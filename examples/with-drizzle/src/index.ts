/**
 * Example: Using @activity-log with Drizzle ORM
 *
 * This example demonstrates the full API of the activity-log package
 * with the Drizzle adapter for PostgreSQL.
 *
 * Prerequisites:
 *   - A PostgreSQL database
 *   - The activity_log table created (see the schema export)
 */

import { createActivity, captureState, setContext } from "@swalha1999/activity";
import { drizzleAdapter, activityLogTable } from "@swalha1999/activity-drizzle";
// import { drizzle } from "drizzle-orm/neon-http";

// 1. Set up your Drizzle database connection
// const db = drizzle(process.env.DATABASE_URL!);

// 2. Create the activity instance
// const activity = createActivity({
//   adapter: drizzleAdapter(db),
//   actions: [
//     "create_property",
//     "update_property",
//     "delete_property",
//     "login",
//     "logout",
//   ] as const,
//   resourceTypes: ["property", "user", "session"] as const,
//   undoableActions: ["update_property", "delete_property"],
//   undoBehavior: {
//     update_property: "restore_state",
//     delete_property: "restore",
//   },
//   format: {
//     action: {
//       create_property: "Created",
//       update_property: "Updated",
//       delete_property: "Deleted",
//       login: "Logged in",
//       logout: "Logged out",
//     },
//     resourceType: {
//       property: "Property",
//       user: "User",
//       session: "Session",
//     },
//     icon: {
//       create_property: "plus-circle",
//       update_property: "edit",
//       delete_property: "trash",
//       login: "log-in",
//       logout: "log-out",
//     },
//     color: {
//       create_property: "green",
//       update_property: "blue",
//       delete_property: "red",
//       login: "gray",
//       logout: "gray",
//     },
//   },
//   retention: { days: 90, cleanupInterval: "24h" },
// });

// Example usage:

// async function main() {
//   // Log a create action
//   const log = await activity.log({
//     action: "create_property",
//     resourceType: "property",
//     resourceId: "prop-123",
//     userId: "user-456",
//     organizationId: "org-789",
//     newState: { name: "Beach House", price: 500000, city: "Miami" },
//   });
//
//   console.log("Created log:", log.id);
//
//   // Log an update with state tracking
//   const previousState = captureState({ name: "Beach House", price: 500000, city: "Miami" });
//   const updateLog = await activity.log({
//     action: "update_property",
//     resourceType: "property",
//     resourceId: "prop-123",
//     userId: "user-456",
//     previousState,
//     newState: { name: "Beach House", price: 550000, city: "Miami" },
//   });
//
//   // Diff
//   const diff = activity.diff(updateLog);
//   console.log("Changes:", activity.formatDiff(diff));
//   // => "Changed price from 500000 to 550000"
//
//   // Format
//   console.log(activity.format.full(updateLog, { userName: "John" }));
//   // => "John updated property"
//
//   // Undo
//   const undoResult = await activity.undo({
//     activityId: updateLog.id,
//     userId: "user-456",
//     reason: "Price was wrong",
//   });
//   console.log("Undo success:", undoResult.success);
//
//   // Query
//   const userActivity = await activity.getUserActivity("user-456", { limit: 10 });
//   console.log("User activities:", userActivity.length);
//
//   // Context-based logging
//   await setContext(
//     { userId: "user-456", organizationId: "org-789", requestId: "req-001" },
//     async () => {
//       await activity.log({
//         action: "login",
//         resourceType: "session",
//         userId: "user-456",
//       });
//     },
//   );
//
//   // Stats
//   const stats = await activity.getStats({});
//   console.log("Total activities:", stats.total);
//
//   // Cleanup
//   activity.destroy();
// }
//
// main().catch(console.error);

console.log("Example: with-drizzle");
console.log("See source code for full usage examples.");
console.log("Exported schema:", Object.keys(activityLogTable));
