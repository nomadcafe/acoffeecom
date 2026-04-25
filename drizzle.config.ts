import { defineConfig } from 'drizzle-kit';

// drizzle-kit only generates SQL migrations here; `wrangler d1 migrations apply`
// is what actually runs them against D1 (local or remote).
export default defineConfig({
  schema: './functions/_lib/db/schema.ts',
  out: './functions/_lib/db/migrations',
  dialect: 'sqlite',
});
