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

import { RequestLRUCache } from './index-db';

const CACHE_CAPACITY = 100;
const COVERAGE_CACHE_CAPACITY = 50;

class RequestCacheService {
  private static fetcherInstance: RequestLRUCache<any>;
  private static coverageInstance: RequestLRUCache<any>;

  static getFetcherInstance(): RequestLRUCache<any> {
    if (!this.fetcherInstance) {
      this.fetcherInstance = new RequestLRUCache<any>(CACHE_CAPACITY, "request_store");
    }
    return this.fetcherInstance;
  }

  static getCoverageInstance(): RequestLRUCache<any> {
    if (!this.coverageInstance) {
      this.coverageInstance = new RequestLRUCache<any>(COVERAGE_CACHE_CAPACITY, "coverage_store");
    }
    return this.coverageInstance;
  }
}

export const cacheService = RequestCacheService.getFetcherInstance();
export const coverageCacheService = RequestCacheService.getCoverageInstance();
