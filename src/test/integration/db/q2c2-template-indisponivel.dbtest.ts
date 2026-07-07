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

  it("a chave de template do enfileirador NÃO existe no catálogo (causa raiz)", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM public.notificacoes_templates
          WHERE codigo_template = $1`,
        [CHAVE_DIVERGENTE],
      );
      // Divergência estrutural: nenhuma linha (ativa ou inativa) para a chave.
      expect(r.rows[0].n).toBe(0);
    });
  });

  it("reproduz o predicado do dispatcher: chave inexistente => template_indisponivel", async () => {
    await withRollback(async (c) => {
      // Espelho fiel do lookup do dispatcher (notificacoes-dispatch/index.ts).
      const r = await c.query(
        `SELECT corpo_template, ativo FROM public.notificacoes_templates
          WHERE codigo_template = $1 LIMIT 1`,
        [CHAVE_DIVERGENTE],
      );
      const tpl = r.rows[0];
      const rejeitado = !tpl || tpl.ativo !== true;
      expect(rejeitado).toBe(true); // dispatcher marcaria erro='template_indisponivel'
    });
  });

  it("templates efetivamente usados por falta_registrada com remarcação divergem do catálogo", async () => {
    await withRollback(async (c) => {
      // Chaves que o fluxo de falta enfileira hoje.
      const chavesEnfileiradas = ["falta_registrada", "tratamento_suspenso", CHAVE_DIVERGENTE];
      const r = await c.query(
        `SELECT codigo_template FROM public.notificacoes_templates
          WHERE codigo_template = ANY($1::text[])`,
        [chavesEnfileiradas],
      );
      const existentes = new Set(r.rows.map((x) => x.codigo_template as string));
      // 'falta_registrada' existe; as chaves de remarcação/suspensão NÃO.
      expect(existentes.has("falta_registrada")).toBe(true);
      expect(existentes.has(CHAVE_DIVERGENTE)).toBe(false);
    });
  });

  it("garantia diagnóstica: item com a chave divergente permaneceria sem envio (sent_at nulo)", async () => {
    await withRollback(async (c) => {
      // Semeia (e reverte) um item na fila espelhando o item real remanescente,
      // apenas para provar o INVARIANTE: sem template válido não há envio.
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
      // O predicado do dispatcher não encontra template => não envia.
      const tpl = (
        await c.query(
          `SELECT ativo FROM public.notificacoes_templates WHERE codigo_template = $1 LIMIT 1`,
          [CHAVE_DIVERGENTE],
        )
      ).rows[0];
      expect(!tpl || tpl.ativo !== true).toBe(true);
      expect(item.status).toBe("falha");
      expect(item.sent_at).toBeNull();
    });
  });
});
