import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => mockClient,
  createServiceClient: () => mockClient,
}));

import { NoTenantError, requireTenant, UnauthenticatedError } from './context';

type MemberRow = { tenant_id: string; role: 'owner' | 'admin' | 'agent' };

function stubMembersQuery(rows: MemberRow[]) {
  const eq = vi.fn().mockResolvedValueOnce({ data: rows, error: null });
  const select = vi.fn().mockReturnValue({ eq });
  mockClient.from.mockReturnValueOnce({ select });
}

describe('requireTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws UnauthenticatedError when no user is signed in', async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(requireTenant()).rejects.toBeInstanceOf(UnauthenticatedError);
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it('throws UnauthenticatedError when getUser returns an error', async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'jwt expired' },
    });

    await expect(requireTenant()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('throws NoTenantError when the user has no tenant_members row', async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    stubMembersQuery([]);

    await expect(requireTenant()).rejects.toBeInstanceOf(NoTenantError);
  });

  it('returns the membership when the user belongs to exactly one tenant', async () => {
    mockClient.auth.getUser.mockResolvedValueOnce({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    stubMembersQuery([{ tenant_id: 'tenant-1', role: 'owner' }]);

    await expect(requireTenant()).resolves.toEqual({
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'owner',
    });
  });
});
