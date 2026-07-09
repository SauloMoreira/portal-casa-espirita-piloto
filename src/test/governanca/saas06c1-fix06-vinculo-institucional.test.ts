import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { concederAcessoOperacional } from "@/services/governanca/acessoService";

beforeEach(() => rpcMock.mockReset());

/**
 * SAAS-06-C1-FIX06 — cliente envia p_instituicao_id ao conceder acesso
 * operacional, e propaga mensagens amigáveis do backend (erro sem termo
 * técnico) e o status de vínculo (criado/reativado/inalterado).
 */
describe("SAAS-06-C1-FIX06 — vínculo institucional na concessão de acesso", () => {
  it("envia p_instituicao_id junto com o papel operacional", async () => {
    rpcMock.mockResolvedValue({
      data: { success: true, status: "concedido", role: "tarefeiro", instituicao_id: "inst1", vinculo: "criado" },
      error: null,
    });
    await concederAcessoOperacional({
      targetUserId: "user1",
      role: "tarefeiro",
      motivo: null,
      instituicaoId: "inst1",
    });
    expect(rpcMock).toHaveBeenCalledWith("fn_conceder_acesso_operacional", {
      p_target_user_id: "user1",
      p_role: "tarefeiro",
      p_motivo: null,
      p_instituicao_id: "inst1",
    });
  });

  it("envia p_instituicao_id=null quando nenhuma instituição é informada (fallback GUC)", async () => {
    rpcMock.mockResolvedValue({
      data: { success: true, status: "ja_concedido", role: "tarefeiro" },
      error: null,
    });
    await concederAcessoOperacional({ targetUserId: "u", role: "tarefeiro" });
    expect(rpcMock).toHaveBeenCalledWith("fn_conceder_acesso_operacional", {
      p_target_user_id: "u",
      p_role: "tarefeiro",
      p_motivo: null,
      p_instituicao_id: null,
    });
  });

  it("propaga mensagem amigável quando não há tenant selecionado", async () => {
    rpcMock.mockResolvedValue({
      data: { error: "Selecione uma instituição antes de conceder acesso." },
      error: null,
    });
    await expect(
      concederAcessoOperacional({ targetUserId: "u", role: "tarefeiro" }),
    ).rejects.toThrow(/Selecione uma instituição/);
  });

  it("propaga mensagem amigável quando o admin não pertence ao tenant alvo", async () => {
    rpcMock.mockResolvedValue({
      data: { error: "Você não é administrador desta instituição." },
      error: null,
    });
    await expect(
      concederAcessoOperacional({
        targetUserId: "u",
        role: "tarefeiro",
        instituicaoId: "outra-inst",
      }),
    ).rejects.toThrow(/administrador desta instituição/);
  });

  it("preserva idempotência: status ja_concedido não é tratado como erro", async () => {
    rpcMock.mockResolvedValue({
      data: { success: true, status: "ja_concedido", role: "tarefeiro", vinculo: "inalterado" },
      error: null,
    });
    const r = await concederAcessoOperacional({
      targetUserId: "u",
      role: "tarefeiro",
      instituicaoId: "inst1",
    });
    expect(r.status).toBe("ja_concedido");
  });

  it("papéis administrativos são recusados com mensagem amigável", async () => {
    rpcMock.mockResolvedValue({
      data: { error: "Acessos administrativos são concedidos apenas pelo fluxo de aprovação reforçado." },
      error: null,
    });
    await expect(
      concederAcessoOperacional({
        // @ts-expect-error — teste de proteção do backend contra papel indevido
        role: "admin",
        targetUserId: "u",
        instituicaoId: "inst1",
      }),
    ).rejects.toThrow(/aprovação reforçado/);
  });
});
