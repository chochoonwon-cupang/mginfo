# Redeploy a Brand Studio clone (same repo as mginfo, different Vercel project).
param(
  [string]$Project = "cheolgeopro-co-kr"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$envPath = Join-Path $root ".env.vercel.local"
if (-not (Test-Path $envPath)) {
  Write-Host "Missing .env.vercel.local"
  exit 1
}
Get-Content $envPath -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $key = $line.Substring(0, $i).Trim()
  $val = $line.Substring($i + 1).Trim()
  if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
  Set-Item -Path "env:$key" -Value $val
}
$env:VERCEL_PROJECT = $Project
Write-Host "Production deploy clone: $($env:VERCEL_SCOPE)/$Project ..."
& npx vercel deploy --prod --yes --force -t $env:VERCEL_TOKEN -S $env:VERCEL_SCOPE
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
