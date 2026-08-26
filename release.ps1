[CmdletBinding()]
param(
  [string]$HarnessDir = '',
  [switch]$Full,
  [switch]$AllowBundledRuntimeDependencies
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
$dist = Join-Path $root 'dist'
$distLocal = Join-Path $root 'dist-local'
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$stage = Join-Path $tempBase ('dwp-' + [Guid]::NewGuid().ToString('N'))

function Require-File([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing release file: $Path" }
}
function Test-Harness([string]$Path) {
  return $Path -and
    (Test-Path -LiteralPath (Join-Path $Path 'DeepSeek Harness.exe') -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $Path 'app\main.js') -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $Path 'runtime\node.exe') -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $Path 'runtime\node_modules\@deepseek-ai\dsh\lib\bin.js') -PathType Leaf)
}
function Copy-Bridge([string]$Target) {
  foreach ($name in @('install.cmd', 'install.ps1', 'install.js', 'update.cmd', 'update.ps1', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'package.json', 'native-scene-bridge.js', 'titles.json', 'we.js')) {
    Require-File (Join-Path $root $name)
    Copy-Item -LiteralPath (Join-Path $root $name) -Destination $Target -Force
  }
  foreach ($folder in @('dsh', 'we-tools')) {
    New-Item -ItemType Directory -Path (Join-Path $Target $folder) -Force | Out-Null
  }
  foreach ($name in @('install-bootstrap.js', 'plugin.host.js', 'plugin.client.js', 'wallpaper-bootstrap.js')) {
    Copy-Item -LiteralPath (Join-Path $root ('dsh\' + $name)) -Destination (Join-Path $Target 'dsh') -Force
  }
  foreach ($name in @('capture.cs', 'capture.exe', 'native-scene-lab.html', 'SceneLayerHost.cs')) {
    Copy-Item -LiteralPath (Join-Path $root ('we-tools\' + $name)) -Destination (Join-Path $Target 'we-tools') -Force
  }
  foreach ($forbidden in @('wallpapers.json', 'runtime.json', 'we.config.json', 'titles.local.json', '.env', 'node_modules', 'cache', 'dist', 'prototype', '.dsh-filess', 'wallpaper-backups')) {
    $candidate = Join-Path $Target $forbidden
    if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate -Force -Recurse }
  }
}
function Assert-Payload([string]$Payload, [bool]$ExpectHarness) {
  foreach ($relative in @('install.cmd', 'install.ps1', 'install.js', 'update.cmd', 'update.ps1', 'we.js', 'native-scene-bridge.js', 'dsh\install-bootstrap.js', 'dsh\wallpaper-bootstrap.js', 'dsh\plugin.host.js', 'dsh\plugin.client.js', 'we-tools\capture.exe', 'we-tools\SceneLayerHost.cs')) {
    Require-File (Join-Path $Payload $relative)
  }
  foreach ($item in Get-ChildItem -LiteralPath $Payload -Force -Recurse) {
    $name = $item.Name
    $underDependencies = $item.FullName -match '(?i)\\node_modules\\'
    $blocked = -not $underDependencies -and ($name -match '^(?:wallpapers\.json|runtime\.json|we\.config\.json|titles\.local\.json|\.env(?:\..*)?|\.npmrc|\.netrc|cache|dist|dist-local|prototype|\.dsh-filess|wallpaper-backups)$' -or
      $name -match '(?i)(?:cookie|credential|secret|token)' -or $name -match '(?i)\.(?:log|jsonl|pem|key|pfx|p12)$')
    if (-not $ExpectHarness -and $name -ieq 'node_modules') { $blocked = $true }
    if ($blocked) { throw "Personal or development state leaked into release: $($item.FullName.Substring($Payload.Length).TrimStart('\'))" }
  }
  $privateMarkers = @($root, $HarnessDir, $env:USERPROFILE) | Where-Object { $_ } | Select-Object -Unique
  $hits = Get-ChildItem -LiteralPath $Payload -Recurse -File | Select-String -SimpleMatch $privateMarkers -ErrorAction SilentlyContinue
  if ($hits) { throw 'Source-machine path leaked into release payload.' }
  if ($ExpectHarness) {
    $harness = Join-Path $Payload 'DeepSeek Harness'
    if (-not (Test-Harness $harness)) { throw 'Full payload has an incomplete DeepSeek Harness.' }
    Require-File (Join-Path $harness 'LICENSE')
  }
}
function Get-Sha256([string]$Path) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '') }
  finally { $stream.Dispose(); $sha.Dispose() }
}
function Build-Zip([string]$Payload, [string]$Name, [string]$OutputDir) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  $archive = Join-Path $OutputDir $Name
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
  Compress-Archive -LiteralPath $Payload -DestinationPath $archive -CompressionLevel Optimal
  if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "Archive was not created: $archive" }
  $hash = Get-Sha256 $archive
  Set-Content -LiteralPath ($archive + '.sha256') -Value ($hash + '  ' + [IO.Path]::GetFileName($archive)) -Encoding ASCII
  Write-Host "Created $archive"
}

try {
  if ($Full -and -not $AllowBundledRuntimeDependencies) {
    throw 'The full DSH bundle contains runtime dependencies including node_modules. Add -AllowBundledRuntimeDependencies only for a reviewed local-only build.'
  }
  & node (Join-Path $root 'dsh\check-privacy.js')
  if ($LASTEXITCODE -ne 0) { throw 'Privacy checks failed; no release was built.' }
  New-Item -ItemType Directory -Path $dist -Force | Out-Null
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  $light = Join-Path $stage 'DSH-Wallpaper-Setup'
  New-Item -ItemType Directory -Path $light -Force | Out-Null
  Copy-Bridge $light
  Set-Content -LiteralPath (Join-Path $light 'manifest.json') -Value (@{ name = 'dsh-wallpaper-bridge'; version = $version; flavor = 'plugin'; createdAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json) -Encoding UTF8
  Assert-Payload -Payload $light -ExpectHarness:$false
  Build-Zip $light ("DSH-Wallpaper-Setup-$version.zip") $dist

  if ($Full) {
    if (-not $HarnessDir) {
      $candidate = $env:DSH_HARNESS_DIR
      if (Test-Harness $candidate) { $HarnessDir = $candidate }
    }
    if (-not (Test-Harness $HarnessDir)) { throw 'A complete custom DeepSeek Harness is required for -Full. Pass -HarnessDir.' }
    $fullPayload = Join-Path $stage 'DSH-Wallpaper-Setup-Full'
    New-Item -ItemType Directory -Path $fullPayload -Force | Out-Null
    Copy-Bridge $fullPayload
    Copy-Item -LiteralPath $HarnessDir -Destination (Join-Path $fullPayload 'DeepSeek Harness') -Recurse -Force
    foreach ($relative in @('README.md', 'debug.log', '.dsh-token-usage.json', 'runtime\server.log', 'runtime\.dsh-token-usage.json')) {
      $candidate = Join-Path $fullPayload ('DeepSeek Harness\' + $relative)
      if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate -Force }
    }
    $main = Join-Path $fullPayload 'DeepSeek Harness\app\main.js'
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $source = [IO.File]::ReadAllText($main, [Text.Encoding]::UTF8)
    $source = [regex]::Replace($source, "const NATIVE_SCENE_LAB_HTML = .*?;", "const NATIVE_SCENE_LAB_HTML = path.join(APP_ROOT, 'native-scene-lab.html');")
    $source = [regex]::Replace($source, "(?m)^(const HARNESS_ROOT = path\.resolve\(APP_ROOT, '\.\.'\);).*$", '$1')
    if ($source -match 'deep seek work\\wallpaper') { throw 'Unable to remove the local native scene lab path.' }
    [IO.File]::WriteAllText($main, $source, $utf8)
    Copy-Item -LiteralPath (Join-Path $root 'we-tools\native-scene-lab.html') -Destination (Join-Path $fullPayload 'DeepSeek Harness\app\native-scene-lab.html') -Force
    Set-Content -LiteralPath (Join-Path $fullPayload 'manifest.json') -Value (@{ name = 'dsh-wallpaper-bridge'; version = $version; flavor = 'full'; publication = 'local-only'; createdAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json) -Encoding UTF8
    Assert-Payload -Payload $fullPayload -ExpectHarness:$true
    Build-Zip $fullPayload ("DSH-Wallpaper-Setup-Full-$version.zip") $distLocal
  }
} finally {
  $resolvedStage = [IO.Path]::GetFullPath($stage)
  if ($resolvedStage.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedStage)) {
    Remove-Item -LiteralPath $resolvedStage -Force -Recurse
  }
}
