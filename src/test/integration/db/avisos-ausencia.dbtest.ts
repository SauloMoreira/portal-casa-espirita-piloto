import { describe, it, expect, afterAll } from "vitest";
import {
  HAS_DB,
  withRollback,
  actAs,
  getUserByRole,
  expectReject,
  closePool,
} from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * MELHORIA-01 — Fluxo REAL de "não poderei comparecer" (aviso de ausência).
 *
 * Prova, no banco real, contra as funções SECURITY DEFINER oficiais:
 *  - assistido registra aviso para compromisso próprio e elegível;
 *  - a agenda NÃO muda automaticamente (os 4 não);
 *  - alerta operacional é gerado para a coordenação;
 *  - trava de duplicidade impede 2 avisos abertos para o mesmo compromisso;
 *  - titularidade: assistido não registra aviso para compromisso de outro;
 *  - tarefeiro recebe payload SEM motivo/resolução; perfil autorizado recebe;
 *  - somente equipe autorizada trata o aviso.
 */
const d = HAS_DB ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

/** Assistido que possui usuário de login (user_id) vinculado. */
async function getAssistidoComUser(c: PoolClient): Promise<{ assistidoId: string; userId: string } | null> {
  const r = await c.query(
    "SELECT id, user_id FROM assistidos WHERE user_id IS NOT NULL AND deleted_at IS NULL LIMIT 1",
  );
  if (!r.rows[0]) return null;
  return { assistidoId: r.rows[0].id, userId: r.rows[0].user_id };
}

async function criarSessaoFutura(c: PoolClient, assistidoId: string): Promise<string> {
  const at = await c.query("SELECT id, tratamento_id FROM assistido_tratamentos LIMIT 1");
  const trat = await c.query("SELECT id FROM tipos_tratamento LIMIT 1");
  const r = await c.query(
    `INSERT INTO agenda_tratamentos_assistido
       (assistido_id, assistido_tratamento_id, tratamento_id, data_sessao, horario, status)
     VALUES ($1, $2, $3, current_date + 7, '09:00', 'agendado') RETURNING id`,
    [assistidoId, at.rows[0].id, trat.rows[0].id],
  );
  return r.rows[0].id as string;
}

d("MELHORIA-01 — registro e invariantes do aviso de ausência", () => {
  it("assistido registra aviso para sessão própria e a agenda NÃO muda", async () => {
    await withRollback(async (c) => {
      const a = await getAssistidoComUser(c);
      if (!a) return;
      const sessaoId = await criarSessaoFutura(c, a.assistidoId);
      await actAs(c, a.userId);

      const res = await c.query(
        "SELECT public.fn_registrar_aviso_ausencia('sessao', $1, 'motivo confidencial') AS r",
        [sessaoId],
      );
      expect(res.rows[0].r.status).toBe("aberto");

      // Agenda intacta
      const ag = await c.query("SELECT status FROM agenda_tratamentos_assistido WHERE id = $1", [sessaoId]);
      expect(ag.rows[0].status).toBe("agendado");

      // Alerta operacional gerado para a coordenação
      const alertas = await c.query(
        "SELECT count(*)::int AS n FROM avisos_internos WHERE tipo = 'aviso_ausencia'",
      );
      expect(alertas.rows[0].n).toBeGreaterThan(0);
    });
  });

  it("trava de duplicidade impede dois avisos abertos para o mesmo compromisso", async () => {
    await withRollback(async (c) => {
      const a = await getAssistidoComUser(c);
      if (!a) return;
      const sessaoId = await criarSessaoFutura(c, a.assistidoId);
      await actAs(c, a.userId);
      await c.query("SELECT public.fn_registrar_aviso_ausencia('sessao', $1, NULL)", [sessaoId]);
      await expectReject(
        c,
        /aviso_duplicado/,
        "SELECT public.fn_registrar_aviso_ausencia('sessao', $1, NULL)",
        [sessaoId],
      );
    });
  });

  it("titularidade: assistido não registra aviso para sessão de outro", async () => {
    await withRollback(async (c) => {
      const a = await getAssistidoComUser(c);
      if (!a) return;
      // Sessão de OUTRO assistido
      const outro = await c.query(
        "SELECT id FROM assistidos WHERE id <> $1 AND deleted_at IS NULL LIMIT 1",
        [a.assistidoId],
      );
      if (!outro.rows[0]) return;
      const sessaoId = await criarSessaoFutura(c, outro.rows[0].id);
      await actAs(c, a.userId);
      await expectReject(
        c,
        /compromisso_invalido/,
        "SELECT public.fn_registrar_aviso_ausencia('sessao', $1, NULL)",
        [sessaoId],
      );
    });
  });

  it("tarefeiro vê metadados mas NÃO o motivo; autorizado vê o motivo", async () => {
    await withRollback(async (c) => {
      const a = await getAssistidoComUser(c);
      if (!a) return;
      const sessaoId = await criarSessaoFutura(c, a.assistidoId);
      await actAs(c, a.userId);
      await c.query("SELECT public.fn_registrar_aviso_ausencia('sessao', $1, 'segredo do assistido')", [
        sessaoId,
      ]);

      const tarefeiro = await getUserByRole(c, "tarefeiro");
      if (tarefeiro) {
        await actAs(c, tarefeiro);
        const t = await c.query(
          "SELECT motivo, resolucao, pode_ver_conteudo FROM public.fn_avisos_ausencia_pendentes(false) WHERE tipo_compromisso = 'sessao'",
        );
        for (const row of t.rows) {
          expect(row.motivo).toBeNull();
          expect(row.resolucao).toBeNull();
          expect(row.pode_ver_conteudo).toBe(false);
        }
      }

      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const adm = await c.query(
        "SELECT motivo, pode_ver_conteudo FROM public.fn_avisos_ausencia_pendentes(false) WHERE tipo_compromisso = 'sessao'",
      );
      const comSegredo = adm.rows.find((r) => r.motivo === "segredo do assistido");
      expect(comSegredo).toBeDefined();
      expect(comSegredo.pode_ver_conteudo).toBe(true);
    });
  });

  it("somente equipe autorizada trata o aviso; tarefeiro não trata", async () => {
    await withRollback(async (c) => {
      const a = await getAssistidoComUser(c);
      if (!a) return;
      const sessaoId = await criarSessaoFutura(c, a.assistidoId);
      await actAs(c, a.userId);
      const reg = await c.query(
        "SELECT (public.fn_registrar_aviso_ausencia('sessao', $1, NULL)->>'id') AS id",
        [sessaoId],
      );
      const avisoId = reg.rows[0].id;

      const tarefeiro = await getUserByRole(c, "tarefeiro");
      if (tarefeiro) {
        await actAs(c, tarefeiro);
        await expectReject(
          c,
          /permissao_negada/,
          "SELECT public.fn_tratar_aviso_ausencia($1, 'resolvido', 'x')",
          [avisoId],
        );
      }

      const admin = await getUserByRole(c, "admin");
      await actAs(c, admin!);
      const res = await c.query(
        "SELECT public.fn_tratar_aviso_ausencia($1, 'resolvido', 'tratado') AS r",
        [avisoId],
      );
      expect(res.rows[0].r.status).toBe("resolvido");

      // Agenda permanece intacta após o tratamento
      const ag = await c.query("SELECT status FROM agenda_tratamentos_assistido WHERE id = $1", [sessaoId]);
      expect(ag.rows[0].status).toBe("agendado");
    });
  });
});
