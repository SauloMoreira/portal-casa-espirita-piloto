import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, closePool, actAs, getUserByRole, expectReject } from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * Q2-C1 — Saneamento pontual, idempotente e auditado da fila de notificações
 * com erro de cadastro, usando EXCLUSIVAMENTE a RPC já existente
 * `public.fn_encerrar_item_fila_erro_cadastro`.
 *
 * Prova, contra o banco real (triggers, guardas SECURITY DEFINER, auditoria),
 * o recorte aprovado:
 *  - identifica itens elegíveis em `falha` por erro de cadastro (`sem_telefone`);
 *  - NÃO encerra itens enviados, pendentes/agendados nem já cancelados;
 *  - `template_indisponivel` NÃO é elegível pela RPC (permanece intocado);
 *  - é idempotente (segunda passada não altera nada);
 *  - registra a ação em `audit_logs`;
 *  - preserva opt-out / consentimento / preferências (não cria nem altera);
 *  - não reenvia mensagem (não gera envio; `sent_at` continua nulo);
 *  - preserva o comportamento atual da fila (só o item alvo muda).
 *
 * Toda a semeadura roda dentro de uma transação SEMPRE revertida (withRollback):
 * nenhum efeito colateral persistente.
 */
const d = HAS_DB ? describe : describe.skip;

/** Predicado OFICIAL do saneamento Q2-C1 (espelho fiel da migração). */
const SELECAO_ELEGIVEIS = `
  SELECT id FROM public.notificacoes_fila
  WHERE status = 'falha'
    AND erro IN ('sem_telefone','telefone_invalido','dados_obrigatorios_ausentes','nome_ausente')
`;

interface SeedFila {
  id: string;
  status: string;
  erro: string | null;
  evento?: string;
}

async function seedAssistido(c: PoolClient, admin: string): Promise<string> {
  const r = await c.query(
    `INSERT INTO assistidos (nome, created_by, celular)
     VALUES ('Q2C1 Assistido', $1, '11999998888') RETURNING id`,
    [admin],
  );
  return r.rows[0].id as string;
}

async function seedItem(
  c: PoolClient,
  assistidoId: string,
  s: SeedFila,
): Promise<string> {
  const r = await c.query(
    `INSERT INTO notificacoes_fila
       (id, evento_origem, assistido_id, telefone_normalizado, canal,
        template_codigo, status, scheduled_at, retry_count, dedupe_key, erro)
     VALUES (COALESCE($1, gen_random_uuid()), $2::notif_evento, $3, NULL, 'whatsapp',
             'sessao_lembrete', $4::notif_status, now(), 0, gen_random_uuid()::text, $5)
     RETURNING id`,
    [s.id || null, s.evento || "sessao_lembrete", assistidoId, s.status, s.erro],
  );
  return r.rows[0].id as string;
}

/** Executa o saneamento Q2-C1 exatamente como a migração (loop + RPC). */
async function executarSaneamento(c: PoolClient): Promise<number> {
  const alvos = await c.query(SELECAO_ELEGIVEIS);
  let n = 0;
  for (const row of alvos.rows) {
    await c.query(
      `SELECT public.fn_encerrar_item_fila_erro_cadastro($1, 'erro_cadastro', 'Q2-C1 teste')`,
      [row.id],
    );
    n += 1;
  }
  return n;
}

d("Q2-C1 — saneamento da fila com erro de cadastro (RPC oficial)", () => {
  afterAll(async () => {
    await closePool();
  });

  it("encerra apenas itens em falha por erro de cadastro; preserva os demais", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      expect(admin).toBeTruthy();
      await actAs(c, admin!);

      const a = await seedAssistido(c, admin!);
      const elegivel = await seedItem(c, a, { id: "", status: "falha", erro: "sem_telefone" });
      const tmpl = await seedItem(c, a, { id: "", status: "falha", erro: "template_indisponivel" });
      const pendente = await seedItem(c, a, { id: "", status: "pendente", erro: "sem_telefone" });
      const agendado = await seedItem(c, a, { id: "", status: "agendado", erro: null });
      const enviado = await seedItem(c, a, { id: "", status: "enviado", erro: null });

      const n = await executarSaneamento(c);
      expect(n).toBe(1); // só o item falha+sem_telefone

      const rows = await c.query(
        `SELECT id, status::text AS status, erro, sent_at FROM notificacoes_fila
          WHERE id = ANY($1::uuid[])`,
        [[elegivel, tmpl, pendente, agendado, enviado]],
      );
      const by = Object.fromEntries(rows.rows.map((r) => [r.id, r]));

      // Alvo encerrado corretamente.
      expect(by[elegivel].status).toBe("cancelado");
      expect(by[elegivel].erro).toBe("erro_cadastro");
      expect(by[elegivel].sent_at).toBeNull(); // sem reenvio

      // Demais intocados.
      expect(by[tmpl].status).toBe("falha");
      expect(by[tmpl].erro).toBe("template_indisponivel");
      expect(by[pendente].status).toBe("pendente");
      expect(by[agendado].status).toBe("agendado");
      expect(by[enviado].status).toBe("enviado");
    });
  });

  it("registra a ação em audit_logs", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a, { id: "", status: "falha", erro: "sem_telefone" });

      await executarSaneamento(c);

      const audit = await c.query(
        `SELECT COUNT(*)::int AS n FROM audit_logs
          WHERE acao = 'encerrar_item_fila_erro_cadastro' AND registro_id = $1`,
        [id],
      );
      expect(audit.rows[0].n).toBe(1);
    });
  });

  it("é idempotente: segunda passada não altera nada", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      await seedItem(c, a, { id: "", status: "falha", erro: "sem_telefone" });

      expect(await executarSaneamento(c)).toBe(1);
      expect(await executarSaneamento(c)).toBe(0); // nada mais elegível
    });
  });

  it("template_indisponivel NÃO é elegível pela RPC (motivo_nao_elegivel)", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a, { id: "", status: "falha", erro: "template_indisponivel" });
      await expectReject(
        c,
        /motivo_nao_elegivel/,
        `SELECT public.fn_encerrar_item_fila_erro_cadastro($1)`,
        [id],
      );
    });
  });

  it("não encerra item enviado nem item já cancelado", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const enviado = await seedItem(c, a, { id: "", status: "enviado", erro: "sem_telefone" });
      const cancelado = await seedItem(c, a, { id: "", status: "cancelado", erro: "sem_telefone" });

      await expectReject(
        c,
        /item_ja_enviado/,
        `SELECT public.fn_encerrar_item_fila_erro_cadastro($1)`,
        [enviado],
      );
      await expectReject(
        c,
        /item_ja_cancelado/,
        `SELECT public.fn_encerrar_item_fila_erro_cadastro($1)`,
        [cancelado],
      );
    });
  });

  it("preserva opt-out / consentimento / preferências do assistido", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      await seedItem(c, a, { id: "", status: "falha", erro: "sem_telefone" });

      const antes = await c.query(
        `SELECT COUNT(*)::int AS n FROM notificacoes_preferencias WHERE assistido_id = $1`,
        [a],
      );
      await executarSaneamento(c);
      const depois = await c.query(
        `SELECT COUNT(*)::int AS n FROM notificacoes_preferencias WHERE assistido_id = $1`,
        [a],
      );
      // O saneamento NÃO cria nem altera preferências/opt-out/consentimento.
      expect(depois.rows[0].n).toBe(antes.rows[0].n);
    });
  });

  it("exige permissão administrativa (permissao_negada para não-admin)", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      const tarefeiro = await getUserByRole(c, "tarefeiro");
      // Semeia como admin, mas tenta encerrar como não-admin.
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a, { id: "", status: "falha", erro: "sem_telefone" });

      if (tarefeiro) {
        await actAs(c, tarefeiro);
        await expectReject(
          c,
          /permissao_negada/,
          `SELECT public.fn_encerrar_item_fila_erro_cadastro($1)`,
          [id],
        );
      }
    });
  });
});
