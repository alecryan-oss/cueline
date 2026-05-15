import { Suspense } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createServiceClient } from '@/lib/db/client';
import { getTenantIntegration } from '@/lib/db/queries/tenantIntegrations';
import { requireTenant } from '@/lib/tenant/context';

import { DialpadCard, type DialpadConnectionState } from './dialpad-card';
import { RenameTenantForm } from './rename-form';

export default async function SettingsPage() {
  const { tenantId, role } = await requireTenant();

  const service = createServiceClient();
  const [tenant, integration] = await Promise.all([
    service.from('tenants').select('name').eq('id', tenantId).maybeSingle().then((r) => r.data),
    getTenantIntegration(service, tenantId),
  ]);

  const dialpad: DialpadConnectionState = {
    connected: Boolean(integration?.dialpad_user_id),
    user_email: integration?.dialpad_user_email ?? null,
    user_id: integration?.dialpad_user_id ?? null,
    company_id: integration?.dialpad_company_id ?? null,
    connected_at: integration?.connected_at ?? null,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your workspace and integrations.</p>
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

      <Suspense>
        <DialpadCard state={dialpad} canManage={role === 'owner'} />
      </Suspense>
    </div>
  );
}
