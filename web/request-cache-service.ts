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

class RequestCacheService {
  private static instance: RequestLRUCache<any>;

  static getInstance(): RequestLRUCache<any> {
    if (!this.instance) {
      this.instance = new RequestLRUCache<any>(CACHE_CAPACITY);
    }
    return this.instance;
  }
}

export const cacheService = RequestCacheService.getInstance();
