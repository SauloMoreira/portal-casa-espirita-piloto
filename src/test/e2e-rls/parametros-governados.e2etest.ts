/**
 * P1.1 — E2E real (JWT + PostgREST) — Parâmetros governados.
 *
 * Prova que apenas admin altera parâmetros operacionais pelo caminho real
 * (RPC governada) e que perfis indevidos são barrados com erro coerente.
 * O teste é não-destrutivo: relê o valor atual e o reescreve idêntico.
 */
import { describe, it, expect } from "vitest";
import { HAS_E2E, rest, rpc } from "./_rlsClient";
import { HAS_SERVICE } from "./_seed";

const ENABLED = HAS_E2E && HAS_SERVICE;
const CHAVE = "tratamento_confirmacao_agendamento_ativa"; // governável, booleana

describe.skipIf(!ENABLED)("E2E RLS · Parâmetros governados — alteração restrita a admin", () => {
  it("admin altera o parâmetro pelo caminho real (idempotente)", async () => {
    // Lê o valor atual com a sessão admin e reescreve o mesmo valor.
    const cur = await rest<Array<{ valor: string }>>(
      "admin",
      `regras_operacionais?chave=eq.${CHAVE}&select=valor`,
    );
    expect(cur.ok).toBe(true);
    const valorAtual = cur.body[0]?.valor ?? "false";

    const r = await rpc("admin", "fn_atualizar_parametro_operacional", {
      p_chave: CHAVE,
      p_valor: valorAtual,
      p_observacao: "e2e_rls verificação não-destrutiva",
    });
    expect(r.ok).toBe(true);
  });

  it("tarefeiro é barrado ao tentar alterar (permissão negada)", async () => {
    const r = await rpc<{ message?: string }>("tarefeiro", "fn_atualizar_parametro_operacional", {
      p_chave: CHAVE,
      p_valor: "true",
    });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.body)).toMatch(/Permiss[aã]o negada/i);
  });

  it("entrevistador é barrado ao tentar alterar", async () => {
    const r = await rpc("entrevistador", "fn_atualizar_parametro_operacional", {
      p_chave: CHAVE,
      p_valor: "true",
    });
    expect(r.ok).toBe(false);
  });

  it("assistido é barrado ao tentar alterar", async () => {
    const r = await rpc("assistido", "fn_atualizar_parametro_operacional", {
      p_chave: CHAVE,
      p_valor: "true",
    });
    expect(r.ok).toBe(false);
  });

  it("anônimo sem JWT é bloqueado (401)", async () => {
    const r = await rpc("none", "fn_atualizar_parametro_operacional", {
      p_chave: CHAVE,
      p_valor: "true",
    });
    expect(r.status).toBe(401);
  });
});
