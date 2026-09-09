"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { UserStoryCard } from "@/components/user-stories/UserStoryCard";
import { UserStoryDetailModal } from "@/components/user-stories/UserStoryDetailModal";
import { UserStoryFilters } from "@/components/user-stories/UserStoryFilters";
import { EmptyState, ErrorBanner, LoadingState } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { projectsApi, taskMonitoringApi, userStoriesApi } from "@/lib/api-services";
import { useAuth } from "@/lib/auth-context";
import { canViewUserStories } from "@/lib/format";
import { isStoryInStatusFilter, statusGroupQueryValue, USER_STORY_STATUS_GROUP_LABELS, USER_STORY_STATUS_GROUP_ORDER, type StoryStatusFilter } from "@/lib/user-story-status";
import type { TaskMonitoringFilters, UserStory } from "@/lib/types";

export default function UserStoriesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<UserStory[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [developerFilters, setDeveloperFilters] = useState<TaskMonitoringFilters["developers"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"board" | "list">("list");
  const [statusGroup, setStatusGroup] = useState<StoryStatusFilter>("all");
  const [priority, setPriority] = useState("");
  const [projectId, setProjectId] = useState("");
  const [developerId, setDeveloperId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedStory, setSelectedStory] = useState<UserStory | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await userStoriesApi.list({ limit: 100, project_id: projectId || undefined, developer_id: developerId || undefined, status_group: statusGroupQueryValue(statusGroup), priority: priority || undefined, search: search || undefined });
      setItems(response.data);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Gagal memuat User Stories"); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (!authLoading && user && !canViewUserStories(user.role)) router.replace("/dashboard"); }, [authLoading, user, router]);
  useEffect(() => {
    if (!user || !canViewUserStories(user.role)) return;
    if (user.role === "bos_it" || user.role === "developer") {
      taskMonitoringApi.filters().then((response) => {
        setProjects(response.projects);
        setDeveloperFilters(response.developers);
      }).catch(() => undefined);
      return;
    }
    projectsApi.list({ limit: 100 }).then((response) => setProjects(response.data.map((project) => ({ id: project.id, name: project.name })))).catch(() => undefined);
  }, [user?.id, user?.role]);
  useEffect(() => { if (user && canViewUserStories(user.role)) void load(); }, [user?.id, user?.role, statusGroup, priority, projectId, developerId]);

  const title = user?.role === "developer" ? "User Stories" : "User Stories";
  const filtered = useMemo(() => search.trim() ? items.filter((story) => `${story.title} ${story.project?.name || ""} ${story.website?.name || ""}`.toLowerCase().includes(search.trim().toLowerCase())) : items, [items, search]);
  const visibleStories = useMemo(() => filtered.filter((story) => isStoryInStatusFilter(story.status, statusGroup)), [filtered, statusGroup]);
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; stories: UserStory[] }>();
    for (const story of visibleStories) {
      const key = story.project_id;
      const group = map.get(key) ?? { name: story.project?.name || "Project", stories: [] };
      group.stories.push(story);
      map.set(key, group);
    }
    return [...map.values()];
  }, [visibleStories]);

  async function refreshAfterStoryUpdate(updated: UserStory) {
    setSelectedStory(updated);
    await load();
  }

  if (!user || !canViewUserStories(user.role)) return <AppShell title="User Stories"><LoadingState /></AppShell>;

  return (
    <AppShell title={title}>
      <section className="story-search-panel panel" aria-label="Cari User Story">
        <div className="filter-field story-search-field">
          <label htmlFor="story-search">Cari</label>
          <input
            id="story-search"
            className="text-input project-search"
            placeholder="Cari User Story, Project, atau Website"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="story-search-actions">
          <div className="segmented-control" aria-label="Pilihan tampilan User Story">
            <button type="button" className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Board</button>
            <button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")}>List</button>
          </div>
        </div>
      </section>

      <UserStoryFilters
        userRole={user.role}
        projects={projects}
        developerFilters={developerFilters}
        statusGroup={statusGroup}
        projectId={projectId}
        developerId={developerId}
        priority={priority}
        onStatusGroupChange={setStatusGroup}
        onProjectChange={setProjectId}
        onDeveloperChange={setDeveloperId}
        onPriorityChange={setPriority}
      />

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <LoadingState label="Memuat User Stories…" /> : null}
      {!loading && visibleStories.length === 0 ? <EmptyState title="Belum ada User Story" description={statusGroup === "all" ? (user.role === "developer" ? "Story yang ditugaskan kepada Anda akan muncul di sini." : "Buat story dari halaman detail Project.") : "Belum ada story pada kelompok status ini."} /> : null}
      {!loading && visibleStories.length > 0 ? <div className="story-project-groups">{groups.map((group) => <section className="story-project-group" key={group.name}><div className="panel-heading-row"><div><span className="eyebrow">Project</span><h3 className="panel-title">{group.name}</h3></div><span className="muted">{group.stories.length} story</span></div>{view === "board" ? <><div className="story-board standalone-story-board desktop-story-board">{USER_STORY_STATUS_GROUP_ORDER.map((groupStatus) => { const groupStories = group.stories.filter((story) => isStoryInStatusFilter(story.status, groupStatus)); return <div key={groupStatus} className="story-column"><div className="story-column-header"><span>{USER_STORY_STATUS_GROUP_LABELS[groupStatus]}</span><strong>{groupStories.length}</strong></div><div className="story-column-cards">{groupStories.map((story) => <UserStoryCard key={story.id} story={story} onOpenDetails={setSelectedStory} />)}</div></div>; })}</div><div className="story-mobile-story-list">{group.stories.map((story) => <UserStoryCard key={story.id} story={story} onOpenDetails={setSelectedStory} />)}</div></> : <div className="story-list standalone-story-list">{group.stories.map((story) => <UserStoryCard key={story.id} story={story} onOpenDetails={setSelectedStory} compact />)}</div>}</section>)}</div> : null}
      <UserStoryDetailModal story={selectedStory} canEditStatus={user.role === "superadmin" || user.role === "bos_it" || user.role === "developer"} canManageStatus={user.role !== "developer"} onClose={() => setSelectedStory(null)} onSaved={refreshAfterStoryUpdate} />
    </AppShell>
  );
}
