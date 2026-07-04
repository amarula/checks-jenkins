# Contributing

## Prerequisites

- **Bazel** — the Gerrit plugin build system.
- **Java 11+** — for the Java backend (`src/`).
- **Node.js 16+** and **npm** — for the TypeScript frontend (`web/`).
- **A Gerrit source tree** — this plugin is built inside a Gerrit checkout at `plugins/checks-jenkins`.

## Project structure

```
checks-jenkins/
├── BUILD                  # Bazel: plugin JAR build rules
├── src/
│   └── main/java/com/google/gerrit/plugins/checks/jenkins/
│       ├── ApiModule.java           # REST endpoint registration
│       ├── HttpModule.java          # JS bundle injection
│       ├── GetConfig.java           # Config resolution endpoint
│       └── ProxyTriggerAction.java  # Auth proxy to Jenkins
├── web/
│   ├── BUILD                       # Bazel: TS build + test rules
│   ├── tsconfig.json               # TypeScript configuration
│   ├── package.json                # npm dependencies
│   ├── .eslintrc.js                # ESLint configuration
│   ├── plugin.ts                   # Frontend entry point
│   ├── fetcher.ts                  # Checks provider (polling + enrichment)
│   ├── coverage.ts                 # Coverage subsystem
│   ├── coverage-percentage-views.ts # Lit web components
│   ├── request-cache-service.ts    # Cache service singletons
│   ├── index-db.ts                 # IndexedDB LRU cache
│   ├── *_test.ts                   # Unit tests
│   ├── test/
│   │   ├── test-setup.ts           # Test framework setup
│   │   └── test-util.ts            # Test utilities
│   └── web_test_runner.sh          # Test runner script
└── docs/                           # Technical documentation
```

## Building

### Full plugin JAR

```bash
bazel build plugins/checks-jenkins:checks-jenkins
```

Output: `bazel-bin/plugins/checks-jenkins/checks-jenkins.jar`

### TypeScript only

The TypeScript sources are compiled via the `ts_project` Bazel rule:

```bash
bazel build plugins/checks-jenkins/web:checks-jenkins-ts
```

### JS bundle

The compiled TypeScript is bundled via the `gerrit_js_bundle` rule:

```bash
bazel build plugins/checks-jenkins/web:checks-jenkins
```

## Testing

### Running tests

```bash
cd web && ./web_test_runner.sh
```

Or via Bazel:

```bash
bazel test plugins/checks-jenkins/web:web_test_runner
```

The test runner uses [Web Test Runner](https://modern-web.dev/docs/test-runner/overview/) with TypeScript support.

### Test files

| Test file | Covers |
|---|---|
| `fetcher_test.ts` | `ChecksFetcher` — category mapping, tag colors, run conversion |
| `coverage_test.ts` | `CoverageClient` — coverage parsing, percentage computation, low-coverage logic |
| `coverage-percentage-views_test.ts` | Lit web components — rendering, reactivity, provider binding |

### Test setup

`test/test-setup.ts` configures the test environment (mocks for Gerrit APIs, DOM polyfills for Lit components).

`test/test-util.ts` provides shared test helpers and mock factories.

## Linting

ESLint is configured in `web/.eslintrc.js` and run via Bazel:

```bash
bazel test plugins/checks-jenkins/web:lint_test
```

Or directly:

```bash
npx eslint web/**/*.ts
```

## Deployment

1. Build the plugin JAR:
   ```bash
   bazel build plugins/checks-jenkins:checks-jenkins
   ```

2. Copy to Gerrit's plugin directory:
   ```bash
   cp bazel-bin/plugins/checks-jenkins/checks-jenkins.jar /path/to/gerrit/plugins/
   ```

3. Reload the plugin:
   ```bash
   ssh -p 29418 user@gerrit-host gerrit plugin reload checks-jenkins
   ```

Gerrit detects the new JAR and may reload automatically depending on configuration.

## License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](../LICENSE) file.

All source files must include the standard Apache 2.0 license header.
