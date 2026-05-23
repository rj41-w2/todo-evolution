'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../../lib/auth-client';
import { Sparkles, User, Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';

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
      const { data, error: authError } = await authClient.signUp.email({
        email,
        password,
        name,
      });

      if (authError) {
        setError(authError.message || 'Failed to initialize account.');
      } else {
        router.push('/');
        router.refresh();
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative font-sans flex items-center justify-center p-4 selection:bg-indigo-500/30 selection:text-indigo-200 overflow-hidden">
      {/* Cinematic Background Layer */}
      <div className="cinematic-bg" />
      <div className="fixed inset-0 -z-5 particles" />

      {/* Floating Ambient Glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 dark:bg-indigo-500/10 blur-[130px] rounded-full animate-float" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 dark:bg-blue-500/10 blur-[120px] rounded-full animate-float" style={{ animationDelay: '-5s' }} />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass p-8 md:p-12 rounded-3xl w-full max-w-md border border-white/5 shadow-2xl relative z-10 space-y-8"
      >
        {/* Header */}
        <div className="text-center space-y-3">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="mx-auto h-12 w-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/30 ring-1 ring-white/20 mb-4"
          >
            <Sparkles className="h-6 w-6 text-white" fill="currentColor" />
          </motion.div>

          <h2 className="text-3xl font-black italic tracking-tighter text-foreground uppercase">
            EVO<span className="text-indigo-500">TODO</span>
          </h2>
          <p className="text-foreground/40 text-sm font-medium">
            Initialize your profile identifier on the grid.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Form */}
        <form onSubmit={handleRegister} className="space-y-6">
          <div className="space-y-4">
            {/* Name Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold tracking-widest text-foreground/40 uppercase">Full Name</label>
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/20 group-focus-within:text-indigo-500 transition-colors" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Rehan Jamil  "
                  className="w-full bg-black/20 dark:bg-white/5 border border-white/5 focus:border-indigo-500/50 rounded-xl pl-12 pr-4 py-3.5 text-sm text-foreground placeholder:text-foreground/20 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all"
                  required
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold tracking-widest text-foreground/40 uppercase">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/20 group-focus-within:text-indigo-500 transition-colors" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rehan@gmail.com"
                  className="w-full bg-black/20 dark:bg-white/5 border border-white/5 focus:border-indigo-500/50 rounded-xl pl-12 pr-4 py-3.5 text-sm text-foreground placeholder:text-foreground/20 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold tracking-widest text-foreground/40 uppercase">Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/20 group-focus-within:text-indigo-500 transition-colors" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black/20 dark:bg-white/5 border border-white/5 focus:border-indigo-500/50 rounded-xl pl-12 pr-4 py-3.5 text-sm text-foreground placeholder:text-foreground/20 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full glow-primary bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:shadow-none text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-lg shadow-indigo-600/20"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Register Identity
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <div className="text-center pt-4 border-t border-white/5">
          <p className="text-xs text-foreground/30 font-medium">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors ml-1"
            >
              Sign In
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
