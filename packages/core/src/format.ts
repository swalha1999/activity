import type { ActivityConfig, ActivityLog } from "./types.js";

export function createFormatter<
  TActions extends readonly string[],
  TResourceTypes extends readonly string[],
>(config: ActivityConfig<TActions, TResourceTypes>) {
  const actionLabels = config.format?.action ?? {};
  const resourceTypeLabels = config.format?.resourceType ?? {};
  const icons = config.format?.icon ?? {};
  const colors = config.format?.color ?? {};
  const resourceNameFields = config.format?.resourceName ?? {};

  function getResourceName(activityLog: ActivityLog): string | null {
    const fields = (resourceNameFields as Record<string, string | string[]>)[
      activityLog.resourceType
    ];
    if (!fields) return null;

    const fieldList = Array.isArray(fields) ? fields : [fields];
    // Try newState first (for creates/updates), then previousState (for deletes)
    const state = activityLog.newState ?? activityLog.previousState;
    if (!state) return null;

    for (const field of fieldList) {
      const value = state[field];
      if (value != null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return null;
  }

  return {
    action(action: TActions[number]): string {
      return (
        (actionLabels as Record<string, string>)[action] ?? action
      );
    },

    resourceType(resourceType: TResourceTypes[number]): string {
      return (
        (resourceTypeLabels as Record<string, string>)[resourceType] ??
        resourceType
      );
    },

    icon(action: TActions[number]): string {
      return (icons as Record<string, string>)[action] ?? "";
    },

    color(action: TActions[number]): string {
      return (colors as Record<string, string>)[action] ?? "";
    },

    full(activityLog: ActivityLog, options?: { userName?: string }): string {
      const userName = options?.userName ?? "Someone";
      const actionLabel = (
        (actionLabels as Record<string, string>)[activityLog.action] ??
        activityLog.action
      ).toLowerCase();
      const resourceLabel =
        (resourceTypeLabels as Record<string, string>)[
          activityLog.resourceType
        ] ?? activityLog.resourceType;

      return `${userName} ${actionLabel} ${resourceLabel.toLowerCase()}`;
    },

    short(activityLog: ActivityLog): string {
      const actionLabel =
        (actionLabels as Record<string, string>)[activityLog.action] ??
        capitalize(activityLog.action);
      const resourceLabel =
        (resourceTypeLabels as Record<string, string>)[
          activityLog.resourceType
        ] ?? activityLog.resourceType;

      return `${actionLabel} ${resourceLabel.toLowerCase()}`;
    },

    message(activityLog: ActivityLog, options?: { userName?: string }): string {
      const actionLabel =
        (actionLabels as Record<string, string>)[activityLog.action] ??
        capitalize(activityLog.action);
      const resourceLabel =
        (resourceTypeLabels as Record<string, string>)[
          activityLog.resourceType
        ] ?? capitalize(activityLog.resourceType);

      const name = getResourceName(activityLog);
      const changedFields = activityLog.changedFields;

      let msg = options?.userName
        ? `${options.userName} ${actionLabel.toLowerCase()} ${resourceLabel}`
        : `${actionLabel} ${resourceLabel}`;

      if (name) {
        msg += ` '${name}'`;
      }

      if (changedFields && changedFields.length > 0) {
        msg += ` (${changedFields.join(", ")})`;
      }

      return msg;
    },
  };
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}
