import { cookies } from 'next/headers';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { createServerClient } from '@/lib/db/client';

export default async function LiveLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? '';

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">← Back to dashboard</Link>
        </Button>
        <span className="truncate text-xs text-muted-foreground">{email}</span>
      </header>
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
