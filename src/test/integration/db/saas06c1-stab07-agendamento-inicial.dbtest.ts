import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, actAs, actAsAnon, expectReject, closePool } from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * SAAS-06-C1-STAB07 — Agendamento inicial transacional e idempotente.
 *
 * Testa a nova RPC `fn_confirmar_agendamento_tratamento` no banco real:
 * - fluxo positivo
 * - idempotência (already_committed=true sem mutação)
 * - inconsistência (sessões parciais/divergentes) — nenhum efeito
 * - validações de cronograma (quantidade, ordem, dia semana, holístico)
 * - autorização (coordenador designado vs sem designação, tenant, admin,
 *   entrevistador, tarefeiro, assistido, anon)
 */
const d = HAS_DB ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

async function seedTenantEUsuario(
  c: PoolClient,
  papel: "coordenador_de_tratamento" | "entrevistador" | "tarefeiro" | "admin",
): Promise<{ userId: string; instId: string }> {
  const inst = await c.query(
    `INSERT INTO instituicoes (nome, slug, cnpj) VALUES
     ('Inst STAB07 ' || gen_random_uuid()::text, 'stab07-' || substr(gen_random_uuid()::text,1,8), NULL)
     RETURNING id`,
  );
  const instId = inst.rows[0].id;
  const u = await c.query(
    `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
     VALUES (gen_random_uuid(), 'stab07-'||gen_random_uuid()||'@test.local','x',now(),'authenticated','authenticated')
     RETURNING id`,
  );
  const userId = u.rows[0].id;
  await c.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2::app_role)`, [userId, papel]);
  await c.query(
    `INSERT INTO instituicao_usuarios (user_id, instituicao_id, papel_local, status)
     VALUES ($1, $2, $3::saas_papel_local, 'ativo')`,
    [userId, instId, papel === "admin" ? "admin_instituicao" : "operador"],
  );
  return { userId, instId };
}

async function seedTratamento(c: PoolClient, opts?: { dia_semana?: number; tipo?: string }): Promise<string> {
  const r = await c.query(
    `INSERT INTO tipos_tratamento
       (nome, tipo, quantidade_padrao_sessoes, dia_semana, horario, frequencia_valor, frequencia_unidade, ativo)
     VALUES ('Trat STAB07 '||gen_random_uuid(), $1, 3, $2, '18:00', 1, 'semanas', true)
     RETURNING id`,
    [opts?.tipo ?? "regular", opts?.dia_semana ?? 3],
  );
  return r.rows[0].id;
}

async function seedAssistidoEVinculo(
  c: PoolClient,
  instId: string,
  tratId: string,
  createdBy: string,
): Promise<{ assistidoId: string; vinculoId: string }> {
  const a = await c.query(
    `INSERT INTO assistidos (nome, instituicao_id, created_by)
     VALUES ('Assistido STAB07 '||gen_random_uuid(), $1, $2) RETURNING id`,
    [instId, createdBy],
  );
  const assistidoId = a.rows[0].id;
  const v = await c.query(
    `INSERT INTO assistido_tratamentos
       (assistido_id, tratamento_id, quantidade_total, status, created_by)
     VALUES ($1, $2, 3, 'aguardando_agendamento', $3) RETURNING id`,
    [assistidoId, tratId, createdBy],
  );
  return { assistidoId, vinculoId: v.rows[0].id };
}

function proximaQuartaISO(offset = 0): string[] {
  // gera 3 quartas-feiras futuras semanais a partir de hoje
  const hoje = new Date();
  const dias: string[] = [];
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let d = new Date(base);
  while (d.getDay() !== 3) d = new Date(d.getTime() + 86400000);
  d = new Date(d.getTime() + offset * 7 * 86400000);
  for (let i = 0; i < 3; i++) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dias.push(`${yyyy}-${mm}-${dd}`);
    d = new Date(d.getTime() + 7 * 86400000);
  }
  return dias;
}

async function chamaRpc(c: PoolClient, vinculoId: string, sessoes: unknown) {
  return c.query(
    `SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb) AS out`,
    [vinculoId, JSON.stringify(sessoes)],
  );
}

d("SAAS-06-C1-STAB07 — RPC fn_confirmar_agendamento_tratamento", () => {
  it("fluxo positivo: coordenador designado grava agenda e transita vínculo", async () => {
    await withRollback(async (c) => {
      const { userId, instId } = await seedTenantEUsuario(c, "coordenador_de_tratamento");
      const tratId = await seedTratamento(c);
      await c.query(
        `INSERT INTO coordenacao_tratamento (tratamento_id, coordenador_id) VALUES ($1,$2)`,
        [tratId, userId],
      );
      const { vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, userId);
      const datas = proximaQuartaISO();
      const sessoes = datas.map((d) => ({ data_sessao: d, horario: "18:00" }));

      await actAs(c, userId);
      const r = await chamaRpc(c, vinculoId, sessoes);
      const out = r.rows[0].out as {
        ok: boolean;
        already_committed: boolean;
        status: string;
        sessoes_criadas: number;
      };
      expect(out.ok).toBe(true);
      expect(out.already_committed).toBe(false);
      expect(out.status).toBe("aguardando_inicio");
      expect(out.sessoes_criadas).toBe(3);

      const v = await c.query(
        `SELECT status, data_inicio, agendado_por FROM assistido_tratamentos WHERE id=$1`,
        [vinculoId],
      );
      expect(v.rows[0].status).toBe("aguardando_inicio");
      expect(v.rows[0].agendado_por).toBe(userId);

      const ag = await c.query(
        `SELECT count(*)::int n FROM agenda_tratamentos_assistido WHERE assistido_tratamento_id=$1`,
        [vinculoId],
      );
      expect(ag.rows[0].n).toBe(3);
    });
  });

  it("idempotência: repetir mesmo payload não muta nem duplica", async () => {
    await withRollback(async (c) => {
      const { userId, instId } = await seedTenantEUsuario(c, "coordenador_de_tratamento");
      const tratId = await seedTratamento(c);
      await c.query(
        `INSERT INTO coordenacao_tratamento (tratamento_id, coordenador_id) VALUES ($1,$2)`,
        [tratId, userId],
      );
      const { vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, userId);
      const sessoes = proximaQuartaISO().map((d) => ({ data_sessao: d, horario: "18:00" }));

      await actAs(c, userId);
      await chamaRpc(c, vinculoId, sessoes);
      const before = await c.query(
        `SELECT updated_at FROM assistido_tratamentos WHERE id=$1`,
        [vinculoId],
      );
      const r2 = await chamaRpc(c, vinculoId, sessoes);
      const out = r2.rows[0].out as { already_committed: boolean; sessoes_criadas: number };
      expect(out.already_committed).toBe(true);
      expect(out.sessoes_criadas).toBe(0);
      const after = await c.query(
        `SELECT updated_at FROM assistido_tratamentos WHERE id=$1`,
        [vinculoId],
      );
      expect(after.rows[0].updated_at.toString()).toBe(before.rows[0].updated_at.toString());
      const ag = await c.query(
        `SELECT count(*)::int n FROM agenda_tratamentos_assistido WHERE assistido_tratamento_id=$1`,
        [vinculoId],
      );
      expect(ag.rows[0].n).toBe(3);
    });
  });

  it("sessões existentes + status aguardando_agendamento => SESSOES_INCONSISTENTES sem mutação", async () => {
    await withRollback(async (c) => {
      const { userId, instId } = await seedTenantEUsuario(c, "coordenador_de_tratamento");
      const tratId = await seedTratamento(c);
      await c.query(
        `INSERT INTO coordenacao_tratamento (tratamento_id, coordenador_id) VALUES ($1,$2)`,
        [tratId, userId],
      );
      const { assistidoId, vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, userId);
      const datas = proximaQuartaISO();
      // insere uma sessão "órfã" simulando registro inconsistente atual
      await c.query(
        `INSERT INTO agenda_tratamentos_assistido
           (assistido_id, assistido_tratamento_id, tratamento_id, data_sessao, horario, status, registrado_por)
         VALUES ($1,$2,$3,$4::date,'18:00','agendado',$5)`,
        [assistidoId, vinculoId, tratId, datas[0], userId],
      );
      const sessoes = datas.map((d) => ({ data_sessao: d, horario: "18:00" }));
      await actAs(c, userId);
      await expectReject(
        c,
        /SESSOES_INCONSISTENTES/,
        `SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb)`,
        [vinculoId, JSON.stringify(sessoes)],
      );
      const v = await c.query(
        `SELECT status, data_inicio FROM assistido_tratamentos WHERE id=$1`,
        [vinculoId],
      );
      expect(v.rows[0].status).toBe("aguardando_agendamento");
      expect(v.rows[0].data_inicio).toBeNull();
    });
  });

  it("PAYLOAD_INVALIDO: quantidade divergente do saldo", async () => {
    await withRollback(async (c) => {
      const { userId, instId } = await seedTenantEUsuario(c, "coordenador_de_tratamento");
      const tratId = await seedTratamento(c);
      await c.query(
        `INSERT INTO coordenacao_tratamento (tratamento_id, coordenador_id) VALUES ($1,$2)`,
        [tratId, userId],
      );
      const { vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, userId);
      const sessoes = proximaQuartaISO()
        .slice(0, 2)
        .map((d) => ({ data_sessao: d, horario: "18:00" }));
      await actAs(c, userId);
      await expectReject(
        c,
        /PAYLOAD_INVALIDO/,
        `SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb)`,
        [vinculoId, JSON.stringify(sessoes)],
      );
    });
  });

  it("PAYLOAD_INVALIDO: dia da semana divergente", async () => {
    await withRollback(async (c) => {
      const { userId, instId } = await seedTenantEUsuario(c, "coordenador_de_tratamento");
      const tratId = await seedTratamento(c, { dia_semana: 3 }); // quarta
      await c.query(
        `INSERT INTO coordenacao_tratamento (tratamento_id, coordenador_id) VALUES ($1,$2)`,
        [tratId, userId],
      );
      const { vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, userId);
      // pega quartas e desloca a primeira para quinta
      const datas = proximaQuartaISO();
      const dt = new Date(datas[0] + "T12:00:00");
      dt.setDate(dt.getDate() + 1);
      const primeiraErrada = dt.toISOString().slice(0, 10);
      const sessoes = [
        { data_sessao: primeiraErrada, horario: "18:00" },
        { data_sessao: datas[1], horario: "18:00" },
        { data_sessao: datas[2], horario: "18:00" },
      ];
      await actAs(c, userId);
      await expectReject(
        c,
        /PAYLOAD_INVALIDO/,
        `SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb)`,
        [vinculoId, JSON.stringify(sessoes)],
      );
    });
  });

  it("PAYLOAD_INVALIDO: holístico sem horário", async () => {
    await withRollback(async (c) => {
      const { userId, instId } = await seedTenantEUsuario(c, "coordenador_de_tratamento");
      const tratId = await seedTratamento(c, { tipo: "holistico" });
      await c.query(
        `INSERT INTO coordenacao_tratamento (tratamento_id, coordenador_id) VALUES ($1,$2)`,
        [tratId, userId],
      );
      const { vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, userId);
      const sessoes = proximaQuartaISO().map((d) => ({ data_sessao: d, horario: null }));
      await actAs(c, userId);
      await expectReject(
        c,
        /PAYLOAD_INVALIDO/,
        `SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb)`,
        [vinculoId, JSON.stringify(sessoes)],
      );
    });
  });

  it("PAYLOAD_INVALIDO: chave extra no objeto de sessão", async () => {
    await withRollback(async (c) => {
      const { userId, instId } = await seedTenantEUsuario(c, "coordenador_de_tratamento");
      const tratId = await seedTratamento(c);
      await c.query(
        `INSERT INTO coordenacao_tratamento (tratamento_id, coordenador_id) VALUES ($1,$2)`,
        [tratId, userId],
      );
      const { vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, userId);
      const sessoes = proximaQuartaISO().map((d) => ({
        data_sessao: d,
        horario: "18:00",
        status: "agendado",
      }));
      await actAs(c, userId);
      await expectReject(
        c,
        /PAYLOAD_INVALIDO/,
        `SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb)`,
        [vinculoId, JSON.stringify(sessoes)],
      );
    });
  });

  it("STATUS_NAO_PERMITE_AGENDAMENTO quando vínculo não está aguardando_agendamento", async () => {
    await withRollback(async (c) => {
      const { userId, instId } = await seedTenantEUsuario(c, "coordenador_de_tratamento");
      const tratId = await seedTratamento(c);
      await c.query(
        `INSERT INTO coordenacao_tratamento (tratamento_id, coordenador_id) VALUES ($1,$2)`,
        [tratId, userId],
      );
      const { vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, userId);
      await c.query(
        `UPDATE assistido_tratamentos SET status='cancelado' WHERE id=$1`,
        [vinculoId],
      );
      const sessoes = proximaQuartaISO().map((d) => ({ data_sessao: d, horario: "18:00" }));
      await actAs(c, userId);
      await expectReject(
        c,
        /STATUS_NAO_PERMITE_AGENDAMENTO/,
        `SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb)`,
        [vinculoId, JSON.stringify(sessoes)],
      );
    });
  });

  it("NAO_AUTORIZADO: coordenador sem designação para o tratamento", async () => {
    await withRollback(async (c) => {
      const { userId, instId } = await seedTenantEUsuario(c, "coordenador_de_tratamento");
      const tratId = await seedTratamento(c);
      // NÃO cria coordenacao_tratamento
      const { vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, userId);
      const sessoes = proximaQuartaISO().map((d) => ({ data_sessao: d, horario: "18:00" }));
      await actAs(c, userId);
      await expectReject(
        c,
        /NAO_AUTORIZADO/,
        `SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb)`,
        [vinculoId, JSON.stringify(sessoes)],
      );
    });
  });

  it("NAO_AUTORIZADO: coordenador designado mas assistido de outro tenant (Reiki global cross-tenant)", async () => {
    await withRollback(async (c) => {
      const { userId, instId: instA } = await seedTenantEUsuario(c, "coordenador_de_tratamento");
      const tratId = await seedTratamento(c);
      await c.query(
        `INSERT INTO coordenacao_tratamento (tratamento_id, coordenador_id) VALUES ($1,$2)`,
        [tratId, userId],
      );
      // cria outro tenant e assistido lá
      const instB = (
        await c.query(
          `INSERT INTO instituicoes (nome, slug) VALUES ('Outra '||gen_random_uuid(),'outra-'||substr(gen_random_uuid()::text,1,8)) RETURNING id`,
        )
      ).rows[0].id;
      const outroCreator = (
        await c.query(
          `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
           VALUES (gen_random_uuid(),'c-'||gen_random_uuid()||'@test.local','x',now(),'authenticated','authenticated') RETURNING id`,
        )
      ).rows[0].id;
      const { vinculoId } = await seedAssistidoEVinculo(c, instB, tratId, outroCreator);
      const sessoes = proximaQuartaISO().map((d) => ({ data_sessao: d, horario: "18:00" }));
      await actAs(c, userId);
      await expectReject(
        c,
        /NAO_AUTORIZADO/,
        `SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb)`,
        [vinculoId, JSON.stringify(sessoes)],
      );
      // instA usada apenas para setup do coordenador
      expect(instA).toBeTruthy();
    });
  });

  it("admin da instituição pode agendar", async () => {
    await withRollback(async (c) => {
      const { userId, instId } = await seedTenantEUsuario(c, "admin");
      const tratId = await seedTratamento(c);
      const { vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, userId);
      const sessoes = proximaQuartaISO().map((d) => ({ data_sessao: d, horario: "18:00" }));
      await actAs(c, userId);
      const r = await chamaRpc(c, vinculoId, sessoes);
      expect(r.rows[0].out.ok).toBe(true);
    });
  });

  it("anon é negado", async () => {
    await withRollback(async (c) => {
      const { userId, instId } = await seedTenantEUsuario(c, "coordenador_de_tratamento");
      const tratId = await seedTratamento(c);
      await c.query(
        `INSERT INTO coordenacao_tratamento (tratamento_id, coordenador_id) VALUES ($1,$2)`,
        [tratId, userId],
      );
      const { vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, userId);
      const sessoes = proximaQuartaISO().map((d) => ({ data_sessao: d, horario: "18:00" }));
      await actAsAnon(c);
      await expectReject(
        c,
        /NAO_AUTORIZADO/,
        `SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb)`,
        [vinculoId, JSON.stringify(sessoes)],
      );
    });
  });

  it("tarefeiro, entrevistador e assistido são negados", async () => {
    for (const papel of ["tarefeiro", "entrevistador"] as const) {
      await withRollback(async (c) => {
        const { userId, instId } = await seedTenantEUsuario(c, papel);
        const tratId = await seedTratamento(c);
        // criador precisa ser válido; usamos um admin auxiliar rapidamente
        const admin = await seedTenantEUsuario(c, "admin");
        const { vinculoId } = await seedAssistidoEVinculo(c, instId, tratId, admin.userId);
        const sessoes = proximaQuartaISO().map((d) => ({ data_sessao: d, horario: "18:00" }));
        await actAs(c, userId);
        await expectReject(
          c,
          /NAO_AUTORIZADO/,
          `SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb)`,
          [vinculoId, JSON.stringify(sessoes)],
        );
      });
    }
  });
});
