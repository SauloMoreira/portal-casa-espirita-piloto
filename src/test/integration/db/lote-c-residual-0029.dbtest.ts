import { describe, it, expect, afterAll } from "vitest";
import {
  HAS_DB,
  withRollback,
  actAs,
  getUserByRole,
  closePool,
} from "./_dbClient";

/**
 * P1 — Lote C — Classificação final do residual `0029`.
 *
 * Prova, em execução real, que:
 *  - as 10 funções do Balde C deixaram de ser executáveis por `authenticated`
 *    (e seguem sem `anon`/`PUBLIC`);
 *  - os helpers de RLS do Balde B continuam executáveis por `authenticated`
 *    (eles PRECISAM ser, para as policies funcionarem);
 *  - o subgrupo de escrita/governança do Balde A continua executável por
 *    `authenticated` mas com guarda interna: assistido sem papel é negado;
 *  - o pipeline de exceção preserva o contrato: usuário autenticado sem papel
 *    é negado, caminho interno (auth.uid() nulo) é permitido.
 */
const d = HAS_DB ? describe : describe.skip;

// Balde C — internas/órfãs: REVOKE de authenticated/anon/PUBLIC.
const BALDE_C: Array<[string, string]> = [
  ["count_active_masters", "public.count_active_masters()"],
  ["count_apt_admins", "public.count_apt_admins()"],
  ["fn_sanear_fila_notificacoes", "public.fn_sanear_fila_notificacoes()"],
  ["fn_fila_motivo_inelegivel", "public.fn_fila_motivo_inelegivel(uuid)"],
  ["fn_reconciliar_excecoes_notificacoes", "public.fn_reconciliar_excecoes_notificacoes()"],
  ["fn_confirmacao_agendamento_ativa", "public.fn_confirmacao_agendamento_ativa()"],
  ["fn_confirmacao_entrevista_ativa", "public.fn_confirmacao_entrevista_ativa()"],
  ["fn_lembrete_antecedencia_horas", "public.fn_lembrete_antecedencia_horas()"],
  ["fn_proxima_sessao_vinculo", "public.fn_proxima_sessao_vinculo(uuid)"],
  ["fn_eh_proxima_sessao", "public.fn_eh_proxima_sessao(uuid)"],
];

// Balde B — helpers de RLS que PRECISAM continuar executáveis por authenticated.
const BALDE_B: Array<[string, string]> = [
  ["has_role", "public.has_role(uuid, app_role)"],
  ["fn_eh_staff", "public.fn_eh_staff(uuid)"],
  ["fn_eh_gestor", "public.fn_eh_gestor(uuid)"],
  ["is_active_admin", "public.is_active_admin(uuid)"],
];

afterAll(async () => {
  await closePool();
});

d("Lote C — Balde C saiu de authenticated/anon/PUBLIC", () => {
  it.each(BALDE_C)("%s não é executável por authenticated nem anon", async (_n, sig) => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS auth_can,
                has_function_privilege('anon', $1, 'EXECUTE') AS anon_can`,
        [sig],
      );
      expect(r.rows[0].auth_can).toBe(false);
      expect(r.rows[0].anon_can).toBe(false);
    });
  });
});

d("Lote C — Balde B (helpers RLS) permanece coerente", () => {
  it.each(BALDE_B)("%s continua executável por authenticated", async (_n, sig) => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS auth_can`,
        [sig],
      );
      expect(r.rows[0].auth_can).toBe(true);
    });
  });
});

d("Lote C — Balde A (governança) mantém guarda interna", () => {
  it("assistido autenticado é negado em fn_conceder_acesso_operacional", async () => {
    await withRollback(async (c) => {
      const assistido = await getUserByRole(c, "assistido");
      expect(assistido).toBeTruthy();
      await actAs(c, assistido!);
      const r = await c.query(
        "SELECT public.fn_conceder_acesso_operacional($1,$2) AS res",
        [assistido, "coordenador_de_tratamento"],
      );
      expect(r.rows[0].res.error).toMatch(/administrador|negad|permiss|gest|admin/i);
    });
  });
});

d("Lote C — pipeline de exceção preserva contrato interno x autenticado", () => {
  it("autenticado sem papel é negado em fn_monitor_excecao_notificacoes", async () => {
    await withRollback(async (c) => {
      const assistido = await getUserByRole(c, "assistido");
      expect(assistido).toBeTruthy();
      await actAs(c, assistido!);
      await expect(
        c.query("SELECT public.fn_monitor_excecao_notificacoes(now())"),
      ).rejects.toThrow(/negad|gest/i);
    });
  });

  it("caminho interno (auth.uid() nulo) é permitido em fn_monitor_excecao_notificacoes", async () => {
    await withRollback(async (c) => {
      // sem actAs => sem auth.uid() => execução interna
      const r = await c.query("SELECT public.fn_monitor_excecao_notificacoes(now()) AS res");
      expect(r.rows[0].res).toBeDefined();
    });
  });
});
