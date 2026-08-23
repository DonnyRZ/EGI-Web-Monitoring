"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { ErrorBanner } from "@/components/ui";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

export default function LoginPage() {
  const { user, loading, login, loginAsGuest } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("egi.egiholding@gmail.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useUnsavedChanges("auth:login", email !== "egi.egiholding@gmail.com" || Boolean(password) || submitting);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login gagal. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onGuest() {
    setError("");
    setSubmitting(true);
    try {
      await loginAsGuest();
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login tamu gagal. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="login-page">
        <div className="state-box" style={{ border: "none", background: "transparent" }}>
          Memuat…
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo-egi.png" alt="EGResources" />
          <div>
            <span className="eyebrow">EGI operations platform</span>
            <h1>Hello IT</h1>
            <p>Masuk untuk memantau website, Project, dan pekerjaan tim EGI.</p>
          </div>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        <form onSubmit={onSubmit}>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="text-input"
              style={{ width: "100%", borderRadius: 10 }}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="text-input"
              style={{ width: "100%", borderRadius: 10 }}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Masuk…" : "Masuk"}
          </button>
        </form>

        <div className="login-links">
          <Link href="/forgot-password">Lupa password?</Link>
          <button type="button" className="link-button" onClick={() => void onGuest()} disabled={submitting}>
            Masuk sebagai tamu
          </button>
        </div>
      </div>
    </div>
  );
}
