import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, actAs, closePool } from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * SAAS-06-C1-STAB10-A.1 — Testes reais da RPC `fn_provisionar_acesso_assistido`.
 *
 * Restrição de sandbox: o role `sandbox_exec` só possui GRANT de SELECT/INSERT
 * em tabelas do schema `public`. Isso impede UPDATE/DELETE diretos (necessários
 * para simular um "novo user" recém-criado sem profile/roles/vínculo). Assim,
 * cobrimos aqui as rejeições atingíveis via INSERT-only + o chamado da RPC;
 * o caminho feliz é validado em homologação e pela suíte de governança do
 * front (mocks + contratos da Edge Function).
 */

const d = HAS_DB ? describe : describe.skip;

const INST_FER = "e3818702-cfac-47ae-b751-cb6a05babd4f";
const INST_OUTRA = "c0ed0316-94ce-4b21-83bb-ab36a86a8ded";
const ADMIN_LOCAL = "18f012e0-bf2a-439b-a8e9-34d5c8b9e785";
const TAREFEIRO = "dcb487e2-0ec2-4dee-9cc4-0adccdbb9121"; // tem profile+role reais (colisão)

afterAll(async () => {
  await closePool();
});

async function seedAssistido(c: PoolClient, instId: string): Promise<string> {
  const r = await c.query(
    `INSERT INTO public.assistidos (nome, instituicao_id, created_by, celular)
     VALUES ('STAB10A '||gen_random_uuid(), $1, $2, '11999998888') RETURNING id`,
    [instId, ADMIN_LOCAL],
  );
  return r.rows[0].id;
}

async function seedAssistidoExcluido(c: PoolClient, instId: string): Promise<string> {
  const r = await c.query(
    `INSERT INTO public.assistidos (nome, instituicao_id, created_by, celular, deleted_at)
     VALUES ('STAB10A DEL '||gen_random_uuid(), $1, $2, '11999998888', now()) RETURNING id`,
    [instId, ADMIN_LOCAL],
  );
  return r.rows[0].id;
}

async function callRpc(
  c: PoolClient,
  operador: string,
  novoUserId: string,
  assistidoId: string,
  email = "novo@exemplo.com",
  celular = "11912345678",
  dob = "1990-05-10",
): Promise<{ ok: boolean; err?: string }> {
  await c.query("SAVEPOINT sp");
  try {
    await c.query(
      "SELECT public.fn_provisionar_acesso_assistido($1,$2,$3,$4,$5,$6::date)",
      [operador, novoUserId, assistidoId, email, celular, dob],
    );
    return { ok: true };
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT sp");
    return { ok: false, err: (e as Error).message };
  }
}

d("STAB10-A.1 · fn_provisionar_acesso_assistido (banco real, INSERT-only)", () => {
  it("assistido excluído é rejeitado (ASSISTIDO_EXCLUIDO) antes de qualquer escrita", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistidoExcluido(c, INST_FER);
      const fake = "00000000-0000-0000-0000-000000000abc";
      const res = await callRpc(c, ADMIN_LOCAL, fake, assistidoId);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/ASSISTIDO_EXCLUIDO/);
    });
  });

  it("operador sem vínculo no tenant do assistido é bloqueado (CROSS_TENANT_ACCESS_DENIED)", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_OUTRA);
      const fake = "00000000-0000-0000-0000-000000000def";
      const res = await callRpc(c, ADMIN_LOCAL, fake, assistidoId);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/CROSS_TENANT_ACCESS_DENIED/);
    });
  });

  it("novo user com profile pré-existente é rejeitado (NOVO_USER_JA_POSSUI_PROFILE)", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER);
      // TAREFEIRO real já possui profile/role/vínculo — não pode ser reciclado.
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/NOVO_USER_JA_POSSUI_(PROFILE|ROLE)/);
    });
  });

  it("novo user inexistente em auth.users é rejeitado (NOVO_USER_INEXISTENTE_EM_AUTH)", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER);
      const fake = "00000000-0000-0000-0000-000000000001";
      const res = await callRpc(c, ADMIN_LOCAL, fake, assistidoId);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/NOVO_USER_INEXISTENTE_EM_AUTH/);
    });
  });

  it("data de nascimento futura é rejeitada (DATA_NASCIMENTO_INVALIDA)", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER);
      const fake = "00000000-0000-0000-0000-000000000002";
      const res = await callRpc(
        c,
        ADMIN_LOCAL,
        fake,
        assistidoId,
        "novo@exemplo.com",
        "11912345678",
        "2999-01-01",
      );
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/DATA_NASCIMENTO_INVALIDA/);
    });
  });

  it("assistido inexistente é rejeitado (ASSISTIDO_NAO_ENCONTRADO)", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      const assistidoFake = "00000000-0000-0000-0000-0000000000aa";
      const fake = "00000000-0000-0000-0000-0000000000bb";
      const res = await callRpc(c, ADMIN_LOCAL, fake, assistidoFake);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/ASSISTIDO_NAO_ENCONTRADO/);
    });
  });

  it("rollback integral: nenhuma rejeição deixa linhas parciais", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER);
      const fake = "00000000-0000-0000-0000-0000000000cc";
      await callRpc(c, ADMIN_LOCAL, fake, assistidoId); // NOVO_USER_INEXISTENTE_EM_AUTH
      const p = await c.query("SELECT 1 FROM profiles WHERE user_id=$1", [fake]);
      const r = await c.query("SELECT 1 FROM user_roles WHERE user_id=$1", [fake]);
      const iu = await c.query("SELECT 1 FROM instituicao_usuarios WHERE user_id=$1", [fake]);
      expect(p.rowCount).toBe(0);
      expect(r.rowCount).toBe(0);
      expect(iu.rowCount).toBe(0);
    });
  });
});
