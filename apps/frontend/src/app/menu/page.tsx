"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { MobileMenuPage } from "@/components/MobileNavigation";
import { LoadingState } from "@/components/ui";
import { loadActiveIncidents } from "@/lib/navigation-badges";
import { buildNavigationCatalog, canNavigateIncidents } from "@/lib/mobile-navigation";
import { loadProjectPicDeveloperScope } from "@/lib/project-scope";
import { useAuth } from "@/lib/auth-context";
import { isEndUserPublicDashboard } from "@/lib/format";

export default function MenuPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [scopeReady, setScopeReady] = useState(false);
  const [isProjectPicDeveloper, setIsProjectPicDeveloper] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState(0);

  useEffect(() => {
    if (!authLoading && user && isEndUserPublicDashboard(user.role)) router.replace("/dashboard");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    if (user.role !== "developer") {
      setScopeReady(true);
      setIsProjectPicDeveloper(false);
    } else {
      setScopeReady(false);
      loadProjectPicDeveloperScope(user.id)
        .then((value) => {
          if (!cancelled) {
            setIsProjectPicDeveloper(value);
            setScopeReady(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setIsProjectPicDeveloper(false);
            setScopeReady(true);
          }
        });
    }
    if (canNavigateIncidents(user.role)) {
      loadActiveIncidents(user)
        .then((value) => {
          if (!cancelled) setActiveIncidents(value);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, user?.role]);

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  if (authLoading || !user || isEndUserPublicDashboard(user.role)) {
    return <AppShell title="Menu"><LoadingState label="Memuat menu…" /></AppShell>;
  }

  const navigation = buildNavigationCatalog(user.role, {
    isProjectPicDeveloper,
    scopeReady,
    activeIncidents,
  });

  return (
    <AppShell title="Menu">
      {!navigation.ready ? (
        <LoadingState label="Menyiapkan menu Anda…" />
      ) : (
        <MobileMenuPage items={navigation.menuNav} pathname={pathname} onLogout={() => void onLogout()} />
      )}
    </AppShell>
  );
}
