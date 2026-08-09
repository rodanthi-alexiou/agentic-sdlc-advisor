#!/usr/bin/env pwsh
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#Requires -Version 7.0

<#
.SYNOPSIS
    Validates the Agentic SDLC Advisor package boundary.
.DESCRIPTION
    Validates APM metadata and confirms that the default plugin pack preview contains
    exactly the intended release files. The script does not generate or compare the
    standalone .github mirror.
.PARAMETER RepoRoot
    Root directory of the Agentic SDLC Advisor repository.
.PARAMETER ApmCommand
    APM CLI command name or path.
.EXAMPLE
    ./tools/Test-PackageBoundary.ps1
.NOTES
    Runs directly from a repository checkout with APM available on PATH.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),

    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$ApmCommand = 'apm'
)

$ErrorActionPreference = 'Stop'

#region Functions

function Test-PackageBoundary {
    <#
    .SYNOPSIS
        Validates APM compilation and the default plugin bundle contents.
    .OUTPUTS
        System.Boolean
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$RepositoryPath,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Command
    )

    if (-not (Get-Command -Name $Command -ErrorAction SilentlyContinue)) {
        throw "APM CLI command '$Command' was not found on PATH."
    }

    $ExpectedFiles = @(
        'agents/agentic-sdlc-advisor.agent.md'
        'commands/agentic-sdlc-audit.md'
        'skills/agentic-sdlc-audit/SKILL.md'
        'skills/agentic-sdlc-audit/assets/report-template.md'
        'skills/agentic-sdlc-audit/assets/templates/AGENTS.md.template'
        'skills/agentic-sdlc-audit/assets/templates/agent-task.issue-template.yml'
        'skills/agentic-sdlc-audit/assets/templates/copilot-instructions.md.template'
        'skills/agentic-sdlc-audit/assets/templates/copilot-setup-steps.yml.template'
        'skills/agentic-sdlc-audit/references/best-practices.md'
        'skills/agentic-sdlc-audit/references/evidence-contract.md'
        'skills/agentic-sdlc-audit/references/maturity-model.md'
        'skills/agentic-sdlc-audit/references/rubric.md'
        'skills/agentic-sdlc-audit/references/sources.md'
        'skills/agentic-sdlc-audit/references/use-cases.md'
        'skills/agentic-sdlc-audit/schemas/examples/standard-inventory.json'
        'skills/agentic-sdlc-audit/schemas/examples/strict-unverified-inventory.json'
        'skills/agentic-sdlc-audit/schemas/inventory-v1.schema.json'
        'skills/agentic-sdlc-audit/scripts/audit-dispatch.mjs'
        'skills/agentic-sdlc-audit/scripts/local-collector.mjs'
        'skills/agentic-sdlc-audit/scripts/scan.sh'
        'plugin.json'
    )

    Push-Location -Path $RepositoryPath
    try {
        $CompileOutput = @(& $Command compile --validate 2>&1)
        if ($LASTEXITCODE -ne 0) {
            throw "APM compile validation failed:`n$($CompileOutput -join [Environment]::NewLine)"
        }

        $PackOutput = @(& $Command pack --dry-run --verbose 2>&1)
        if ($LASTEXITCODE -ne 0) {
            throw "APM pack preview failed:`n$($PackOutput -join [Environment]::NewLine)"
        }

        $ActualFiles = @(
            $PackOutput |
                ForEach-Object { $_.ToString() } |
                Where-Object { $_ -match '^  \S' } |
                ForEach-Object { $_.Trim() }
        )

        $Difference = @(Compare-Object -ReferenceObject $ExpectedFiles -DifferenceObject $ActualFiles)
        if ($Difference.Count -gt 0) {
            $DifferenceText = $Difference | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
            throw "Default plugin bundle boundary changed:`n$($DifferenceText -join [Environment]::NewLine)"
        }

        Write-Host "Package boundary validation passed: $($ActualFiles.Count) intended files." -ForegroundColor Green
        return $true
    }
    finally {
        Pop-Location
    }
}

#endregion Functions

#region Main Execution

if ($MyInvocation.InvocationName -ne '.') {
    try {
        $null = Test-PackageBoundary -RepositoryPath $RepoRoot -Command $ApmCommand
        exit 0
    }
    catch {
        Write-Error -ErrorAction Continue "Package boundary validation failed: $($_.Exception.Message)"
        exit 1
    }
}

#endregion Main Execution