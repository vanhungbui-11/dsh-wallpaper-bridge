[CmdletBinding()]
param(
  [string]$DshHome = '',
  [string]$InstallDir = '',
  [switch]$NoLaunch,
  [switch]$NoShortcut
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Test-Harness([string]$Path) {
  if (-not $Path) { return $false }
  return (Test-Path -LiteralPath (Join-Path $Path 'DeepSeek Harness.exe') -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $Path 'app\main.js') -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $Path 'runtime\node.exe') -PathType Leaf) -and
    (Test-Path -LiteralPath (Join-Path $Path 'runtime\node_modules\@deepseek-ai\dsh\lib\bin.js') -PathType Leaf)
}

function Get-RunningHarness {
  try {
    $process = Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'" |
      Where-Object { $_.ExecutablePath -and $_.CommandLine -notmatch '--type=' } |
      Select-Object -First 1
    if ($process) { return Split-Path -Parent $process.ExecutablePath }
  } catch { }
  return ''
}

function Install-BundledHarness([string]$Bundle, [string]$Target) {
  if (-not (Test-Harness $Bundle)) { return '' }
  $sourcePath = [IO.Path]::GetFullPath($Bundle).TrimEnd('\')
  $targetPath = [IO.Path]::GetFullPath($Target).TrimEnd('\')
  if ($sourcePath -eq $targetPath) { return $targetPath }

  $running = Get-RunningHarness
  if ($running -and ([IO.Path]::GetFullPath($running).TrimEnd('\') -eq $targetPath)) {
    Write-Warning 'Installed DeepSeek Harness is running; shell files were not overwritten. Close it and rerun setup to update the shell.'
    return $targetPath
  }

  Write-Host 'Installing the bundled DeepSeek Harness...'
  New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
  & robocopy.exe $sourcePath $targetPath /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  $copyCode = $LASTEXITCODE
  if ($copyCode -gt 7) { throw "Copying the bundled DeepSeek Harness failed (robocopy exit code $copyCode)." }
  foreach ($file in @('debug.log', '.dsh-token-usage.json', 'runtime\server.log', 'runtime\.dsh-token-usage.json')) {
    $candidate = Join-Path $targetPath $file
    if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate -Force }
  }
  if (-not (Test-Harness $targetPath)) { throw 'The bundled DeepSeek Harness copy is incomplete.' }
  return $targetPath
}

function New-HarnessShortcut([string]$Harness, [string]$LinkPath) {
  $parent = Split-Path -Parent $LinkPath
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($LinkPath)
  $shortcut.TargetPath = Join-Path $Harness 'DeepSeek Harness.exe'
  $shortcut.Arguments = '"' + (Join-Path $Harness 'app') + '"'
  $shortcut.WorkingDirectory = $Harness
  $shortcut.IconLocation = (Join-Path $Harness 'DeepSeek Harness.exe') + ',0'
  $shortcut.Save()
}

function New-UpdateShortcut([string]$Updater, [string]$LinkPath) {
  $parent = Split-Path -Parent $LinkPath
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($LinkPath)
  $shortcut.TargetPath = $Updater
  $shortcut.WorkingDirectory = Split-Path -Parent $Updater
  $shortcut.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',238'
  $shortcut.Save()
}

try {
  $bundle = Join-Path $root 'DeepSeek Harness'
  $defaultTarget = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness Wallpaper'
  if ($InstallDir) { $target = $InstallDir } elseif ($env:DSH_INSTALL_DIR) { $target = $env:DSH_INSTALL_DIR } else { $target = $defaultTarget }
  $harness = Install-BundledHarness $bundle $target

  if (-not $harness) {
    $candidates = @($InstallDir, $env:DSH_INSTALL_DIR, (Get-RunningHarness), $defaultTarget,
      (Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'),
      (Join-Path $env:ProgramFiles 'DeepSeek Harness'))
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'DeepSeek Harness') }
    $harness = $candidates | Where-Object { Test-Harness $_ } | Select-Object -First 1
  }

  $node = ''
  if ($env:DSH_NODE -and (Test-Path -LiteralPath $env:DSH_NODE -PathType Leaf)) { $node = $env:DSH_NODE }
  if (-not $node -and $harness) { $node = Join-Path $harness 'runtime\node.exe' }
  if (-not $node) {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { $node = $command.Source }
  }
  if (-not $node -or -not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Node.js 18+ was not found. Use the full suite or set DSH_NODE.' }

  $version = & $node -p "process.versions.node"
  if ($LASTEXITCODE -ne 0 -or [int]($version.Split('.')[0]) -lt 18) { throw "Node.js 18+ is required; found $version" }
  if ($DshHome) { $env:DSH_HOME = [IO.Path]::GetFullPath($DshHome) }
  $env:DSH_NODE_EXE = [IO.Path]::GetFullPath($node)
  if ($harness) { $env:DSH_INSTALL_DIR = [IO.Path]::GetFullPath($harness) }
  if ($env:DSH_WALLPAPER_INSTALL_DIR) {
    $runtimeDir = [IO.Path]::GetFullPath($env:DSH_WALLPAPER_INSTALL_DIR)
  } else {
    $runtimeDir = Join-Path $env:LOCALAPPDATA 'DSHWallpaperBridge\current'
  }
  $env:DSH_WALLPAPER_INSTALL_DIR = $runtimeDir

  & $node (Join-Path $root 'install.js')
  if ($LASTEXITCODE -ne 0) { throw "Plugin installer exited with code $LASTEXITCODE" }

  if (-not $NoShortcut) {
    New-UpdateShortcut (Join-Path $runtimeDir 'update.cmd') (Join-Path ([Environment]::GetFolderPath('Programs')) 'Update DSH Wallpaper Bridge.lnk')
  }

  if ($harness) {
    if (-not $NoShortcut) {
      New-HarnessShortcut $harness (Join-Path ([Environment]::GetFolderPath('Desktop')) 'DeepSeek Harness Wallpaper.lnk')
      New-HarnessShortcut $harness (Join-Path ([Environment]::GetFolderPath('Programs')) 'DeepSeek Harness Wallpaper.lnk')
    }
    if (-not $NoLaunch -and -not (Get-RunningHarness)) {
      Start-Process -FilePath (Join-Path $harness 'DeepSeek Harness.exe') -ArgumentList ('"' + (Join-Path $harness 'app') + '"') -WorkingDirectory $harness
    } elseif (Get-RunningHarness) {
      Write-Host 'DeepSeek Harness is running. Restart it once to load the installed plugin.'
    }
  } else {
    Write-Warning 'DeepSeek Harness was not located. The Cordis files are installed; start or restart DSH manually.'
  }
  Write-Host 'Setup completed.'
} catch {
  Write-Error $_
  exit 1
}
