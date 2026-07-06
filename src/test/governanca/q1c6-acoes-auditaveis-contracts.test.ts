import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do client Supabase antes de importar os services.
const rpcMock = vi.fn();
const fromMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import {
  parseEncerramentoErroCadastro,
  parseMensagemManual,
} from "@/services/notificacoes/notificacoesContracts";
import {
  encerrarItemFilaErroCadastro,
  enfileirarMensagemManual,
} from "@/services/notificacoes/notificacoesService";

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

// ============================================================================
// 1. parseEncerramentoErroCadastro
// ============================================================================

describe("Q1-C6 contratos — parseEncerramentoErroCadastro", () => {
  const valido = {
    ok: true,
    fila_id: "f1",
    status: "encerrado",
    motivo_encerramento: "erro_cadastro",
    motivo_anterior: "pendente",
    assistido_id: "a1",
    encerrado_por: "u1",
    encerrado_em: "2026-07-06T12:00:00Z",
  };

  it("preserva o shape completo e todos os campos", () => {
    expect(parseEncerramentoErroCadastro(valido)).toEqual(valido);
  });

  it("não introduz fallback (retorna o dado recebido)", () => {
    expect(parseEncerramentoErroCadastro(valido)).toBe(valido);
  });
});

// ============================================================================
// 2. parseMensagemManual
// ============================================================================

describe("Q1-C6 contratos — parseMensagemManual", () => {
  const base = {
    ok: true,
    fila_id: "f1",
    assistido_id: "a1",
    assistido_nome: "Fulano",
    telefone: "5599999",
    status: "enfileirado",
    origem_manual: "manual",
    enviado_por: "u1",
  };

  it("preserva o shape completo, incluindo assistido_nome", () => {
    const r = parseMensagemManual(base);
    expect(r).toEqual(base);
    expect(r.assistido_nome).toBe("Fulano");
  });

  it("preserva assistido_nome quando vier null", () => {
    const r = parseMensagemManual({ ...base, assistido_nome: null });
    expect(r.assistido_nome).toBeNull();
  });
});

// ============================================================================
// 3. encerrarItemFilaErroCadastro (payload + propagação de erro)
// ============================================================================

describe("Q1-C6 service — encerrarItemFilaErroCadastro", () => {
  it("envia payload com p_motivo fixo e p_observacao preenchido", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, fila_id: "f1" }, error: null });
    await encerrarItemFilaErroCadastro("f1", "  duplicado  ");
    expect(rpcMock).toHaveBeenCalledWith("fn_encerrar_item_fila_erro_cadastro", {
      p_fila_id: "f1",
      p_motivo: "erro_cadastro",
      p_observacao: "duplicado",
    });
  });

  it("envia p_observacao como null quando vazio", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
    await encerrarItemFilaErroCadastro("f1", "   ");
    expect(rpcMock).toHaveBeenCalledWith("fn_encerrar_item_fila_erro_cadastro", {
      p_fila_id: "f1",
      p_motivo: "erro_cadastro",
      p_observacao: null,
    });
  });

  it("propaga erro técnico da RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("permissao_negada") });
    await expect(encerrarItemFilaErroCadastro("f1")).rejects.toThrow("permissao_negada");
  });
});

// ============================================================================
// 4. enfileirarMensagemManual (payload + propagação de erro)
// ============================================================================

describe("Q1-C6 service — enfileirarMensagemManual", () => {
  it("envia payload correto com p_observacao preenchido", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, assistido_nome: "X" }, error: null });
    await enfileirarMensagemManual({ assistidoId: "a1", mensagem: "oi", observacao: "  nota  " });
    expect(rpcMock).toHaveBeenCalledWith("fn_enfileirar_mensagem_manual", {
      p_assistido_id: "a1",
      p_mensagem: "oi",
      p_observacao: "nota",
    });
  });

  it("envia p_observacao como null quando vazio/ausente", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
    await enfileirarMensagemManual({ assistidoId: "a1", mensagem: "oi" });
    expect(rpcMock).toHaveBeenCalledWith("fn_enfileirar_mensagem_manual", {
      p_assistido_id: "a1",
      p_mensagem: "oi",
      p_observacao: null,
    });
  });

  it("propaga erro técnico da RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("consentimento_ausente") });
    await expect(
      enfileirarMensagemManual({ assistidoId: "a1", mensagem: "oi" }),
    ).rejects.toThrow("consentimento_ausente");
  });
});
