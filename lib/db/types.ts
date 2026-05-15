import type { Database } from './database.types';

type SchemaTables = Database['public']['Tables'];

export type Row<T extends keyof SchemaTables> = SchemaTables[T]['Row'];
export type InsertRow<T extends keyof SchemaTables> = SchemaTables[T]['Insert'];
export type UpdateRow<T extends keyof SchemaTables> = SchemaTables[T]['Update'];

// CHECK-constraint enums. Supabase's gen types renders these as `string`
// because Postgres CHECK constraints aren't introspectable as enums; we keep
// the narrower unions here so call sites get exhaustiveness checks.
export type TenantRole = 'owner' | 'admin' | 'agent';
export type CallStatus = 'active' | 'ended' | 'dropped';
export type Speaker = 'contact' | 'operator';
