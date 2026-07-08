import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testes do painel de homologação controlada (serviço).
 * Mock do client supabase com um query builder encadeável + captura de RPCs.
 * A regra de plano (construirPlanoConsolidado) NÃO é mockada: é a oficial.
 */

type Row = Record<string, unknown>;
const tableData: Record<string, Row[]> = {};
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
let rpcError: string | null = null;

function makeBuilder(table: string) {
  const result = () => ({
    data: tableData[table] ?? [],
    count: (tableData[table] ?? []).length,
    error: null,
  });
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "order", "limit", "neq", "gte"]) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = () =>
    Promise.resolve({ data: (tableData[table] ?? [])[0] ?? null, error: null });
  builder.single = () =>
    Promise.resolve({ data: (tableData[table] ?? [])[0] ?? null, error: null });
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: { success: true }, error: rpcError ? { message: rpcError } : null });
    },
  },
}));

import {
  obterGateHomologacao,
  gerarPreviaConversao,
  avaliarSegurancaRollback,
  rollbackControladoPlano,
  reprocessarAssistidoHomologacao,
} from "./orquestracao";
import { _setCurrentInstituicaoId } from "@/lib/tenant/currentTenant";

const ASSISTIDO = "00000000-0000-0000-0000-000000000001";
const VINC = "00000000-0000-0000-0000-0000000000a1";
const TIPO = "00000000-0000-0000-0000-0000000000b1";
const TENANT = "00000000-0000-0000-0000-0000000000e2";

function resetData() {
  for (const k of Object.keys(tableData)) delete tableData[k];
  rpcCalls.length = 0;
  rpcError = null;
  _setCurrentInstituicaoId(TENANT);
}

describe("homologação — gate", () => {
  beforeEach(resetData);

  it("lê gate global e por assistido", async () => {
    tableData["regras_operacionais"] = [{ valor: "false" }];
    tableData["assistidos"] = [{ usa_agenda_plano: true }];
    const g = await obterGateHomologacao(ASSISTIDO);
    expect(g.global_ativo).toBe(false);
    expect(g.assistido_ativo).toBe(true);
  });

  it("reconhece flag global ativa", async () => {
    tableData["regras_operacionais"] = [{ valor: "true" }];
    tableData["assistidos"] = [{ usa_agenda_plano: false }];
    const g = await obterGateHomologacao(ASSISTIDO);
    expect(g.global_ativo).toBe(true);
    expect(g.assistido_ativo).toBe(false);
  });
});

describe("homologação — prévia obrigatória", () => {
  beforeEach(resetData);

  it("monta itens respeitando a quantidade parametrizada e audita a consulta", async () => {
    tableData["assistido_tratamentos"] = [
      {
        id: VINC,
        tratamento_id: TIPO,
        status: "em_andamento",
        quantidade_total: 7,
        quantidade_realizada: 2,
      },
    ];
    tableData["tipos_tratamento"] = [
      {
        id: TIPO,
        nome: "Desobsessão",
        modo_agendamento: "sequencial_bloqueante",
        tratamento_livre: false,
        ordem_tratamento: 1,
        dia_semana: 2,
        horario: "20:00",
        frequencia_valor: 1,
        frequencia_unidade: "semana",
        trabalho_publico: false,
        permite_entrada_sem_agendamento: false,
        quantidade_padrao_sessoes: 7,
      },
    ];
    tableData["plano_tratamento_sessoes"] = [];
    tableData["agenda_tratamentos_assistido"] = [];

    const previa = await gerarPreviaConversao(ASSISTIDO);
    expect(previa.itens).toHaveLength(1);
    const item = previa.itens[0];
    expect(item.tratamento_nome).toBe("Desobsessão");
    expect(item.quantidade_parametrizada).toBe(7);
    expect(item.etapas_previstas).toBe(7);
    // 2 já realizadas → a próxima etapa ativa é a nº 3
    expect(item.etapa_ativa_numero).toBe(3);
    expect(item.publico_livre).toBe(false);
    // audita a prévia
    const audit = rpcCalls.find((c) => c.fn === "pts_homologacao_auditar");
    expect(audit?.args.p_acao).toBe("PLANO_PREVIA_HOMOLOGACAO");
  });

  it("lança erro quando não há tratamentos ativos", async () => {
    tableData["assistido_tratamentos"] = [];
    await expect(gerarPreviaConversao(ASSISTIDO)).rejects.toThrow();
  });
});

describe("homologação — segurança de rollback", () => {
  beforeEach(resetData);

  it("é seguro quando não houve avanço (sem realizadas/ausentes/presenças)", async () => {
    tableData["plano_tratamento_sessoes"] = [{ status_etapa: "ativa" }, { status_etapa: "prevista" }];
    tableData["assistido_tratamentos"] = [{ id: VINC }];
    tableData["presencas_tratamentos"] = [];
    const s = await avaliarSegurancaRollback(ASSISTIDO);
    expect(s.seguro).toBe(true);
    expect(s.motivo).toBeNull();
  });

  it("bloqueia quando há etapa realizada", async () => {
    tableData["plano_tratamento_sessoes"] = [{ status_etapa: "realizada" }, { status_etapa: "ativa" }];
    tableData["assistido_tratamentos"] = [{ id: VINC }];
    tableData["presencas_tratamentos"] = [];
    const s = await avaliarSegurancaRollback(ASSISTIDO);
    expect(s.seguro).toBe(false);
    expect(s.etapas_realizadas).toBe(1);
    expect(s.motivo).toMatch(/reconcilia/i);
  });

  it("bloqueia quando há presença registrada", async () => {
    tableData["plano_tratamento_sessoes"] = [{ status_etapa: "ativa" }];
    tableData["assistido_tratamentos"] = [{ id: VINC }];
    tableData["presencas_tratamentos"] = [{ id: "p1" }];
    const s = await avaliarSegurancaRollback(ASSISTIDO);
    expect(s.seguro).toBe(false);
    expect(s.presencas_pos_conversao).toBe(1);
  });

  it("rollbackControlado recusa quando não é mais seguro (não chama RPC de rollback)", async () => {
    tableData["plano_tratamento_sessoes"] = [{ status_etapa: "realizada" }];
    tableData["assistido_tratamentos"] = [{ id: VINC }];
    tableData["presencas_tratamentos"] = [];
    await expect(rollbackControladoPlano(ASSISTIDO)).rejects.toThrow(/reconcilia/i);
    expect(rpcCalls.find((c) => c.fn === "pts_rollback_piloto")).toBeUndefined();
  });

  it("rollbackControlado executa pela porta única quando é seguro", async () => {
    tableData["plano_tratamento_sessoes"] = [{ status_etapa: "ativa" }];
    tableData["assistido_tratamentos"] = [{ id: VINC }];
    tableData["presencas_tratamentos"] = [];
    await rollbackControladoPlano(ASSISTIDO);
    expect(rpcCalls.find((c) => c.fn === "pts_rollback_piloto")).toBeDefined();
  });
});

describe("homologação — reprocessamento idempotente", () => {
  beforeEach(resetData);

  it("reconcilia e audita", async () => {
    tableData["assistido_tratamentos"] = [
      {
        id: VINC,
        tratamento_id: TIPO,
        status: "em_andamento",
        quantidade_total: 7,
        quantidade_realizada: 2,
      },
    ];
    tableData["tipos_tratamento"] = [
      {
        id: TIPO,
        nome: "Desobsessão",
        modo_agendamento: "sequencial_bloqueante",
        tratamento_livre: false,
        ordem_tratamento: 1,
        dia_semana: 2,
        horario: "20:00",
        frequencia_valor: 1,
        frequencia_unidade: "semana",
        trabalho_publico: false,
        permite_entrada_sem_agendamento: false,
      },
    ];
    tableData["plano_tratamento_sessoes"] = [];
    await reprocessarAssistidoHomologacao(ASSISTIDO);
    expect(rpcCalls.find((c) => c.fn === "pts_persistir_plano")).toBeDefined();
    const audit = rpcCalls.find((c) => c.fn === "pts_homologacao_auditar");
    expect(audit?.args.p_acao).toBe("PLANO_REPROCESSAMENTO_HOMOLOGACAO");
  });
});
