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
  ├─ 3. computeTreeNames()      → Parse externalId for parent-child relationships,
  │                                  rewrite checkName as "NN 🌳|🍃 originalName"
  │                                  (skipped when no dependencies exist)
  │
  ├─ 4. Phase A (parallel)      → Error explanation enrichment for COMPLETED runs
  │     └─ explainBuildFailure()   GET {statusLink}error-explanation/api/json
  │
  ├─ 5. Phase B (parallel)      → Warnings + test enrichment (cached in IndexedDB)
  │     ├─ buildWarnings()         GET {statusLink}warnings-ng/api/json
  │     │   └─ for each tool →     GET {statusLink}{toolId}/all/api/json?tree=...
  │     └─ buildTestResults()      GET {statusLink}testReport/api/json?tree=...
  │
  └─ 6. convert()               → Map JenkinsCheckRun → CheckRun with action callbacks
```

### Enrichment details

| Enrichment | Endpoint | Output |
|---|---|---|
| Error explanation | `{statusLink}error-explanation/api/json` | Parsed `explanation` string split into summary + markdown code block |
| Warnings (warnings-ng) | `{statusLink}warnings-ng/api/json` → per-tool `{toolId}/all/api/json` | `CheckRun` per tool with per-issue `CheckResult` entries, tagged by severity |
| JUnit test results | `{statusLink}testReport/api/json?tree=suites[cases[...]]` | Single `CheckRun` named "JUnit" with failed-test results |

### Flattened-tree pipeline naming

`computeTreeNames()` (`web/fetcher.ts:546`) rewrites `checkName` in-place to visualize upstream/downstream pipeline structure directly in Gerrit's flat Checks UI table.

#### externalId format

The Jenkins-side `gerrit-checks-api-plugin` encodes relationships in `externalId`:

| Relationship | externalId format |
|---|---|
| Direct run (no parent) | `"jobFullName#buildNumber"` |
| Downstream run | `{"parent":"upstreamJob#N","run":"thisJob#M"}` (JSON string) |

#### Naming convention

```
{zeroPaddedDepth} {🌳|🍃} {originalName}
```

| Component | Rule |
|---|---|
| **Number** | Depth in the dependency tree + 1, zero-padded to 2 digits. Direct runs (no parent) = `01`, their children = `02`, grandchildren = `03`. Parallel jobs at the same depth share the same number. |
| **Emoji** | `🌳` if the job has downstream children (someone references it as parent), `🍃` if it has none. |
| **Original name** | The unmodified `checkName` from Jenkins. |

#### Scope

Only runs that participate in a parent→child relationship (as either parent or child) get the prefix. Independent runs in the same batch, and all enrichment runs (warnings-ng tools, JUnit, Code Coverage), keep their original names unchanged.

#### Multiple independent trees

When multiple independent pipeline trees appear in the same batch (e.g. two separate upstream pipelines each with their own downstream jobs), runs are grouped by tree first, then sorted by depth within each tree. Tree order follows the first-appearance order of each tree's root in the input from Jenkins. This keeps each pipeline's upstream/downstream chain visually together in the flat list.

Run labels visible to the user in each component of the pipeline tree are:

| Component | Example |
|---|---|
| **Number** | `01`, `02`, `03` — depth within **that tree**, zero-padded to 2 digits |
| **Emoji** | 🌳 if the job has downstream children, 🍃 if it is terminal |
| **Original name** | The check name assigned by Jenkins |

#### Example output

*Single tree:*

```
01 🌳 Base Initialization
02 🌳 Parallel Builds
03 🍃 Backend Unit Tests
03 🍃 Frontend Unit Tests
03 🍃 Database Migrations
04 🍃 Final Release
```

*Two independent trees in the same batch:*

```
01 🌳 Pipeline-A          ← tree 1 root
02 🍃 Downstream-A1       ← tree 1 leaves
02 🍃 Downstream-A2
01 🌳 Pipeline-B          ← tree 2 root
02 🍃 Downstream-B1       ← tree 2 leaf
```

Each tree's numbering restarts at `01` for its root. Tree grouping ensures all runs belonging to one pipeline appear together before the next tree begins.

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

**Double-trigger prevention**: A `triggeredReruns: Set<string>` field tracks runKeys (from `externalId`) for active reruns. On every `fetch()` cycle, RUNNING/RUNNABLE runs populate this set (disabling all rerun buttons). When a run completes, its key drops out and the button re-enables. The `rerun()` method also adds the key eagerly on click so the immediate `shouldReload` re-fetch maintains the disabled state.

Tooltips explain the reason: `"Run already triggered"` for the specific run, or `"A pipeline job is currently running"` when another run in the batch is active.

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
