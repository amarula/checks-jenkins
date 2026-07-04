# Backend (Java)

The backend is thin by design — four classes that provide configuration and a secure proxy to Jenkins.

## ApiModule

`src/main/java/com/google/gerrit/plugins/checks/jenkins/ApiModule.java`

Extends `RestApiModule`. Registers two REST endpoints scoped to the project resource (`PROJECT_KIND`):

```java
get(PROJECT_KIND, "config").to(GetConfig.class);
post(PROJECT_KIND, "proxy-trigger").to(ProxyTriggerAction.class);
```

These appear as:
- `GET /projects/{project}/checks-jenkins~config`
- `POST /projects/{project}/checks-jenkins~proxy-trigger`

## HttpModule

`src/main/java/com/google/gerrit/plugins/checks/jenkins/HttpModule.java`

Extends `ServletModule`. Binds the compiled TypeScript bundle as a `JavaScriptPlugin`:

```java
DynamicSet.bind(binder(), WebUiPlugin.class)
    .toInstance(new JavaScriptPlugin("checks-jenkins.js"));
```

This causes Gerrit to serve `checks-jenkins.js` (the compiled output of the `web/` TypeScript sources) and inject it into every Gerrit page. The JS bundle is packaged into the plugin JAR via the Bazel `resource_jars` attribute.

The manifest entries that wire everything together are declared in `BUILD`:

```python
manifest_entries = [
    "Gerrit-PluginName: checks-jenkins",
    "Gerrit-Module: com.google.gerrit.plugins.checks.jenkins.ApiModule",
    "Gerrit-HttpModule: com.google.gerrit.plugins.checks.jenkins.HttpModule",
],
```

## GetConfig

`src/main/java/com/google/gerrit/plugins/checks/jenkins/GetConfig.java`

Implements `RestReadView<ProjectResource>`. Returns the Jenkins connection configuration for a given project.

### Resolution order

1. **Per-project config** — reads `project.config` (from `refs/meta/config`) for `[jenkins "..."]` subsections.
2. **Global fallback** — if no per-project instances are found, reads `gerrit.config` for the `[plugin "checks-jenkins"]` section.

### Multi-instance support

Multiple Jenkins instances are configured as subsections:

```ini
[jenkins "prod-ci"]
    url = https://jenkins.prod.example.com/
    user = gerrit-bot
    coverage = true

[jenkins "staging-ci"]
    url = https://jenkins.staging.example.com/
    user = gerrit-bot
```

The subsection key (`prod-ci`, `staging-ci`) becomes the `name` field in the returned config.

### Return type

Returns `Set<JenkinsChecksConfig>` where each entry has:

| Field | Type | Source |
|---|---|---|
| `name` | `String` | Subsection key, or `"globalConfig"` for global fallback |
| `url` | `String` | `url` key |
| `user` | `String` | `user` key |
| `coverage_enabled` | `Boolean` | `true` if `coverage` key equals `"true"` |

## ProxyTriggerAction

`src/main/java/com/google/gerrit/plugins/checks/jenkins/ProxyTriggerAction.java`

Implements `RestModifyView<ProjectResource, ProxyInput>`. The secure proxy that the frontend uses to reach Jenkins when authentication is configured.

### Why a proxy?

When `user` is configured, Jenkins requires Basic authentication. Sending credentials to the browser would expose them. Instead, the frontend POSTs to this proxy endpoint, which adds the `Authorization: Basic ...` header server-side and forwards the request.

### Input (`ProxyInput`)

| Field | Description |
|---|---|
| `jenkinsname` | Which Jenkins instance to target (matches config subsection key) |
| `urlpath` | URL-encoded path + query string to forward to Jenkins |
| `method` | HTTP method: `"GET"` or `"POST"` |

### Flow

1. Look up `jenkinsname` in per-project config (`project.config`).
2. Fall back to global config (`gerrit.config`) if not found or missing credentials.
3. Base64-encode `user:token` for the `Authorization` header.
4. Build the full Jenkins URL: `{url}/{urlpath}`.
5. Forward the request with a 30s connection timeout and 60s request timeout.
6. Return Jenkins' response status code and body verbatim.

### Timeouts

| Timeout | Duration | Applies to |
|---|---|---|
| Connection timeout | 30 seconds | TCP connection establishment |
| Request timeout | 60 seconds | Entire HTTP request-response cycle |

### Auth modes

- **With `user` configured**: Uses Basic auth via the proxy. The `token` field from config is the password portion.
- **Without `user`**: The frontend calls Jenkins directly with `credentials: 'include'` (cookie-based SSO).
