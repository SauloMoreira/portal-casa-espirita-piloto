import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, closePool } from "./_dbClient";

/**
 * Q2-C2 — Diagnóstico controlado da falha `template_indisponivel`.
 *
 * RECORTE EXCLUSIVAMENTE DIAGNÓSTICO / DE REPRODUÇÃO.
 * Este arquivo NÃO altera dados, NÃO reenvia, NÃO cancela e NÃO reenfileira o
 * item remanescente. Ele apenas documenta e prova, contra o banco real, a
 * CAUSA RAIZ do único item em `falha` com `erro = 'template_indisponivel'`.
 *
 * CAUSA RAIZ (divergência entre código e dados):
 *  - O enfileirador de "falta registrada com remarcação"
 *    (`fn_registrar_falta` / trigger de plano) chama
 *    `fn_enqueue_notificacao('falta_registrada', ..., 'tratamento_ausencia_remarcada', ...)`.
 *  - O 3º argumento vira `notificacoes_fila.template_codigo` LITERALMENTE
 *    (ver fn_enqueue_notificacao: `p_template -> template_codigo`).
 *  - Porém NÃO existe em `notificacoes_templates` nenhuma linha com
 *    `codigo_template = 'tratamento_ausencia_remarcada'` (nem ativa nem inativa).
 *  - O dispatcher (`notificacoes-dispatch`) faz:
 *        SELECT corpo_template, ativo FROM notificacoes_templates
 *        WHERE codigo_template = item.template_codigo
 *    e, quando `!tpl || !tpl.ativo`, marca `status='falha', erro='template_indisponivel'`
 *    SEM enviar (sent_at permanece nulo).
 *  => É uma CHAVE DE TEMPLATE DIVERGENTE: o código de enfileiramento aponta
 *     para um `codigo_template` inexistente no catálogo.
 *
 * Toda semeadura roda em transação SEMPRE revertida (withRollback).
 */
const d = HAS_DB ? describe : describe.skip;

/** Chave de template usada pelo enfileirador de remarcação de ausência. */
const CHAVE_DIVERGENTE = "tratamento_ausencia_remarcada";

d("Q2-C2 — diagnóstico template_indisponivel", () => {
  afterAll(async () => {
    await closePool();
  });

  // NOTA HISTÓRICA (pós-Q2-C3-A): a causa raiz original era a AUSÊNCIA da chave
  // no catálogo. O Q2-C3-A corrigiu estruturalmente o catálogo, criando
  // `tratamento_ausencia_remarcada` e `tratamento_suspenso` como templates
  // ATIVOS. Os testes abaixo foram ajustados para refletir a nova realidade,
  // preservando o registro histórico da falha e provando que ela não reincide.

  it("a chave de template do enfileirador AGORA existe no catálogo (corrigido no Q2-C3-A)", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM public.notificacoes_templates
          WHERE codigo_template = $1`,
        [CHAVE_DIVERGENTE],
      );
      // Antes do Q2-C3-A: n = 0 (divergência estrutural — causa raiz).
      // Depois do Q2-C3-A: n = 1 (catálogo corrigido).
      expect(r.rows[0].n).toBe(1);
    });
  });

  it("predicado do dispatcher: chave AGORA existente/ativa => NÃO gera template_indisponivel", async () => {
    await withRollback(async (c) => {
      // Espelho fiel do lookup do dispatcher (notificacoes-dispatch/index.ts).
      const r = await c.query(
        `SELECT corpo_template, ativo FROM public.notificacoes_templates
          WHERE codigo_template = $1 LIMIT 1`,
        [CHAVE_DIVERGENTE],
      );
      const tpl = r.rows[0];
      const rejeitado = !tpl || tpl.ativo !== true;
      // Pós-Q2-C3-A: template válido e ativo => dispatcher não rejeita.
      expect(rejeitado).toBe(false);
    });
  });

  it("templates de falta_registrada com remarcação/suspensão AGORA constam do catálogo", async () => {
    await withRollback(async (c) => {
      // Chaves que o fluxo de falta enfileira hoje.
      const chavesEnfileiradas = ["falta_registrada", "tratamento_suspenso", CHAVE_DIVERGENTE];
      const r = await c.query(
        `SELECT codigo_template FROM public.notificacoes_templates
          WHERE codigo_template = ANY($1::text[])`,
        [chavesEnfileiradas],
      );
      const existentes = new Set(r.rows.map((x) => x.codigo_template as string));
      // Pós-Q2-C3-A: TODAS as chaves enfileiradas existem no catálogo.
      expect(existentes.has("falta_registrada")).toBe(true);
      expect(existentes.has("tratamento_suspenso")).toBe(true);
      expect(existentes.has(CHAVE_DIVERGENTE)).toBe(true);
    });
  });

  it("garantia pós-correção: item com a chave AGORA seria enviável (template válido)", async () => {
    await withRollback(async (c) => {
      // Semeia (e reverte) um item na fila espelhando o item real remanescente.
      // Prova que a barreira original (template ausente) não existe mais.
      const admin = (
        await c.query(
          `SELECT user_id FROM public.user_roles WHERE role = 'admin'::app_role LIMIT 1`,
        )
      ).rows[0]?.user_id;
      const a = (
        await c.query(
          `INSERT INTO assistidos (nome, created_by, celular)
             VALUES ('Q2C2 Assistido', $1, '11988887777') RETURNING id`,
          [admin],
        )
      ).rows[0].id;
      const item = (
        await c.query(
          `INSERT INTO notificacoes_fila
             (evento_origem, assistido_id, telefone_normalizado, canal,
              template_codigo, payload_json, status, scheduled_at, retry_count, dedupe_key, erro)
           VALUES ('falta_registrada'::notif_evento, $1, '5511988887777', 'whatsapp',
              $2, '{"nome":"Q2C2","tratamento":"Magnetismo"}'::jsonb,
              'falha'::notif_status, now(), 0, gen_random_uuid()::text, 'template_indisponivel')
           RETURNING id, status, sent_at`,
          [a, CHAVE_DIVERGENTE],
        )
      ).rows[0];
      // O predicado do dispatcher agora encontra template ativo.
      const tpl = (
        await c.query(
          `SELECT ativo FROM public.notificacoes_templates WHERE codigo_template = $1 LIMIT 1`,
          [CHAVE_DIVERGENTE],
        )
      ).rows[0];
      expect(!tpl || tpl.ativo !== true).toBe(false);
      // O item semeado (revertido) espelha o estado terminal histórico.
      expect(item.status).toBe("falha");
      expect(item.sent_at).toBeNull();
    });
  });
});
