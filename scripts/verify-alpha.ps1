# Xyeena Notch — Authoritative Windows Alpha Verification
# Canonical entry point for 1.0.0-alpha.1 release gating.
# Run from repository root or scripts directory on Windows.
# Does NOT mutate lockfiles, commit, push, tag, or publish releases.

[CmdletBinding()]
param(
    [switch]$SkipPackaging
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

function Assert-Command($stepName, $cmd, [string[]]$cmdArgs, $workingDir = $repoRoot) {
    Write-Host "`n>>> [$stepName] Starting..." -ForegroundColor Cyan
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    Push-Location $workingDir
    try {
        & $cmd @cmdArgs
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    $sw.Stop()
    if ($exitCode -ne 0) {
        Write-Host "FAILED: $stepName (exit code $exitCode) in $($sw.Elapsed.TotalSeconds.ToString('F2'))s" -ForegroundColor Red
        throw "Verification step failed: $stepName (exit code $exitCode)"
    }
    Write-Host "PASS: $stepName ($($sw.Elapsed.TotalSeconds.ToString('F2'))s)" -ForegroundColor Green
    return [PSCustomObject]@{
        Step = $stepName
        Status = 'PASS'
        Duration = "$($sw.Elapsed.TotalSeconds.ToString('F2'))s"
    }
}

function Clean-EphemeralBuildArtifacts {
    $ephemeral = @(
        (Join-Path $repoRoot 'apps/xyeena-island/src-tauri/gen'),
        (Join-Path $repoRoot 'apps/xyeena-island/dist'),
        (Join-Path $repoRoot 'examples/guardian-playground/dist')
    )
    foreach ($p in $ephemeral) {
        if (Test-Path -LiteralPath $p) {
            Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

$results = [System.Collections.Generic.List[PSObject]]::new()
$totalSw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Xyeena Notch 1.0.0-alpha.1 Windows Verification Matrix" -ForegroundColor Cyan
Write-Host "  Repository: $repoRoot" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 0. Clean any local build remnants so init audit inspects pristine sources
Clean-EphemeralBuildArtifacts

$npm = if (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue) { 'npm.cmd' } else { 'npm' }

# 1. Source hygiene
$results.Add((Assert-Command "1. Git Diff & Whitespace Check" "git" @("diff", "--check")))

# 2. Workspace initialization audit
$results.Add((Assert-Command "2. Repository Structure & Init Audit" "node" @("scripts/audit-init.mjs")))

# 3. Reproducible dependency installation
$results.Add((Assert-Command "3. Reproducible NPM CI" $npm @("ci")))

# 4. Workspace unit tests (Island, Mascot, Playground)
$results.Add((Assert-Command "4. Workspace Unit Tests" $npm @("test")))

# 5. TypeScript strict typecheck & frontend build
$results.Add((Assert-Command "5. TypeScript & Vite Production Build" $npm @("run", "build")))

# 6. Rust format check
$tauriDir = Join-Path $repoRoot 'apps/xyeena-island/src-tauri'
$results.Add((Assert-Command "6. Rust Format Verification" "cargo" @("fmt", "--all", "--", "--check") $tauriDir))

# 7. Rust native tests
$results.Add((Assert-Command "7. Native Cargo Tests (--locked)" "cargo" @("test", "--locked") $tauriDir))

# 8. Clippy lint gate
$results.Add((Assert-Command "8. Clippy Strict Lint (--locked)" "cargo" @("clippy", "--locked", "--all-targets", "--", "-D", "warnings") $tauriDir))

# 9. Native debug build
$results.Add((Assert-Command "9. Native Cargo Build (--locked)" "cargo" @("build", "--locked") $tauriDir))

# 10. Monorepo release audit
$results.Add((Assert-Command "10. Release Audit & Capabilities Gate" $npm @("run", "release:audit")))

# 11. Optional/supported Tauri NSIS packaging
if (-not $SkipPackaging) {
    $results.Add((Assert-Command "11. Unsigned Tauri NSIS Alpha Packaging" $npm @("run", "tauri", "--workspace", "@xyeena/island", "--", "build", "--bundles", "nsis")))

    $nsisPath = Join-Path $tauriDir 'target/release/bundle/nsis'
    $installers = @(Get-ChildItem -Path "$nsisPath/*.exe" -ErrorAction SilentlyContinue)
    if ($installers.Count -lt 1) {
        throw "NSIS build succeeded but no installer executable found in $nsisPath"
    }
    foreach ($inst in $installers) {
        $hash = (Get-FileHash -Algorithm SHA256 -Path $inst.FullName).Hash
        Write-Host "  Installer: $($inst.Name) ($(($inst.Length / 1MB).ToString('F2')) MB)" -ForegroundColor Yellow
        Write-Host "  SHA256:    $hash" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n>>> [11. Unsigned Tauri NSIS Packaging] SKIPPED (-SkipPackaging flag)" -ForegroundColor Gray
    $results.Add([PSCustomObject]@{
        Step = "11. Unsigned Tauri NSIS Alpha Packaging"
        Status = "SKIPPED"
        Duration = "0.00s"
    })
}

# 12. Hygiene check on git staging
$staged = git diff --name-only --cached
if ($staged) {
    Write-Host "WARNING: Files currently staged in Git index:`n$staged" -ForegroundColor Yellow
}

$totalSw.Stop()

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  VERIFICATION MATRIX RESULTS" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
$results | Format-Table -AutoSize

Write-Host "Total Verification Duration: $($totalSw.Elapsed.TotalSeconds.ToString('F2'))s" -ForegroundColor Green
Write-Host "PASS: Authoritative Windows Alpha 1.0.0-alpha.1 Verification." -ForegroundColor Green
