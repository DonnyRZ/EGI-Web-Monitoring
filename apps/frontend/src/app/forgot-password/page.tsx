"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authApi } from "@/lib/api-services";
import { ApiError } from "@/lib/api";
import { ErrorBanner, SuccessBanner } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim permintaan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo-egi.png" alt="EGResources" />
          <div>
            <h1>Lupa Password</h1>
            <p>Masukkan email untuk menerima link reset password</p>
          </div>
        </div>

        {error ? <ErrorBanner message={error} /> : null}
        {message ? <SuccessBanner message={message} /> : null}

        {!message ? (
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
            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "Mengirim…" : "Kirim link reset"}
            </button>
          </form>
        ) : null}

        <div className="login-links">
          <Link href="/login">Kembali ke halaman masuk</Link>
        </div>
      </div>
    </div>
  );
}
