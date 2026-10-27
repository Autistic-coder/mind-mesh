$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$localNode = Join-Path (Get-Location) '.local\node-v24.21.0-win-x64'
if (Test-Path (Join-Path $localNode 'node.exe')) { $env:PATH = "$localNode;$env:PATH" }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.12 or later.' }
& npm.cmd run dev -- --strictPort
exit $LASTEXITCODE
