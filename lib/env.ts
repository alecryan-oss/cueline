import { z } from 'zod';

const isServer = typeof window === 'undefined';

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),
  DIALPAD_CLIENT_ID: z.string().min(1),
  DIALPAD_CLIENT_SECRET: z.string().min(1),
  DIALPAD_WEBHOOK_SECRET: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Dev-only feature flag: exposes /calls/simulate when 'true' AND NODE_ENV is
  // 'development'. Anything else means it's hidden + the route 302s to /.
  ENABLE_MOCK_CALLS: z.enum(['true', 'false']).default('false'),
  // Shared secret the WS relay / simulator sends as `x-internal-secret` when
  // POSTing to /api/suggest. The route rejects any request whose header
  // doesn't match (401). Required — generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  SUGGEST_INTERNAL_SECRET: z.string().min(16),
});

const source = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  VOYAGE_API_KEY: process.env.VOYAGE_API_KEY,
  DIALPAD_CLIENT_ID: process.env.DIALPAD_CLIENT_ID,
  DIALPAD_CLIENT_SECRET: process.env.DIALPAD_CLIENT_SECRET,
  DIALPAD_WEBHOOK_SECRET: process.env.DIALPAD_WEBHOOK_SECRET,
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  NODE_ENV: process.env.NODE_ENV,
  ENABLE_MOCK_CALLS: process.env.ENABLE_MOCK_CALLS,
  SUGGEST_INTERNAL_SECRET: process.env.SUGGEST_INTERNAL_SECRET,
};

const schema = isServer ? serverSchema : publicSchema;
const parsed = schema.safeParse(source);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(
    `[env] Invalid or missing environment variables (${isServer ? 'server' : 'client'}):\n${issues}\n` +
      `See .env.example for the full list and where to get each value.`,
  );
}

export const env = parsed.data as z.infer<typeof serverSchema>;
