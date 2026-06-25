import { describe, it, expect, afterAll } from "vitest";
import {
  HAS_DB,
  withRollback,
  actAs,
  actAsAnon,
  getUserByRole,
  expectReject,
  closePool,
} from "./_dbClient";

/**
 * P1.2 — Observabilidade operacional (integração REAL de banco).
 *
 * Prova, contra o Postgres real e a RPC oficial `fn_observabilidade_operacional`:
 *  - autorização real no backend (admin/master/coordenador passam; demais e anônimo barram);
 *  - validação de janela (24h/7d/30d ok; inválida rejeitada);
 *  - separação snapshot × histórico e metadados autoexplicativos no payload;
 *  - INV-OBS-001: a função é somente leitura (nenhuma escrita), garantido pelo rollback.
 */
const d = HAS_DB ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

async function chamar(c: import("pg").PoolClient, janela = "7d") {
  const r = await c.query("SELECT public.fn_observabilidade_operacional($1) AS p", [janela]);
  return r.rows[0].p as Record<string, unknown>;
}

d("P1.2 — fn_observabilidade_operacional (DB real)", () => {
  it("admin recebe payload com metadados, snapshot e histórico", async () => {
    await withRollback(async (c) => {
      const uid = await getUserByRole(c, "admin");
      if (!uid) return;
      await actAs(c, uid);
      const p = await chamar(c, "7d");

      expect(p.schema_version).toBe(1);
      expect(p).toHaveProperty("generated_at");
      expect(p).toHaveProperty("snapshot_reference_time");
      expect((p.historical_window as { code: string }).code).toBe("7d");

      const snap = p.snapshot as Record<string, unknown>;
      expect(snap).toHaveProperty("pendencias_por_status");
      expect(snap).toHaveProperty("aguardando_janela_limite");
      expect(snap).toHaveProperty("avisos_ausencia");
      expect(snap).toHaveProperty("anomalias_lembrete_por_vinculo");
      expect(snap).toHaveProperty("inconsistencias_agenda_fila");

      const hist = p.historico as Record<string, unknown>;
      expect(hist).toHaveProperty("falhas_por_motivo");
      expect(hist).toHaveProperty("saneados_por_motivo");
      expect(hist).toHaveProperty("distribuicao_por_origem");
    });
  });

  it("coordenador de tratamento também tem acesso", async () => {
    await withRollback(async (c) => {
      const uid = await getUserByRole(c, "coordenador_de_tratamento");
      if (!uid) return;
      await actAs(c, uid);
      const p = await chamar(c, "24h");
      expect((p.historical_window as { code: string }).code).toBe("24h");
    });
  });

  it("administrador master tem acesso", async () => {
    await withRollback(async (c) => {
      const uid = await getUserByRole(c, "administrador_master");
      if (!uid) return;
      await actAs(c, uid);
      const p = await chamar(c, "30d");
      expect((p.historical_window as { code: string }).code).toBe("30d");
    });
  });

  it("tarefeiro é barrado (permissao_negada)", async () => {
    await withRollback(async (c) => {
      const uid = await getUserByRole(c, "tarefeiro");
      if (!uid) return;
      await actAs(c, uid);
      await expectReject(
        c,
        /permissao_negada/,
        "SELECT public.fn_observabilidade_operacional('7d')",
      );
    });
  });

  it("anônimo é barrado", async () => {
    await withRollback(async (c) => {
      await actAsAnon(c);
      await expectReject(
        c,
        /permissao_negada/,
        "SELECT public.fn_observabilidade_operacional('7d')",
      );
    });
  });

  it("janela inválida é rejeitada", async () => {
    await withRollback(async (c) => {
      const uid = await getUserByRole(c, "admin");
      if (!uid) return;
      await actAs(c, uid);
      await expectReject(
        c,
        /janela_invalida/,
        "SELECT public.fn_observabilidade_operacional('90d')",
      );
    });
  });

  it("é somente leitura: nada escrito na fila durante a chamada", async () => {
    await withRollback(async (c) => {
      const uid = await getUserByRole(c, "admin");
      if (!uid) return;
      await actAs(c, uid);
      const antes = await c.query("SELECT count(*)::int AS n FROM notificacoes_fila");
      await chamar(c, "7d");
      const depois = await c.query("SELECT count(*)::int AS n FROM notificacoes_fila");
      expect(depois.rows[0].n).toBe(antes.rows[0].n);
    });
  });
});
