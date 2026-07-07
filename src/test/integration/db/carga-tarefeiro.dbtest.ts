import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, closePool, getUserByRole } from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * Q2-B1 — Correção REAL da leitura da carga do tarefeiro.
 *
 * Prova, contra o banco real, que a RPC `relatorio_carga_tarefeiro`:
 *  - conta a carga do modelo legado (`agenda_tratamentos_assistido`);
 *  - conta a carga do novo modelo (`plano_tratamento_sessoes`);
 *  - soma corretamente legado + plano;
 *  - deduplica quando a agenda legada está `substituida_plano` ou já foi
 *    materializada por uma etapa do plano (`agenda_sessao_id`);
 *  - preserva o contrato de retorno e os filtros atuais.
 *
 * Toda a semeadura ocorre dentro de uma transação SEMPRE revertida
 * (withRollback), então não há efeito colateral persistente. Cada cenário usa
 * a própria transação porque a RPC cria tabelas TEMP `ON COMMIT DROP`.
 */
const d = HAS_DB ? describe : describe.skip;

// Janela isolada no futuro distante para não colidir com dados reais.
const INI = "2099-01-01";
const FIM = "2099-12-31";

interface SeedIds {
  tarefeiro: string;
  tipo: string;
  a1: string;
  a2: string;
  vinc1: string;
  vinc2: string;
}

/** Semeia um tarefeiro isolado com um tipo de tratamento e dois assistidos. */
async function seedBase(c: PoolClient): Promise<SeedIds> {
  const admin = (await getUserByRole(c, "admin")) ?? (await getUserByRole(c, "master"));
  if (!admin) throw new Error("sem usuário admin/master para semear");

  const tipo = (
    await c.query(
      `INSERT INTO tipos_tratamento (nome, tipo, tarefeiro_id)
       VALUES ('Q2B1 Carga', 'espiritual', $1) RETURNING id`,
      [admin],
    )
  ).rows[0].id as string;

  const a1 = (
    await c.query(
      `INSERT INTO assistidos (nome, created_by, celular) VALUES ('Q2B1 A1', $1, '11999990001') RETURNING id`,
      [admin],
    )
  ).rows[0].id as string;
  const a2 = (
    await c.query(
      `INSERT INTO assistidos (nome, created_by, celular) VALUES ('Q2B1 A2', $1, '11999990002') RETURNING id`,
      [admin],
    )
  ).rows[0].id as string;

  const vinc1 = (
    await c.query(
      `INSERT INTO assistido_tratamentos (assistido_id, tratamento_id, created_by, status)
       VALUES ($1, $2, $3, 'em_andamento') RETURNING id`,
      [a1, tipo, admin],
    )
  ).rows[0].id as string;
  const vinc2 = (
    await c.query(
      `INSERT INTO assistido_tratamentos (assistido_id, tratamento_id, created_by, status)
       VALUES ($1, $2, $3, 'em_andamento') RETURNING id`,
      [a2, tipo, admin],
    )
  ).rows[0].id as string;

  return { tarefeiro: admin, tipo, a1, a2, vinc1, vinc2 };
}

async function insAgenda(
  c: PoolClient,
  s: SeedIds,
  assistido: string,
  vinc: string,
  data: string,
  status: string,
): Promise<string> {
  return (
    await c.query(
      `INSERT INTO agenda_tratamentos_assistido
         (assistido_id, assistido_tratamento_id, tratamento_id, data_sessao, horario, status)
       VALUES ($1, $2, $3, $4, '08:00', $5) RETURNING id`,
      [assistido, vinc, s.tipo, data, status],
    )
  ).rows[0].id as string;
}

async function insPlano(
  c: PoolClient,
  s: SeedIds,
  assistido: string,
  vinc: string,
  etapa: number,
  data: string,
  agendaSessaoId: string | null = null,
): Promise<void> {
  await c.query(
    `INSERT INTO plano_tratamento_sessoes
       (assistido_id, assistido_tratamento_id, tipo_tratamento_id, numero_etapa,
        quantidade_total_do_tratamento, data_prevista, agenda_sessao_id)
     VALUES ($1, $2, $3, $4, 10, $5, $6)`,
    [assistido, vinc, s.tipo, etapa, data, agendaSessaoId],
  );
}

async function carga(c: PoolClient, tarefeiro: string) {
  const r = await c.query(
    `SELECT public.relatorio_carga_tarefeiro($1, $2, NULL, $3, 1, 25) AS res`,
    [INI, FIM, tarefeiro],
  );
  return r.rows[0].res as {
    registros: number;
    totais: Record<string, number | string>;
    rows: Array<Record<string, unknown>>;
  };
}

afterAll(async () => {
  await closePool();
});

d("Q2-B1 — carga do tarefeiro (legado + plano, dedupe)", () => {
  it("conta apenas o modelo legado", async () => {
    await withRollback(async (c) => {
      const s = await seedBase(c);
      await insAgenda(c, s, s.a1, s.vinc1, "2099-03-01", "realizada");
      await insAgenda(c, s, s.a1, s.vinc1, "2099-03-08", "agendado");

      const res = await carga(c, s.tarefeiro);
      expect(res.totais.sessoes).toBe(2);
      expect(res.totais.assistidos).toBe(1);
    });
  });

  it("conta apenas o novo modelo (plano)", async () => {
    await withRollback(async (c) => {
      const s = await seedBase(c);
      await insPlano(c, s, s.a1, s.vinc1, 1, "2099-04-01");
      await insPlano(c, s, s.a2, s.vinc2, 1, "2099-04-08");

      const res = await carga(c, s.tarefeiro);
      expect(res.totais.sessoes).toBe(2);
      expect(res.totais.assistidos).toBe(2);
    });
  });

  it("soma legado + plano quando são sessões distintas", async () => {
    await withRollback(async (c) => {
      const s = await seedBase(c);
      await insAgenda(c, s, s.a1, s.vinc1, "2099-05-01", "realizada");
      await insPlano(c, s, s.a2, s.vinc2, 1, "2099-05-08");

      const res = await carga(c, s.tarefeiro);
      expect(res.totais.sessoes).toBe(2);
      expect(res.totais.assistidos).toBe(2);
    });
  });

  it("deduplica agenda legada marcada como substituida_plano", async () => {
    await withRollback(async (c) => {
      const s = await seedBase(c);
      // Mesma sessão representada nos dois modelos: legado substituído + etapa do plano.
      await insAgenda(c, s, s.a1, s.vinc1, "2099-06-01", "substituida_plano");
      await insPlano(c, s, s.a1, s.vinc1, 1, "2099-06-01");

      const res = await carga(c, s.tarefeiro);
      // Conta 1 (apenas pelo plano), não 2.
      expect(res.totais.sessoes).toBe(1);
      expect(res.totais.assistidos).toBe(1);
    });
  });

  it("deduplica agenda materializada por etapa do plano (agenda_sessao_id)", async () => {
    await withRollback(async (c) => {
      const s = await seedBase(c);
      const ag = await insAgenda(c, s, s.a1, s.vinc1, "2099-07-01", "agendado");
      await insPlano(c, s, s.a1, s.vinc1, 1, "2099-07-01", ag);

      const res = await carga(c, s.tarefeiro);
      // Etapa do plano referencia a linha de agenda: conta 1, não 2.
      expect(res.totais.sessoes).toBe(1);
      expect(res.totais.assistidos).toBe(1);
    });
  });

  it("preserva o contrato de retorno e respeita o filtro por tarefeiro", async () => {
    await withRollback(async (c) => {
      const s = await seedBase(c);
      await insAgenda(c, s, s.a1, s.vinc1, "2099-08-01", "realizada");

      const res = await carga(c, s.tarefeiro);
      expect(res).toHaveProperty("registros");
      expect(res).toHaveProperty("totais");
      expect(res).toHaveProperty("rows");
      const row = res.rows.find((r) => r.tarefeiro_id === s.tarefeiro);
      expect(row).toBeTruthy();
      expect(row).toHaveProperty("total_sessoes");
      expect(row).toHaveProperty("total_assistidos");
      expect(row).toHaveProperty("presencas");
      expect(row).toHaveProperty("ausencias");
      expect(row).toHaveProperty("em_andamento");
      expect(row).toHaveProperty("concluidos");
      expect(row).toHaveProperty("tratamentos");
      // O filtro por tarefeiro isola o resultado ao tarefeiro semeado.
      expect(res.rows.every((r) => r.tarefeiro_id === s.tarefeiro)).toBe(true);
    });
  });
});
