import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do client Supabase antes de importar o service.
const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import {
  solicitarPromocaoAdmin,
  decidirPromocaoAdmin,
  concederAcessoOperacional,
  revogarAcessoOperacional,
} from "@/services/governanca/acessoService";

beforeEach(() => {
  rpcMock.mockReset();
});

describe("Q1-C2 acessoService — payloads enviados", () => {
  it("solicitarPromocaoAdmin envia chaves esperadas", async () => {
    rpcMock.mockResolvedValue({ data: { success: true, id: "req1", required_approvals: 2, excecao_master: false }, error: null });
    await solicitarPromocaoAdmin({ targetUserId: "u1", targetRole: "admin", justificativa: "motivo" });
    expect(rpcMock).toHaveBeenCalledWith("solicitar_promocao_admin", {
      p_target_user_id: "u1",
      p_target_role: "admin",
      p_justificativa: "motivo",
    });
  });

  it("decidirPromocaoAdmin envia chaves esperadas", async () => {
    rpcMock.mockResolvedValue({ data: { success: true, status: "aprovado" }, error: null });
    await decidirPromocaoAdmin({ requestId: "r1", decision: "aprovar", motivo: null });
    expect(rpcMock).toHaveBeenCalledWith("decidir_promocao_admin", {
      p_request_id: "r1",
      p_decision: "aprovar",
      p_motivo: null,
    });
  });

  it("concederAcessoOperacional envia chaves esperadas", async () => {
    rpcMock.mockResolvedValue({ data: { success: true, status: "concedido", role: "entrevistador" }, error: null });
    await concederAcessoOperacional({ targetUserId: "u2", role: "entrevistador", motivo: "x", instituicaoId: "inst1" });
    expect(rpcMock).toHaveBeenCalledWith("fn_conceder_acesso_operacional", {
      p_target_user_id: "u2",
      p_role: "entrevistador",
      p_motivo: "x",
      p_instituicao_id: "inst1",
    });
  });

  it("revogarAcessoOperacional envia chaves esperadas", async () => {
    rpcMock.mockResolvedValue({ data: { success: true, status: "revogado", role: "tarefeiro" }, error: null });
    await revogarAcessoOperacional({ targetUserId: "u3", role: "tarefeiro", motivo: null });
    expect(rpcMock).toHaveBeenCalledWith("fn_revogar_acesso_operacional", {
      p_target_user_id: "u3",
      p_role: "tarefeiro",
      p_motivo: null,
    });
  });
});

describe("Q1-C2 acessoService — mapeamento de retorno", () => {
  it("mapeia sucesso de solicitarPromocaoAdmin", async () => {
    rpcMock.mockResolvedValue({ data: { success: true, id: "req1", required_approvals: 2, excecao_master: true }, error: null });
    const r = await solicitarPromocaoAdmin({ targetUserId: "u1", targetRole: "admin", justificativa: "m" });
    expect(r).toEqual({ id: "req1", required_approvals: 2, excecao_master: true });
  });

  it("mapeia status parcial de decidirPromocaoAdmin", async () => {
    rpcMock.mockResolvedValue({ data: { success: true, status: "aprovado_parcialmente", aprovacoes: 1, necessarias: 2 }, error: null });
    const r = await decidirPromocaoAdmin({ requestId: "r1", decision: "aprovar" });
    expect(r).toEqual({ status: "aprovado_parcialmente", aprovacoes: 1, necessarias: 2 });
  });

  it("mapeia ja_concedido de concederAcessoOperacional", async () => {
    rpcMock.mockResolvedValue({ data: { success: true, status: "ja_concedido", role: "entrevistador" }, error: null });
    const r = await concederAcessoOperacional({ targetUserId: "u2", role: "entrevistador" });
    expect(r.status).toBe("ja_concedido");
    expect(r.role).toBe("entrevistador");
  });

  it("mapeia inexistente de revogarAcessoOperacional", async () => {
    rpcMock.mockResolvedValue({ data: { success: true, status: "inexistente", role: "tarefeiro" }, error: null });
    const r = await revogarAcessoOperacional({ targetUserId: "u3", role: "tarefeiro" });
    expect(r.status).toBe("inexistente");
  });
});

describe("Q1-C2 acessoService — propagação de erros", () => {
  it("propaga erro de negócio (json.error)", async () => {
    rpcMock.mockResolvedValue({ data: { error: "sem_permissao" }, error: null });
    await expect(
      solicitarPromocaoAdmin({ targetUserId: "u1", targetRole: "admin", justificativa: "m" }),
    ).rejects.toThrow("sem_permissao");
  });

  it("propaga erro de transporte", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "network" } });
    await expect(
      decidirPromocaoAdmin({ requestId: "r1", decision: "rejeitar" }),
    ).rejects.toThrow("network");
  });
});
