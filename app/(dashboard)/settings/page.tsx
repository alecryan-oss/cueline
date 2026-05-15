import { cookies } from 'next/headers';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createServerClient } from '@/lib/db/client';
import { requireTenant } from '@/lib/tenant/context';

import { RenameTenantForm } from './rename-form';

export default async function SettingsPage() {
  const { tenantId, role } = await requireTenant();

  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name')
    .eq('id', tenantId)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your workspace.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Workspace name</CardTitle>
          <CardDescription>
            {role === 'owner'
              ? 'Visible to everyone in your workspace.'
              : 'Only the workspace owner can change this.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RenameTenantForm initialName={tenant?.name ?? ''} canEdit={role === 'owner'} />
        </CardContent>
      </Card>
    </div>
  );
}
