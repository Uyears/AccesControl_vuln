#Requires -Version 5.1
<#
.SYNOPSIS
  Merakit paket portable Windows untuk lab Broken Access Control.

.DESCRIPTION
  Menghasilkan release\lab berisi node.exe resmi, server, frontend build,
  node_modules produksi, start.bat, dan start-secure.bat, lalu membungkusnya
  menjadi release\bac-lab-portable.zip.

  Prasyarat: Node.js + npm terpasang, koneksi internet, PowerShell 5.1+.

  Pemakaian:
    npm run build
    powershell -ExecutionPolicy Bypass -File scripts\make-portable.ps1
#>

[CmdletBinding()]
param(
  [string]$NodeVersion = "",
  [switch]$SkipZip
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ReleaseRoot = Join-Path $Root "release"
$LabDir = Join-Path $ReleaseRoot "lab"
$ZipPath = Join-Path $ReleaseRoot "bac-lab-portable.zip"

function Fail([string]$Message) {
  Write-Host "[portable] $Message" -ForegroundColor Red
  exit 1
}

function Invoke-Checked([string]$Exe, [string[]]$Arguments, [string]$WorkingDirectory) {
  Push-Location $WorkingDirectory
  try {
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) {
      Fail "$Exe keluar dengan kode $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path (Join-Path $Root "server\public\index.html"))) {
  Fail "frontend belum dibangun. Jalankan: npm run build"
}
if (-not (Test-Path (Join-Path $Root "package-lock.json"))) {
  Fail "package-lock.json tidak ditemukan. Jalankan: npm install"
}

if ([string]::IsNullOrWhiteSpace($NodeVersion)) {
  $NodeVersion = (& node --version).Trim().TrimStart("v")
}
$NodeZipName = "node-v$NodeVersion-win-x64.zip"
$NodeZipUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeZipName"
$NodeZip = Join-Path $ReleaseRoot $NodeZipName
$ExtractDir = Join-Path $ReleaseRoot ".node-extract"

Write-Host "[portable] Node Windows: v$NodeVersion"
Write-Host "[portable] $NodeZipUrl"

if (Test-Path $LabDir) {
  Remove-Item $LabDir -Recurse -Force
}
New-Item -ItemType Directory -Path $LabDir -Force | Out-Null

# 1. Salin server, data, frontend build, manifest.
Copy-Item (Join-Path $Root "server") (Join-Path $LabDir "server") -Recurse -Force
Copy-Item (Join-Path $Root "data") (Join-Path $LabDir "data") -Recurse -Force
Copy-Item (Join-Path $Root "package.json") (Join-Path $LabDir "package.json") -Force
Copy-Item (Join-Path $Root "package-lock.json") (Join-Path $LabDir "package-lock.json") -Force
if (Test-Path (Join-Path $Root "start.sh")) {
  Copy-Item (Join-Path $Root "start.sh") (Join-Path $LabDir "start.sh") -Force
}

# 2. Dependency produksi saja.
Write-Host "[portable] memasang dependency produksi..."
Invoke-Checked "npm" @("ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund") $LabDir

# 3. node.exe portable resmi (dari zip resmi nodejs.org).
Write-Host "[portable] mengunduh $NodeZipName..."
$ProgressPreference = "SilentlyContinue"
Invoke-WebRequest -Uri $NodeZipUrl -OutFile $NodeZip -UseBasicParsing

if (Test-Path $ExtractDir) { Remove-Item $ExtractDir -Recurse -Force }
Expand-Archive -LiteralPath $NodeZip -DestinationPath $ExtractDir -Force
$NodeExe = Get-ChildItem -Path $ExtractDir -Filter "node.exe" -Recurse | Select-Object -First 1
if (-not $NodeExe) {
  Fail "node.exe tidak ditemukan di dalam $NodeZipName"
}
Copy-Item $NodeExe.FullName (Join-Path $LabDir "node.exe") -Force
Remove-Item $ExtractDir -Recurse -Force
Remove-Item $NodeZip -Force

# 4. Launcher batch.
$startBat = @"
@echo off
setlocal
cd /d "%~dp0"

rem Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.
set "SECURE_MODE=false"
set "HOST=127.0.0.1"
if "%PORT%"=="" set "PORT=3000"

echo.
echo  Nusa Supply - Broken Access Control Lab (MODE VULNERABLE)
echo  Buka http://127.0.0.1:%PORT% setelah server siap.
echo  Hentikan dengan Ctrl+C.
echo.

node.exe server\index.js
echo.
echo  Server berhenti.
pause
"@

$startSecureBat = $startBat.
  Replace("(MODE VULNERABLE)", "(MODE SECURE)").
  Replace('set "SECURE_MODE=false"', 'set "SECURE_MODE=true"')

# Batch file harus CRLF dan ASCII agar aman di cmd.exe.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $LabDir "start.bat"), ($startBat -replace "`r?`n", "`r`n"), $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $LabDir "start-secure.bat"), ($startSecureBat -replace "`r?`n", "`r`n"), $utf8NoBom)

# 5. README singkat.
$readme = @"
NUSA SUPPLY - BROKEN ACCESS CONTROL LAB
=======================================

Intentionally vulnerable training lab. Data fiktif. Jangan deploy ke publik.

WINDOWS
  1. Ekstrak seluruh isi zip ke satu folder.
  2. Double-click start.bat         -> mode VULNERABLE
     atau start-secure.bat          -> mode SECURE
  3. Buka http://127.0.0.1:3000
  4. Hentikan server dengan Ctrl+C.

  Tidak perlu Node.js, npm, atau hak administrator.

AKUN DEMO
  alice / Password123!   (customer)
  bob   / Password123!   (customer)
  dian  / Password123!   (customer)
  admin / Admin!2024     (admin)
  toko.alpha / Seller123! (seller)
  toko.bravo / Seller123! (seller)

RESET DATA
  Hentikan server lalu jalankan ulang. Tidak ada endpoint reset.

BURP SUITE
  Browser sering tidak meneruskan trafik localhost lewat proxy. Dua solusi:
  - pakai browser bawaan Burp (Proxy > Intercept > Open browser), atau
  - Firefox: about:config -> network.proxy.allow_hijacking_localhost = true
"@
[System.IO.File]::WriteAllText((Join-Path $LabDir "README.txt"), ($readme -replace "`r?`n", "`r`n"), $utf8NoBom)

# 6. Verifikasi dependency produksi.
Write-Host "[portable] memeriksa native addon..."
Invoke-Checked "node" @((Join-Path $Root "scripts\check-native-deps.js")) $LabDir

# 7. Zip final.
if (-not $SkipZip) {
  if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
  Compress-Archive -Path (Join-Path $LabDir "*") -DestinationPath $ZipPath -Force
  Write-Host "[portable] zip selesai: release\bac-lab-portable.zip"
}

Write-Host "[portable] selesai. Folder: release\lab"
Write-Host "[portable] Windows: ekstrak zip lalu double-click start.bat."
