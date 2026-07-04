# Architecture

## Overview

`checks-jenkins` is a Gerrit plugin that bridges Gerrit's [Checks API](https://gerrit-review.googlesource.com/Documentation/pg-plugin-checks-api.html) to Jenkins CI. It surfaces Jenkins build statuses, logs, static-analysis warnings (warnings-ng), JUnit test results, and code-coverage metrics directly inside the Gerrit change screen.

The plugin splits into two halves wired together by Gerrit's plugin framework:

```
┌──────────────────────────────────────────────────────────┐
│                        Gerrit                            │
│                                                          │
│  ┌──────────────────┐       ┌─────────────────────────┐ │
│  │   Java Backend    │       │   TypeScript Frontend    │ │
│  │                   │       │                         │ │
│  │  ApiModule        │       │  plugin.ts              │ │
│  │  ├─ GetConfig     │◄──────┤  ChecksFetcher          │ │
│  │  └─ ProxyTrigger  │◄──────┤  CoverageClient         │ │
│  │       Action      │       │  CoverageViews (Lit)    │ │
│  │                   │       │                         │ │
│  │  HttpModule       │──┐    └─────────────────────────┘ │
│  │  → JavaScriptPlugin│  │                               │
│  └──────────────────┘  │    ┌─────────────┐              │
│                        └───►│ checks-jen- │              │
│                             │ kins.js     │              │
│                             └─────────────┘              │
└──────────────────────────────────────────────────────────┘
         │                                │
         │ Gerrit REST API                │ HTTP (via proxy)
         ▼                                ▼
┌──────────────────────────────────────────────────────────┐
│                      Jenkins                             │
│                                                          │
│  /gerrit-checks/runs          Checks API endpoint        │
│  /warnings-ng/api/json        Static analysis reports    │
│  /testReport/api/json         JUnit test results         │
│  /error-explanation/api/json  Build failure reasons      │
│  /coverage/api/json           Project coverage stats     │
│  /coverage/modified/api/json  Per-file modified lines    │
└──────────────────────────────────────────────────────────┘
```

## Module graph

| Module | Role |
|---|---|
| `ApiModule` (`RestApiModule`) | Registers REST endpoints: `GET {project}/config`, `POST {project}/proxy-trigger` |
| `HttpModule` (`ServletModule`) | Registers the compiled TypeScript bundle (`checks-jenkins.js`) as a `JavaScriptPlugin` so Gerrit injects it into every page |
| `plugin.ts` | Entry point for the frontend. Installs checks provider, coverage provider, annotation provider, and dynamic custom components |
| `fetcher.ts` / `ChecksFetcher` | Polls Jenkins for check runs, enriches results with warnings, test failures, and error explanations |
| `coverage.ts` / `CoverageClient` | Fetches coverage data, provides line-level annotations in the diff view, per-file percentage columns, and low-coverage alerts |
| `coverage-percentage-views.ts` | Lit web components that render coverage percentage badges in file-list table columns |
| `request-cache-service.ts` | Two-tier cache (in-memory LRU + IndexedDB) for warnings/test enrichment results and coverage payloads |
| `index-db.ts` | IndexedDB schema and key definitions |

## Build pipeline

1. **Bazel** compiles Java sources in `src/` into a Gerrit plugin JAR.
2. **Bazel** also compiles TypeScript in `web/` (using `ts_project` rule) and packages the output into a resource JAR via `resource_jars`.
3. At deploy time, Gerrit loads the JAR, reads `Gerrit-Module` / `Gerrit-HttpModule` from `MANIFEST.MF`, and bootstraps the plugin.

## Key design decisions

- **Proxy pattern for auth**: The TypeScript frontend never calls Jenkins directly when authentication is configured. Instead it POSTs to the `proxy-trigger` Gerrit endpoint, which forwards the request with Basic auth headers. This keeps Jenkins credentials server-side only.
- **Two-tier caching**: Coverage data is cached in memory (LRU, size 10) for fast same-page navigation and in IndexedDB for persistence across page reloads. Staleness is detected by comparing the Jenkins run's `statusLink` and `attempt`.
- **Unavailable endpoint tracking**: When a Jenkins endpoint returns 403 or an error, it is marked as unavailable for the remainder of the session to avoid request storms.
- **Single checks provider**: Both Jenkins run data and coverage alerts are merged into a single Gerrit checks provider, giving users one unified CI status view.
