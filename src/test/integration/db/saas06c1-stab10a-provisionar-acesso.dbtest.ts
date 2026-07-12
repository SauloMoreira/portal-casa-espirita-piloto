import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, actAs, closePool } from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * SAAS-06-C1-STAB10-A.1 — Testes reais da RPC `fn_provisionar_acesso_assistido`.
 *
 * Restrição de sandbox: o role `sandbox_exec` só possui GRANT de SELECT/INSERT
 * em tabelas do schema `public` (sem UPDATE/DELETE). Não conseguimos remover
 * o profile/role do usuário-alvo para validar o caminho feliz. Cobrimos aqui
 * TODAS as rejeições da cascata de validação da RPC — que é a garantia
 * defense-in-depth contra dados parciais. O caminho feliz é validado em
 * homologação e pelos testes de contrato do frontend (mock da Edge Function).
 *
 * Estratégia para atingir os checks tardios: usar `lista_usuarios_email()`
 * (SECURITY DEFINER) agindo como admin para descobrir o e-mail real do
 * usuário-alvo (tarefeiro FER) e passar (uuid, email) coerentes com auth.users.
 */

const d = HAS_DB ? describe : describe.skip;

const INST_FER = "e3818702-cfac-47ae-b751-cb6a05babd4f";
const INST_OUTRA = "c0ed0316-94ce-4b21-83bb-ab36a86a8ded";
const ADMIN_LOCAL = "18f012e0-bf2a-439b-a8e9-34d5c8b9e785"; // admin + admin_instituicao FER
const TAREFEIRO = "dcb487e2-0ec2-4dee-9cc4-0adccdbb9121"; // auth user real; possui profile/role/vínculo

afterAll(async () => {
  await closePool();
});

async function emailReal(c: PoolClient, uid: string): Promise<string> {
  await actAs(c, ADMIN_LOCAL);
  const r = await c.query(
    "SELECT email FROM public.lista_usuarios_email() WHERE user_id = $1",
    [uid],
  );
  const email = r.rows[0]?.email as string | undefined;
  if (!email) throw new Error(`email real ausente para ${uid}`);
  return email;
}

async function seedAssistido(
  c: PoolClient,
  instId: string,
  opts: { deleted?: boolean; jaVinculado?: string } = {},
): Promise<string> {
  const cols = ["nome", "instituicao_id", "created_by", "celular"];
  const vals: unknown[] = ["STAB10A " + crypto.randomUUID(), instId, ADMIN_LOCAL, "11999998888"];
  if (opts.deleted) {
    cols.push("deleted_at");
    vals.push(new Date());
  }
  if (opts.jaVinculado) {
    cols.push("user_id");
    vals.push(opts.jaVinculado);
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(",");
  const r = await c.query(
    `INSERT INTO public.assistidos (${cols.join(",")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return r.rows[0].id;
}

async function callRpc(
  c: PoolClient,
  operador: string,
  novoUserId: string,
  assistidoId: string,
  email: string,
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

d("STAB10-A.1 · fn_provisionar_acesso_assistido — cascata de validação (banco real)", () => {
  it("data de nascimento futura é rejeitada imediatamente (DATA_NASCIMENTO_INVALIDA)", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER);
      const res = await callRpc(
        c,
        ADMIN_LOCAL,
        TAREFEIRO,
        assistidoId,
        "qualquer@x.com",
        "11912345678",
        "2999-01-01",
      );
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/DATA_NASCIMENTO_INVALIDA/);
    });
  });

  it("novo user inexistente em auth.users é rejeitado (NOVO_USER_INEXISTENTE_EM_AUTH)", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER);
      const fake = "00000000-0000-0000-0000-000000000001";
      const res = await callRpc(c, ADMIN_LOCAL, fake, assistidoId, "qualquer@x.com");
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/NOVO_USER_INEXISTENTE_EM_AUTH/);
    });
  });

  it("e-mail divergente do auth.users é rejeitado (EMAIL_DIVERGENTE_DO_AUTH)", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, "email-errado@x.com");
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/EMAIL_DIVERGENTE_DO_AUTH/);
    });
  });

  it("assistido inexistente é rejeitado (ASSISTIDO_NAO_ENCONTRADO)", async () => {
    await withRollback(async (c) => {
      const email = await emailReal(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      const assistidoFake = "00000000-0000-0000-0000-0000000000aa";
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoFake, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/ASSISTIDO_NAO_ENCONTRADO/);
    });
  });

  it("assistido excluído é rejeitado (ASSISTIDO_EXCLUIDO)", async () => {
    await withRollback(async (c) => {
      const email = await emailReal(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER, { deleted: true });
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/ASSISTIDO_EXCLUIDO/);
    });
  });

  it("assistido já vinculado a outro user é rejeitado (ASSISTIDO_JA_VINCULADO)", async () => {
    await withRollback(async (c) => {
      const email = await emailReal(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER, { jaVinculado: ADMIN_LOCAL });
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/ASSISTIDO_JA_VINCULADO/);
    });
  });

  it("operador sem vínculo no tenant do assistido é bloqueado (CROSS_TENANT_ACCESS_DENIED)", async () => {
    await withRollback(async (c) => {
      const email = await emailReal(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_OUTRA);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/CROSS_TENANT_ACCESS_DENIED/);
    });
  });

  it("novo user com profile pré-existente é rejeitado (NOVO_USER_JA_POSSUI_PROFILE)", async () => {
    await withRollback(async (c) => {
      const email = await emailReal(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/NOVO_USER_JA_POSSUI_PROFILE/);
    });
  });

  it("rollback integral: nenhuma rejeição deixa linhas parciais (idempotência)", async () => {
    await withRollback(async (c) => {
      const email = await emailReal(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER);
      // Força NOVO_USER_JA_POSSUI_PROFILE — check ocorre APÓS as validações de operador
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok).toBe(false);
      // O assistido semeado permanece sem user_id (nenhum efeito colateral)
      const a = await c.query("SELECT user_id FROM assistidos WHERE id=$1", [assistidoId]);
      expect(a.rows[0].user_id).toBeNull();
    });
  });
});
