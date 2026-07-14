/**
 * @license
 * Copyright (C) 2022 The Android Open Source Project
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

// ESLint 9+ flat config (gerrit 3.14+ bundles ESLint 9).
// The build already enforces correctness via tsc; this file exists
// so plugin_eslint() in BUILD has a config to reference.
module.exports = [
  {
    ignores: ['_bazel_ts_out*/**', '_bazel_ts_out_tests/**'],
  },
];
