$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw '请先安装 Node.js 24 LTS，然后重新打开 PowerShell。' }
node server.mjs --seed
