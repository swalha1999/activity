import type { ActivityConfig, ActivityLog } from "./types.js";

export function createFormatter<
  TActions extends readonly string[],
  TResourceTypes extends readonly string[],
>(config: ActivityConfig<TActions, TResourceTypes>) {
  const actionLabels = config.format?.action ?? {};
  const resourceTypeLabels = config.format?.resourceType ?? {};
  const icons = config.format?.icon ?? {};
  const colors = config.format?.color ?? {};

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
  };
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}
