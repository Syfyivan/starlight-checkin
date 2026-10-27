param([string]$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk", [string]$JavaRoot = 'D:\develop\jdk18')
$ErrorActionPreference = 'Stop'
$taskProject = Split-Path -Parent $PSScriptRoot
$taskBuild = Join-Path $taskProject 'output/android-build'
$taskTools = Join-Path $SdkRoot 'build-tools/34.0.0'
$taskPlatform = Join-Path $SdkRoot 'platforms/android-35/android.jar'
$taskSignDir = Join-Path $env:LOCALAPPDATA 'StarlightSigning'
$taskKey = Join-Path $taskSignDir 'starlight-release.p12'
$taskPasswordFile = Join-Path $taskSignDir 'password.dpapi'
$taskPriorJava = $env:JAVA_HOME
function Run-Tool([string]$Tool, [string[]]$ToolArgs) { & $Tool @ToolArgs; if ($LASTEXITCODE -ne 0) { throw "Build tool failed ($LASTEXITCODE): $Tool" } }
try {
    $env:JAVA_HOME = $JavaRoot
    foreach ($taskDir in @($taskBuild, "$taskBuild/res/drawable", "$taskBuild/classes", "$taskBuild/dex", "$taskProject/public/downloads", $taskSignDir)) { New-Item -ItemType Directory -Path $taskDir -Force | Out-Null }
    $taskAcl = Get-Acl -LiteralPath $taskSignDir
    $taskSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    if (!$taskAcl.AreAccessRulesProtected) {
        $taskAcl.SetAccessRuleProtection($true, $false)
        $taskRule = [System.Security.AccessControl.FileSystemAccessRule]::new($taskSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $taskAcl.AddAccessRule($taskRule)
        Set-Acl -LiteralPath $taskSignDir -AclObject $taskAcl
    }
    if (!(Test-Path -LiteralPath $taskPasswordFile)) {
        if (Test-Path -LiteralPath $taskKey) { throw 'Signing key exists without its password record; refusing to replace it.' }
        $taskBytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
        $taskSecure = ConvertTo-SecureString ([Convert]::ToBase64String($taskBytes)) -AsPlainText -Force
        ConvertFrom-SecureString $taskSecure | Set-Content -LiteralPath $taskPasswordFile -Encoding ascii
    }
    $taskSecure = (Get-Content -LiteralPath $taskPasswordFile -Raw).Trim() | ConvertTo-SecureString
    $env:STARLIGHT_SIGNING_PASSWORD = [System.Net.NetworkCredential]::new('', $taskSecure).Password
    if (!(Test-Path -LiteralPath $taskKey)) {
        Run-Tool "$JavaRoot/bin/keytool.exe" @('-genkeypair', '-keystore', $taskKey, '-storetype', 'PKCS12', '-storepass:env', 'STARLIGHT_SIGNING_PASSWORD', '-keypass:env', 'STARLIGHT_SIGNING_PASSWORD', '-alias', 'starlight', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Starlight Check-in')
    }
    Copy-Item -LiteralPath "$taskProject/public/icon-192.png" -Destination "$taskBuild/res/drawable/icon.png" -Force
    Run-Tool "$taskTools/aapt2.exe" @('compile', '--dir', "$taskBuild/res", '-o', "$taskBuild/resources.zip")
    Run-Tool "$taskTools/aapt2.exe" @('link', '-o', "$taskBuild/resources.apk", '-I', $taskPlatform, '--manifest', "$PSScriptRoot/AndroidManifest.xml", '--auto-add-overlay', "$taskBuild/resources.zip")
    $taskSources = @(Get-ChildItem -LiteralPath "$PSScriptRoot/src/app/starlight/checkin" -Filter '*.java' | ForEach-Object FullName)
    Run-Tool "$JavaRoot/bin/javac.exe" (@('--release', '8', '-encoding', 'UTF-8', '-classpath', $taskPlatform, '-d', "$taskBuild/classes") + $taskSources)
    Run-Tool "$JavaRoot/bin/jar.exe" @('cf', "$taskBuild/classes.jar", '-C', "$taskBuild/classes", '.')
    Run-Tool "$taskTools/d8.bat" @('--release', '--min-api', '26', '--lib', $taskPlatform, '--output', "$taskBuild/dex", "$taskBuild/classes.jar")
    Copy-Item -LiteralPath "$taskBuild/resources.apk" -Destination "$taskBuild/unsigned.apk" -Force
    Run-Tool "$JavaRoot/bin/jar.exe" @('uf', "$taskBuild/unsigned.apk", '-C', "$taskBuild/dex", 'classes.dex')
    Run-Tool "$taskTools/zipalign.exe" @('-p', '-f', '4', "$taskBuild/unsigned.apk", "$taskBuild/aligned.apk")
    $taskApk = Join-Path $taskProject 'public/downloads/starlight.apk'
    Run-Tool "$taskTools/apksigner.bat" @('sign', '--ks', $taskKey, '--ks-key-alias', 'starlight', '--ks-pass', 'env:STARLIGHT_SIGNING_PASSWORD', '--key-pass', 'env:STARLIGHT_SIGNING_PASSWORD', '--out', $taskApk, "$taskBuild/aligned.apk")
    Run-Tool "$taskTools/apksigner.bat" @('verify', '--verbose', '--print-certs', $taskApk)
    Run-Tool "$taskTools/zipalign.exe" @('-c', '4', $taskApk)
    $taskHash = (Get-FileHash -LiteralPath $taskApk -Algorithm SHA256).Hash.ToLowerInvariant()
    "$taskHash  starlight.apk" | Set-Content -LiteralPath "$taskProject/public/downloads/starlight.apk.sha256" -Encoding ascii
    [xml]$taskManifest = Get-Content -LiteralPath "$PSScriptRoot/AndroidManifest.xml"
    $taskRelease = @{version=$taskManifest.manifest.GetAttribute('versionName','http://schemas.android.com/apk/res/android');versionCode=[int]$taskManifest.manifest.GetAttribute('versionCode','http://schemas.android.com/apk/res/android');sha256=$taskHash;bytes=(Get-Item -LiteralPath $taskApk).Length}
    $taskRelease | ConvertTo-Json | Set-Content -LiteralPath "$taskProject/public/downloads/starlight.json" -Encoding utf8
    Write-Output "APK_READY $taskApk"
    Write-Output "SHA256 $taskHash"
} finally {
    Remove-Item Env:STARLIGHT_SIGNING_PASSWORD -ErrorAction SilentlyContinue
    $env:JAVA_HOME = $taskPriorJava
}
