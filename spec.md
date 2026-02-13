# Agent Prompt: Build `activity-log` Package

## Overview

Build a TypeScript monorepo package called `activity-log` — a git-like undo/redo audit logging system for databases. It's ORM-agnostic at its core, with a Drizzle adapter. The package uses a factory pattern (`createActivity`) that returns a fully-typed instance based on user-defined actions and resource types.

---

## Monorepo Structure

Use a pnpm workspace monorepo with the following packages:

```
activity-log/
├── packages/
│   ├── core/                 # Main package (@activity-log/core) — ORM-agnostic
│   └── drizzle/              # Drizzle adapter (@activity-log/drizzle)
├── examples/
│   ├── with-drizzle/
│   └── with-nextjs/
├── docs/
├── pnpm-workspace.yaml
├── tsconfig.json
└── package.json
```

Use `tsup` for building, `vitest` for testing, and `changesets` for versioning.

---

## 1. Core Package (`@activity-log/core`)

### 1.1 Factory: `createActivity(config)`

This is the main entry point. It accepts a config object and returns a typed activity instance. The config shape is:

```ts
interface ActivityConfig<
  TActions extends readonly string[],
  TResourceTypes extends readonly string[]
> {
  adapter: ActivityAdapter;
  actions: TActions;
  resourceTypes: TResourceTypes;
  undoableActions?: TActions[number][];
  undoBehavior?: Partial<Record<TActions[number], 'soft_delete' | 'restore' | 'restore_state'>>;
  format?: {
    action?: Partial<Record<TActions[number], string>>;
    resourceType?: Partial<Record<TResourceTypes[number], string>>;
    icon?: Partial<Record<TActions[number], string>>;
    color?: Partial<Record<TActions[number], string>>;
  };
  retention?: { days: number; cleanupInterval?: string };
}
```

**Critical:** The `actions` and `resourceTypes` arrays must be `as const` and the returned instance must infer literal union types from them for full autocomplete on `action` and `resourceType` fields throughout the API.

### 1.2 Database Schema

The underlying table is `activity_log`. Here is the SQL schema — the Drizzle adapter must create this table using Drizzle's schema language:

```sql
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    previous_state JSONB,
    new_state JSONB,
    changed_fields TEXT[],
    user_id UUID NOT NULL,
    organization_id UUID,
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    parent_id UUID REFERENCES activity_log(id),
    batch_id UUID,
    is_undone BOOLEAN DEFAULT FALSE,
    undone_by UUID REFERENCES activity_log(id),
    undone_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);
```

Create these indexes:
- `idx_activity_user` on `(user_id)`
- `idx_activity_org` on `(organization_id)`
- `idx_activity_resource` on `(resource_type, resource_id)`
- `idx_activity_action` on `(action)`
- `idx_activity_created` on `(created_at DESC)`
- `idx_activity_request` on `(request_id)`
- `idx_activity_batch` on `(batch_id)`

### 1.3 Adapter Interface

Define an `ActivityAdapter` interface that ORM adapters must implement (currently only Drizzle):

```ts
interface ActivityAdapter {
  insert(entry: ActivityEntry): Promise<ActivityLog>;
  insertMany(entries: ActivityEntry[]): Promise<ActivityLog[]>;
  findById(id: string): Promise<ActivityLog | null>;
  findMany(query: ActivityQuery): Promise<ActivityLog[]>;
  update(id: string, data: Partial<ActivityEntry>): Promise<ActivityLog>;
  delete(query: { olderThan: Date }): Promise<{ deleted: number }>;
  count(query?: ActivityQuery): Promise<number>;
  getStats(query: StatsQuery): Promise<ActivityStats>;
}
```

### 1.4 Methods on the Returned Instance

The instance returned by `createActivity()` must expose the following methods. All `action` and `resourceType` parameters must be typed as the literal unions from config.

#### Logging

- **`activity.log(entry)`** — Insert a single activity log. Accepts `{ userId, organizationId?, action, resourceType, resourceId?, previousState?, newState?, requestId?, parentId?, batchId?, metadata?, ipAddress?, userAgent? }`. Automatically computes `changed_fields` by diffing `previousState` and `newState` if both are provided. Returns the created `ActivityLog`.
- **`activity.logAsync(entry)`** — Same as `log` but fire-and-forget (non-blocking). Returns `void`. Errors are swallowed and logged to console.
- **`activity.logBatch(entries[], sharedFields)`** — Insert multiple activity logs. `sharedFields` (like `userId`, `batchId`, `metadata`) are merged into each entry. Returns `ActivityLog[]`.

#### Queries

- **`activity.getUserActivity(userId, options?)`** — Get activities for a user. Options: `{ limit?, offset?, actions?, resourceTypes?, dateRange?: { from, to } }`.
- **`activity.getOrgActivity(orgId, options?)`** — Same but scoped to organization.
- **`activity.getResourceHistory({ resourceType, resourceId })`** — Get full history for a specific resource, ordered by `created_at DESC`.
- **`activity.getById(id)`** — Get single activity by ID.
- **`activity.getByRequestId(requestId)`** — Get all activities grouped under a request.
- **`activity.getByBatchId(batchId)`** — Get all activities in a batch.
- **`activity.getStats(query)`** — Returns `{ total, byAction, byResourceType, byUser, byDate }`.

#### Undo / Redo

- **`activity.canUndo(activityLog)`** — Returns `boolean`. True if the action is in `undoableActions`, `is_undone` is false, and `previous_state` exists (for updates/deletes).
- **`activity.canRedo(activityLog)`** — Returns `boolean`. True if `is_undone` is true.
- **`activity.undo({ activityId, userId, reason? })`** — Undo a single activity. Behavior depends on `undoBehavior` config:
  - `'soft_delete'`: Marks the created resource as deleted (caller must implement via adapter hook).
  - `'restore'`: Restores the resource from `previous_state`.
  - `'restore_state'`: Restores the resource to `previous_state`.
  - Marks the original activity as `is_undone = true`, sets `undone_by` and `undone_at`.
  - Creates a NEW activity log entry recording the undo action itself.
  - Returns `{ success: boolean, activity?: ActivityLog, error?: string }`.
- **`activity.redo({ activityId, userId })`** — Redo a previously undone activity. Restores `new_state`. Marks `is_undone = false`. Creates a new log entry for the redo.
- **`activity.undoRequest({ requestId, userId, reason? })`** — Undo all activities under a `request_id`, in reverse chronological order.
- **`activity.undoBatch({ batchId, userId, reason? })`** — Undo all activities in a batch.
- **`activity.rollbackTo({ activityId, userId, reason? })`** — Rollback a resource to the state it was in at a specific activity. Applies all necessary undos in order.

#### Diff

- **`activity.diff(activityLog)`** — Returns `Array<{ field: string, before: any, after: any }>` by comparing `previous_state` and `new_state`.
- **`activity.diffStates(oldState, newState)`** — Compare two arbitrary objects.
- **`activity.formatDiff(diff)`** — Returns human-readable string like `"Changed price from 500000 to 550000"`.
- **`activity.getChangedFields(activityLog)`** — Returns `string[]` of changed field names.

#### Format

- **`activity.format.action(action)`** — Returns the human-readable label from config, or the raw action string.
- **`activity.format.resourceType(resourceType)`** — Same for resource types.
- **`activity.format.icon(action)`** — Returns icon name string from config.
- **`activity.format.color(action)`** — Returns color string from config.
- **`activity.format.full(activityLog, { userName? })`** — Returns full sentence like `"John created property"`.
- **`activity.format.short(activityLog)`** — Returns short label like `"Created property"`.

#### Cleanup

- **`activity.cleanup({ olderThan, dryRun? })`** — Delete activities older than N days. If `dryRun` is true, return count without deleting. Returns `{ deleted: number }`.
- **`activity.getStorageStats()`** — Returns `{ totalRecords, oldestRecord, newestRecord, sizeEstimate }`.

If `retention` is configured, start an internal interval that runs cleanup automatically.

### 1.5 Helpers

- **`captureState(obj)`** — Deep-clones a plain object for use as `previousState` or `newState`. Strips functions and class instances.
- **`setContext(ctx)`** — Uses `AsyncLocalStorage` to set context (userId, organizationId, requestId, ipAddress, userAgent) that is automatically merged into all `activity.log()` calls within that async scope.

---

## 2. Drizzle Adapter (`@activity-log/drizzle`)

- Export `drizzleAdapter(db)` that implements `ActivityAdapter` using Drizzle queries.
- Export the Drizzle schema definition (`activityLogTable`) using `pgTable` with all columns and indexes defined.
- The adapter should accept any Drizzle database instance (postgres).

---

## 3. Type Safety Requirements

This is the most important design goal. The factory pattern must provide **full TypeScript inference**:

```ts
const activity = createActivity({
  adapter: drizzleAdapter(db),
  actions: ['create_property', 'update_property', 'login'] as const,
  resourceTypes: ['property', 'user'] as const,
  // ...
});

// These must autocomplete and type-check:
activity.log({ action: 'create_property', ... })  // ✅
activity.log({ action: 'nonexistent', ... })       // ❌ Type error
activity.format.icon('update_property')             // ✅
activity.format.icon('bad_action')                  // ❌ Type error
```

Use generics on `createActivity` to infer `TActions` and `TResourceTypes` from the `as const` arrays, then thread those types through the entire returned API.

---

## 4. Testing

Write tests with `vitest` for:

- Core logging (insert, query, batch)
- Diff computation
- Undo/redo state machines
- Format helpers
- Context propagation via AsyncLocalStorage
- Adapter interface compliance (test the Drizzle adapter)
- Cleanup and retention
- Type inference (use `expectTypeOf` from vitest)

---

## 5. Build & Publish

- Use `tsup` to build each package to both ESM and CJS.
- Each package has its own `package.json` with proper `exports` field mapping sub-paths.
- Use `changesets` for versioning.
- Include proper `peerDependencies` (e.g., `drizzle-orm` for the drizzle adapter).

---

## 6. Priority Order

Build in this order:
1. **Types & interfaces** — `ActivityAdapter`, `ActivityLog`, `ActivityEntry`, `ActivityConfig`, all generics
2. **Core logic** — diff, format, context (AsyncLocalStorage), captureState
3. **Core instance methods** — log, logBatch, queries, undo/redo, cleanup
4. **Drizzle adapter** — schema + adapter implementation
5. **Tests**
6. **Examples**

---

## Reference

The full spec with all API signatures, schema, and usage examples is attached as `activity-log-spec.md`. Follow it exactly for API naming, method signatures, and return types. If anything in this prompt conflicts with the spec, the spec wins.