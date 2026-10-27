# Builds and installs the official packaged release of Antigravity Manager on Windows.
# Handles closing running processes, removing/upgrading any existing installation, and installing the new package.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-official-windows.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-official-windows.ps1 -SkipBuild
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-official-windows.ps1 -SkipUninstall
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-official-windows.ps1 -NoLaunch

[CmdletBinding()]
param(
    [string]$InstallerPath,
    [switch]$SkipBuild,
    [switch]$SkipUninstall,
    [switch]$NoLaunch,
    [string]$Bump = 'patch',
    [switch]$NoBump,
    [string]$NewVersion
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Step, [string]$Message)
    Write-Host "==> [$Step] $Message" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Gray
}

function Write-Success {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Green
}

function Write-WarningLine {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Yellow
}

# Determine repository root
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

# If workspace is inside a path with '#' (e.g. #external.customize), map parent directory to virtual drive Y:
# (Mapping the parent ensures the repo folder is Y:\<repoName> rather than bare root Y:\, avoiding trailing slash & path split bugs in electron-packager)
if ($repoRoot -notmatch '^[A-Za-z]:\\$' -and $repoRoot -like "*#*") {
    $parentDir = Split-Path -Parent $repoRoot
    $repoLeaf = Split-Path -Leaf $repoRoot
    if (Get-PSDrive -Name Y -ErrorAction SilentlyContinue) {
        if (-not (Test-Path -LiteralPath "Y:\$repoLeaf")) {
            subst Y: /d 2>$null
            subst Y: "$parentDir"
        }
    } else {
        subst Y: "$parentDir"
    }
    Set-Location "Y:\$repoLeaf"
    $repoRoot = "Y:\$repoLeaf"
} else {
    Set-Location $repoRoot
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Antigravity Manager - Build & Install Official Release   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------------------
# Step 1: Terminate running instances
# ------------------------------------------------------------------------------
Write-Step "1/5" "Terminating any running Antigravity Manager processes..."
$processNames = @('antigravity-manager', 'Antigravity Manager', 'AntigravityManager')
$runningProcesses = Get-Process -Name $processNames -ErrorAction SilentlyContinue

if ($runningProcesses) {
    Write-WarningLine "Found running processes ($($runningProcesses.Count)): $($runningProcesses.Name -join ', '). Stopping..."
    $runningProcesses | Stop-Process -Force
    Start-Sleep -Milliseconds 1200
    Write-Success "All running instances stopped."
} else {
    Write-Info "No active Antigravity Manager process found."
}

# ------------------------------------------------------------------------------
# Step 2: Build official production package
# ------------------------------------------------------------------------------
if ($SkipBuild) {
    Write-Step "2/5" "Skipping packaging step (-SkipBuild specified)."
} else {
    # Automatic version increment for each install build
    if (-not $NoBump) {
        $packageJsonPath = Join-Path $repoRoot "package.json"
        if (Test-Path -LiteralPath $packageJsonPath) {
            $pkg = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
            $oldVersion = $pkg.version

            if ($NewVersion) {
                Write-Step "2/5" "Setting release version to $NewVersion..."
                & pnpm.cmd version --no-git-tag-version $NewVersion
            } else {
                Write-Step "2/5" "Bumping build version ($Bump) from $oldVersion..."
                & pnpm.cmd version --no-git-tag-version $Bump
            }

            if ($LASTEXITCODE -eq 0) {
                $pkgAfter = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
                Write-Success "Bumped version: $oldVersion -> $($pkgAfter.version)"
            } else {
                Write-WarningLine "Version bump exited with code $LASTEXITCODE; proceeding with existing version $oldVersion."
            }
        }
    }

    Write-Step "2/5" "Building official release package with electron-forge..."

    $hasWix = (Get-Command candle.exe -ErrorAction SilentlyContinue) -and (Get-Command light.exe -ErrorAction SilentlyContinue)
    if ($hasWix) {
        Write-Info "WiX toolset detected. Building all Windows targets (Squirrel + WiX MSI)..."
        & pnpm.cmd exec electron-forge make --platform=win32 --arch=x64
    } else {
        Write-Info "WiX toolset not detected. Building Squirrel setup package..."
        & pnpm.cmd exec electron-forge make --platform=win32 --arch=x64 --targets @electron-forge/maker-squirrel
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Packaging failed with exit code $LASTEXITCODE." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    Write-Success "Production packaging completed successfully."
}

# ------------------------------------------------------------------------------
# Step 3: Locate generated installer
# ------------------------------------------------------------------------------
Write-Step "3/5" "Locating installer package..."
$installer = $null

if ($InstallerPath) {
    if (Test-Path -LiteralPath $InstallerPath) {
        $installer = Get-Item -LiteralPath $InstallerPath
    } else {
        Write-Host "Error: Specified -InstallerPath '$InstallerPath' does not exist." -ForegroundColor Red
        exit 1
    }
} else {
    $squirrelDir = Join-Path $repoRoot "out\make\squirrel.windows\x64"
    $wixDir = Join-Path $repoRoot "out\make\wix\x64"

    if (Test-Path -LiteralPath $squirrelDir) {
        $installer = Get-ChildItem -LiteralPath $squirrelDir -Filter "*.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like "*-setup.exe" -or $_.Name -like "*Setup*.exe" -or $_.Name -like "*.exe" } |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
    }

    if (-not $installer -and (Test-Path -LiteralPath $wixDir)) {
        $installer = Get-ChildItem -LiteralPath $wixDir -Filter "*.msi" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
    }

    if (-not $installer) {
        $makeDir = Join-Path $repoRoot "out\make"
        if (Test-Path -LiteralPath $makeDir) {
            $installer = Get-ChildItem -LiteralPath $makeDir -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "*setup*.exe" -or $_.Name -like "*.exe" } |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 1
        }
    }

    if (-not $installer) {
        # Check Downloads directory as fallback
        $downloadsDir = Join-Path $env:USERPROFILE "Downloads"
        if (Test-Path -LiteralPath $downloadsDir) {
            $installer = Get-ChildItem -LiteralPath $downloadsDir -Filter "*Antigravity*Manager*" -ErrorAction SilentlyContinue |
                Where-Object { $_.Extension -in @('.exe', '.msi') } |
                Sort-Object LastWriteTime -Descending |
                Select-Object -First 1
        }
    }
}

if (-not $installer) {
    Write-Host "Error: No installer executable or MSI found in '$repoRoot\out\make' or Downloads." -ForegroundColor Red
    exit 1
}

$sizeMiB = [math]::Round($installer.Length / 1MB, 2)
Write-Success "Selected installer: $($installer.FullName) ($sizeMiB MB)"

# ------------------------------------------------------------------------------
# Step 4: Handle existing Windows installation (Upgrade / Replace / Uninstall)
# ------------------------------------------------------------------------------
if ($SkipUninstall) {
    Write-Step "4/5" "Skipping uninstall step (-SkipUninstall specified)."
} else {
    Write-Step "4/5" "Checking for existing Windows installation to cleanly upgrade/replace..."

    $uninstallRegistryPaths = @(
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    $existingInstalls = Get-ItemProperty -Path $uninstallRegistryPaths -ErrorAction SilentlyContinue |
        Where-Object {
            $_.DisplayName -and ($_.DisplayName -match 'Antigravity\s*Manager' -or $_.DisplayName -match 'antigravity-manager')
        }

    if ($existingInstalls) {
        foreach ($app in $existingInstalls) {
            Write-WarningLine "Found existing installation: '$($app.DisplayName)' (Version: $($app.DisplayVersion))"

            # Check if MSI installation (GUID product code)
            if ($app.UninstallString -match '\{[0-9A-Fa-f\-]{36}\}') {
                $guid = $Matches[0]
                Write-Info "Uninstalling existing MSI package $guid..."
                $uninstProc = Start-Process -FilePath "msiexec.exe" -ArgumentList "/x $guid /passive /norestart" -Wait -PassThru
                Write-Success "MSI uninstall completed (ExitCode: $($uninstProc.ExitCode))."
            }
            # Check if Squirrel installation with Update.exe
            elseif ($app.UninstallString -and $app.UninstallString -match 'Update\.exe') {
                Write-Info "Uninstalling existing Squirrel package..."
                if ($app.UninstallString -match '^(?<exe>"[^"]+"|\S+)\s*(?<args>.*)$') {
                    $uninstExe = $Matches['exe'].Trim('"')
                    $uninstArgs = "$($Matches['args']) -s".Trim()
                    if (Test-Path -LiteralPath $uninstExe) {
                        $uninstProc = Start-Process -FilePath $uninstExe -ArgumentList $uninstArgs -Wait -PassThru
                        Write-Success "Squirrel uninstall completed (ExitCode: $($uninstProc.ExitCode))."
                    }
                }
            }
            elseif ($app.QuietUninstallString) {
                Write-Info "Executing quiet uninstall..."
                Start-Process -FilePath "cmd.exe" -ArgumentList "/c $($app.QuietUninstallString)" -Wait -NoNewWindow
                Write-Success "Uninstall command completed."
            }
        }
        Start-Sleep -Milliseconds 1500
    } else {
        Write-Info "No previous Antigravity Manager installation registered in Windows."
    }
}

# ------------------------------------------------------------------------------
# Step 5: Install new official build
# ------------------------------------------------------------------------------
Write-Step "5/5" "Installing newly packaged build..."

if ($installer.Extension -eq '.msi') {
    Write-Info "Installing MSI package: $($installer.FullName)..."
    $installProc = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$($installer.FullName)`" /passive /norestart" -Wait -PassThru
    if ($installProc.ExitCode -ne 0) {
        Write-Host "MSI installer exited with error code $($installProc.ExitCode)." -ForegroundColor Red
        exit $installProc.ExitCode
    }
} else {
    Write-Info "Executing Setup installer: $($installer.FullName)..."
    $installProc = Start-Process -FilePath $installer.FullName -ArgumentList "-s" -Wait -PassThru
    if ($installProc.ExitCode -ne 0) {
        Write-Host "Setup installer exited with error code $($installProc.ExitCode)." -ForegroundColor Red
        exit $installProc.ExitCode
    }
}

Write-Success "Installation completed successfully."

# ------------------------------------------------------------------------------
# Verification & Launch
# ------------------------------------------------------------------------------
$candidatePaths = @(
    "$env:LOCALAPPDATA\antigravity_manager\antigravity-manager.exe",
    "$env:LOCALAPPDATA\antigravity-manager\antigravity-manager.exe",
    "$env:LOCALAPPDATA\Programs\antigravity-manager\antigravity-manager.exe",
    "$env:ProgramFiles\Antigravity Manager\antigravity-manager.exe",
    "${env:ProgramFiles(x86)}\Antigravity Manager\antigravity-manager.exe"
)

$installedExe = $candidatePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " [SUCCESS] Official Antigravity Manager Ready!" -ForegroundColor Green
if ($installedExe) {
    $ver = (Get-Item -LiteralPath $installedExe).VersionInfo.ProductVersion
    Write-Host " Installed Path: $installedExe" -ForegroundColor Cyan
    Write-Host " Version:        $ver" -ForegroundColor Cyan
} else {
    Write-Host " Installed via:  $($installer.Name)" -ForegroundColor Cyan
}
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

if (-not $NoLaunch -and $installedExe) {
    Write-Host "Launching installed Antigravity Manager..." -ForegroundColor Cyan
    Start-Process -FilePath $installedExe
}
