# Build Infocs Brand Studio (studio-v2) portable exe
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$studio = Join-Path $root "studio-v2"
$destDir = Join-Path $root "사이트만들기-브랜드"
Set-Location $studio
$outName = "dist-build-new"
if (Test-Path $outName) {
  Remove-Item -Recurse -Force $outName -ErrorAction SilentlyContinue
}
$pkg = Get-Content (Join-Path $studio "package.json") -Raw -Encoding UTF8
$pkgPatched = $pkg -replace '"output":\s*"dist-out"', ('"output": "' + $outName + '"')
Set-Content (Join-Path $studio "package.json") -Value $pkgPatched -Encoding UTF8 -NoNewline
try {
  npm run dist
} finally {
  Set-Content (Join-Path $studio "package.json") -Value $pkg -Encoding UTF8 -NoNewline
}
$exe = Get-ChildItem (Join-Path $studio $outName) -Filter "InfocsBrandStudio.exe" -Recurse | Select-Object -First 1
if (-not $exe) {
  throw "InfocsBrandStudio.exe not found under studio-v2/dist-out"
}
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$outExe = Join-Path $destDir "InfocsBrandStudio.exe"
Copy-Item $exe.FullName $outExe -Force
Write-Host Built $outExe
