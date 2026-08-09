#!/usr/bin/env pwsh
# Copyright (c) Microsoft Corporation.
# SPDX-License-Identifier: MIT
#Requires -Version 7.0

<#
.SYNOPSIS
    Records runtime availability and dispatcher behavior for an audit host.
.DESCRIPTION
    Measures command availability and startup duration for candidate runtimes, invokes
    the Phase 2 dispatcher probe when Node.js is available, and writes structured JSON.
.PARAMETER RepoRoot
    Root directory of the Agentic SDLC Advisor repository.
.PARAMETER OutputPath
    Destination for measured runtime facts.
.EXAMPLE
    ./tools/Invoke-RuntimeMatrixProbe.ps1 -OutputPath artifacts/runtime-probe.json
.NOTES
    The package validation workflow runs this script on Windows, Ubuntu, and macOS.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),

    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$OutputPath = (Join-Path $RepoRoot 'artifacts/runtime-probe.json')
)

$ErrorActionPreference = 'Stop'

#region Functions

function Get-RuntimeProbe {
    <#
    .SYNOPSIS
        Measures one runtime command without requiring it to exist.
    .OUTPUTS
        System.Management.Automation.PSCustomObject.
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string[]]$VersionArguments
    )

    $Command = Get-Command -Name $Name -ErrorAction SilentlyContinue
    if (-not $Command) {
        return [pscustomobject]@{
            name = $Name
            available = $false
            path = $null
            version = $null
            startupMilliseconds = $null
        }
    }

    $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $VersionOutput = @(& $Command.Source @VersionArguments 2>&1)
    $ExitCode = $LASTEXITCODE
    $Stopwatch.Stop()
    if ($ExitCode -ne 0) {
        throw "Runtime probe failed for '$Name': $($VersionOutput -join [Environment]::NewLine)"
    }

    return [pscustomobject]@{
        name = $Name
        available = $true
        path = $Command.Source
        version = ($VersionOutput | Select-Object -First 1).ToString()
        startupMilliseconds = [math]::Round($Stopwatch.Elapsed.TotalMilliseconds, 2)
    }
}

#endregion Functions

#region Main Execution

if ($MyInvocation.InvocationName -ne '.') {
    try {
        $Runtimes = @(
            Get-RuntimeProbe -Name 'node' -VersionArguments @('--version')
            Get-RuntimeProbe -Name 'python' -VersionArguments @('--version')
            Get-RuntimeProbe -Name 'python3' -VersionArguments @('--version')
            Get-RuntimeProbe -Name 'pwsh' -VersionArguments @('--version')
            Get-RuntimeProbe -Name 'bash' -VersionArguments @('--version')
            Get-RuntimeProbe -Name 'sh' -VersionArguments @('-c', 'echo $0')
            Get-RuntimeProbe -Name 'apm' -VersionArguments @('--version')
        )

        $NodeRuntime = $Runtimes | Where-Object { $_.name -eq 'node' }
        $DispatchProbe = $null
        if ($NodeRuntime.available) {
            $DispatcherPath = Join-Path $RepoRoot '.apm/skills/agentic-sdlc-audit/scripts/audit-dispatch.mjs'
            $DispatchOutput = @(& node $DispatcherPath --probe 2>&1)
            if ($LASTEXITCODE -ne 0) {
                throw "Dispatcher probe failed: $($DispatchOutput -join [Environment]::NewLine)"
            }
            $DispatchProbe = ($DispatchOutput -join [Environment]::NewLine) | ConvertFrom-Json
        }

        $Result = [ordered]@{
            measuredAt = [DateTimeOffset]::UtcNow.ToString('o')
            operatingSystem = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription
            platform = [System.Environment]::OSVersion.Platform.ToString()
            architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
            runtimes = $Runtimes
            dispatch = $DispatchProbe
        }

        $OutputDirectory = Split-Path -Parent $OutputPath
        if ($OutputDirectory) {
            $null = New-Item -ItemType Directory -Path $OutputDirectory -Force
        }
        $Result | ConvertTo-Json -Depth 10 | Set-Content -Path $OutputPath -Encoding utf8NoBOM
        $Result | ConvertTo-Json -Depth 10
        exit 0
    }
    catch {
        Write-Error -ErrorAction Continue "Runtime matrix probe failed: $($_.Exception.Message)"
        exit 1
    }
}

#endregion Main Execution