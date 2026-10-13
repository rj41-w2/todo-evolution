'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../../lib/auth-client';
import { AlertCircle, ArrowRight } from 'lucide-react';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return;

    setLoading(true);
    setError('');

    try {
      const { error: authError } = await authClient.signUp.email({
        email,
        password,
        name,
      });

      if (authError) {
        setError(authError.message || 'Failed to create your account.');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-paper px-4 py-12">
      <main className="w-full max-w-sm">
        <div className="text-center mb-6">
          <p className="wordmark inline-block">
            EVO<span className="text-accent-strong">TODO</span>
          </p>
        </div>

        <div className="bg-card border border-rule rounded-[var(--radius-panel)] shadow-card p-6 sm:p-8">
          <header className="space-y-1.5 mb-6">
            <h1 className="page-header text-[var(--text-2xl)]">Create your account.</h1>
            <p className="text-sm text-muted">Start tracking tasks in a couple of minutes.</p>
          </header>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2 p-3.5 rounded-[var(--radius-input)] bg-danger-soft border border-danger/40 text-danger text-sm"
            >
              <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label htmlFor="name" className="field-label">Full name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="input"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="field-label">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="field-label">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <>
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 border-2 border-accent-ink/30 border-t-accent-ink rounded-full animate-spin"
                  />
                  Creating account…
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-6 pt-6 border-t border-rule">
            Already have an account?{' '}
            <Link href="/login" className="text-accent-strong font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
