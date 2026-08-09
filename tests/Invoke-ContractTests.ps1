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

function Invoke-Git {
    <#
    .SYNOPSIS
        Runs Git in an isolated fixture repository.
    .OUTPUTS
        System.String[].
    #>
    [CmdletBinding()]
    [OutputType([string[]])]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string[]]$Arguments
    )

    $Output = @(& git -C $Path @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed in '$Path':`n$($Output -join [Environment]::NewLine)"
    }
    return $Output
}

function New-GitFixture {
    <#
    .SYNOPSIS
        Creates an isolated Git repository with deterministic identity and an initial commit.
    .OUTPUTS
        System.String.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Path
    )

    New-Item -Path $Path -ItemType Directory -Force | Out-Null
    Invoke-Git -Path $Path -Arguments @('init', '--initial-branch=main') | Out-Null
    Invoke-Git -Path $Path -Arguments @('config', 'user.email', 'contract@example.invalid') | Out-Null
    Invoke-Git -Path $Path -Arguments @('config', 'user.name', 'Contract Tests') | Out-Null
    New-Item -Path (Join-Path $Path '.github') -ItemType Directory -Force | Out-Null
    Set-Content -Path (Join-Path $Path '.github/copilot-instructions.md') -Value '# Instructions'
    Set-Content -Path (Join-Path $Path 'README.md') -Value '# Fixture'
    Invoke-Git -Path $Path -Arguments @('add', '.') | Out-Null
    Invoke-Git -Path $Path -Arguments @('commit', '-m', 'Create fixture') | Out-Null
    return $Path
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

        $HarnessPath = Join-Path $RepoRoot 'tests/contract-harness.mjs'
        $Phase4ContractsPath = Join-Path $RepoRoot 'tests/phase4-contracts.mjs'
        $Phase4Output = @(& node $Phase4ContractsPath 2>&1)
        Assert-Condition -Condition ($LASTEXITCODE -eq 0) -Message "Phase 4 contracts failed:`n$($Phase4Output -join [Environment]::NewLine)"
        $ExpectedNormalization = Get-Content -Path (Join-Path $RepoRoot 'tests/expected/github-normalization.json') -Raw | ConvertFrom-Json -AsHashtable
        $NormalizedRemoteFindings = @()
        foreach ($FixtureName in $ExpectedNormalization.Keys) {
            $FixturePath = Join-Path $RepoRoot "tests/fixtures/github/$FixtureName"
            $Normalized = Invoke-NodeJson -Arguments @($HarnessPath, '--normalize-http', $FixturePath)
            Assert-Condition -Condition ($Normalized.finding.status -eq $ExpectedNormalization[$FixtureName]) -Message "Unexpected normalization for $FixtureName."
            Assert-Condition -Condition (-not [string]::IsNullOrWhiteSpace($Normalized.endpoint)) -Message "Normalization omitted endpoint for $FixtureName."
            Assert-Condition -Condition (-not [string]::IsNullOrWhiteSpace($Normalized.responseClass)) -Message "Normalization omitted response class for $FixtureName."
            Assert-Condition -Condition ($Normalized.finding.source.kind -eq 'github-api') -Message "Normalization omitted GitHub API attribution for $FixtureName."
            Assert-Condition -Condition ($Normalized.finding.trust.classification -eq 'untrusted-remote') -Message "Normalization omitted remote trust classification for $FixtureName."
            $NormalizedRemoteFindings += $Normalized.finding
        }
        $MergedInventory = Get-Content -Path (Join-Path $ExamplePath 'standard-inventory.json') -Raw | ConvertFrom-Json
        $MergedInventory.auditId = 'remote-normalization-contract'
        $MergedInventory.findings = $NormalizedRemoteFindings
        $MergedInventoryValid = ($MergedInventory | ConvertTo-Json -Depth 20) | Test-Json -SchemaFile $SchemaPath
        Assert-Condition -Condition $MergedInventoryValid -Message 'Normalized remote findings produced an invalid merged inventory.'

        $TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "advisor-contract-$([guid]::NewGuid())"
        $CollectorRoot = New-GitFixture -Path (Join-Path $TempRoot 'collector')
        $ObservedAt = '2026-08-08T00:00:00.000Z'
        $CollectorArguments = @(
            $DispatcherPath,
            '--repo', $CollectorRoot,
            '--mode', 'strict',
            '--observed-at', $ObservedAt
        )
        $CollectorBefore = Get-DirectorySnapshot -Path $CollectorRoot
        $CollectorInventory = Invoke-NodeJson -Arguments $CollectorArguments
        $CollectorAfter = Get-DirectorySnapshot -Path $CollectorRoot
        Assert-SnapshotEqual -Expected $CollectorBefore -Actual $CollectorAfter -Message 'Strict collector mode changed the fixture repository.'
        $CollectorValid = ($CollectorInventory | ConvertTo-Json -Depth 20) | Test-Json -SchemaFile $SchemaPath
        Assert-Condition -Condition $CollectorValid -Message 'Collector emitted an invalid inventory.'
        Assert-Condition -Condition ($CollectorInventory.repository.git.state -eq 'branch') -Message 'Collector did not identify the current Git branch.'
        Assert-Condition -Condition ($CollectorInventory.repository.currentBranch -eq 'main') -Message 'Collector reported the wrong current branch.'
        Assert-Condition -Condition ($CollectorInventory.repository.defaultBranch.status -eq 'unverified') -Message 'Local collection overclaimed the hosted default branch.'
        Assert-Condition -Condition (($CollectorInventory.findings | Where-Object id -eq 'copilot-instructions').scope -eq 'head-branch') -Message 'Committed instructions were not attributed to HEAD.'

        $RepeatedInventory = Invoke-NodeJson -Arguments $CollectorArguments
        Assert-Condition -Condition (($CollectorInventory | ConvertTo-Json -Depth 20 -Compress) -eq ($RepeatedInventory | ConvertTo-Json -Depth 20 -Compress)) -Message 'Collector output is not deterministic for fixed inputs.'

        Set-Content -Path (Join-Path $CollectorRoot '.github/copilot-instructions.md') -Value '# Dirty instructions'
        $DirtyInventory = Invoke-NodeJson -Arguments $CollectorArguments
        $DirtyFinding = $DirtyInventory.findings | Where-Object id -eq 'copilot-instructions'
        Assert-Condition -Condition ($DirtyFinding.scope -eq 'working-tree') -Message 'Dirty instructions were not attributed to the working tree.'
        Assert-Condition -Condition ($DirtyFinding.status -eq 'local-only') -Message 'Dirty instructions were overclaimed as enforced.'

        New-Item -Path (Join-Path $CollectorRoot '.github/instructions') -ItemType Directory -Force | Out-Null
        Set-Content -Path (Join-Path $CollectorRoot '.github/instructions/staged.instructions.md') -Value '# Staged'
        Invoke-Git -Path $CollectorRoot -Arguments @('add', '.github/instructions/staged.instructions.md') | Out-Null
        $StagedInventory = Invoke-NodeJson -Arguments $CollectorArguments
        $StagedFinding = $StagedInventory.findings | Where-Object id -eq 'path-instructions'
        Assert-Condition -Condition ($StagedFinding.discovery.indexCount -eq 1) -Message 'Staged instructions were not found in the index.'
        Assert-Condition -Condition ($StagedFinding.discovery.headCount -eq 0) -Message 'Staged instructions were incorrectly found in HEAD.'

        Invoke-Git -Path $CollectorRoot -Arguments @('checkout', '-b', 'feature/audit') | Out-Null
        Invoke-Git -Path $CollectorRoot -Arguments @('remote', 'add', 'origin', 'https://example.invalid/org/repo.git') | Out-Null
        Invoke-Git -Path $CollectorRoot -Arguments @('update-ref', 'refs/remotes/origin/main', 'HEAD') | Out-Null
        Invoke-Git -Path $CollectorRoot -Arguments @('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main') | Out-Null
        $RemoteHeadInventory = Invoke-NodeJson -Arguments $CollectorArguments
        Assert-Condition -Condition ($RemoteHeadInventory.repository.currentBranch -eq 'feature/audit') -Message 'Feature branch identity was not retained.'
        Assert-Condition -Condition ($RemoteHeadInventory.repository.git.remoteHead.name -eq 'main') -Message 'Remote HEAD branch normalization failed.'
        Assert-Condition -Condition ($RemoteHeadInventory.repository.git.remoteHead.remote -eq 'origin') -Message 'Remote HEAD remote normalization failed.'
        Assert-Condition -Condition ($RemoteHeadInventory.repository.git.remoteHead.status -eq 'unverified') -Message 'Remote HEAD fallback was overclaimed.'
        Assert-Condition -Condition ($RemoteHeadInventory.repository.defaultBranch.name -eq $null) -Message 'Remote HEAD was incorrectly promoted to hosted default branch.'

        Invoke-Git -Path $CollectorRoot -Arguments @('add', '.') | Out-Null
        Invoke-Git -Path $CollectorRoot -Arguments @('commit', '-m', 'Add staged controls') | Out-Null
        Invoke-Git -Path $CollectorRoot -Arguments @('checkout', '--detach') | Out-Null
        $DetachedInventory = Invoke-NodeJson -Arguments $CollectorArguments
        Assert-Condition -Condition ($DetachedInventory.repository.git.state -eq 'detached') -Message 'Detached HEAD was not identified.'
        Assert-Condition -Condition ($DetachedInventory.repository.currentBranch -eq $null) -Message 'Detached HEAD reported a current branch.'

        $UnbornRoot = Join-Path $TempRoot 'unborn'
        New-Item -Path $UnbornRoot -ItemType Directory -Force | Out-Null
        Invoke-Git -Path $UnbornRoot -Arguments @('init', '--initial-branch=feature') | Out-Null
        Set-Content -Path (Join-Path $UnbornRoot 'AGENTS.md') -Value '# Unborn'
        $UnbornInventory = Invoke-NodeJson -Arguments @($DispatcherPath, '--repo', $UnbornRoot, '--mode', 'strict', '--observed-at', $ObservedAt)
        Assert-Condition -Condition ($UnbornInventory.repository.git.state -eq 'unborn') -Message 'Unborn repository was not identified.'
        Assert-Condition -Condition ($UnbornInventory.repository.currentBranch -eq 'feature') -Message 'Unborn branch identity was not retained.'

        $NoRepositoryRoot = Join-Path $TempRoot 'no-repository'
        New-Item -Path $NoRepositoryRoot -ItemType Directory -Force | Out-Null
        Set-Content -Path (Join-Path $NoRepositoryRoot 'AGENTS.md') -Value '# No repository'
        $NoRepositoryInventory = Invoke-NodeJson -Arguments @($DispatcherPath, '--repo', $NoRepositoryRoot, '--mode', 'strict', '--observed-at', $ObservedAt)
        Assert-Condition -Condition ($NoRepositoryInventory.repository.git.state -eq 'no-repository') -Message 'Non-Git directory was not identified.'
        Assert-Condition -Condition (($NoRepositoryInventory.findings | Where-Object id -eq 'root-agents').status -eq 'local-only') -Message 'Non-Git control presence was not retained as local evidence.'

        $DiscoveryRoot = New-GitFixture -Path (Join-Path $TempRoot 'discovery')
        $DiscoveryFiles = @{
            'services/api/AGENTS.md' = '# Nested'
            'services/api/package.json' = '{}'
            '.github/PULL_REQUEST_TEMPLATE/Feature.MD' = '# Pull request'
            '.agents/skills/sample/SKILL.md' = '# Skill'
            '.github/SECURITY.md' = '# Security'
            'docs/adr/0001-test.md' = '# ADR'
            'node_modules/ignored/package.json' = '{}'
            'dist/generated/AGENTS.md' = '# Generated'
            '.apm/skills/generated/SKILL.md' = '# Package source'
            'ignored/AGENTS.md' = '# Git ignored'
        }
        foreach ($RelativePath in $DiscoveryFiles.Keys) {
            $TargetPath = Join-Path $DiscoveryRoot $RelativePath
            New-Item -Path (Split-Path -Parent $TargetPath) -ItemType Directory -Force | Out-Null
            Set-Content -Path $TargetPath -Value $DiscoveryFiles[$RelativePath]
        }
        Set-Content -Path (Join-Path $DiscoveryRoot '.gitignore') -Value 'ignored/'
        Invoke-Git -Path $DiscoveryRoot -Arguments @('add', '.') | Out-Null
        Invoke-Git -Path $DiscoveryRoot -Arguments @('commit', '-m', 'Add discovery controls') | Out-Null
        $DiscoveryInventory = Invoke-NodeJson -Arguments @($DispatcherPath, '--repo', $DiscoveryRoot, '--mode', 'strict', '--observed-at', $ObservedAt)
        $DiscoveryIds = @($DiscoveryInventory.findings.id)
        foreach ($ExpectedId in @('nested-agents', 'build-manifests', 'pull-request-templates', 'agent-skills', 'security-policy', 'architecture-decisions')) {
            Assert-Condition -Condition ($DiscoveryIds -contains $ExpectedId) -Message "Discovery omitted '$ExpectedId'."
        }
        $AllSamples = @($DiscoveryInventory.findings.discovery.sampledPaths)
        Assert-Condition -Condition (-not ($AllSamples -match 'node_modules|dist/generated|\.apm/|^ignored/')) -Message 'Discovery included generated, dependency, package, or ignored paths.'

        $Canary = 'ghp_123456789012345678901234567890'
        New-Item -Path (Join-Path $DiscoveryRoot '.github/instructions') -ItemType Directory -Force | Out-Null
        $CanaryPath = Join-Path $DiscoveryRoot ".github/instructions/$Canary.instructions.md"
        Set-Content -Path $CanaryPath -Value '$(throw "repository content executed")'
        $CanaryInventoryJson = @(& node $DispatcherPath --repo $DiscoveryRoot --mode strict --observed-at $ObservedAt 2>&1) -join [Environment]::NewLine
        Assert-Condition -Condition ($LASTEXITCODE -eq 0) -Message 'Adversarial repository text changed collector execution.'
        Assert-Condition -Condition (-not $CanaryInventoryJson.Contains($Canary)) -Message 'Secret-shaped repository data was emitted without redaction.'
        Assert-Condition -Condition ($CanaryInventoryJson.Contains('[REDACTED]')) -Message 'Secret-shaped repository data was not marked as redacted.'

        $LargeRoot = New-GitFixture -Path (Join-Path $TempRoot 'large')
        New-Item -Path (Join-Path $LargeRoot '.github/instructions') -ItemType Directory -Force | Out-Null
        foreach ($Index in 1..1000) {
            Set-Content -Path (Join-Path $LargeRoot ".github/instructions/control-$($Index.ToString('0000')).instructions.md") -Value '# Control'
        }
        Invoke-Git -Path $LargeRoot -Arguments @('add', '.') | Out-Null
        Invoke-Git -Path $LargeRoot -Arguments @('commit', '-m', 'Add one thousand controls') | Out-Null
        $LargeInventory = Invoke-NodeJson -Arguments @($DispatcherPath, '--repo', $LargeRoot, '--mode', 'strict', '--observed-at', $ObservedAt)
        $LargeFinding = $LargeInventory.findings | Where-Object id -eq 'path-instructions'
        Assert-Condition -Condition ($LargeFinding.discovery.totalCount -eq 1000) -Message 'Large discovery total was not preserved.'
        Assert-Condition -Condition ($LargeFinding.discovery.sampleCount -eq 20) -Message 'Large discovery sample was not bounded.'
        Assert-Condition -Condition $LargeFinding.discovery.truncated -Message 'Large discovery did not report truncation.'
        Assert-Condition -Condition ($LargeInventory.outputBudget.omittedFindingCount -ge 980) -Message 'Large discovery omission total was not preserved.'
        $LargeInventoryBytes = [Text.Encoding]::UTF8.GetByteCount(($LargeInventory | ConvertTo-Json -Depth 20 -Compress))
        Assert-Condition -Condition ($LargeInventoryBytes -le $LargeInventory.outputBudget.maxEvidenceBytes) -Message 'Large discovery exceeded the configured byte budget.'

        $ApprovedInventoryPath = Join-Path $TempRoot 'approved/collector-inventory.json'
        $StandardInventory = Invoke-NodeJson -Arguments @(
            $DispatcherPath,
            '--repo', $DiscoveryRoot,
            '--mode', 'standard',
            '--inventory-path', $ApprovedInventoryPath,
            '--observed-at', $ObservedAt
        )
        Assert-Condition -Condition (Test-Path -Path $ApprovedInventoryPath -PathType Leaf) -Message 'Standard collector mode did not write the approved inventory.'
        Assert-Condition -Condition ((Get-Content -Path $ApprovedInventoryPath -Raw | ConvertFrom-Json).auditId -eq $StandardInventory.auditId) -Message 'Persisted collector inventory differs from stdout.'

        $FailureOutput = @(& node $DispatcherPath --repo (Join-Path $TempRoot 'missing') --mode strict --observed-at $ObservedAt 2>&1)
        Assert-Condition -Condition ($LASTEXITCODE -ne 0) -Message 'Missing repository setup failure exited successfully.'
        $SerializationOutput = @(& node $DispatcherPath --repo $CollectorRoot --mode strict --observed-at $ObservedAt --max-evidence-bytes 1 2>&1)
        Assert-Condition -Condition ($LASTEXITCODE -ne 0) -Message 'Serialization budget failure exited successfully.'
        $StrictWriteOutput = @(& node $DispatcherPath --repo $CollectorRoot --mode strict --inventory-path (Join-Path $TempRoot 'forbidden.json') --observed-at $ObservedAt 2>&1)
        Assert-Condition -Condition ($LASTEXITCODE -ne 0) -Message 'Strict mode accepted an inventory write path.'

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
            Assert-Condition -Condition ($StartExitCode -eq 0) -Message 'APM start did not complete local collection.'
            Assert-Condition -Condition ($AuditExitCode -eq 0) -Message 'APM audit did not complete local collection.'
            $StartJson = $StartOutput | Where-Object { ([string]$_).TrimStart().StartsWith('{') } | Select-Object -Last 1
            $AuditJson = $AuditOutput | Where-Object { ([string]$_).TrimStart().StartsWith('{') } | Select-Object -Last 1
            Assert-Condition -Condition ($null -ne $StartJson) -Message 'APM start did not emit collector JSON.'
            Assert-Condition -Condition ($null -ne $AuditJson) -Message 'APM audit did not emit collector JSON.'
            $StartInventory = $StartJson | ConvertFrom-Json
            $AuditInventory = $AuditJson | ConvertFrom-Json
            Assert-Condition -Condition ($StartInventory.schemaVersion -eq '1.0.0') -Message 'APM start did not route to the collector.'
            Assert-Condition -Condition ($AuditInventory.schemaVersion -eq '1.0.0') -Message 'APM audit did not route to the collector.'
        }

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