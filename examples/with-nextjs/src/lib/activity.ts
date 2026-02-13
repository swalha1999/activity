/**
 * Example: Using @activity-log with Next.js
 *
 * This file shows how to set up activity logging in a Next.js app.
 * Create a singleton instance and use it across your API routes.
 */

import { createActivity, setContext } from "@swalha1999/activity";
// import { drizzleAdapter } from "@swalha1999/activity-drizzle";
// import { db } from "./db"; // your Drizzle db instance

// Create a singleton activity logger
// export const activity = createActivity({
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
//   },
// });

/**
 * Middleware helper to set context for activity logging.
 * Use in your Next.js API route handlers or middleware.
 */
export function withActivityContext(
  req: Request,
  userId: string,
  orgId: string,
) {
  return setContext(
    {
      userId,
      organizationId: orgId,
      requestId: crypto.randomUUID(),
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    },
    () => {
      // Your handler logic here
    },
  );
}

/**
 * Example API route handler (Next.js App Router):
 *
 * // app/api/properties/route.ts
 * import { activity } from "@/lib/activity";
 * import { captureState } from "@swalha1999/activity";
 *
 * export async function POST(req: Request) {
 *   const body = await req.json();
 *   const property = await db.insert(properties).values(body).returning();
 *
 *   await activity.log({
 *     action: "create_property",
 *     resourceType: "property",
 *     resourceId: property.id,
 *     userId: session.userId,
 *     newState: captureState(property),
 *   });
 *
 *   return Response.json(property);
 * }
 */
