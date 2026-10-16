'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { authClient } from '../lib/auth-client';
import { clearTokenCache } from '../lib/api';

/**
 * Sign-out is a single mechanism. The shell sidebar's quick control and the
 * settings page both render this, so the two can never drift apart: one
 * `authClient.signOut()`, then back to the login page.
 */
export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      // Drop the memoized JWT *before* navigating: the token outlives the
      // session cookie server-side (stateless verification), and a stale cache
      // would let the next `secureFetch` in this tab send a still-valid token
      // for a signed-out user.
      clearTokenCache();
      await authClient.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Failed to sign out user:', error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-input)] text-xs font-medium text-danger hover:bg-danger-soft transition-colors cursor-pointer"
    >
      <LogOut className="h-3.5 w-3.5" />
      Log out
    </button>
  );
}
