import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, getAnyAssistido, closePool } from "./_dbClient";

/**
 * L-07 — Idempotência REAL (INV-SEG-003, INV-FILA-001/002).
 *
 * Executar o mesmo efeito duas vezes não pode duplicar item/envio nem criar
 * estado inconsistente. Prova, no banco real, a barreira oficial de
 * deduplicação (`dedupe_key` UNIQUE + `fn_enqueue_notificacao` com
 * `ON CONFLICT DO NOTHING`) — o mesmo mecanismo usado por triggers de sessão,
 * entrevista e saneamento de fila.
 */
const d = HAS_DB ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

d("L-07 idempotência real — barreira de dedupe da fila", () => {
  it("o mesmo dedupe_key enfileirado duas vezes gera UM único item", async () => {
    await withRollback(async (c) => {
      const assistido = await getAnyAssistido(c);
      const dedupe = "itest-idem:fixo-001";
      const enqueue = () =>
        c.query(
          `SELECT public.fn_enqueue_notificacao('entrevista_lembrete'::notif_evento, $1, 'entrevista_lembrete',
             '{}'::jsonb, now() + interval '2 days', $2)`,
          [assistido, dedupe],
        );
      await enqueue();
      await enqueue();
      await enqueue();
      const r = await c.query("SELECT count(*)::int n FROM notificacoes_fila WHERE dedupe_key=$1", [
        dedupe,
      ]);
      expect(r.rows[0].n).toBe(1);
    });
  });

  it("reprocessar (saneamento/replay) com mesma chave não duplica nem altera o item", async () => {
    await withRollback(async (c) => {
      const assistido = await getAnyAssistido(c);
      const dedupe = "itest-idem:replay-002";
      await c.query(
        `SELECT public.fn_enqueue_notificacao('entrevista_lembrete'::notif_evento, $1, 'entrevista_lembrete',
           jsonb_build_object('v',1), now() + interval '2 days', $2)`,
        [assistido, dedupe],
      );
      const first = await c.query(
        "SELECT id, payload_json, status FROM notificacoes_fila WHERE dedupe_key=$1",
        [dedupe],
      );
      // Replay com payload diferente: ON CONFLICT DO NOTHING preserva o item original.
      await c.query(
        `SELECT public.fn_enqueue_notificacao('entrevista_lembrete'::notif_evento, $1, 'entrevista_lembrete',
           jsonb_build_object('v',2), now() + interval '2 days', $2)`,
        [assistido, dedupe],
      );
      const after = await c.query(
        "SELECT id, payload_json, status FROM notificacoes_fila WHERE dedupe_key=$1",
        [dedupe],
      );
      expect(after.rowCount).toBe(1);
      expect(after.rows[0].id).toBe(first.rows[0].id);
      expect(after.rows[0].payload_json.v).toBe(1); // original mantido, não sobrescrito
    });
  });

  it("itens distintos (dedupe diferente) coexistem — idempotência é por chave", async () => {
    await withRollback(async (c) => {
      const assistido = await getAnyAssistido(c);
      for (const k of ["itest-idem:a", "itest-idem:b"]) {
        await c.query(
          `SELECT public.fn_enqueue_notificacao('entrevista_lembrete'::notif_evento, $1, 'entrevista_lembrete',
             '{}'::jsonb, now() + interval '2 days', $2)`,
          [assistido, k],
        );
      }
      const r = await c.query(
        "SELECT count(*)::int n FROM notificacoes_fila WHERE dedupe_key like 'itest-idem:%'",
      );
      expect(r.rows[0].n).toBe(2);
    });
  });
});
