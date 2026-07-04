# Caching

The plugin uses a two-tier caching strategy: in-memory LRU for same-page navigation speed and IndexedDB for persistence across page reloads.

## Cache domains

Two independent cache instances serve different data:

| Cache | Store name | Capacity | Key type | Data |
|---|---|---|---|---|
| Fetcher cache | `request_store` | 100 | `RequestKey` (4-element) | Enriched warnings + test results (`CheckRun[]`) |
| Coverage cache | `coverage_store` | 50 | `CoverageCacheKey` (3-element) | Coverage responses, parsed ranges, percentages |

Both are backed by the same IndexedDB database (`GerritRequestDB`, version 2) but operate in separate object stores.

## IndexedDB layer (`index-db.ts`)

### `RequestLRUCache<T>`

A generic LRU cache backed by IndexedDB. Created per store name:

```typescript
// Fetcher cache — capacity 100
const fetcherCache = new RequestLRUCache<CheckRun[]>(100, "request_store");

// Coverage cache — capacity 50
const coverageCache = new RequestLRUCache<CoverageCacheEntry>(50, "coverage_store");
```

### Key types

```typescript
// 4-element key for fetcher enrichment data
type RequestKey = [name, changeNumber, patchsetNumber, numberOfRuns];

// 3-element key for coverage data
type CoverageCacheKey = [name, changeNumber, patchsetNumber];
```

### Entry structure

Each entry stores `{key, value, lastAccessed}` with a `lastAccessed` index for LRU eviction.

### Eviction strategy

On `put()`:
1. If `count >= capacity`, open cursor on the `lastAccessed` index (ascending) and delete the oldest entry.
2. Insert the new entry with `lastAccessed = Date.now()`.

### Staleness pruning (fetcher cache only)

For 4-element `RequestKey` entries, before inserting a new entry the cache scans for existing entries with the same `[name, change, patch]` prefix:

```typescript
const range = IDBKeyRange.bound(
    [name, patch, change, 0],
    [name, patch, change, Infinity]
);
```

Any existing entry with a different `numberOfRuns` (4th element) is deleted — the run count changed, so the cached enrichment data is stale.

### `get()` touch

On read, the `lastAccessed` timestamp is updated to move the entry to the "recently used" end of the LRU order.

## In-memory LRU (`coverage.ts`)

The `CoverageClient` maintains a second in-memory cache layer on top of IndexedDB:

```typescript
private cache: Map<string, CoverageCacheEntry> = new Map();
private static readonly MEMORY_CACHE_LIMIT = 10;
```

### Eviction

Delete-then-set to maintain MRU ordering:

```typescript
private setMemoryCache(key: string, entry: CoverageCacheEntry): void {
    this.cache.delete(key);       // remove old position
    this.cache.set(key, entry);   // insert at "most recently used" end
    if (this.cache.size > MEMORY_CACHE_LIMIT) {
        const oldest = this.cache.keys().next().value;  // Map iterates in insertion order
        if (oldest !== undefined) this.cache.delete(oldest);
    }
}
```

### Why two tiers?

- **Memory** (size 10): sub-millisecond lookup for files within the same change — the diff view asks `provideCoverageRanges()` per file, which would be too slow hitting IndexedDB every time.
- **IndexedDB** (size 50): survives page reloads. When a user navigates away and comes back, coverage data is available instantly without re-fetching from Jenkins.

## Coverage cache population flow

`CoverageClient.updateCache()` is the single entry point for populating the coverage cache:

```
updateCache(jenkins, repo, changeNum, patchNum)
  │
  ├─ 1. Check in-memory cache → hit: touch & return
  │
  ├─ 2. Check pendingFetches (dedup) → hit: await existing promise
  │
  ├─ 3. Parallel: read IndexedDB + findCompletedRun()
  │
  ├─ 4. No runInfo + have dbEntry → serve stale
  │
  ├─ 5. dbEntry matches runInfo (statusLink + attempt) → promote to memory, return
  │
  ├─ 6. No completed run → cache empty result
  │
  └─ 7. Fresh fetch: fetchAllCoverage() → parse → cache both tiers
```

### Staleness detection

The cache key for invalidation is the pair `(statusLink, attempt)`:

```typescript
if (dbEntry && runInfo
    && dbEntry.statusLink === runInfo.statusLink
    && dbEntry.attempt === runInfo.attempt) {
    // Cache hit — promote to memory
    this.setMemoryCache(memKey, dbEntry);
    return;
}
```

When a new build completes, the `statusLink` changes (different build number in the URL) or the `attempt` increments — the cache is invalidated and fresh data is fetched.

## Concurrent request deduplication

A `pendingFetches` map prevents concurrent `updateCache()` calls for the same change from issuing duplicate HTTP requests:

```typescript
private pendingFetches: Map<string, Promise<void>> = new Map();

// In updateCache():
const pending = this.pendingFetches.get(memKey);
if (pending) return pending;  // await existing in-flight fetch

const promise = new Promise<void>(r => { resolve = r; });
this.pendingFetches.set(memKey, promise);
// ... fetch ...
this.pendingFetches.delete(memKey);
```

This is critical during `SHOW_CHANGE` where `prefetchCoverageRanges()` and `showPercentageColumns()` both call `ensureConfig()` + `updateCache()` concurrently.

## Fetcher enrichment cache

`ChecksFetcher` uses the IndexedDB cache for enriched warnings and test results:

```typescript
const cachedData: CheckRun[] = await cacheService.get(key);

if (cachedData === null || cachedData === undefined || cachedData.length == 0) {
    // Fetch warnings + tests in parallel, cache results
    const enrichmentPromises = completedRuns.flatMap(...);
    const results = await Promise.all(enrichmentPromises);
    const warningsData = results.flat().filter(Boolean);
    if (warningsData.length > 0) {
        await cacheService.put(key, warningsData.slice());
        checkRuns.push(...warningsData.slice());
    }
} else {
    checkRuns.push(...cachedData);  // cache hit — skip enrichment fetches
}
```

The cache key includes `numberOfRuns` — when the number of Jenkins runs changes, stale entries are pruned automatically by the IndexedDB layer.

## Cache capacity rationale

| Cache | Capacity | Rationale |
|---|---|---|
| Fetcher (IndexedDB) | 100 | Enrichment data is heavy (per-issue results). 100 entries covers several changes with multiple runs each. |
| Coverage (IndexedDB) | 50 | Coverage payloads are large (per-file blocks). 50 entries covers typical navigation patterns. |
| Coverage (memory) | 10 | A single diff view may query dozens of files. 10 change-level entries is sufficient for the current repo + a few recently viewed changes. |
