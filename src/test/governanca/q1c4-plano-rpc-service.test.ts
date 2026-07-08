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
  registrarPresencaRpc,
  registrarAusenciaRpc,
  rollbackPilotoRpc,
  homologacaoAuditarRpc,
} from "@/services/agendaPlano/planoRpcService";
import {
  getComunicacaoGeralAtiva,
  setComunicacaoGeralAtiva,
} from "@/services/notificacoes/notificacoesService";
import { _setCurrentInstituicaoId } from "@/lib/tenant/currentTenant";

const TENANT = "00000000-0000-0000-0000-0000000000e2";

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  _setCurrentInstituicaoId(TENANT);
});

describe("Q1-C4 planoRpcService — pts_registrar_presenca", () => {
  it("envia o payload esperado e normaliza o retorno", async () => {
    rpcMock.mockResolvedValue({
      data: { concluido: true, quantidade_realizada: 3, quantidade_total: 5 },
      error: null,
    });
    const r = await registrarPresencaRpc({
      vinculoId: "v1",
      data: "2026-07-06",
      registradoPor: "u1",
      proximaNumeroEtapa: 4,
      proximaData: "2026-07-13",
      proximaHorario: "19:30",
    });
    expect(rpcMock).toHaveBeenCalledWith("pts_registrar_presenca", {
      p_vinculo_id: "v1",
      p_data: "2026-07-06",
      p_registrado_por: "u1",
      p_proxima_numero_etapa: 4,
      p_proxima_data: "2026-07-13",
      p_proxima_horario: "19:30",
      p_instituicao_id: TENANT,
    });
    expect(r).toEqual({ concluido: true, quantidade_realizada: 3, quantidade_total: 5 });
  });

  it("normaliza retorno vazio para defaults seguros", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const r = await registrarPresencaRpc({ vinculoId: "v1", data: "2026-07-06", registradoPor: "u1" });
    expect(rpcMock).toHaveBeenCalledWith("pts_registrar_presenca", {
      p_vinculo_id: "v1",
      p_data: "2026-07-06",
      p_registrado_por: "u1",
      p_proxima_numero_etapa: undefined,
      p_proxima_data: undefined,
      p_proxima_horario: undefined,
      p_instituicao_id: TENANT,
    });
    expect(r).toEqual({ concluido: false, quantidade_realizada: 0, quantidade_total: 0 });
  });

  it("propaga erro técnico do supabase", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(
      registrarPresencaRpc({ vinculoId: "v1", data: "2026-07-06", registradoPor: "u1" }),
    ).rejects.toMatchObject({ message: "boom" });
  });
});

describe("Q1-C4 planoRpcService — pts_registrar_ausencia", () => {
  it("envia o payload esperado e normaliza o retorno", async () => {
    rpcMock.mockResolvedValue({
      data: { suspenso: true, faltas_consecutivas: 2, remarcacoes_automaticas: 1 },
      error: null,
    });
    const r = await registrarAusenciaRpc({
      vinculoId: "v2",
      data: "2026-07-06",
      registradoPor: "u1",
      novaData: "2026-07-13",
      novaHorario: "20:00",
    });
    expect(rpcMock).toHaveBeenCalledWith("pts_registrar_ausencia", {
      p_vinculo_id: "v2",
      p_data: "2026-07-06",
      p_registrado_por: "u1",
      p_nova_data: "2026-07-13",
      p_nova_horario: "20:00",
      p_instituicao_id: TENANT,
    });
    expect(r).toEqual({ suspenso: true, faltas_consecutivas: 2, remarcacoes_automaticas: 1 });
  });

  it("normaliza retorno vazio para defaults seguros", async () => {
    rpcMock.mockResolvedValue({ data: {}, error: null });
    const r = await registrarAusenciaRpc({ vinculoId: "v2", data: "2026-07-06", registradoPor: "u1" });
    expect(r).toEqual({ suspenso: false, faltas_consecutivas: 0, remarcacoes_automaticas: 0 });
  });

  it("propaga erro técnico do supabase", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "falhou" } });
    await expect(
      registrarAusenciaRpc({ vinculoId: "v2", data: "2026-07-06", registradoPor: "u1" }),
    ).rejects.toMatchObject({ message: "falhou" });
  });
});

describe("Q1-C4 planoRpcService — pts_rollback_piloto", () => {
  it("envia o assistido e normaliza o retorno", async () => {
    rpcMock.mockResolvedValue({
      data: { sessoes_removidas: 4, sessoes_restauradas: 10, etapas_removidas: 2 },
      error: null,
    });
    const r = await rollbackPilotoRpc("a1");
    expect(rpcMock).toHaveBeenCalledWith("pts_rollback_piloto", { p_assistido_id: "a1" });
    expect(r).toEqual({ sessoes_removidas: 4, sessoes_restauradas: 10, etapas_removidas: 2 });
  });

  it("normaliza retorno vazio para defaults seguros", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const r = await rollbackPilotoRpc("a1");
    expect(r).toEqual({ sessoes_removidas: 0, sessoes_restauradas: 0, etapas_removidas: 0 });
  });

  it("propaga erro técnico do supabase", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rollback erro" } });
    await expect(rollbackPilotoRpc("a1")).rejects.toMatchObject({ message: "rollback erro" });
  });
});

describe("Q1-C4 planoRpcService — pts_homologacao_auditar", () => {
  it("envia payload com resultado", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await homologacaoAuditarRpc({
      assistidoId: "a1",
      acao: "PLANO_PREVIA_HOMOLOGACAO",
      resultado: { total_planos: 2 },
    });
    expect(rpcMock).toHaveBeenCalledWith("pts_homologacao_auditar", {
      p_assistido_id: "a1",
      p_acao: "PLANO_PREVIA_HOMOLOGACAO",
      p_resultado: { total_planos: 2 },
    });
  });

  it("envia p_resultado undefined quando ausente", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await homologacaoAuditarRpc({ assistidoId: "a1", acao: "X" });
    expect(rpcMock).toHaveBeenCalledWith("pts_homologacao_auditar", {
      p_assistido_id: "a1",
      p_acao: "X",
      p_resultado: undefined,
    });
  });

  it("propaga erro técnico do supabase", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "audit erro" } });
    await expect(
      homologacaoAuditarRpc({ assistidoId: "a1", acao: "X" }),
    ).rejects.toMatchObject({ message: "audit erro" });
  });
});

describe("Q1-C4 notificacoesService — comunicacao_geral_ativa tipado", () => {
  it("lê comunicacao_geral_ativa (default true sem registro)", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });

    const r = await getComunicacaoGeralAtiva("a1");
    expect(fromMock).toHaveBeenCalledWith("notificacoes_preferencias");
    expect(select).toHaveBeenCalledWith("comunicacao_geral_ativa");
    expect(eq).toHaveBeenCalledWith("assistido_id", "a1");
    expect(r).toBe(true);
  });

  it("lê comunicacao_geral_ativa = false quando desativado", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { comunicacao_geral_ativa: false },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });

    expect(await getComunicacaoGeralAtiva("a1")).toBe(false);
  });

  it("escreve comunicacao_geral_ativa via upsert tipado", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ upsert });

    await setComunicacaoGeralAtiva("a1", false);
    expect(fromMock).toHaveBeenCalledWith("notificacoes_preferencias");
    expect(upsert).toHaveBeenCalledWith(
      { assistido_id: "a1", comunicacao_geral_ativa: false },
      { onConflict: "assistido_id" },
    );
  });

  it("propaga erro técnico na escrita", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: "upsert erro" } });
    fromMock.mockReturnValue({ upsert });
    await expect(setComunicacaoGeralAtiva("a1", true)).rejects.toMatchObject({
      message: "upsert erro",
    });
  });
});
