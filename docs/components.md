# Web Components

The coverage percentage columns in Gerrit's file list are implemented as [Lit](https://lit.dev/) web components. They are registered as dynamic custom components via Gerrit's plugin API.

## Class hierarchy

```
LitElement
  └── BaseComponent                    (shown, instances)
        ├── BaseCoverageComponent      (changeNum, patchRange, path, provider, percentageText, kind)
        │     ├── AbsoluteContentView        (absolute percentage)
        │     ├── IncrementalContentView     (incremental percentage)
        │     ├── AbsoluteUnitTestsContentView     (absolute unit-test percentage)
        │     └── IncrementalUnitTestsContentView  (incremental unit-test percentage)
        │
        ├── AbsoluteHeaderView          ("Cov" header)
        ├── IncrementalHeaderView       ("ΔCov" header)
        ├── AbsoluteUnitTestsHeaderView ("Cov(U)" header)
        ├── IncrementalUnitTestsHeaderView ("ΔCov(U)" header)
        ├── AbsoluteSummaryView         (empty summary cell)
        ├── IncrementalSummaryView      (empty summary cell)
        ├── AbsoluteUnitTestsSummaryView      (empty summary cell)
        └── IncrementalUnitTestsSummaryView   (empty summary cell)
```

## BaseComponent

`web/coverage-percentage-views.ts:40`

The root class for all 12 components. Provides:

```typescript
export class BaseComponent extends LitElement {
    static instances = new Set<BaseComponent>();  // live-instance registry
    @property() shown = true;                      // column visibility

    connectedCallback()    → instances.add(this)
    disconnectedCallback() → instances.delete(this)
    render()               → <div class="{shown ? 'coverage-percentage-column' : 'coverage-percentage-column hidden'}"><slot></slot></div>
}
```

### Visibility broadcasting

`plugin.ts` uses the static `instances` set to broadcast column visibility changes:

```typescript
plugin.on(EventType.SHOW_CHANGE, async (change, revision) => {
    const [show] = await Promise.all([
        coverageClient.showPercentageColumns(),
        coverageClient.prefetchCoverageRanges(change, revision),
    ]);
    for (const instance of BaseComponent.instances) {
        instance.shown = show;
    }
});
```

When `show` is `false`, the CSS class `hidden` (display: none) is applied.

## BaseCoverageComponent

`web/coverage-percentage-views.ts:82`

Extends `BaseComponent` with data-binding logic:

```typescript
export class BaseCoverageComponent extends BaseComponent {
    @property() changeNum = '';
    @property() patchRange: PatchRange | null = null;
    @property() path = '';
    @property() provider: CoverageProvider = async () => null;
    @property() percentageText = '-';
    @property() kind = '';
}
```

### Reactive update

`update()` triggers `computePercentage()` whenever `changeNum`, `patchRange`, `path`, or `provider` changes:

```typescript
override update(changedProperties: PropertyValues) {
    if (changedProperties.has('changeNum') || changedProperties.has('patchRange')
        || changedProperties.has('path') || changedProperties.has('provider')) {
        this.computePercentage(this.changeNum, this.patchRange, this.path, this.provider);
    }
    super.update(changedProperties);
}
```

### Data resolution

`computePercentage()` calls the `provider` callback and delegates to the subclass's `getPercentageFromData()`:

```typescript
const p = await provider(changeNum, path, patchRange.patchNum);
if (p && Number.isFinite(this.getPercentageFromData(p))) {
    this.percentageText = this.getPercentageFromData(p)!.toString() + '%';
} else {
    this.percentageText = '-';
}
```

Each subclass overrides `getPercentageFromData()` to extract its metric:

| Component | `kind` | Extracts |
|---|---|---|
| `AbsoluteContentView` | `absolute` | `pd.absolute` |
| `IncrementalContentView` | `incremental` | `pd.incremental` |
| `AbsoluteUnitTestsContentView` | `absolute_unit_tests` | `pd.absolute_unit_tests` |
| `IncrementalUnitTestsContentView` | `incremental_unit_tests` | `pd.incremental_unit_tests` |

## Registration in plugin.ts

Components are registered into three file-list table slots:

| Slot | Registration ID | Components |
|---|---|---|
| `change-view-file-list-header` | Column headers | `absolute-header-view`, `incremental-header-view`, `absolute-unit-tests-header-view`, `incremental-unit-tests-header-view` |
| `change-view-file-list-content` | Per-file data cells | `absolute-content-view`, `incremental-content-view`, `absolute-unit-tests-content-view`, `incremental-unit-tests-content-view` |
| `change-view-file-list-summary` | Summary row | `absolute-summary-view`, `incremental-summary-view`, `absolute-unit-tests-summary-view`, `incremental-unit-tests-summary-view` |

### Content vs header registration

Content components receive a `provider` callback; header and summary components do not:

```typescript
// Header — no provider
plugin.registerDynamicCustomComponent('change-view-file-list-header', 'absolute-header-view')
    .onAttached(onAttached());  // needsProvider defaults to false

// Content — with provider
plugin.registerDynamicCustomComponent('change-view-file-list-content', 'absolute-content-view')
    .onAttached(onAttached(true));  // needsProvider = true → sets provider
```

### Provider binding

The `provider` is `CoverageClient.provideCoveragePercentages`, which queries the coverage cache and returns `PercentageData | null`. If null or the requested metric is not a finite number, the component renders `-`.

## CSS

All components share common styles:

```css
:host {
    display: inline-block;
    min-width: 3.5em;
    box-sizing: border-box;
}
.coverage-percentage-column {
    display: inline-block;
    min-width: 3.5em;
    text-align: center;
    width: 100%;
}
.coverage-percentage-column.hidden {
    display: none;
}
```

## Custom element names

Defined via `@customElement()` decorator:

| Decorator | HTML tag |
|---|---|
| `@customElement('absolute-header-view')` | `<absolute-header-view>` |
| `@customElement('incremental-header-view')` | `<incremental-header-view>` |
| `@customElement('absolute-content-view')` | `<absolute-content-view>` |
| `@customElement('incremental-content-view')` | `<incremental-content-view>` |
| `@customElement('absolute-summary-view')` | `<absolute-summary-view>` |
| `@customElement('incremental-summary-view')` | `<incremental-summary-view>` |
| `@customElement('absolute-unit-tests-header-view')` | `<absolute-unit-tests-header-view>` |
| `@customElement('incremental-unit-tests-header-view')` | `<incremental-unit-tests-header-view>` |
| `@customElement('absolute-unit-tests-content-view')` | `<absolute-unit-tests-content-view>` |
| `@customElement('incremental-unit-tests-content-view')` | `<incremental-unit-tests-content-view>` |
| `@customElement('absolute-unit-tests-summary-view')` | `<absolute-unit-tests-summary-view>` |
| `@customElement('incremental-unit-tests-summary-view')` | `<incremental-unit-tests-summary-view>` |
