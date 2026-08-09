---
title: Audit Runtime and Dispatch
description: Accepted runtime and public command decision for the cross-platform audit
ms.date: 2026-08-09
ms.topic: architecture-decision
---

## Status

Accepted.

## Context

The audit requires one semantic implementation across Windows, Ubuntu, and macOS. The
existing `scan.sh` cannot provide native Windows execution. APM CLI 0.26.0 stores scripts
as shell command strings, bare `apm run` invokes `scripts.start`, and `apm run audit`
invokes `scripts.audit`.

The runtime choice must keep local collection, remote normalization, scoring, and
rendering separate. This phase defines the launcher and contracts only. It does not move
collector behavior into the dispatcher.

## Evidence

The repository workflow `Package validation` contains the job
`runtime-dispatch-probe`. It runs `tools/Invoke-RuntimeMatrixProbe.ps1` on
`windows-latest`, `ubuntu-latest`, and `macos-latest`, then uploads one structured JSON
artifact per operating system.

Run [31314580883](https://github.com/rodanthi-alexiou/agentic-sdlc-advisor/actions/runs/31314580883)
completed successfully for commit `41b8c04e20a18634b1fbe239ef970d9a6db9c0e6` on
2026-08-09. The accepted evidence is preserved in these run artifacts:

* `runtime-probe-windows-latest`, artifact `9038354391`
* `runtime-probe-ubuntu-latest`, artifact `9038354655`
* `runtime-probe-macos-latest`, artifact `9038353408`

### Hosted runner measurements

Startup values are single probe durations and compare prerequisite cost only. They are
not application benchmarks.

| Candidate | Windows 10.0.26100 X64 | Ubuntu 24.04.4 LTS X64 | macOS 26.5.2 Arm64 |
|---|---|---|---|
| Node.js | v22.23.2, 638.37 ms | v22.23.1, 91.05 ms | v24.18.0, 351.57 ms |
| Python | 3.12.10, 153.46 ms | 3.12.3, 2.25 ms | 3.14.6, 174.95 ms |
| Python 3 | 3.12.10, 26.18 ms | 3.12.3, 1.85 ms | 3.14.6, 106.34 ms |
| PowerShell | 7.6.4, 164.67 ms | 7.6.3, 83.50 ms | 7.6.4, 120.21 ms |
| Bash | 5.3.15, 121.19 ms | 5.2.21, 1.94 ms | 3.2.57, 38.14 ms |
| POSIX `sh` | `/usr/bin/bash`, 77.49 ms | `/usr/bin/sh`, 1.34 ms | `/bin/sh`, 40.33 ms |
| APM | Not preinstalled | Not preinstalled | Not preinstalled |

Each artifact records Node as available and the dispatcher probe as successful with
contract version `1.0.0`. The dispatcher reported `win32`/`x64`, `linux`/`x64`, and
`darwin`/`arm64`, matching the corresponding runners. The separate `validate-package`
job installed APM CLI 0.26.0 and passed version, package-boundary, and contract tests.

GitHub runner-image documentation lists installed software for each hosted image. That is
runner-image contract evidence. The run artifacts above are the acceptance evidence for
this repository.

* [GitHub Actions runner images](https://github.com/actions/runner-images)
* [Windows runner image documentation](https://github.com/actions/runner-images/tree/main/images/windows)
* [Ubuntu runner image documentation](https://github.com/actions/runner-images/tree/main/images/ubuntu)
* [macOS runner image documentation](https://github.com/actions/runner-images/tree/main/images/macos)

### Local Windows measurement

The probe ran on Windows 10.0.26100, X64, on 2026-08-09. Startup values are single probe
durations and compare prerequisite cost only. They are not application benchmarks.

| Candidate | Available | Version | Startup |
|---|---:|---|---:|
| Node.js | Yes | v22.19.0 | 46.13 ms |
| Python | Yes | 3.12.10 | 28.43 ms |
| PowerShell | Yes | 7.6.3 | 403.47 ms |
| Bash | Yes, through WSL | 5.1.16 | 3196.74 ms |
| POSIX `sh` | No | Not available | Not measured |
| APM | Yes | 0.26.0 | 1410.85 ms |

The Node dispatcher probe returned contract version `1.0.0`, platform `win32`, and
architecture `x64`.

### APM 0.26.0 script behavior

Both `apm run` and `apm run audit` invoked the same dispatcher command on Windows. The
Phase 2 dispatcher intentionally exited with child code `2` because collection belongs to
Phase 3. APM reported its own exit code `1` for both invocations while preserving the
child failure in its output. Consumers must not rely on child exit-code transparency
through APM 0.26.0.

## Options

| Option | Startup and packaging | Prerequisite clarity | Maintenance |
|---|---|---|---|
| Node portable core | One script set and no project package manager; requires `node` on `PATH` | Dispatcher can report a direct missing-runtime error when launched by a thin host wrapper | Lowest semantic drift |
| Python portable core | One script set; interpreter naming differs between `python` and `python3` | Requires interpreter resolution before launch | Low semantic drift, extra launcher logic |
| PowerShell portable core | One script set; PowerShell 7 is a separate prerequisite on many developer hosts | Clear `pwsh` prerequisite | Low semantic drift, slower local startup |
| PowerShell and POSIX backends | Native implementation per host | Host prerequisites are familiar | Highest maintenance and parity cost |

## Decision

Use Node.js for the host-neutral dispatcher and point both APM scripts to the same file:

```yaml
scripts:
  start: node .apm/skills/agentic-sdlc-audit/scripts/audit-dispatch.mjs
  audit: node .apm/skills/agentic-sdlc-audit/scripts/audit-dispatch.mjs
```

The shared portable core is supported by the accepted hosted measurements. If a future
supported image lacks Node or cannot execute the dispatcher, retain the JSON schema and
fixture suite and reassess contract-equivalent PowerShell and POSIX backends.

## Consequences

One schema and semantic fixture suite remain mandatory regardless of the final runtime.
The dispatcher stays thin. Local collection, remote normalization, scoring, and rendering
must remain separate modules in later phases.

The public command cannot provide audit results until Phase 3 implements collection. Its
current no-argument failure is explicit rather than a fabricated partial audit. The
`--probe` option is the Phase 2 smoke contract.

## Acceptance Gate

Satisfied by run `31314580883`. All jobs named
`Package validation / Runtime and dispatch probe (<os>)` passed, all three uploaded JSON
artifacts were reviewed, and `validate-package` passed. Node is available and the
dispatcher probe succeeds on every supported runner.