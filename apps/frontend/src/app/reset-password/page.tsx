"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api-services";
import { ApiError } from "@/lib/api";
import { ErrorBanner, SuccessBanner } from "@/components/ui";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => router.replace("/login"), 2500);
      return () => clearTimeout(t);
    }
  }, [message, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authApi.resetPassword(token, password);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengubah password. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <Image src="/logo-egi.png" alt="EGI" width={48} height={48} />
          <div>
            <h1>Reset Password</h1>
            <p>Buat password baru untuk akun Anda</p>
          </div>
        </div>

        {!token ? (
          <ErrorBanner message="Link reset password tidak valid. Silakan minta link baru." />
        ) : (
          <>
            {error ? <ErrorBanner message={error} /> : null}
            {message ? <SuccessBanner message={`${message} Mengalihkan ke halaman masuk…`} /> : null}

            {!message ? (
              <form onSubmit={onSubmit}>
                <div className="form-field">
                  <label htmlFor="password">Password baru</label>
                  <input
                    id="password"
                    className="text-input"
                    style={{ width: "100%", borderRadius: 10 }}
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="confirmPassword">Konfirmasi password baru</label>
                  <input
                    id="confirmPassword"
                    className="text-input"
                    style={{ width: "100%", borderRadius: 10 }}
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
                  {submitting ? "Menyimpan…" : "Simpan password baru"}
                </button>
              </form>
            ) : null}
          </>
        )}

        <div className="login-links">
          <Link href="/login">Kembali ke halaman masuk</Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="login-page" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
