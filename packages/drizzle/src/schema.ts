import {
  pgTable,
  uuid,
  text,
  jsonb,
  boolean,
  timestamp,
  index,
  inet,
} from "drizzle-orm/pg-core";

export const activityLogTable = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    previousState: jsonb("previous_state").$type<Record<string, unknown>>(),
    newState: jsonb("new_state").$type<Record<string, unknown>>(),
    changedFields: text("changed_fields")
      .array()
      .$type<string[]>(),
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

export type ActivityLogRow = typeof activityLogTable.$inferSelect;
export type ActivityLogInsert = typeof activityLogTable.$inferInsert;
