# Vercel account / project link helpers (non-interactive for agents & CI).
# Requires .env.vercel.local at repo root (see .env.vercel.example).

param(
  [ValidateSet("status", "link", "teams", "projects", "git-connect", "git-disconnect", "git-status", "git-remote", "deploy")]
  [string]$Action = "status",
  [switch]$UnlinkFirst
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Load-VercelEnv {
  $path = Join-Path $root ".env.vercel.local"
  if (-not (Test-Path $path)) {
    Write-Host "Missing .env.vercel.local — copy .env.vercel.example and set VERCEL_TOKEN, VERCEL_SCOPE, VERCEL_PROJECT."
    exit 1
  }
  Get-Content $path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $key = $line.Substring(0, $i).Trim()
    $val = $line.Substring($i + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
    Set-Item -Path "env:$key" -Value $val
  }
  if (-not $env:VERCEL_TOKEN) {
    Write-Host "VERCEL_TOKEN is empty in .env.vercel.local"
    exit 1
  }
}

function Invoke-Vercel {
  param([string[]]$CommandArgs)
  $cliArgs = @("-t", $env:VERCEL_TOKEN, "--non-interactive") + $CommandArgs
  if ($env:VERCEL_SCOPE) { $cliArgs = @("-S", $env:VERCEL_SCOPE) + $cliArgs }
  & npx vercel @cliArgs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Load-VercelEnv

$projectJson = Join-Path $root ".vercel\project.json"

switch ($Action) {
  "status" {
    Write-Host "=== Vercel target (.env.vercel.local) ==="
    Write-Host "scope:   $($env:VERCEL_SCOPE)"
    Write-Host "project: $($env:VERCEL_PROJECT)"
    Write-Host ""
    Write-Host "=== CLI (token) ==="
    Invoke-Vercel @("whoami")
    Write-Host ""
    if (Test-Path $projectJson) {
      Write-Host "=== Local link (.vercel/project.json) ==="
      Get-Content $projectJson -Raw | Write-Host
    } else {
      Write-Host "No local .vercel/project.json (not linked yet)."
    }
  }
  "teams" {
    Invoke-Vercel @("teams", "ls")
  }
  "projects" {
    Invoke-Vercel @("project", "ls")
  }
  "git-status" {
    Invoke-Vercel @("project", "inspect", $env:VERCEL_PROJECT)
  }
  "git-connect" {
    $repo = if ($env:GITHUB_REPO) { $env:GITHUB_REPO.Trim() } else { "chochoonwon-cupang/mginfo" }
    $gitUrl = "https://github.com/$repo.git"
    Write-Host "Connecting $gitUrl to $($env:VERCEL_SCOPE)/$($env:VERCEL_PROJECT) ..."
    Write-Host "Need: GitHub account in repo owner + Vercel GitHub app on that repo."
    Write-Host "  Git:  https://github.com/settings/installations (Vercel -> $repo)"
    Write-Host "  Vercel: https://vercel.com/coupangs-projects/~/settings/git"
    & npx vercel git connect $gitUrl -t $env:VERCEL_TOKEN -S $env:VERCEL_SCOPE --non-interactive 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "Git connected."
  }
  "git-disconnect" {
    Invoke-Vercel @("git", "disconnect")
  }
  "deploy" {
    Write-Host "Production deploy to $($env:VERCEL_SCOPE)/$($env:VERCEL_PROJECT) ..."
    Invoke-Vercel @("deploy", "--prod", "--yes", "--force")
  }
  "git-remote" {
    $repo = if ($env:GITHUB_REPO) { $env:GITHUB_REPO.Trim() } else { "chochoonwon-cupang/mginfo" }
    $url = "https://github.com/$repo.git"
    $old = git remote get-url origin 2>$null
    Write-Host "origin was: $old"
    git remote set-url origin $url
    Write-Host "origin now: $(git remote get-url origin)"
    Write-Host "Create empty repo on GitHub if needed, then: git push -u origin HEAD"
  }
  "link" {
    if (-not $env:VERCEL_PROJECT) {
      Write-Host "Set VERCEL_PROJECT in .env.vercel.local"
      exit 1
    }
    if (-not $env:VERCEL_SCOPE) {
      Write-Host "Set VERCEL_SCOPE in .env.vercel.local"
      exit 1
    }
    if ($UnlinkFirst -and (Test-Path (Join-Path $root ".vercel"))) {
      Remove-Item -Recurse -Force (Join-Path $root ".vercel")
      Write-Host "Removed .vercel/"
    }
    $linkArgs = @("link", "--yes", "--project", $env:VERCEL_PROJECT)
    & npx vercel @linkArgs -t $env:VERCEL_TOKEN -S $env:VERCEL_SCOPE --non-interactive 2>&1 | ForEach-Object { $_; if ($_ -match "Failed to connect the GitHub") { $script:githubLinkWarn = $true } }
    if ($LASTEXITCODE -ne 0 -and -not (Test-Path $projectJson)) { exit $LASTEXITCODE }
    if ($script:githubLinkWarn) {
      Write-Host "Note: Git repo link skipped (no repo access on this account). CLI deploy still works."
    }
    Write-Host ""
    Write-Host "Linked. Current project.json:"
    Get-Content $projectJson -Raw | Write-Host
  }
}
