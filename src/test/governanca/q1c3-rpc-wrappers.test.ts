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

import { souComunicadorElegivel } from "@/services/notificacoes/comunicadorService";
import {
  registrarAvisoAusencia,
  tratarAvisoAusencia,
  listarAvisosAusenciaPendentes,
} from "@/services/avisos/avisosAusenciaService";
import { listConversasEnriquecidas } from "@/services/notificacoes/notificacoesService";

beforeEach(() => {
  rpcMock.mockReset();
});

describe("Q1-C3 comunicadorService — sou_comunicador_elegivel", () => {
  it("envia o nome da RPC sem argumentos e normaliza retorno true", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const r = await souComunicadorElegivel();
    expect(rpcMock).toHaveBeenCalledWith("sou_comunicador_elegivel");
    expect(r).toBe(true);
  });

  it("normaliza retorno falsy para false", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    expect(await souComunicadorElegivel()).toBe(false);
  });

  it("propaga erro técnico de supabase.rpc", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(souComunicadorElegivel()).rejects.toMatchObject({ message: "boom" });
  });
});

describe("Q1-C3 avisosAusenciaService — payloads e retornos", () => {
  it("registrarAvisoAusencia envia payload esperado e retorna id/status", async () => {
    rpcMock.mockResolvedValue({ data: { id: "a1", status: "aberto" }, error: null });
    const r = await registrarAvisoAusencia({
      tipoCompromisso: "sessao",
      compromissoId: "c1",
      motivo: "não posso",
    });
    expect(rpcMock).toHaveBeenCalledWith("fn_registrar_aviso_ausencia", {
      p_tipo_compromisso: "sessao",
      p_compromisso_id: "c1",
      p_motivo: "não posso",
    });
    expect(r).toEqual({ id: "a1", status: "aberto" });
  });

  it("registrarAvisoAusencia usa null quando motivo ausente", async () => {
    rpcMock.mockResolvedValue({ data: { id: "a2", status: "aberto" }, error: null });
    await registrarAvisoAusencia({ tipoCompromisso: "entrevista", compromissoId: "c2" });
    expect(rpcMock).toHaveBeenCalledWith("fn_registrar_aviso_ausencia", {
      p_tipo_compromisso: "entrevista",
      p_compromisso_id: "c2",
      p_motivo: null,
    });
  });

  it("tratarAvisoAusencia envia payload esperado com status", async () => {
    rpcMock.mockResolvedValue({ data: { id: "a1", status: "resolvido" }, error: null });
    const r = await tratarAvisoAusencia({
      avisoId: "a1",
      novoStatus: "resolvido",
      resolucao: "ok",
    });
    expect(rpcMock).toHaveBeenCalledWith("fn_tratar_aviso_ausencia", {
      p_aviso_id: "a1",
      p_novo_status: "resolvido",
      p_resolucao: "ok",
    });
    expect(r.status).toBe("resolvido");
  });

  it("tratarAvisoAusencia rejeita status inválido sem chamar a RPC", async () => {
    await expect(
      // @ts-expect-error status fora do contrato de tratamento
      tratarAvisoAusencia({ avisoId: "a1", novoStatus: "aberto" }),
    ).rejects.toThrow("status_invalido");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("listarAvisosAusenciaPendentes envia flag e retorna lista", async () => {
    rpcMock.mockResolvedValue({ data: [{ id: "a1", status: "aberto" }], error: null });
    const r = await listarAvisosAusenciaPendentes(true);
    expect(rpcMock).toHaveBeenCalledWith("fn_avisos_ausencia_pendentes", {
      p_incluir_resolvidos: true,
    });
    expect(r).toHaveLength(1);
  });

  it("listarAvisosAusenciaPendentes propaga erro técnico", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rls" } });
    await expect(listarAvisosAusenciaPendentes()).rejects.toMatchObject({ message: "rls" });
  });
});

describe("Q1-C3 notificacoesService — painel_conversas", () => {
  it("envia todos os filtros e normaliza o resultado", async () => {
    rpcMock.mockResolvedValue({
      data: { autorizado: true, total: 2, rows: [{ id: "x" }] },
      error: null,
    });
    const r = await listConversasEnriquecidas({ status: "aberta", busca: " oi " });
    expect(rpcMock).toHaveBeenCalledWith(
      "painel_conversas",
      expect.objectContaining({
        p_status: "aberta",
        p_busca: "oi",
        p_limit: 300,
      }),
    );
    expect(r).toEqual({ autorizado: true, total: 2, rows: [{ id: "x" }] });
  });

  it("retorna estrutura vazia segura quando data é nulo", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const r = await listConversasEnriquecidas();
    expect(r).toEqual({ autorizado: false, total: 0, rows: [] });
  });

  it("propaga erro técnico de supabase.rpc", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(listConversasEnriquecidas()).rejects.toMatchObject({ message: "denied" });
  });
});
