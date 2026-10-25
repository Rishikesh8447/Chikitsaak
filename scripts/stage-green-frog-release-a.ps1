param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$ReviewedCommit
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$expectedHost = 'ep-green-frog-adc7hgyv-pooler.c-2.us-east-1.aws.neon.tech'
$expectedDatabase = 'neondb'
$baseMigrations = @(
    '000000000000_baseline',
    '20261012000000_laboratory_workflow',
    '20261016000000_pharmacy_partners'
)
$paymentMigrations = @(
    '20261020000000_appointment_payment_pending_status',
    '20261021000000_online_appointment_payments',
    '20261021120000_payment_reliability_review',
    '20261021130000_offline_appointment_payments',
    '20261021140000_cash_collection_audit',
    '20261024120000_payment_backed_doctor_payouts'
)
$cleanupMigration = '20261024130000_remove_legacy_credit_system'
$releaseMigrations = @($baseMigrations) + @($paymentMigrations)
$allExpectedMigrations = @($releaseMigrations) + @($cleanupMigration)

function Assert-EqualSequence([string[]]$Expected, [string[]]$Actual, [string]$Description) {
    $expectedSorted = @($Expected | Sort-Object)
    $actualSorted = @($Actual | Sort-Object)
    if (Compare-Object -ReferenceObject $expectedSorted -DifferenceObject $actualSorted) {
        throw "$Description does not match the reviewed Release A migration set."
    }
}

Push-Location $repoRoot
try {
    $gitRoot = (& git rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -ne 0 -or [IO.Path]::GetFullPath($gitRoot.Trim()) -ne $repoRoot) {
        throw 'Run this from the reviewed Chikitsaak Git checkout.'
    }

    $head = (& git rev-parse HEAD 2>$null)
    if ($LASTEXITCODE -ne 0 -or $head.Trim() -ne $ReviewedCommit.ToLowerInvariant()) {
        throw 'ReviewedCommit must exactly match HEAD in this checkout.'
    }

    $worktreeChanges = @(& git status --porcelain --untracked-files=all 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify the Git working tree state.' }
    if ($worktreeChanges.Count -gt 0) {
        throw 'Release A requires a clean reviewed checkout. No files were staged.'
    }

    $migrationRoot = Join-Path $repoRoot 'prisma\migrations'
    $sourceNames = @(Get-ChildItem -LiteralPath $migrationRoot -Directory | Select-Object -ExpandProperty Name)
    Assert-EqualSequence -Expected $allExpectedMigrations -Actual $sourceNames -Description 'Active migration directories'
    if ($releaseMigrations -contains $cleanupMigration) {
        throw 'Internal safety check failed: cleanup migration is included in Release A.'
    }

    foreach ($name in $releaseMigrations) {
        $sourceDirectory = Join-Path $migrationRoot $name
        $sourceFiles = @(Get-ChildItem -LiteralPath $sourceDirectory -File -Recurse | ForEach-Object {
            $_.FullName.Substring($sourceDirectory.Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
        })
        if ($sourceFiles.Count -ne 1 -or $sourceFiles[0] -ne 'migration.sql') {
            throw "Unexpected files in reviewed migration directory: $name"
        }
    }

    if (-not (Test-Path -LiteralPath '.env.local' -PathType Leaf)) { throw '.env.local is missing.' }
    $targetValidationCode = "const fs=require('node:fs'); const dotenv=require('dotenv'); const {validateGreenFrogTarget}=require('./scripts/green-frog-schema-verification.cjs'); const target=validateGreenFrogTarget(dotenv.parse(fs.readFileSync('.env.local','utf8')).DATABASE_URL); if(!target.ok){ console.error(target.reason); process.exit(2); } process.stdout.write('Green Frog target validated.');"
    $targetCheck = & node -e $targetValidationCode
    if ($LASTEXITCODE -ne 0) { throw 'Configured DATABASE_URL is not the approved Green Frog target.' }
    Write-Host $targetCheck

    & npm.cmd run db:migration-preflight -- --expect reconciled --database $expectedDatabase --host $expectedHost
    if ($LASTEXITCODE -ne 0) { throw 'The read-only reconciled migration preflight failed. No artifact was staged.' }

    $stageRoot = Join-Path $env:TEMP "chikitsaak-green-frog-release-a-$($ReviewedCommit.ToLowerInvariant())"
    $stagePrisma = Join-Path $stageRoot 'prisma'
    $stageMigrations = Join-Path $stagePrisma 'migrations'
    $reusingStage = Test-Path -LiteralPath $stageRoot
    if (-not $reusingStage) {
        New-Item -ItemType Directory -Path $stageMigrations -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $repoRoot 'prisma\schema.prisma') -Destination $stagePrisma
        Copy-Item -LiteralPath (Join-Path $migrationRoot 'migration_lock.toml') -Destination $stageMigrations
        foreach ($name in $releaseMigrations) {
            Copy-Item -LiteralPath (Join-Path $migrationRoot $name) -Destination $stageMigrations -Recurse
        }
    }
    elseif (-not (Test-Path -LiteralPath $stageMigrations -PathType Container)) {
        throw "Existing deterministic staging path is incomplete; preserve and review it: $stageRoot"
    }

    $stagedNames = @(Get-ChildItem -LiteralPath $stageMigrations -Directory | Select-Object -ExpandProperty Name)
    Assert-EqualSequence -Expected $releaseMigrations -Actual $stagedNames -Description 'Staged migration directories'
    if (Test-Path -LiteralPath (Join-Path $stageMigrations $cleanupMigration)) {
        throw 'Cleanup migration was unexpectedly staged.'
    }

    foreach ($relativeFile in @('prisma\schema.prisma', 'prisma\migrations\migration_lock.toml')) {
        $sourcePath = Join-Path $repoRoot $relativeFile
        $stagedPath = Join-Path $stageRoot $relativeFile
        if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $stagedPath -Algorithm SHA256).Hash) {
            throw "Staged file checksum mismatch: $relativeFile"
        }
    }
    foreach ($name in $releaseMigrations) {
        $sourcePath = Join-Path (Join-Path $migrationRoot $name) 'migration.sql'
        $stagedPath = Join-Path (Join-Path $stageMigrations $name) 'migration.sql'
        if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $stagedPath -Algorithm SHA256).Hash) {
            throw "Migration checksum mismatch: $name"
        }
    }

    $stageVerb = if ($reusingStage) { 'reused and verified' } else { 'staged and verified' }
    Write-Host "Release A artifact $stageVerb at: $stageRoot"
    Write-Host "Included directories: $($releaseMigrations -join ', ')"
    Write-Host "Cleanup remains excluded: $cleanupMigration"
    Write-Host 'No migration command was run.'
}
finally {
    Pop-Location
}
