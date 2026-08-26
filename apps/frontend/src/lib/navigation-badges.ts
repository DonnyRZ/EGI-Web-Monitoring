import { incidentsApi, userStoriesApi } from "@/lib/api-services";

let activeIncidentsCache = 0;
let activeIncidentsCachedAt = 0;
let activeIncidentsRequest: Promise<number> | null = null;
let activeIncidentsCacheKey = "";

let myOpenTasksCache = 0;
let myOpenTasksCachedAt = 0;
let myOpenTasksRequest: Promise<number> | null = null;
let myOpenTasksCacheKey = "";

export function loadActiveIncidents(user: { id: string; role: string }) {
  const now = Date.now();
  const key = `${user.id}:${user.role}`;
  if (key === activeIncidentsCacheKey && now - activeIncidentsCachedAt < 30_000) {
    return Promise.resolve(activeIncidentsCache);
  }
  if (!activeIncidentsRequest) {
    activeIncidentsRequest = incidentsApi
      .activeCount()
      .then((response) => {
        activeIncidentsCache = response.count;
        activeIncidentsCacheKey = key;
        activeIncidentsCachedAt = Date.now();
        return activeIncidentsCache;
      })
      .finally(() => {
        activeIncidentsRequest = null;
      });
  }
  return activeIncidentsRequest;
}

export function loadMyOpenTasks(user: { id: string }) {
  const now = Date.now();
  if (user.id === myOpenTasksCacheKey && now - myOpenTasksCachedAt < 30_000) {
    return Promise.resolve(myOpenTasksCache);
  }
  if (!myOpenTasksRequest) {
    myOpenTasksRequest = userStoriesApi
      .meWorkSummary()
      .then((response) => {
        const count = response.pending + response.in_progress;
        myOpenTasksCache = count;
        myOpenTasksCacheKey = user.id;
        myOpenTasksCachedAt = Date.now();
        return myOpenTasksCache;
      })
      .finally(() => {
        myOpenTasksRequest = null;
      });
  }
  return myOpenTasksRequest;
}
