[CmdletBinding()]
param(
  [string]$DshHome = '',
  [string]$InstallDir = '',
  [string]$PackagePath = '',
  [switch]$NoLaunch,
  [switch]$NoShortcut,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repository = 'vanhungbui-11/dsh-wallpaper-bridge'
$headers = @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'DSH-Wallpaper-Bridge-Updater' }
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = Join-Path $tempBase ('dsh-wallpaper-update-' + [Guid]::NewGuid().ToString('N'))

function Get-LocalVersion {
  foreach ($name in @('install.json', 'package.json')) {
    $file = Join-Path $PSScriptRoot $name
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { continue }
    try {
      $value = (Get-Content -LiteralPath $file -Raw | ConvertFrom-Json).version
      if ($value -match '^\d+\.\d+\.\d+$') { return [Version]$value }
    } catch { }
  }
  return [Version]'0.0.0'
}

function Save-Download([string]$Url, [string]$Target) {
  $uri = [Uri]$Url
  if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'github.com' -or
      $uri.AbsolutePath -notmatch '^/vanhungbui-11/dsh-wallpaper-bridge/releases/download/[^/]+/[^/]+$') {
    throw "Refusing an unofficial release URL: $Url"
  }
  if ([Uri]::UnescapeDataString($uri.Segments[-1]) -cne [IO.Path]::GetFileName($Target)) { throw 'The release asset URL names a different file.' }
  Invoke-WebRequest -UseBasicParsing -Uri $uri -Headers $headers -OutFile $Target
}

function Assert-ArchiveHash([string]$Archive, [string]$HashFile) {
  if (-not (Test-Path -LiteralPath $HashFile -PathType Leaf)) { throw "Missing SHA-256 file: $HashFile" }
  $line = (Get-Content -LiteralPath $HashFile -Raw).Trim()
  $match = [regex]::Match($line, '^([0-9a-fA-F]{64})[ \t]{2}([^\r\n]+)$')
  $name = [IO.Path]::GetFileName($Archive)
  if (-not $match.Success -or $match.Groups[2].Value -cne $name) { throw 'The SHA-256 sidecar format or file name is invalid.' }
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($Archive)
  try { $actual = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '') }
  finally { $stream.Dispose(); $sha.Dispose() }
  if ($actual -ine $match.Groups[1].Value) { throw 'The package SHA-256 does not match; update stopped.' }
}

function Expand-VerifiedArchive([string]$Archive, [string]$Target) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $root = [IO.Path]::GetFullPath($Target).TrimEnd('\') + '\'
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $total = [long]0
  $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
  try {
    if ($zip.Entries.Count -gt 2000) { throw 'The package contains too many files.' }
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName.Replace('/', '\')
      $parts = @($name.TrimEnd('\').Split('\'))
      if (-not $name -or [IO.Path]::IsPathRooted($name) -or $name.Contains(':') -or
          $parts[0] -cne 'DSH-Wallpaper-Setup' -or $parts -contains '..' -or $parts -contains '.') {
        throw "The package contains an unsafe path: $($entry.FullName)"
      }
      $destination = [IO.Path]::GetFullPath((Join-Path $Target $name))
      if (-not $destination.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'The package path escapes the extraction directory.' }
      if (-not $seen.Add($name)) { throw "The package contains a duplicate path: $($entry.FullName)" }
      $total += $entry.Length
      if ($total -gt 268435456) { throw 'The portable package is unexpectedly large.' }
    }
  } finally {
    $zip.Dispose()
  }
  [IO.Compression.ZipFile]::ExtractToDirectory($Archive, $Target)
}

function Get-OnlinePackage([string]$TargetDir, [Version]$Current, [bool]$ForceDownload) {
  $api = "https://api.github.com/repos/$repository/releases/latest"
  try {
    $release = (Invoke-WebRequest -UseBasicParsing -Uri $api -Headers $headers).Content | ConvertFrom-Json
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 403 -or $status -eq 429) { throw 'GitHub rate-limited this request. Wait before running the updater again; it will not retry automatically.' }
    throw
  }
  if ($release.tag_name -notmatch '^v?(\d+\.\d+\.\d+)$') { throw 'The latest Release has an invalid version tag.' }
  $version = $Matches[1]
  if (-not $ForceDownload -and [Version]$version -le $Current) { return @{ Current = $true; Version = $version } }
  $archiveName = "DSH-Wallpaper-Setup-$version.zip"
  $hashName = $archiveName + '.sha256'
  $assets = @($release.assets)
  $archiveAsset = @($assets | Where-Object { $_.name -ceq $archiveName })
  $hashAsset = @($assets | Where-Object { $_.name -ceq $hashName })
  if ($archiveAsset.Count -ne 1 -or $hashAsset.Count -ne 1) { throw 'The latest Release must contain one portable package and one SHA-256 sidecar.' }
  $archive = Join-Path $TargetDir $archiveName
  Save-Download $archiveAsset[0].browser_download_url $archive
  Save-Download $hashAsset[0].browser_download_url ($archive + '.sha256')
  return @{ Archive = $archive; Version = $version }
}

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  $current = Get-LocalVersion
  if ($PackagePath) {
    $archive = [IO.Path]::GetFullPath($PackagePath)
    if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "Update package does not exist: $archive" }
    $expectedVersion = ''
  } else {
    $download = Get-OnlinePackage $tempRoot $current $Force.IsPresent
    if ($download.Current) {
      Write-Host "Installed version $current is already current or newer."
      exit 0
    }
    $archive = $download.Archive
    $expectedVersion = $download.Version
  }

  Assert-ArchiveHash $archive ($archive + '.sha256')
  $extract = Join-Path $tempRoot 'extracted'
  New-Item -ItemType Directory -Path $extract -Force | Out-Null
  Expand-VerifiedArchive $archive $extract
  $payload = Join-Path $extract 'DSH-Wallpaper-Setup'
  $manifestFile = Join-Path $payload 'manifest.json'
  $installer = Join-Path $payload 'install.ps1'
  if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf) -or -not (Test-Path -LiteralPath $installer -PathType Leaf)) {
    throw 'The package is missing manifest.json or install.ps1.'
  }
  $manifest = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
  if ($manifest.name -cne 'dsh-wallpaper-bridge' -or $manifest.flavor -cne 'plugin' -or $manifest.version -notmatch '^\d+\.\d+\.\d+$') {
    throw 'The package manifest is invalid or is not the public portable flavor.'
  }
  if ($expectedVersion -and $manifest.version -cne $expectedVersion) { throw 'The Release tag and package version do not match.' }

  $next = [Version]$manifest.version
  if (-not $Force -and $next -le $current) {
    Write-Host "Installed version $current is already current or newer."
    exit 0
  }

  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installer)
  if ($DshHome) { $arguments += @('-DshHome', $DshHome) }
  if ($InstallDir) { $arguments += @('-InstallDir', $InstallDir) }
  if ($NoLaunch) { $arguments += '-NoLaunch' }
  if ($NoShortcut) { $arguments += '-NoShortcut' }
  & (Join-Path $PSHOME 'powershell.exe') @arguments
  if ($LASTEXITCODE -ne 0) { throw "Installer exit code: $LASTEXITCODE" }
  Write-Host "DSH Wallpaper Bridge updated to $next."
} catch {
  Write-Error $_
  exit 1
} finally {
  $resolvedTemp = [IO.Path]::GetFullPath($tempRoot)
  if ($resolvedTemp.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and
      (Test-Path -LiteralPath $resolvedTemp)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}
