/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Composite Key: [name, changeNumber, patchsetNumber, numberOfRuns]
 */
export type RequestKey = [name: string, changeNumber: number, patchsetNumber: number, numberOfRuns: number];

interface CacheEntry<T> {
  key: RequestKey;
  value: T;
  lastAccessed: number;
}

/**
 * A persistent LRU cache for browser request data using IndexedDB.
 * Automatically evicts older entries when capacity is reached and
 * prunes stale run data when the number of runs for a specific change changes.
 */
export class RequestLRUCache<T> {
  private dbName: string = "GerritRequestDB";
  private storeName: string = "request_store";
  private db: IDBDatabase | null = null;

  constructor(private capacity: number) {}

  /**
   * Initializes the database connection and object stores.
   */
  async init(): Promise<void> {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "key" });
          // Index for LRU eviction logic
          store.createIndex("lastAccessed", "lastAccessed");
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves data and updates its 'lastAccessed' timestamp.
   */
  async get(key: RequestKey): Promise<T | undefined> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);

      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry<T>;
        if (entry) {
          // Update timestamp to move this entry to the "Recently Used" end
          entry.lastAccessed = Date.now();
          store.put(entry);
          resolve(entry.value);
        } else {
          resolve(undefined);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Stores data in the cache.
   * Logic:
   * 1. If entries exist for the same [name, change, patch] but DIFFERENT [runs], they are deleted.
   * 2. If the cache exceeds capacity, the oldest entry (by lastAccessed) is evicted.
   */
  async put(key: RequestKey, value: T): Promise<void> {
    await this.init();
    const [name, patch, change, runs] = key;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);

      // Step 1: Query for all runs related to this change/patch
      const range = IDBKeyRange.bound([name, patch, change, 0], [name, patch, change, Infinity]);
      const cursorRequest = store.openCursor(range);

      cursorRequest.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const existingKey = cursor.key as RequestKey;
          if (existingKey[2] !== runs) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          const countReq = store.count();
          countReq.onsuccess = () => {
            if (countReq.result >= this.capacity) {
              const index = store.index("lastAccessed");
              index.openCursor().onsuccess = (ev) => {
                const lruCursor = (ev.target as IDBRequest<IDBCursorWithValue>).result;
                if (lruCursor) lruCursor.delete();
              };
            }
            const entry: CacheEntry<T> = { key, value, lastAccessed: Date.now() };
            store.put(entry);
          };
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Clears all cached requests.
   */
  async clear(): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
