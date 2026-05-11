#Requires -Version 5.1
<#
.SYNOPSIS
  Build Noteriv as a portable Windows zip.

.DESCRIPTION
  Two flavors:
    - Lite (default): just noteriv.exe + portable.txt. Requires WebView2 to be
      installed on the target machine (default on Win11, near-universal on Win10).
    - Fixed runtime (-FixedRuntime <path>): bundles a copy of the Edge WebView2
      Fixed Version Runtime alongside the EXE. True 100% portable, runs without
      system WebView2. Adds ~150 MB.

.PARAMETER FixedRuntime
  Path to an extracted Edge WebView2 Fixed Version Runtime folder. Download
  from https://developer.microsoft.com/en-us/microsoft-edge/webview2/ under
  "Fixed Version", extract the CAB, and pass the resulting folder here.

.PARAMETER OutDir
  Output directory for the produced zip(s). Defaults to ../bundles.

.EXAMPLE
  ./build-windows-portable.ps1
  Builds the lite portable zip.

.EXAMPLE
  ./build-windows-portable.ps1 -FixedRuntime C:\webview2-runtime\140.0.3485.94\
  Builds the fixed-runtime portable zip.
#>
param(
  [string]$FixedRuntime = "",
  [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopDir = Split-Path -Parent $ScriptDir
$SrcTauri = Join-Path $DesktopDir "src-tauri"

if (-not $OutDir) {
  $OutDir = Join-Path (Split-Path -Parent $DesktopDir) "bundles"
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Push-Location $DesktopDir
try {
  $version = (Get-Content (Join-Path $DesktopDir "package.json") | ConvertFrom-Json).version
  $exeName = "noteriv.exe"

  if ($FixedRuntime) {
    if (-not (Test-Path $FixedRuntime -PathType Container)) {
      throw "FixedRuntime path not found or not a directory: $FixedRuntime"
    }
    $runtimeDest = Join-Path $SrcTauri "runtime"
    if (Test-Path $runtimeDest) { Remove-Item -Recurse -Force $runtimeDest }
    Copy-Item -Recurse -Path $FixedRuntime -Destination $runtimeDest
    Write-Host "Copied fixed runtime to $runtimeDest"

    Write-Host "Building with fixed-runtime config..."
    npm run build -- --config "src-tauri/tauri.windows.fixedruntime.conf.json"
    $zipName = "Noteriv-$version-windows-x64-portable-fixedruntime.zip"
    $stageName = "noteriv-portable-fixedruntime"
  } else {
    Write-Host "Building lite portable (requires system WebView2)..."
    npm run build
    $zipName = "Noteriv-$version-windows-x64-portable.zip"
    $stageName = "noteriv-portable"
  }

  $exePath = Join-Path $SrcTauri "target\release\$exeName"
  if (-not (Test-Path $exePath)) { throw "Build did not produce $exePath" }

  $stage = Join-Path ([System.IO.Path]::GetTempPath()) $stageName
  if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
  New-Item -ItemType Directory -Path $stage | Out-Null

  Copy-Item $exePath (Join-Path $stage $exeName)
  Set-Content -Path (Join-Path $stage "portable.txt") -Value "Marker file. Do not delete. Triggers portable mode: all settings, vaults, and cache stay in this folder."
  Set-Content -Path (Join-Path $stage "README.txt") -Value @"
Noteriv $version - Portable
============================

This is a portable build. All settings, vaults, and cache live in the
'data' folder created next to noteriv.exe on first run. No registry
writes, no AppData usage.

To run:
  Double-click noteriv.exe.

To turn portable mode OFF (use system AppData like the installed build):
  Delete portable.txt.

Auto-updates are disabled in portable builds. To upgrade, download the
latest portable zip from GitHub releases and replace noteriv.exe.
"@

  if ($FixedRuntime) {
    $runtimeStage = Join-Path $stage "runtime"
    Copy-Item -Recurse -Path $runtimeDest -Destination $runtimeStage
  }

  $zipPath = Join-Path $OutDir $zipName
  if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
  Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath
  Write-Host "Created $zipPath"

  Remove-Item -Recurse -Force $stage
}
finally {
  Pop-Location
}
