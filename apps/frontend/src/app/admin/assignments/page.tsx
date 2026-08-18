"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

export default function AssignmentsCompatibilityPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user) router.replace("/projects");
  }, [loading, user, router]);
  return <AppShell title="Kelola Project"><LoadingState label="Membuka Kelola Project…" /></AppShell>;
}
