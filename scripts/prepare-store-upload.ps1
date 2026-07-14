$ErrorActionPreference = "Stop"

$releaseDirectory = Join-Path $PSScriptRoot "..\release"
$packages = @(Get-ChildItem $releaseDirectory -File -Filter *.appx)
if ($packages.Count -ne 1) {
  throw "Expected exactly one Store AppX/MSIX package in $releaseDirectory; found $($packages.Count)"
}

$makeAppx = Get-Command MakeAppx.exe -ErrorAction SilentlyContinue
if ($null -eq $makeAppx) {
  $windowsKitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  $makeAppx = Get-ChildItem $windowsKitsRoot -Recurse -File -Filter MakeAppx.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -match '[\\/]x64$' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1
}
if ($null -eq $makeAppx) {
  throw "MakeAppx.exe was not found in PATH or the Windows 10 SDK"
}

$validationDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "vibe-codr-appx-$([guid]::NewGuid())"
try {
  & $makeAppx.FullName unpack /p $packages[0].FullName /d $validationDirectory /o
  if ($LASTEXITCODE -ne 0) {
    throw "MakeAppx could not unpack $($packages[0].Name)"
  }

  $requiredPackageFiles = @(
    "AppxManifest.xml",
    "app\Vibe Codr.exe",
    "app\resources\vibecodr-engine-host.exe"
  )
  foreach ($requiredPackageFile in $requiredPackageFiles) {
    if (-not (Test-Path (Join-Path $validationDirectory $requiredPackageFile) -PathType Leaf)) {
      throw "Store package is missing required file: $requiredPackageFile"
    }
  }
} finally {
  Remove-Item $validationDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

$version = (Get-Content (Join-Path $PSScriptRoot "..\package.json") -Raw | ConvertFrom-Json).version
$uploadPath = Join-Path $releaseDirectory "Vibe-Codr-$version-x64.appxupload"
$temporaryZip = [System.IO.Path]::ChangeExtension($uploadPath, ".zip")
Remove-Item $temporaryZip, $uploadPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path $packages[0].FullName -DestinationPath $temporaryZip
Move-Item $temporaryZip $uploadPath

Write-Host "Prepared Microsoft Store upload: $uploadPath"
