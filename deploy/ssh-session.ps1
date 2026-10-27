param(
  [string]$Destination = 'ubuntu@124.221.36.36',
  [string]$PublicKey = (Join-Path $env:USERPROFILE '.ssh\tencent-booking.pub')
)
$ErrorActionPreference = 'Stop'
# Use Microsoft OpenSSH and the existing 1Password agent. The identity is a
# public key selector; no private key is exported, copied, or cached on disk.
$taskSsh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$taskScp = Join-Path $env:WINDIR 'System32\OpenSSH\scp.exe'
if (!(Test-Path -LiteralPath $taskSsh) -or !(Test-Path -LiteralPath $taskScp)) {
  throw 'Microsoft OpenSSH is required.'
}
if (!(Test-Path -LiteralPath $PublicKey)) { throw 'The public key selector was not found.' }
$taskPublicKeyText = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $PublicKey).Path).Trim()
if ($taskPublicKeyText -notmatch '^(ssh-rsa|ssh-ed25519|ecdsa-sha2-[^ ]+) [A-Za-z0-9+/]+={0,2}(?:\s[^\r\n]*)?$') {
  throw 'PublicKey must contain one OpenSSH public key, never a private key.'
}
$taskSshArgs = @('-i', $PublicKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=12', '-o', 'StrictHostKeyChecking=yes',
  '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3')
Write-Output 'CLOUD_SESSION_READY'
while ($taskLine = [Console]::ReadLine()) {
  $taskRequest = $taskLine | ConvertFrom-Json
  switch ($taskRequest.action) {
    'stop' { return }
    'ssh' {
      if (!$taskRequest.command) { throw 'A remote command is required.' }
      & $taskSsh @taskSshArgs $Destination $taskRequest.command
      Write-Output ('SSH_EXIT=' + $LASTEXITCODE)
    }
    'upload' {
      if (!(Test-Path -LiteralPath $taskRequest.source -PathType Leaf)) { throw 'Upload source was not found.' }
      if (!$taskRequest.target.StartsWith('/')) { throw 'Use an absolute remote upload path.' }
      & $taskScp @taskSshArgs $taskRequest.source ($Destination + ':' + $taskRequest.target)
      Write-Output ('UPLOAD_EXIT=' + $LASTEXITCODE)
    }
    default { throw 'Supported actions: ssh, upload, stop.' }
  }
  Write-Output 'CLOUD_SESSION_READY'
}
