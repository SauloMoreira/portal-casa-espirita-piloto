/**
 * SAAS-02 — Isolamento entre tenants (banco real).
 *
 * Roda apenas quando HAS_DB=true (script `test:db`). Cria dois tenants A e B,
 * cria um usuário fictício vinculado apenas a A, e valida que:
 *   1. helper user_pertence_instituicao só retorna true para A.
 *   2. helper user_is_admin_instituicao(B) retorna false.
 *   3. um usuário sem vínculo não pertence a nenhum tenant.
 *
 * Tudo acontece dentro de uma transação com rollback — nada persiste.
 * O suite valida os helpers SECURITY DEFINER (que são a base das policies RLS);
 * a validação de RLS efetiva por linha permanece na suíte e2e-rls (P1.1).
 */
import { describe, it, expect } from "vitest";
import { HAS_DB, withRollback } from "./_dbClient";

const d = HAS_DB ? describe : describe.skip;

d("SAAS-02 — isolamento entre tenants via helpers de tenancy", () => {
  it("user_pertence_instituicao respeita o vínculo por tenant", async () => {
    await withRollback(async (c) => {
      // Cria dois tenants sintéticos
      const a = await c.query(
        `INSERT INTO public.instituicoes (nome, slug, status)
         VALUES ('Tenant A Test', 'saas02-test-a-' || gen_random_uuid()::text, 'ativa')
         RETURNING id`,
      );
      const b = await c.query(
        `INSERT INTO public.instituicoes (nome, slug, status)
         VALUES ('Tenant B Test', 'saas02-test-b-' || gen_random_uuid()::text, 'ativa')
         RETURNING id`,
      );
      const tenantA = a.rows[0].id as string;
      const tenantB = b.rows[0].id as string;

      // Cria um usuário na auth.users apenas para o teste (será revertido no rollback)
      const u = await c.query(
        `INSERT INTO auth.users (id, instance_id, email, aud, role, encrypted_password, created_at, updated_at)
         VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'saas02-a@test.local', 'authenticated', 'authenticated', '', now(), now())
         RETURNING id`,
      );
      const userA = u.rows[0].id as string;

      // Vincula apenas ao tenant A como admin_instituicao ATIVO
      await c.query(
        `INSERT INTO public.instituicao_usuarios (instituicao_id, user_id, papel_local, status)
         VALUES ($1, $2, 'admin_instituicao', 'ativo')`,
        [tenantA, userA],
      );

      const perteA = await c.query(
        `SELECT public.user_pertence_instituicao($1, $2) AS ok`,
        [userA, tenantA],
      );
      const perteB = await c.query(
        `SELECT public.user_pertence_instituicao($1, $2) AS ok`,
        [userA, tenantB],
      );
      const adminB = await c.query(
        `SELECT public.user_is_admin_instituicao($1, $2) AS ok`,
        [userA, tenantB],
      );
      const adminA = await c.query(
        `SELECT public.user_is_admin_instituicao($1, $2) AS ok`,
        [userA, tenantA],
      );

      expect(perteA.rows[0].ok).toBe(true);
      expect(perteB.rows[0].ok).toBe(false);
      expect(adminA.rows[0].ok).toBe(true);
      expect(adminB.rows[0].ok).toBe(false);
    });
  });

  it("usuário sem vínculo não pertence a nenhum tenant", async () => {
    await withRollback(async (c) => {
      const tenant = await c.query(
        `INSERT INTO public.instituicoes (nome, slug, status)
         VALUES ('Tenant Solo', 'saas02-test-solo-' || gen_random_uuid()::text, 'ativa')
         RETURNING id`,
      );
      const u = await c.query(
        `INSERT INTO auth.users (id, instance_id, email, aud, role, encrypted_password, created_at, updated_at)
         VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'saas02-orfao@test.local', 'authenticated', 'authenticated', '', now(), now())
         RETURNING id`,
      );
      const r = await c.query(
        `SELECT public.user_pertence_instituicao($1, $2) AS ok`,
        [u.rows[0].id, tenant.rows[0].id],
      );
      expect(r.rows[0].ok).toBe(false);
    });
  });

  it("vínculo inativo não conta como pertencimento", async () => {
    await withRollback(async (c) => {
      const t = await c.query(
        `INSERT INTO public.instituicoes (nome, slug, status)
         VALUES ('Tenant Inativo', 'saas02-test-inat-' || gen_random_uuid()::text, 'ativa')
         RETURNING id`,
      );
      const u = await c.query(
        `INSERT INTO auth.users (id, instance_id, email, aud, role, encrypted_password, created_at, updated_at)
         VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'saas02-inat@test.local', 'authenticated', 'authenticated', '', now(), now())
         RETURNING id`,
      );
      await c.query(
        `INSERT INTO public.instituicao_usuarios (instituicao_id, user_id, papel_local, status)
         VALUES ($1, $2, 'assistido', 'inativo')`,
        [t.rows[0].id, u.rows[0].id],
      );
      const r = await c.query(
        `SELECT public.user_pertence_instituicao($1, $2) AS ok`,
        [u.rows[0].id, t.rows[0].id],
      );
      expect(r.rows[0].ok).toBe(false);
    });
  });
});
