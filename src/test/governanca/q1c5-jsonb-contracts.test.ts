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
  parseConversasResultado,
  parsePainelWhatsapp,
  parsePainelV2,
} from "@/services/notificacoes/notificacoesContracts";
import { parseRolloutMonitor } from "@/services/programacao/excecoesContracts";
import { parsePessoaCandidatas } from "@/services/voluntarios/voluntariosContracts";
import {
  listConversasEnriquecidas,
  getPainelWhatsapp,
  getPainelWhatsappV2,
} from "@/services/notificacoes/notificacoesService";
import { obterRolloutMonitor } from "@/services/programacao/excecoesService";
import { buscarPessoaParaVoluntario } from "@/services/voluntarios/voluntariosService";
import { _setCurrentInstituicaoId } from "@/lib/tenant/currentTenant";

const FAKE_INST_ID = "00000000-0000-0000-0000-00000000c001";

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  // SAAS-05-E1: services de tenant exigem instituição ativa (fail-closed).
  _setCurrentInstituicaoId(FAKE_INST_ID);
});

// ============================================================================
// 1. Painéis WhatsApp / Conversas — contratos com gate de autorização
// ============================================================================

describe("Q1-C5 contratos — parseConversasResultado", () => {
  it("normaliza retorno autorizado com linhas", () => {
    const r = parseConversasResultado({
      autorizado: true,
      total: 2,
      rows: [{ id: "c1" }, { id: "c2" }],
    });
    expect(r.autorizado).toBe(true);
    expect(r.total).toBe(2);
    expect(r.rows).toHaveLength(2);
  });

  it("preserva fallback { autorizado:false, total:0, rows:[] } quando null", () => {
    expect(parseConversasResultado(null)).toEqual({ autorizado: false, total: 0, rows: [] });
  });

  it("preserva fallback quando retorno inesperado (campos ausentes)", () => {
    const r = parseConversasResultado({ autorizado: true });
    expect(r).toEqual({ autorizado: true, total: 0, rows: [] });
  });

  it("retorno não autorizado mantém autorizado=false", () => {
    const r = parseConversasResultado({ autorizado: false, total: 0, rows: [] });
    expect(r.autorizado).toBe(false);
  });
});

describe("Q1-C5 contratos — parsePainelWhatsapp", () => {
  it("mantém o shape autorizado retornado pela RPC", () => {
    const payload = { autorizado: true, operacional: { geradas: 5, enviadas: 4, falhas: 1 } };
    expect(parsePainelWhatsapp(payload)).toBe(payload);
  });

  it("preserva fallback { autorizado:false } quando null", () => {
    expect(parsePainelWhatsapp(null)).toEqual({ autorizado: false });
  });
});

describe("Q1-C5 contratos — parsePainelV2", () => {
  it("mantém o shape autorizado retornado pela RPC", () => {
    const payload = { autorizado: true, periodo: { inicio: "a", fim: "b", dias: 7 } };
    expect(parsePainelV2(payload)).toBe(payload);
  });

  it("preserva fallback { autorizado:false } quando null", () => {
    expect(parsePainelV2(null)).toEqual({ autorizado: false });
  });
});

describe("Q1-C5 notificacoesService — RPCs sensíveis", () => {
  it("listConversasEnriquecidas normaliza retorno da RPC painel_conversas", async () => {
    rpcMock.mockResolvedValue({
      data: { autorizado: true, total: 1, rows: [{ id: "c1" }] },
      error: null,
    });
    const r = await listConversasEnriquecidas({});
    expect(rpcMock).toHaveBeenCalledWith("painel_conversas", expect.any(Object));
    expect(r).toEqual({ autorizado: true, total: 1, rows: [{ id: "c1" }] });
  });

  it("listConversasEnriquecidas cai no fallback quando RPC devolve null", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const r = await listConversasEnriquecidas({});
    expect(r).toEqual({ autorizado: false, total: 0, rows: [] });
  });

  it("getPainelWhatsapp cai no fallback { autorizado:false } quando null", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const r = await getPainelWhatsapp("2026-01-01", "2026-01-31");
    expect(r).toEqual({ autorizado: false });
  });

  it("getPainelWhatsappV2 cai no fallback { autorizado:false } quando null", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const r = await getPainelWhatsappV2("2026-01-01", "2026-01-31");
    expect(r).toEqual({ autorizado: false });
  });

  it("propaga erro da RPC (painel_conversas)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("negado") });
    await expect(listConversasEnriquecidas({})).rejects.toThrow("negado");
  });
});

// ============================================================================
// 2. Rollout / kill-switch — RolloutMonitor
// ============================================================================

describe("Q1-C5 contratos — parseRolloutMonitor", () => {
  const valido = {
    rollout_ativo: true,
    desde: "2026-06-01T00:00:00Z",
    excecoes_processadas: 3,
    cancelamentos: 1,
    remarcacoes: 2,
    fila_por_status: { pendente: 4 },
    fila_por_evento: { cancelamento: 1 },
    fallback_por_nome: 0,
    publico_com_alvo: 5,
    dedupe_duplicados: 0,
  };

  it("preserva integralmente o contrato do monitoramento", () => {
    expect(parseRolloutMonitor(valido)).toEqual(valido);
  });

  it("obterRolloutMonitor usa a RPC fn_monitor_excecao_notificacoes com p_instituicao_id", async () => {
    rpcMock.mockResolvedValue({ data: valido, error: null });
    const r = await obterRolloutMonitor(14);
    expect(rpcMock).toHaveBeenCalledWith(
      "fn_monitor_excecao_notificacoes",
      expect.objectContaining({
        p_desde: expect.any(String),
        p_instituicao_id: FAKE_INST_ID,
      }),
    );
    expect(r).toEqual(valido);
  });

  it("obterRolloutMonitor propaga erro da RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("falha") });
    await expect(obterRolloutMonitor()).rejects.toThrow("falha");
  });
});

// ============================================================================
// 3. Busca de pessoa para voluntário — PessoaCandidata[] (LGPD)
// ============================================================================

describe("Q1-C5 contratos — parsePessoaCandidatas", () => {
  it("retorna a lista preservando os campos esperados", () => {
    const lista = [
      { origem: "assistido", origem_id: "a1", nome: "Fulano", cpf: "123", celular: "999" },
    ];
    const r = parsePessoaCandidatas(lista);
    expect(r).toHaveLength(1);
    expect(r[0].origem).toBe("assistido");
    expect(r[0].nome).toBe("Fulano");
  });

  it("preserva fallback de lista vazia quando null", () => {
    expect(parsePessoaCandidatas(null)).toEqual([]);
  });

  it("preserva fallback de lista vazia quando undefined", () => {
    expect(parsePessoaCandidatas(undefined)).toEqual([]);
  });

  it("buscarPessoaParaVoluntario usa a RPC fn_buscar_pessoa_para_voluntario com p_instituicao_id", async () => {
    const lista = [{ origem: "usuario", origem_id: "u1", nome: "Ciclano" }];
    rpcMock.mockResolvedValue({ data: lista, error: null });
    const r = await buscarPessoaParaVoluntario("cicl");
    expect(rpcMock).toHaveBeenCalledWith("fn_buscar_pessoa_para_voluntario", {
      p_termo: "cicl",
      p_instituicao_id: FAKE_INST_ID,
    });
    expect(r).toEqual(lista);
  });

  it("buscarPessoaParaVoluntario retorna [] quando RPC devolve null", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    expect(await buscarPessoaParaVoluntario("x")).toEqual([]);
  });

  it("buscarPessoaParaVoluntario propaga erro da RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("erro") });
    await expect(buscarPessoaParaVoluntario("x")).rejects.toThrow("erro");
  });
});
