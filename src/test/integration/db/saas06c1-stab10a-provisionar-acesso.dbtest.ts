import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, actAs, closePool } from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * SAAS-06-C1-STAB10-A.1 — Testes reais da RPC public.fn_provisionar_acesso_assistido.
 *
 * O sandbox não pode inserir em auth.users. Os testes reutilizam usuários já
 * existentes (papel admin/entrevistador/tarefeiro), buscam seus e-mails via
 * `lista_usuarios_email()` (SECURITY DEFINER) e, dentro da transação rolled-back,
 * removem seus vínculos públicos para simular um "novo user" recém-criado
 * pelo passo Auth da Edge Function. Nenhum efeito persiste.
 */

const d = HAS_DB ? describe : describe.skip;

// Contas piloto FER (mesma instituição). Reutilizadas por segurança/estabilidade.
const INST_FER = "e3818702-cfac-47ae-b751-cb6a05babd4f";
const ADMIN_LOCAL = "18f012e0-bf2a-439b-a8e9-34d5c8b9e785";   // admin + admin_instituicao FER
const ENTREVISTADOR = "1a89c34c-d2e5-45c9-aae7-ebcc19bd9203"; // entrevistador FER
const TAREFEIRO = "dcb487e2-0ec2-4dee-9cc4-0adccdbb9121";     // tarefeiro FER (novo user simulado)

afterAll(async () => {
  await closePool();
});

/** Busca e-mail via lista_usuarios_email agindo como admin. */
async function emailDe(c: PoolClient, uid: string): Promise<string> {
  await actAs(c, ADMIN_LOCAL);
  const r = await c.query(
    "SELECT email FROM public.lista_usuarios_email() WHERE user_id = $1",
    [uid],
  );
  if (!r.rows[0]?.email) throw new Error(`email ausente para ${uid}`);
  return r.rows[0].email as string;
}

/** Remove rastros públicos do target para simular "novo user" recém-criado no Auth. */
async function limparPublico(c: PoolClient, target: string): Promise<void> {
  await c.query("UPDATE public.assistidos SET user_id = NULL WHERE user_id = $1", [target]);
  await c.query("DELETE FROM public.instituicao_usuarios WHERE user_id = $1", [target]);
  await c.query("DELETE FROM public.user_roles WHERE user_id = $1", [target]);
  await c.query("DELETE FROM public.profiles WHERE user_id = $1", [target]);
}

/** Cria assistido órfão (sem user_id) na instituição indicada. */
async function seedAssistido(c: PoolClient, instId: string, createdBy: string): Promise<string> {
  const r = await c.query(
    `INSERT INTO public.assistidos (nome, instituicao_id, created_by, celular)
     VALUES ('Assistido STAB10A '||gen_random_uuid(), $1, $2, '11999998888')
     RETURNING id`,
    [instId, createdBy],
  );
  return r.rows[0].id as string;
}

async function callRpc(
  c: PoolClient,
  operador: string,
  novoUserId: string,
  assistidoId: string,
  email: string,
  celular = "11912345678",
  dob = "1990-05-10",
): Promise<{ ok: boolean; err?: string; data?: any }> {
  await c.query("SAVEPOINT sp");
  try {
    const r = await c.query(
      "SELECT public.fn_provisionar_acesso_assistido($1,$2,$3,$4,$5,$6::date) AS d",
      [operador, novoUserId, assistidoId, email, celular, dob],
    );
    return { ok: true, data: r.rows[0].d };
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT sp");
    return { ok: false, err: (e as Error).message };
  }
}

d("STAB10-A.1 · fn_provisionar_acesso_assistido (banco real)", () => {
  it("caminho feliz — admin_instituicao provisiona; profile+role+vínculo+link criados atomicamente", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      await limparPublico(c, TAREFEIRO);
      const assistidoId = await seedAssistido(c, INST_FER, ADMIN_LOCAL);

      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok, res.err).toBe(true);
      expect(res.data.ok).toBe(true);

      const [p, r, iu, a] = await Promise.all([
        c.query("SELECT nome_completo FROM profiles WHERE user_id=$1", [TAREFEIRO]),
        c.query("SELECT role FROM user_roles WHERE user_id=$1", [TAREFEIRO]),
        c.query(
          "SELECT status, papel_local, instituicao_id FROM instituicao_usuarios WHERE user_id=$1",
          [TAREFEIRO],
        ),
        c.query("SELECT user_id, email FROM assistidos WHERE id=$1", [assistidoId]),
      ]);
      expect(p.rows.length).toBe(1);
      expect(r.rows[0].role).toBe("assistido");
      expect(iu.rows[0].status).toBe("ativo");
      expect(iu.rows[0].papel_local).toBe("assistido");
      expect(iu.rows[0].instituicao_id).toBe(INST_FER);
      expect(a.rows[0].user_id).toBe(TAREFEIRO);
      expect((a.rows[0].email as string).toLowerCase()).toBe(email.toLowerCase());
    });
  });

  it("entrevistador do mesmo tenant também pode provisionar", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ENTREVISTADOR);
      await limparPublico(c, TAREFEIRO);
      const assistidoId = await seedAssistido(c, INST_FER, ENTREVISTADOR);
      const res = await callRpc(c, ENTREVISTADOR, TAREFEIRO, assistidoId, email);
      expect(res.ok, res.err).toBe(true);
    });
  });

  it("nome do profile é derivado do assistido (não editável pelo cliente)", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      await limparPublico(c, TAREFEIRO);
      const r = await c.query(
        `INSERT INTO public.assistidos (nome, instituicao_id, created_by, celular)
         VALUES ('Nome Canonico X', $1, $2, '11999998888') RETURNING id`,
        [INST_FER, ADMIN_LOCAL],
      );
      const assistidoId = r.rows[0].id;
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok, res.err).toBe(true);
      const p = await c.query("SELECT nome_completo FROM profiles WHERE user_id=$1", [TAREFEIRO]);
      expect(p.rows[0].nome_completo).toBe("Nome Canonico X");
    });
  });

  it("operador sem vínculo local no tenant do assistido é bloqueado (CROSS_TENANT_ACCESS_DENIED)", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      await limparPublico(c, TAREFEIRO);
      // Assistido em OUTRA instituição — operador não tem vínculo lá.
      const outra = "c0ed0316-94ce-4b21-83bb-ab36a86a8ded";
      const assistidoId = await seedAssistido(c, outra, ADMIN_LOCAL);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/CROSS_TENANT_ACCESS_DENIED/);
    });
  });

  it("vínculo local inativo do operador é rejeitado", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      await limparPublico(c, TAREFEIRO);
      await c.query(
        "UPDATE instituicao_usuarios SET status='inativo' WHERE user_id=$1 AND instituicao_id=$2",
        [ADMIN_LOCAL, INST_FER],
      );
      const assistidoId = await seedAssistido(c, INST_FER, ADMIN_LOCAL);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/CROSS_TENANT_ACCESS_DENIED/);
    });
  });

  it("assistido já vinculado é rejeitado com ASSISTIDO_JA_VINCULADO", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      await limparPublico(c, TAREFEIRO);
      const assistidoId = await seedAssistido(c, INST_FER, ADMIN_LOCAL);
      await c.query("UPDATE assistidos SET user_id=$1 WHERE id=$2", [ENTREVISTADOR, assistidoId]);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/ASSISTIDO_JA_VINCULADO/);
    });
  });

  it("assistido excluído é rejeitado (ASSISTIDO_EXCLUIDO)", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      await limparPublico(c, TAREFEIRO);
      const assistidoId = await seedAssistido(c, INST_FER, ADMIN_LOCAL);
      await c.query("UPDATE assistidos SET deleted_at=now() WHERE id=$1", [assistidoId]);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/ASSISTIDO_EXCLUIDO/);
    });
  });

  it("novo user com profile existente é rejeitado (NOVO_USER_JA_POSSUI_PROFILE)", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      // NÃO limpa — mantém profile pré-existente
      const assistidoId = await seedAssistido(c, INST_FER, ADMIN_LOCAL);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/NOVO_USER_JA_POSSUI_PROFILE/);
    });
  });

  it("novo user com role existente é rejeitado", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      await c.query("DELETE FROM profiles WHERE user_id=$1", [TAREFEIRO]);
      await c.query("DELETE FROM instituicao_usuarios WHERE user_id=$1", [TAREFEIRO]);
      const assistidoId = await seedAssistido(c, INST_FER, ADMIN_LOCAL);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/NOVO_USER_JA_POSSUI_ROLE/);
    });
  });

  it("novo user sem linha em auth.users é rejeitado (NOVO_USER_INEXISTENTE_EM_AUTH)", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      const assistidoId = await seedAssistido(c, INST_FER, ADMIN_LOCAL);
      // UUID aleatório que jamais existirá em auth.users
      const fakeUid = "00000000-0000-0000-0000-000000000001";
      const res = await callRpc(c, ADMIN_LOCAL, fakeUid, assistidoId, email);
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/NOVO_USER_INEXISTENTE_EM_AUTH/);
    });
  });

  it("e-mail divergente do auth.users é rejeitado (EMAIL_DIVERGENTE_DO_AUTH)", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      await limparPublico(c, TAREFEIRO);
      const assistidoId = await seedAssistido(c, INST_FER, ADMIN_LOCAL);
      const res = await callRpc(
        c,
        ADMIN_LOCAL,
        TAREFEIRO,
        assistidoId,
        "nao-e-o-email-real@example.com",
      );
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/EMAIL_DIVERGENTE_DO_AUTH/);
    });
  });

  it("data de nascimento futura é rejeitada (DATA_NASCIMENTO_INVALIDA)", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      await limparPublico(c, TAREFEIRO);
      const assistidoId = await seedAssistido(c, INST_FER, ADMIN_LOCAL);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email, "11912345678", "2999-01-01");
      expect(res.ok).toBe(false);
      expect(res.err).toMatch(/DATA_NASCIMENTO_INVALIDA/);
    });
  });

  it("rollback integral: rejeição do RPC não cria linhas parciais", async () => {
    await withRollback(async (c) => {
      await actAs(c, ADMIN_LOCAL);
      await limparPublico(c, TAREFEIRO);
      const assistidoId = await seedAssistido(c, INST_FER, ADMIN_LOCAL);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, "wrong@email.com");
      expect(res.ok).toBe(false);
      const p = await c.query("SELECT 1 FROM profiles WHERE user_id=$1", [TAREFEIRO]);
      const r = await c.query("SELECT 1 FROM user_roles WHERE user_id=$1", [TAREFEIRO]);
      const iu = await c.query("SELECT 1 FROM instituicao_usuarios WHERE user_id=$1", [TAREFEIRO]);
      const a = await c.query("SELECT user_id FROM assistidos WHERE id=$1", [assistidoId]);
      expect(p.rowCount).toBe(0);
      expect(r.rowCount).toBe(0);
      expect(iu.rowCount).toBe(0);
      expect(a.rows[0].user_id).toBeNull();
    });
  });

  it("tratamentos e sessões pré-existentes do assistido não são alterados", async () => {
    await withRollback(async (c) => {
      const email = await emailDe(c, TAREFEIRO);
      await actAs(c, ADMIN_LOCAL);
      await limparPublico(c, TAREFEIRO);
      const assistidoId = await seedAssistido(c, INST_FER, ADMIN_LOCAL);
      const t = await c.query(
        `INSERT INTO tipos_tratamento (nome, tipo, quantidade_padrao_sessoes, dia_semana, horario, frequencia_valor, frequencia_unidade, status)
         VALUES ('T STAB10A '||gen_random_uuid(), 'espiritual', 3, 3, '18:00', 1, 'semanas', 'ativo') RETURNING id`,
      );
      const at = await c.query(
        `INSERT INTO assistido_tratamentos (assistido_id, tipo_tratamento_id, status, created_by)
         VALUES ($1, $2, 'aguardando_agendamento', $3) RETURNING id`,
        [assistidoId, t.rows[0].id, ADMIN_LOCAL],
      );
      const antes = await c.query("SELECT * FROM assistido_tratamentos WHERE id=$1", [at.rows[0].id]);
      const res = await callRpc(c, ADMIN_LOCAL, TAREFEIRO, assistidoId, email);
      expect(res.ok, res.err).toBe(true);
      const depois = await c.query("SELECT * FROM assistido_tratamentos WHERE id=$1", [at.rows[0].id]);
      expect(depois.rows[0].status).toBe(antes.rows[0].status);
      expect(depois.rows[0].tipo_tratamento_id).toBe(antes.rows[0].tipo_tratamento_id);
    });
  });
});
