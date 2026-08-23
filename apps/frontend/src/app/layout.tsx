import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { BuildUpdateMonitor } from "@/components/BuildUpdateMonitor";
import { AuthProvider } from "@/lib/auth-context";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "EGI Website Monitoring",
  description: "Internal platform for monitoring EGI websites",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <UnsavedChangesProvider>
          <AuthProvider>
            <BuildUpdateMonitor />
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </UnsavedChangesProvider>
      </body>
    </html>
  );
}
