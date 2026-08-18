"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

/** Compatibility route: workload is now a filter/summary inside Task Monitoring. */
export default function TeamWorkloadPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user) router.replace("/tasks");
  }, [loading, user, router]);
  return <AppShell title="Task Monitoring"><LoadingState label="Membuka Task Monitoring…" /></AppShell>;
}
