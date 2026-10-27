param([string]$JavaRoot = 'D:\develop\jdk18')
$ErrorActionPreference = 'Stop'
$taskTestOutput = Join-Path (Split-Path -Parent $PSScriptRoot) 'output/android-policy-test'
New-Item -ItemType Directory -Path $taskTestOutput -Force | Out-Null
& "$JavaRoot/bin/javac.exe" '-encoding' 'UTF-8' '-d' $taskTestOutput "$PSScriptRoot/src/app/starlight/checkin/UpdatePolicy.java" "$PSScriptRoot/test/app/starlight/checkin/UpdatePolicyTest.java"
if ($LASTEXITCODE -ne 0) { throw 'Android policy test compilation failed' }
& "$JavaRoot/bin/java.exe" '-cp' $taskTestOutput 'app.starlight.checkin.UpdatePolicyTest'
if ($LASTEXITCODE -ne 0) { throw 'Android policy checks failed' }
