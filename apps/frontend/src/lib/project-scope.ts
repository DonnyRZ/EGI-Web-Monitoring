import { projectsApi } from "@/lib/api-services";

let projectScopeCache = false;
let projectScopeCachedAt = 0;
let projectScopeRequest: Promise<boolean> | null = null;
let projectScopeCacheKey = "";

/** Shared single-flight cache for the developer PIC scope probe. */
export function loadProjectPicDeveloperScope(userId: string) {
  const now = Date.now();
  if (userId === projectScopeCacheKey && now - projectScopeCachedAt < 60_000) {
    return Promise.resolve(projectScopeCache);
  }
  if (!projectScopeRequest) {
    projectScopeRequest = projectsApi
      .scopeSummary()
      .then((response) => {
        projectScopeCache = response.has_pic_developer;
        projectScopeCacheKey = userId;
        projectScopeCachedAt = Date.now();
        return projectScopeCache;
      })
      .finally(() => {
        projectScopeRequest = null;
      });
  }
  return projectScopeRequest;
}
