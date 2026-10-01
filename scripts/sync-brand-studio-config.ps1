# Sync .env.vercel.local -> Brand Studio user config (AppData).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env.vercel.local"
if (-not (Test-Path $envPath)) {
  Write-Host "Missing .env.vercel.local"
  exit 1
}
$vars = @{}
Get-Content $envPath -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $vars[$line.Substring(0, $i).Trim()] = $line.Substring($i + 1).Trim()
}
$token = $vars["VERCEL_TOKEN"]
if (-not $token) {
  Write-Host "VERCEL_TOKEN empty in .env.vercel.local"
  exit 1
}
$repo = if ($vars["GITHUB_REPO"]) { $vars["GITHUB_REPO"] } else { "chochoonwon-cupang/mginfo" }
$config = @{
  token               = $token
  teamId              = "team_PL8jAXEb4wZ1R9nrar9HfKG4"
  repo                = $repo
  opsHubUrl           = "https://mginfo-phi.vercel.app"
  opsMasterPassword   = ""
  geminiApiKey        = ""
  geminiModel         = ""
}
$dir = Join-Path $env:APPDATA "infocs-brand-studio"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$out = Join-Path $dir "brand-studio-config.json"
$config | ConvertTo-Json | Set-Content $out -Encoding UTF8
Write-Host "Brand Studio config -> $out"
Write-Host "  repo: $repo"
Write-Host "  team: coupangs-projects (team_PL8jAXEb4wZ1R9nrar9HfKG4)"
Write-Host "  hub:  https://mginfo-phi.vercel.app"
