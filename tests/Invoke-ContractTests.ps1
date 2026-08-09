#!/usr/bin/env pwsh
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#Requires -Version 7.0

<#
.SYNOPSIS
    Runs Phase 2 contract tests for the Agentic SDLC Advisor.
.DESCRIPTION
    Validates inventory schemas, dispatch behavior, remote normalization, grouped operator
    input, and standard versus strict output side effects without network access.
.PARAMETER RepoRoot
    Root directory of the Agentic SDLC Advisor repository.
.EXAMPLE
    ./tests/Invoke-ContractTests.ps1
.NOTES
    Requires Node.js and PowerShell 7 on PATH.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

#region Functions

function Assert-Condition {
    <#
    .SYNOPSIS
        Throws when a contract assertion is false.
    .OUTPUTS
        None.
    #>
    [CmdletBinding()]
    [OutputType([void])]
    param(
        [Parameter(Mandatory = $true)]
        [bool]$Condition,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Get-DirectorySnapshot {
    <#
    .SYNOPSIS
        Returns content hashes for all files below a directory.
    .OUTPUTS
        System.Collections.Hashtable.
    #>
    [CmdletBinding()]
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Path
    )

    $Snapshot = @{}
    Get-ChildItem -Path $Path -File -Recurse | ForEach-Object {
        $RelativePath = [System.IO.Path]::GetRelativePath($Path, $_.FullName)
        $Snapshot[$RelativePath] = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash
    }
    return $Snapshot
}

function Assert-SnapshotEqual {
    <#
    .SYNOPSIS
        Asserts that two directory snapshots contain identical paths and hashes.
    .OUTPUTS
        None.
    #>
    [CmdletBinding()]
    [OutputType([void])]
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Expected,

        [Parameter(Mandatory = $true)]
        [hashtable]$Actual,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Message
    )

    $ExpectedJson = $Expected | ConvertTo-Json -Compress
    $ActualJson = $Actual | ConvertTo-Json -Compress
    Assert-Condition -Condition ($ExpectedJson -eq $ActualJson) -Message $Message
}

function Invoke-NodeJson {
    <#
    .SYNOPSIS
        Runs a Node.js script and parses its JSON stdout.
    .OUTPUTS
        System.Management.Automation.PSCustomObject.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $Output = @(& node @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Node command failed:`n$($Output -join [Environment]::NewLine)"
    }
    return ($Output -join [Environment]::NewLine) | ConvertFrom-Json
}

#endregion Functions

#region Main Execution

if ($MyInvocation.InvocationName -ne '.') {
    try {
        if (-not (Get-Command -Name node -ErrorAction SilentlyContinue)) {
            throw 'Node.js is required for contract tests.'
        }

        $SchemaPath = Join-Path $RepoRoot '.apm/skills/agentic-sdlc-audit/schemas/inventory-v1.schema.json'
        $ExamplePath = Join-Path $RepoRoot '.apm/skills/agentic-sdlc-audit/schemas/examples'
        Get-ChildItem -Path $ExamplePath -Filter '*.json' | ForEach-Object {
            $Valid = (Get-Content -Path $_.FullName -Raw) | Test-Json -SchemaFile $SchemaPath
            Assert-Condition -Condition $Valid -Message "Schema example failed: $($_.Name)"
        }

        $RequiredFindingFields = @('status', 'scope', 'source', 'consumer', 'observation')
        $BaseExample = Get-Content -Path (Join-Path $ExamplePath 'standard-inventory.json') -Raw | ConvertFrom-Json
        foreach ($Field in $RequiredFindingFields) {
            $Candidate = $BaseExample | ConvertTo-Json -Depth 20 | ConvertFrom-Json
            $Candidate.findings[0].PSObject.Properties.Remove($Field)
            $CandidateJson = $Candidate | ConvertTo-Json -Depth 20
            $Valid = $CandidateJson | Test-Json -SchemaFile $SchemaPath -ErrorAction SilentlyContinue
            Assert-Condition -Condition (-not $Valid) -Message "Schema accepted finding without '$Field'."
        }

        $DispatcherPath = Join-Path $RepoRoot '.apm/skills/agentic-sdlc-audit/scripts/audit-dispatch.mjs'
        $Probe = Invoke-NodeJson -Arguments @($DispatcherPath, '--probe')
        Assert-Condition -Condition ($Probe.contractVersion -eq '1.0.0') -Message 'Dispatch contract version mismatch.'
        Assert-Condition -Condition ($Probe.dispatcher -eq 'node') -Message 'Dispatch runtime mismatch.'

        if (Get-Command -Name apm -ErrorAction SilentlyContinue) {
            Push-Location -Path $RepoRoot
            try {
                $StartOutput = @(& apm run 2>&1)
                $StartExitCode = $LASTEXITCODE
                $AuditOutput = @(& apm run audit 2>&1)
                $AuditExitCode = $LASTEXITCODE
            }
            finally {
                Pop-Location
            }
            $ExpectedDispatchMessage = 'Audit collection is not implemented yet.'
            Assert-Condition -Condition ($StartExitCode -eq 1) -Message 'APM 0.26.0 start exit-code wrapping changed.'
            Assert-Condition -Condition ($AuditExitCode -eq 1) -Message 'APM 0.26.0 audit exit-code wrapping changed.'
            Assert-Condition -Condition (($StartOutput -join [Environment]::NewLine).Contains($ExpectedDispatchMessage)) -Message 'APM start did not invoke the dispatcher.'
            Assert-Condition -Condition (($AuditOutput -join [Environment]::NewLine).Contains($ExpectedDispatchMessage)) -Message 'APM audit did not invoke the dispatcher.'
        }

        $HarnessPath = Join-Path $RepoRoot 'tests/contract-harness.mjs'
        $ExpectedNormalization = Get-Content -Path (Join-Path $RepoRoot 'tests/expected/github-normalization.json') -Raw | ConvertFrom-Json -AsHashtable
        foreach ($FixtureName in $ExpectedNormalization.Keys) {
            $FixturePath = Join-Path $RepoRoot "tests/fixtures/github/$FixtureName"
            $Normalized = Invoke-NodeJson -Arguments @($HarnessPath, '--normalize-http', $FixturePath)
            Assert-Condition -Condition ($Normalized.status -eq $ExpectedNormalization[$FixtureName]) -Message "Unexpected normalization for $FixtureName."
        }

        $TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "advisor-contract-$([guid]::NewGuid())"
        $StrictRoot = Join-Path $TempRoot 'strict'
        $StandardRoot = Join-Path $TempRoot 'standard'
        Copy-Item -Path (Join-Path $RepoRoot 'tests/fixtures/repositories/baseline') -Destination $StrictRoot -Recurse
        Copy-Item -Path (Join-Path $RepoRoot 'tests/fixtures/repositories/baseline') -Destination $StandardRoot -Recurse

        $UnansweredPath = Join-Path $RepoRoot 'tests/fixtures/operator-input/unanswered.json'
        $StrictBefore = Get-DirectorySnapshot -Path $StrictRoot
        $StrictReport = Invoke-NodeJson -Arguments @($HarnessPath, '--mode', 'strict', '--operator-input', $UnansweredPath)
        $StrictAfter = Get-DirectorySnapshot -Path $StrictRoot
        Assert-SnapshotEqual -Expected $StrictBefore -Actual $StrictAfter -Message 'Strict mode changed the fixture repository.'
        Assert-Condition -Condition ($StrictReport.operatorInput.groupedQuestionCount -eq 1) -Message 'Unanswered input did not produce one grouped question.'
        Assert-Condition -Condition $StrictReport.operatorInput.independentChecksCompleted -Message 'Independent checks did not complete.'

        $ReportPath = Join-Path $StandardRoot 'approved/report.json'
        $InventoryPath = Join-Path $StandardRoot 'approved/inventory.json'
        $StandardBefore = Get-DirectorySnapshot -Path $StandardRoot
        $StandardReport = Invoke-NodeJson -Arguments @(
            $HarnessPath,
            '--mode', 'standard',
            '--report-path', $ReportPath,
            '--inventory-path', $InventoryPath,
            '--operator-input', $UnansweredPath
        )
        $StandardAfter = Get-DirectorySnapshot -Path $StandardRoot
        $AddedPaths = @($StandardAfter.Keys | Where-Object { -not $StandardBefore.ContainsKey($_) } | Sort-Object)
        $ExpectedAddedPaths = @(
            Join-Path 'approved' 'inventory.json'
            Join-Path 'approved' 'report.json'
        ) | Sort-Object
        Assert-Condition -Condition (($AddedPaths -join ',') -eq ($ExpectedAddedPaths -join ',')) -Message "Standard mode wrote unexpected paths: $($AddedPaths -join ', ')"
        $PersistedInventoryValid = (Get-Content -Path $InventoryPath -Raw) | Test-Json -SchemaFile $SchemaPath
        Assert-Condition -Condition $PersistedInventoryValid -Message 'Standard mode persisted an invalid inventory.'
        Assert-Condition -Condition (($StrictReport | ConvertTo-Json -Depth 20 -Compress) -eq ($StandardReport | ConvertTo-Json -Depth 20 -Compress)) -Message 'Strict and standard reports are not semantically equivalent.'

        $AnsweredPath = Join-Path $RepoRoot 'tests/fixtures/operator-input/answered.json'
        $AnsweredReport = Invoke-NodeJson -Arguments @($HarnessPath, '--mode', 'strict', '--operator-input', $AnsweredPath)
        Assert-Condition -Condition ($AnsweredReport.operatorInput.groupedQuestionCount -eq 0) -Message 'Complete operator input produced a question.'
        Assert-Condition -Condition (($AnsweredReport.findings | Where-Object id -eq 'dependency-review').status -eq 'unverified') -Message 'Unsupported dependency review did not remain unverified.'

        Remove-Item -Path $TempRoot -Recurse -Force
        Write-Host 'Contract tests passed: schema, dispatch, normalization, operator input, and file effects.' -ForegroundColor Green
        exit 0
    }
    catch {
        Write-Error -ErrorAction Continue "Contract tests failed: $($_.Exception.Message)"
        exit 1
    }
}

#endregion Main Execution