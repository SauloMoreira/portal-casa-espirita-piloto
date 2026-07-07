import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, closePool, actAs, getUserByRole, expectReject } from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * Q2-C3-B — Encerramento auditado do item remanescente OBSOLETO da fila,
 * usando EXCLUSIVAMENTE a RPC `public.fn_encerrar_item_fila_obsoleto`.
 *
 * Prova, contra o banco real (triggers, guardas SECURITY DEFINER, auditoria),
 * o recorte aprovado:
 *  - encerra SOMENTE item elegível (falha + template_indisponivel +
 *    template_codigo 'tratamento_ausencia_remarcada' + retry_count 0 +
 *    sent_at NULL + external_message_id NULL + nova_data vencida);
 *  - NÃO encerra item com sent_at preenchido;
 *  - NÃO encerra item com external_message_id preenchido;
 *  - NÃO encerra item com retry_count > 0;
 *  - NÃO encerra item com status diferente de 'falha';
 *  - NÃO encerra item cujo template não seja 'tratamento_ausencia_remarcada';
 *  - NÃO encerra item com nova_data futura;
 *  - é idempotente (reexecução seleciona 0 / rejeita item já cancelado);
 *  - registra a ação em audit_logs;
 *  - preserva sent_at NULL, external_message_id NULL e retry_count 0;
 *  - não reenvia mensagem (nenhum envio; sent_at continua nulo).
 *
 * Toda a semeadura roda dentro de uma transação SEMPRE revertida (withRollback):
 * nenhum efeito colateral persistente.
 */
const d = HAS_DB ? describe : describe.skip;

interface SeedFila {
  status?: string;
  erro?: string | null;
  template?: string;
  retry?: number;
  sentAt?: string | null;
  externalId?: string | null;
  novaData?: string;
}

async function seedAssistido(c: PoolClient, admin: string): Promise<string> {
  const r = await c.query(
    `INSERT INTO assistidos (nome, created_by, celular)
     VALUES ('Q2C3B Assistido', $1, '11999997777') RETURNING id`,
    [admin],
  );
  return r.rows[0].id as string;
}

async function seedItem(c: PoolClient, assistidoId: string, s: SeedFila = {}): Promise<string> {
  const payload = JSON.stringify({
    nome: "Andréa Vilela",
    nova_data: s.novaData ?? "2026-06-29",
    tratamento: "Magnetismo",
  });
  const r = await c.query(
    `INSERT INTO notificacoes_fila
       (evento_origem, assistido_id, telefone_normalizado, canal,
        template_codigo, status, scheduled_at, retry_count, sent_at,
        external_message_id, dedupe_key, erro, payload_json)
     VALUES ('falta_registrada'::notif_evento, $1, NULL, 'whatsapp',
             $2, $3::notif_status, now(), $4, $5, $6,
             gen_random_uuid()::text, $7, $8::jsonb)
     RETURNING id`,
    [
      assistidoId,
      s.template ?? "tratamento_ausencia_remarcada",
      s.status ?? "falha",
      s.retry ?? 0,
      s.sentAt ?? null,
      s.externalId ?? null,
      s.erro === undefined ? "template_indisponivel" : s.erro,
      payload,
    ],
  );
  return r.rows[0].id as string;
}

const RPC = `SELECT public.fn_encerrar_item_fila_obsoleto($1, 'Q2-C3-B teste')`;

d("Q2-C3-B — encerramento auditado de item obsoleto (RPC oficial)", () => {
  afterAll(async () => {
    await closePool();
  });

  it("encerra somente o item elegível; preserva sent_at/external_id/retry", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      expect(admin).toBeTruthy();
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a);

      const res = await c.query(RPC, [id]);
      expect(res.rows[0].fn_encerrar_item_fila_obsoleto.ok).toBe(true);

      const row = (
        await c.query(
          `SELECT status::text AS status, erro, sent_at, external_message_id, retry_count
             FROM notificacoes_fila WHERE id = $1`,
          [id],
        )
      ).rows[0];
      expect(row.status).toBe("cancelado");
      expect(row.erro).toBe("item_obsoleto");
      expect(row.sent_at).toBeNull();
      expect(row.external_message_id).toBeNull();
      expect(row.retry_count).toBe(0);
    });
  });

  it("NÃO encerra item com sent_at preenchido", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a, { sentAt: "2026-06-24T10:00:00Z", status: "enviado" });
      await expectReject(c, /item_ja_enviado/, RPC, [id]);
    });
  });

  it("NÃO encerra item com external_message_id preenchido", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a, { externalId: "wamid.XYZ" });
      await expectReject(c, /item_ja_enviado/, RPC, [id]);
    });
  });

  it("NÃO encerra item com retry_count > 0", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a, { retry: 2 });
      await expectReject(c, /item_nao_elegivel/, RPC, [id]);
    });
  });

  it("NÃO encerra item com status diferente de 'falha'", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a, { status: "pendente" });
      await expectReject(c, /item_nao_elegivel/, RPC, [id]);
    });
  });

  it("NÃO encerra item cujo template não seja 'tratamento_ausencia_remarcada'", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a, { template: "tratamento_suspenso" });
      await expectReject(c, /item_nao_elegivel/, RPC, [id]);
    });
  });

  it("NÃO encerra item com nova_data futura (remarcação ainda válida)", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a, { novaData: "2099-12-31" });
      await expectReject(c, /nova_data_futura/, RPC, [id]);
    });
  });

  it("é idempotente: reexecução rejeita item já cancelado", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a);
      await c.query(RPC, [id]);
      await expectReject(c, /item_ja_cancelado/, RPC, [id]);
    });
  });

  it("registra auditoria em audit_logs com motivo remarcacao_com_data_passada", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a);
      await c.query(RPC, [id]);

      const audit = await c.query(
        `SELECT user_id, dados_anteriores, dados_novos FROM audit_logs
          WHERE acao = 'encerrar_item_fila_obsoleto' AND registro_id = $1`,
        [id],
      );
      expect(audit.rowCount).toBe(1);
      expect(audit.rows[0].user_id).toBe(admin);
      expect(audit.rows[0].dados_novos.motivo).toBe("remarcacao_com_data_passada");
      expect(audit.rows[0].dados_novos.sent_at).toBeNull();
      expect(audit.rows[0].dados_novos.external_message_id).toBeNull();
    });
  });

  it("exige permissão administrativa (permissao_negada para não-admin)", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      const tarefeiro = await getUserByRole(c, "tarefeiro");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a);
      if (tarefeiro) {
        await actAs(c, tarefeiro);
        await expectReject(c, /permissao_negada/, RPC, [id]);
      }
    });
  });

  it("não gera reenvio: nenhum log de envio real (só cancelamento auditado)", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const a = await seedAssistido(c, admin!);
      const id = await seedItem(c, a);
      await c.query(RPC, [id]);

      const envios = await c.query(
        `SELECT COUNT(*)::int AS n FROM notificacoes_log
          WHERE fila_id = $1 AND status = 'enviado'`,
        [id],
      );
      expect(envios.rows[0].n).toBe(0);
    });
  });
});
