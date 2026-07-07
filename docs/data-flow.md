# Data Flow

## Config resolution flow

```
Browser                         Gerrit                          Gerrit Config
  │                               │                                 │
  │  plugin.ts install()          │                                 │
  │  ChecksFetcher.fetch()        │                                 │
  │    GET /projects/{repo}/      │                                 │
  │      checks-jenkins~config    │                                 │
  │──────────────────────────────►│  GetConfig.apply()              │
  │                               │────────────────────────────────►│
  │                               │  Read project.config            │
  │                               │  [jenkins "..."] subsections    │
  │                               │◄────────────────────────────────│
  │                               │                                 │
  │                               │  (if empty)                     │
  │                               │  Read gerrit.config             │
  │                               │  [plugin "checks-jenkins"]      │
  │                               │◄────────────────────────────────│
  │                               │                                 │
  │  Set<JenkinsChecksConfig>     │                                 │
  │◄──────────────────────────────│                                 │
  │                               │                                 │
```

### Resolution priority

1. `project.config` in `refs/meta/config` — `[jenkins "instance-name"]` subsections
2. `gerrit.config` — `[plugin "checks-jenkins"]` section (global fallback, used only when per-project config has zero instances)

The frontend receives a `Set` of config objects. It uses only the first entry (`configs[0]`).

## Checks polling flow

The fetcher uses a **stale-while-revalidate** pattern. On each poll, it starts the network request to Jenkins but checks the IndexedDB cache first. If cached data exists and is under 2 minutes old, it returns immediately while a background update refreshes the cache. Only when the background update detects changed data (different `checkName`, `status`, or `statusDescription`) does it trigger a UI reload via `announceUpdate()`.

### Cache hit path (fast)

```
Browser (ChecksFetcher)           IndexedDB               Gerrit Proxy        Jenkins
  │                                  │                        │                  │
  │  60-second polling interval      │                        │                  │
  │                                  │                        │                  │
  │  Start network request           │                        │                  │
  │  (don't await)                   │                        │                  │
  │─────────────────────────────────────────────────────────►│─────────────────►│
  │                                  │                        │                  │
  │  GET runsKey from cache          │                        │                  │
  │─────────────────────────────────►│                        │                  │
  │◄──── CachedRuns {runs, ts} ──────│                        │                  │
  │                                  │                        │                  │
  │  Cache hit, age < 2 min!         │                        │                  │
  │  Use cached runs.                │                        │                  │
  │  Fire backgroundUpdateRuns()     │                        │                  │
  │  (structuredClone for safety)    │                        │                  │
  │                                  │                        │                  │
  │  ── Tree naming + enrichment ──  │                        │                  │
  │  ── convert() + merge ──         │                        │                  │
  │  return to Gerrit Checks UI      │                        │                  │
  │  (all from cache — instant!)     │                        │                  │
  │                                  │                        │                  │
  │  ... meanwhile, in background:   │                        │                  │
  │  backgroundUpdateRuns()          │                        │                  │
  │    await networkPromise          │                        │                  │
  │    ◄──────── response ───────────│◄───────────────────────│                  │
  │    runsEqual(current, fresh)?    │                        │                  │
  │    → YES: no-op, skip everything │                        │                  │
  │    → NO:  structuredClone()     │                        │                  │
  │           cacheService.put()     │                        │                  │
  │─────────────────────────────────►│                        │                  │
  │           announceUpdate()       │                        │                  │
  │           → Gerrit re-fetches    │                        │                  │
  │           → this time cache has  │                        │                  │
  │             fresh data           │                        │                  │
```

### Cache miss path (slow)

```
Browser (ChecksFetcher)           IndexedDB               Gerrit Proxy        Jenkins
  │                                  │                        │                  │
  │  Start network request           │                        │                  │
  │─────────────────────────────────────────────────────────►│─────────────────►│
  │                                  │                        │                  │
  │  GET runsKey from cache          │                        │                  │
  │─────────────────────────────────►│                        │                  │
  │◄──── undefined ──────────────────│                        │                  │
  │                                  │                        │                  │
  │  Cache MISS (or expired).        │                        │                  │
  │  Must await network.             │                        │                  │
  │  ◄──────── 200 ──────────────────│◄─────── 200 ──────────│                  │
  │                                  │                        │                  │
  │  Auth checks pass.               │                        │                  │
  │  structuredClone(data.runs).     │                        │                  │
  │  cacheService.put(runsKey, ...)  │                        │                  │
  │─────────────────────────────────►│                        │                  │
  │                                  │                        │                  │
  │  ── Tree naming + enrichment ──  │                        │                  │
  │  ── convert() + merge ──         │                        │                  │
  │  return to Gerrit Checks UI      │                        │                  │
  │  (from network — normal latency) │                        │                  │
```

### Enrichment phases (both paths converge here)

```
  ── Phase 0b: Tree naming ──
  computeTreeNames(data.runs)
  Parse externalId → parent map
  Find roots, assign tree index
  Build inGraph set (runs with
    parent or child relationship)
  Group by tree, then by depth
  Rewrite checkName in-place:
    "01 🌳 Build"
    "02 🍃 Test"
  (skipped if no dependencies)

  ── Phase A: Error explanation (parallel per run) ──
  For each COMPLETED run:
    POST proxy-trigger
    {urlpath: statusLink +
     "error-explanation/api/json"}
  ─────────────────────────────────►  GET .../error-
                                      explanation/api/json
                                    ───────────────────────►
                                    ◄───────────────────────
  ◄─────────────────────────────────

  ── Phase B: Warnings + Tests (parallel) ──
  buildWarnings() per run:
    POST proxy-trigger
    {urlpath: statusLink +
     "warnings-ng/api/json"}
  ─────────────────────────────────►───────────────────────►
                                    ◄───────────────────────
  ◄─────────────────────────────────
    For each tool:
      POST proxy-trigger
      {urlpath: statusLink +
       toolId + "/all/api/json"}
  ─────────────────────────────────►───────────────────────►
                                    ◄───────────────────────
  ◄─────────────────────────────────

  buildTestResults() per run:
    POST proxy-trigger
    {urlpath: statusLink +
     "testReport/api/json?tree=
     suites[cases[...]]"}
  ─────────────────────────────────►───────────────────────►
                                    ◄───────────────────────
  ◄─────────────────────────────────

  ── Merge & render ──
  combine runs + enrichments
  return to Gerrit Checks UI
```

### Concurrency notes

- Phase 0 (fetch runs) uses the stale-while-revalidate cache — the network request is started eagerly but only awaited on cache miss.
- Phase A and Phase B enrichment only runs for runs with `status === COMPLETED`.
- Phase A (error explanation) runs in parallel with Phase B (warnings + tests).
- Within Phase B, all enrichment fetches (warnings, tests) across all runs are launched concurrently.
- Within `buildWarnings()`, per-tool issue fetches use `Promise.allSettled` for resilience — a single failing tool doesn't block others.
- Unavailable endpoints (403/error on prior poll) are **skipped entirely** — no HTTP request is made.
- Background updates fire `announceUpdate()` only when `runsEqual()` detects actual changes, preventing unnecessary UI reloads.

## Coverage fetch flow

```
Browser (CoverageClient)          Gerrit Proxy              Jenkins
  │                                  │                        │
  │  SHOW_CHANGE event fires         │                        │
  │  prefetchCoverageRanges()        │                        │
  │                                  │                        │
  │  ── Step 1: Find completed run ──│                        │
  │  POST proxy-trigger              │                        │
  │  {urlpath: "gerrit-checks/       │                        │
  │   runs?change=X&patchset=Y"}     │                        │
  │─────────────────────────────────►│───────────────────────►│
  │                                  │◄───────────────────────│
  │◄─────────────────────────────────│                        │
  │  Find first run with             │                        │
  │  status === "COMPLETED"          │                        │
  │                                  │                        │
  │  ── Step 2: Fetch both coverage  │                        │
  │       endpoints (parallel) ──    │                        │
  │                                  │                        │
  │  POST proxy-trigger              │                        │
  │  {urlpath: statusLink +          │                        │
  │   "coverage/api/json"}           │                        │
  │─────────────────────────────────►│───────────────────────►│
  │                                  │◄───────────────────────│
  │◄─────────────────────────────────│                        │
  │                                  │                        │
  │  POST proxy-trigger              │  (parallel — same      │
  │  {urlpath: statusLink +          │   instant as above)    │
  │   "coverage/modified/api/json"}  │                        │
  │─────────────────────────────────►│───────────────────────►│
  │                                  │◄───────────────────────│
  │◄─────────────────────────────────│                        │
  │                                  │                        │
  │  ── Step 3: Parse & cache ──     │                        │
  │  parseRanges() → per-file        │                        │
  │    CoverageRange[]               │                        │
  │  computePercentages() → per-file │                        │
  │    PercentageData                │                        │
  │  Cache in Memory LRU + IndexedDB │                        │
```

## Coverage annotation flow

```
Gerrit Diff View             CoverageClient              Cache
  │                              │                          │
  │  User opens a file diff      │                          │
  │  annotationApi calls         │                          │
  │  provideCoverageRanges()     │                          │
  │─────────────────────────────►│                          │
  │                              │  ensureConfig()          │
  │                              │  updateCache()           │
  │                              │  (no-op if already        │
  │                              │   cached)                │
  │                              │                          │
  │                              │  Look up path in         │
  │                              │  entry.ranges            │
  │                              │─────────────────────────►│
  │                              │◄─────────────────────────│
  │                              │                          │
  │  CoverageRange[]             │                          │
  │  [{side: RIGHT,              │                          │
  │    type: COVERED,            │                          │
  │    code_range: {             │                          │
  │      start_line: 42,         │                          │
  │      end_line: 50            │                          │
  │    }}]                       │                          │
  │◄─────────────────────────────│                          │
  │                              │                          │
  │  Gerrit renders green/red    │                          │
  │  coverage markers on         │                          │
  │  modified lines              │                          │
```

## Rerun trigger flow

```
Browser                   Gerrit Proxy              Jenkins
  │                           │                        │
  │  User clicks "Rerun"      │                        │
  │  action in Checks UI      │                        │
  │                           │                        │
  │  POST proxy-trigger       │                        │
  │  {jenkinsname,            │                        │
  │   urlpath: "job/.../      │                        │
  │     build?token=...",     │                        │
  │   method: "POST"}         │                        │
  │──────────────────────────►│  POST /job/.../build   │
  │                           │───────────────────────►│
  │                           │◄─────── 302 ───────────│
  │◄─────── 200 ──────────────│                        │
  │                           │                        │
  │  ActionResult {           │                        │
  │    message: "Run          │                        │
  │      triggered.",         │                        │
  │    shouldReload: true     │                        │
  │  }                        │                        │
```

The 302 response from Jenkins is caught as an exception by `fetch()` (redirect mode is not followed for POST), but `rerun()` explicitly checks for `302` in the error message and treats it as success.
