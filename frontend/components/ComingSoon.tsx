import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description: string;
}

/**
 * Honest placeholder for a shell destination whose feature does not exist yet.
 * It says the feature is coming, names the page, states in one sentence what
 * will live there, and links back to the tasks page.
 *
 * No mock numbers, sample rows or fabricated entries: the backend cannot back
 * them, so none appear (see the spec's honesty rules).
 */
export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="space-y-8">
      <section className="space-y-1.5">
        <p className="font-mono text-micro uppercase tracking-[0.08em] text-muted">
          Coming soon
        </p>
        <h1 className="page-header text-[length:var(--text-2xl)]">{title}</h1>
        <p className="max-w-prose text-md text-ink-2">{description}</p>
      </section>

      <div className="border-t border-rule pt-6">
        <Link href="/tasks" className="btn-ghost">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Back to tasks
        </Link>
      </div>
    </div>
  );
}
