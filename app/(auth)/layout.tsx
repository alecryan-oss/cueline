import { Logo } from '@/components/brand/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      {/* Left: form column */}
      <div className="flex flex-col bg-background">
        <header className="flex h-14 items-center px-6">
          <Logo size="md" />
        </header>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <footer className="flex h-12 items-center justify-between px-6 text-xs text-muted-foreground">
          <span>© Cueline</span>
          <a href="https://developers.dialpad.com" className="hover:underline" rel="noreferrer">
            Built for Dialpad
          </a>
        </footer>
      </div>

      {/* Right: pitch column (hidden on mobile) */}
      <div className="relative hidden overflow-hidden border-l bg-muted/30 lg:flex">
        <div className="relative z-10 flex flex-1 flex-col justify-center px-12">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-brand">
            Real-time sales assist
          </p>
          <h2 className="mb-4 text-3xl font-semibold leading-tight tracking-tight">
            The right thing to say,
            <br />
            <span className="text-muted-foreground">while the prospect is still talking.</span>
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Cueline listens to your live Dialpad calls and surfaces a single, well-sourced
            suggestion the moment the prospect raises an objection, asks a discovery question, or
            shows a buying signal. Sub-2-second from utterance to card.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              <span>
                Two-stage pipeline — cheap classifier filters filler, full model only fires on
                signal.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              <span>
                Per-tenant knowledge base, RAG over your own playbook. No invented numbers.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              <span>Hard cost ceiling per workspace — the bill never surprises you.</span>
            </li>
          </ul>
        </div>
        {/* Subtle radial accent */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,oklch(0.51_0.21_280/0.08),transparent_60%)]" />
      </div>
    </div>
  );
}
