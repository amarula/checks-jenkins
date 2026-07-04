# Frontend (TypeScript)

The frontend is a TypeScript application compiled by Bazel into a single `checks-jenkins.js` bundle. It registers with Gerrit's plugin API and provides the entire checks UI, coverage annotations, and custom column components.

## Entry point: `plugin.ts`

`web/plugin.ts` — invoked via `window.Gerrit.install(async (plugin) => { ... })`.

### Registration sequence

1. **Checks provider** — a single `plugin.checks().register(...)` that merges Jenkins run data and coverage alerts into one unified result. Polling interval: 60 seconds.
2. **Coverage annotation provider** — `plugin.annotationApi().setCoverageProvider(coverageClient.provideCoverageRanges)` for line-level coverage highlighting in the diff view.
3. **SHOW_CHANGE handler** — on every change-page navigation, pre-fetches coverage data and re-evaluates column visibility.
4. **Dynamic custom components** — registers 12 Lit-based components into three file-list slots:
   - `change-view-file-list-header` — column headers
   - `change-view-file-list-content` — per-file percentage badges
   - `change-view-file-list-summary` — summary row

## ChecksFetcher (`fetcher.ts`)

Implements `ChecksProvider`. The core polling logic that fetches Jenkins build status and enriches it with detailed results.

### Fetch lifecycle

```
fetch(changeData)
  │
  ├─ 1. fetchConfig()           → GET /projects/{repo}/checks-jenkins~config
  │
  ├─ 2. fetchFromJenkins()      → GET {jenkins}/gerrit-checks/runs?change=X&patchset=Y
  │
  ├─ 3. Phase A (parallel)      → Error explanation enrichment for COMPLETED runs
  │     └─ explainBuildFailure()   GET {statusLink}error-explanation/api/json
  │
  ├─ 4. Phase B (parallel)      → Warnings + test enrichment (cached in IndexedDB)
  │     ├─ buildWarnings()         GET {statusLink}warnings-ng/api/json
  │     │   └─ for each tool →     GET {statusLink}{toolId}/all/api/json?tree=...
  │     └─ buildTestResults()      GET {statusLink}testReport/api/json?tree=...
  │
  └─ 5. convert()               → Map JenkinsCheckRun → CheckRun with action callbacks
```

### Enrichment details

| Enrichment | Endpoint | Output |
|---|---|---|
| Error explanation | `{statusLink}error-explanation/api/json` | Parsed `explanation` string split into summary + markdown code block |
| Warnings (warnings-ng) | `{statusLink}warnings-ng/api/json` → per-tool `{toolId}/all/api/json` | `CheckRun` per tool with per-issue `CheckResult` entries, tagged by severity |
| JUnit test results | `{statusLink}testReport/api/json?tree=suites[cases[...]]` | Single `CheckRun` named "JUnit" with failed-test results |

### Category and tag-color mapping (warnings-ng)

Warnings are classified using the tool's `size` vs configured thresholds:

| Condition | Category |
|---|---|
| `size >= errorSize` | `ERROR` |
| `size >= highSize` | `WARNING` |
| `size >= normalSize` | `INFO` |
| `size >= lowSize` | `INFO` |
| Otherwise | `SUCCESS` |

Per-issue tag colors map by severity:

| Severity | TagColor |
|---|---|
| `ERROR`, `TOTAL_ERROR`, `NEW_ERROR`, `DELTA_ERROR` | `PURPLE` |
| `HIGH`, `TOTAL_HIGH`, `NEW_HIGH`, `DELTA_HIGH` | `BROWN` |
| `NORMAL`, `TOTAL_NORMAL`, `NEW_NORMAL`, `DELTA_NORMAL` | `YELLOW` |
| `LOW`, `TOTAL_LOW`, `NEW_LOW`, `DELTA_LOW` | `PINK` |
| Other | `GRAY` |

### Unavailable endpoint tracking

A `Set<string>` keyed by `"jenkinsName:endpoint"` tracks endpoints that returned 403 or an error. Once marked unavailable, that endpoint is skipped on all future polling cycles within the session. This prevents request storms against missing or misconfigured Jenkins plugins.

### Auth modes

- **With `user`**: Frontend POSTs to the Gerrit `proxy-trigger` endpoint, which forwards to Jenkins with Basic auth.
- **Without `user`**: Frontend calls Jenkins directly with `fetch(url, {credentials: 'include'})` for cookie-based SSO.

### Rerun action

The `convert()` method wraps each Jenkins action's URL into a Gerrit `Action` with a `callback` that POSTs to the proxy. The rerun endpoint expects a 302 redirect on success — this is explicitly handled as success rather than an error.

## CoverageClient (`coverage.ts`)

The coverage subsystem. See [coverage-system.md](coverage-system.md) for a deep dive.

### Public API

| Method | Used by | Returns |
|---|---|---|
| `provideCoverageRanges(changeNum, path, basePatchNum, patchNum)` | Gerrit annotation API | `CoverageRange[]` for line-level diff highlighting |
| `provideCoveragePercentages(changeNum, path, patchNum)` | Dynamic custom components | `PercentageData` with `absolute` and `incremental` values |
| `mayBeShowLowCoverageAlert(changeNum, patchNum, commitMessage, repo)` | Checks provider | `FetchResponse` with coverage check runs |
| `prefetchCoverageRanges(change, revision)` | SHOW_CHANGE event | Populates cache eagerly |
| `showPercentageColumns()` | SHOW_CHANGE + column attach | `boolean` — whether coverage is enabled for this project |

## Dynamic custom components (`coverage-percentage-views.ts`)

Lit-based web components registered into Gerrit's file-list table. See [components.md](components.md).

## Caching (`request-cache-service.ts`, `index-db.ts`)

Two-tier cache for enrichment results and coverage data. See [caching.md](caching.md).
