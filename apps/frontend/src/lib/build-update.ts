export type BuildUpdateAction = "none" | "reload" | "banner";

export function getBuildUpdateAction(
  currentVersion: string,
  latestVersion: string,
  hasUnsavedChanges: boolean,
  attemptedVersion: string | null,
): BuildUpdateAction {
  if (!currentVersion || currentVersion === "development" || !latestVersion || latestVersion === "development") {
    return "none";
  }
  if (currentVersion === latestVersion) return "none";
  if (hasUnsavedChanges || attemptedVersion === latestVersion) return "banner";
  return "reload";
}
