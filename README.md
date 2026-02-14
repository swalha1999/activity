# activity-log

A git-like **undo/redo audit logging** system for databases. ORM-agnostic core with a Drizzle adapter. Full TypeScript inference — your actions and resource types autocomplete everywhere.

## Features

- **Typed from config** — define actions and resource types once, get autocomplete everywhere
- **State tracking** — stores previous/new state, auto-computes changed fields
- **Undo/Redo** — undo single actions, entire batches, or rollback to a point in time
- **Diff engine** — compare states, get human-readable change descriptions
- **Batch & request grouping** — group related activities by batch or request ID
- **Async context** — auto-inject userId, orgId, IP via `AsyncLocalStorage`
- **Retention & cleanup** — auto-purge old records on a schedule
- **ORM-agnostic** — core logic is adapter-based; ships with a Drizzle adapter

## Packages

| Package | Description |
| --- | --- |
| `@swalha1999/activity` | Core library — types, factory, diff, format, undo/redo |
| `@swalha1999/activity-drizzle` | Drizzle ORM adapter + PostgreSQL schema |

## Quick Start

### Install

```bash
pnpm add @swalha1999/activity @swalha1999/activity-drizzle
```

### Set Up

```ts
import { createActivity } from "@swalha1999/activity";
import { drizzleAdapter } from "@swalha1999/activity-drizzle";
import { drizzle } from "drizzle-orm/neon-http";

const db = drizzle(process.env.DATABASE_URL!);

const activity = createActivity({
  adapter: drizzleAdapter(db),
  actions: [
    "create_property",
    "update_property",
    "delete_property",
    "login",
  ] as const,
  resourceTypes: ["property", "user"] as const,
});
```

The `as const` is important — it gives you full autocomplete on every method.

### Log an Activity

```ts
await activity.log({
  action: "create_property",    // autocompletes
  resourceType: "property",     // autocompletes
  resourceId: "prop-123",
  userId: "user-456",
  newState: { name: "Beach House", price: 500000 },
});
```

That's it. You're logging.

---

## Usage

### Logging

```ts
// Single log
const log = await activity.log({
  action: "update_property",
  resourceType: "property",
  resourceId: "prop-123",
  userId: "user-456",
  previousState: { name: "Beach House", price: 500000 },
  newState: { name: "Beach House", price: 550000 },
});
// changed_fields is auto-computed: ["price"]

// Fire-and-forget (non-blocking, errors go to console)
activity.logAsync({
  action: "login",
  resourceType: "user",
  userId: "user-456",
});

// Batch insert with shared fields
await activity.logBatch(
  [
    { action: "update_property", resourceType: "property", resourceId: "p1", userId: "u1" },
    { action: "update_property", resourceType: "property", resourceId: "p2", userId: "u1" },
  ],
  { batchId: "batch-001", userId: "user-456" },
);
```

### Queries

```ts
// Get a user's activity feed
const feed = await activity.getUserActivity("user-456", {
  limit: 20,
  offset: 0,
  actions: ["create_property", "update_property"],
});

// Get activity for an organization
const orgFeed = await activity.getOrgActivity("org-789");

// Full history of a single resource
const history = await activity.getResourceHistory({
  resourceType: "property",
  resourceId: "prop-123",
});

// Lookup by ID, request, or batch
const single = await activity.getById("activity-id");
const request = await activity.getByRequestId("req-001");
const batch = await activity.getByBatchId("batch-001");

// Stats
const stats = await activity.getStats({ organizationId: "org-789" });
// => { total: 142, byAction: { create_property: 80, ... }, byResourceType: {...}, byUser: {...}, byDate: {...} }
```

### Undo / Redo

Configure which actions are undoable:

```ts
const activity = createActivity({
  adapter: drizzleAdapter(db),
  actions: ["create_property", "update_property", "delete_property"] as const,
  resourceTypes: ["property"] as const,
  undoableActions: ["update_property", "delete_property"],
  undoBehavior: {
    update_property: "restore_state",
    delete_property: "restore",
  },
});
```

Then use it:

```ts
// Check if an activity can be undone
activity.canUndo(someActivityLog); // true/false

// Undo a single activity
const result = await activity.undo({
  activityId: "activity-id",
  userId: "user-456",
  reason: "Price was entered incorrectly",
});
// => { success: true, activity: <the new undo log entry> }

// Redo a previously undone activity
await activity.redo({ activityId: "activity-id", userId: "user-456" });

// Undo everything in a batch
await activity.undoBatch({ batchId: "batch-001", userId: "user-456" });

// Undo everything in a request
await activity.undoRequest({ requestId: "req-001", userId: "user-456" });

// Rollback a resource to a specific point in time
await activity.rollbackTo({ activityId: "activity-id", userId: "user-456" });
```

### Diff

```ts
// Diff an activity log's previous vs new state
const changes = activity.diff(someLog);
// => [{ field: "price", before: 500000, after: 550000 }]

// Diff any two objects
const changes = activity.diffStates(
  { name: "Old Name", price: 500000 },
  { name: "New Name", price: 500000 },
);
// => [{ field: "name", before: "Old Name", after: "New Name" }]

// Human-readable
activity.formatDiff(changes);
// => "Changed name from Old Name to New Name"

// Just the field names
activity.getChangedFields(someLog);
// => ["name"]
```

### Format

Configure human-readable labels, icons, and colors:

```ts
const activity = createActivity({
  // ...
  format: {
    action: {
      create_property: "Created",
      update_property: "Updated",
      delete_property: "Deleted",
    },
    resourceType: {
      property: "Property",
      user: "User",
    },
    icon: {
      create_property: "plus-circle",
      update_property: "edit",
      delete_property: "trash",
    },
    color: {
      create_property: "green",
      update_property: "blue",
      delete_property: "red",
    },
  },
});

activity.format.action("create_property");        // "Created"
activity.format.resourceType("property");          // "Property"
activity.format.icon("create_property");           // "plus-circle"
activity.format.color("create_property");          // "green"
activity.format.full(log, { userName: "John" });   // "John created property"
activity.format.short(log);                        // "Created property"
```

### Context (AsyncLocalStorage)

Auto-inject fields into every log call within an async scope:

```ts
import { setContext } from "@swalha1999/activity";

// In your middleware
await setContext(
  {
    userId: "user-456",
    organizationId: "org-789",
    requestId: crypto.randomUUID(),
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  },
  async () => {
    // All log calls in this scope auto-inherit the context
    await activity.log({
      action: "create_property",
      resourceType: "property",
      userId: "user-456", // still required, but context fills in the rest
    });
  },
);
```

### Capture State

Deep-clone objects for state tracking. Strips functions, converts Maps/Sets/Dates:

```ts
import { captureState } from "@swalha1999/activity";

const before = captureState(property);
// ... mutate property ...
await activity.log({
  action: "update_property",
  resourceType: "property",
  resourceId: property.id,
  userId: "user-456",
  previousState: before,
  newState: captureState(property),
});
```

### Cleanup & Retention

```ts
// Auto-cleanup: purge records older than 90 days, check every 24 hours
const activity = createActivity({
  // ...
  retention: { days: 90, cleanupInterval: "24h" },
});

// Manual cleanup
const result = await activity.cleanup({ olderThan: 90 }); // days
// => { deleted: 1234 }

// Dry run — see what would be deleted
const preview = await activity.cleanup({ olderThan: 90, dryRun: true });
// => { deleted: 1234 } (nothing actually deleted)

// Storage stats
const stats = await activity.getStorageStats();
// => { totalRecords: 50000, oldestRecord: Date, newestRecord: Date, sizeEstimate: "48.8 MB" }

// Stop the auto-cleanup interval when shutting down
activity.destroy();
```

---

## Database Schema

**You own the schema.** This package exports the Drizzle table definition, but you must add it to your project's schema and generate/run the migration yourself.

### Step 1: Add to your schema file

You have two options. In your Drizzle schema file (e.g. `src/schema/index.ts` or `db/schema.ts`):

**Option A — Re-export from the package:**

```ts
// db/schema.ts
export { activityLogTable } from "@swalha1999/activity-drizzle";

// ... your other tables
export * from "./users";
export * from "./posts";
```

**Option B — Copy the schema into your project:**

If you prefer full control, add this table definition directly to your schema:

```ts
// db/schema/activity-log.ts
import { pgTable, uuid, text, jsonb, boolean, timestamp, index, inet } from "drizzle-orm/pg-core";

export const activityLogTable = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    previousState: jsonb("previous_state").$type<Record<string, unknown>>(),
    newState: jsonb("new_state").$type<Record<string, unknown>>(),
    changedFields: text("changed_fields").array().$type<string[]>(),
    userId: uuid("user_id").notNull(),
    organizationId: uuid("organization_id"),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    requestId: uuid("request_id"),
    parentId: uuid("parent_id"),
    batchId: uuid("batch_id"),
    isUndone: boolean("is_undone").default(false),
    undoneBy: uuid("undone_by"),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_activity_user").on(table.userId),
    index("idx_activity_org").on(table.organizationId),
    index("idx_activity_resource").on(table.resourceType, table.resourceId),
    index("idx_activity_action").on(table.action),
    index("idx_activity_created").on(table.createdAt),
    index("idx_activity_request").on(table.requestId),
    index("idx_activity_batch").on(table.batchId),
  ],
);
```

### Step 2: Generate and run the migration

```bash
# Generate the migration
pnpm drizzle-kit generate

# Apply it to your database
pnpm drizzle-kit migrate
```

This creates the `activity_log` table and all its indexes in your database. From here on, you manage it like any other table in your project — you control when and how migrations run.

### Table Reference

The table (`activity_log`) has these columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key, auto-generated |
| `action` | TEXT | e.g. `"create_property"` |
| `resource_type` | TEXT | e.g. `"property"` |
| `resource_id` | UUID | The affected resource |
| `previous_state` | JSONB | State before the change |
| `new_state` | JSONB | State after the change |
| `changed_fields` | TEXT[] | Auto-computed field names |
| `user_id` | UUID | Who did it |
| `organization_id` | UUID | Multi-tenant scoping |
| `ip_address` | INET | Request IP |
| `user_agent` | TEXT | Browser/client info |
| `request_id` | UUID | Group activities by request |
| `parent_id` | UUID | Links undo entries to originals |
| `batch_id` | UUID | Group activities by batch |
| `is_undone` | BOOLEAN | Whether this was undone |
| `undone_by` | UUID | ID of the undo activity |
| `undone_at` | TIMESTAMPTZ | When it was undone |
| `metadata` | JSONB | Arbitrary extra data |
| `created_at` | TIMESTAMPTZ | Auto-set on insert |

Indexes on: `user_id`, `organization_id`, `(resource_type, resource_id)`, `action`, `created_at`, `request_id`, `batch_id`.

---

## Type Safety

The whole point of the factory pattern is end-to-end type safety. Define your actions and resource types as `as const` arrays, and every method parameter is checked:

```ts
const activity = createActivity({
  adapter: drizzleAdapter(db),
  actions: ["create_property", "update_property", "login"] as const,
  resourceTypes: ["property", "user"] as const,
});

activity.log({ action: "create_property", ... })  // OK
activity.log({ action: "typo_here", ... })         // Type error

activity.format.icon("update_property")            // OK
activity.format.icon("nope")                       // Type error
```

---

## Writing a Custom Adapter

The core package is ORM-agnostic. Implement the `ActivityAdapter` interface to use any database:

```ts
import type { ActivityAdapter } from "@swalha1999/activity";

const myAdapter: ActivityAdapter = {
  insert(entry)          { /* ... */ },
  insertMany(entries)    { /* ... */ },
  findById(id)           { /* ... */ },
  findMany(query)        { /* ... */ },
  update(id, data)       { /* ... */ },
  delete(query)          { /* ... */ },
  count(query?)          { /* ... */ },
  getStats(query)        { /* ... */ },
};

const activity = createActivity({
  adapter: myAdapter,
  actions: ["create", "update"] as const,
  resourceTypes: ["item"] as const,
});
```

---

## Project Structure

```
activity-log/
├── packages/
│   ├── core/              @swalha1999/activity
│   │   └── src/
│   │       ├── types.ts           All TypeScript interfaces
│   │       ├── create-activity.ts Factory + instance methods
│   │       ├── diff.ts            State diffing engine
│   │       ├── format.ts          Human-readable formatting
│   │       ├── context.ts         AsyncLocalStorage context
│   │       ├── capture-state.ts   Deep-clone helper
│   │       └── __tests__/         51 tests
│   └── drizzle/           @swalha1999/activity-drizzle
│       └── src/
│           ├── schema.ts          pgTable definition + indexes
│           └── adapter.ts         ActivityAdapter implementation
├── examples/
│   ├── with-drizzle/      Standalone Drizzle example
│   └── with-nextjs/       Next.js integration pattern
├── pnpm-workspace.yaml
└── package.json
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type check
pnpm lint
```

## License

MIT
