import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Dedicated runner for REAL end-to-end RLS / JWT / PostgREST tests (P1.1).
 *
 * Unlike the DB integration suite (which connects with a BYPASSRLS sandbox role
 * and only simulates `auth.uid()`), this suite proves the REAL access path:
 *
 *   real password sign-in (GoTrue) -> real JWT -> real PostgREST endpoints
 *   -> row-level RLS effectively enforced per profile.
 *
 * It requires:
 *   - VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (anon key)
 *   - E2E_RLS_PASSWORD (shared password of the namespaced e2e-rls-* accounts)
 *   - SUPABASE_SERVICE_ROLE_KEY (used ONLY by the seed/cleanup fixture helper,
 *     never by the assertions themselves)
 *
 * It NEVER runs in the default `npm test` / CI (no creds there). Run with
 * `npm run test:e2e:rls`. Naming convention: `*.e2etest.ts`.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/test/e2e-rls/**/*.e2etest.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
