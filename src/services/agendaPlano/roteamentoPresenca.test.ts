import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Testes do roteador operacional de presença/ausência.
 * Mock do client supabase com query builder encadeável + captura de RPCs,
 * no mesmo estilo de orquestracao.test.ts. A regra de plano oficial não é
 * mockada; apenas controlamos as linhas de tabela e capturamos as RPCs.
 */

type Row = Record<string, unknown>;
const tableData: Record<string, Row[]> = {};
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

function makeBuilder(table: string) {
  const rows = () => tableData[table] ?? [];
  const result = () => ({ data: rows(), count: rows().length, error: null });
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "order", "limit", "neq", "gte", "head"]) {
    builder[m] = () => builder;
  }
  // select com { count, head } retorna a contagem ao ser "await"-ado.
  builder.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  builder.single = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: { success: true }, error: null });
    },
  },
}));

import { registrarPresencaRoteada } from "./orquestracao";
import { _setCurrentInstituicaoId } from "@/lib/tenant/currentTenant";

const VINC = "00000000-0000-0000-0000-0000000000a1";
const ASSIST = "00000000-0000-0000-0000-000000000001";
const TIPO = "00000000-0000-0000-0000-0000000000b1";
const TENANT = "00000000-0000-0000-0000-0000000000e2";

function resetData() {
  for (const k of Object.keys(tableData)) delete tableData[k];
  rpcCalls.length = 0;
  _setCurrentInstituicaoId(TENANT);
}

/** Configura o backend simulado: gate do assistido + existência de plano. */
function setup(opts: { gate: boolean; temPlano: boolean; tipo?: string; holisticoHorario?: string }) {
  tableData["assistido_tratamentos"] = [
    { id: VINC, assistido_id: ASSIST, tratamento_id: TIPO, quantidade_total: 7, quantidade_realizada: 1 },
  ];
  tableData["assistidos"] = [{ id: ASSIST, usa_agenda_plano: opts.gate }];
  tableData["plano_tratamento_sessoes"] = opts.temPlano
    ? [{ status_etapa: "ativa", numero_etapa: 2, horario_previsto: "20:00", agenda_sessao_id: null }]
    : [];
  tableData["tipos_tratamento"] = [
    {
      id: TIPO,
      tipo: opts.tipo ?? "espiritual",
      dia_semana: 2,
      horario: opts.holisticoHorario ?? "20:00",
      frequencia_valor: 1,
      frequencia_unidade: "semana",
    },
  ];
  tableData["agenda_tratamentos_assistido"] = [];
}

describe("roteamentoPresenca — novo modelo (gate + plano)", () => {
  beforeEach(resetData);

  it("presença → pts_registrar_presenca e nunca registrar_presenca legado", async () => {
    setup({ gate: true, temPlano: true });
    const res = await registrarPresencaRoteada({
      vinculoId: VINC, status: "presente", data: "2026-06-22", registradoPor: ASSIST,
    });
    expect(res.rota).toBe("plano");
    expect(rpcCalls.some((c) => c.fn === "pts_registrar_presenca")).toBe(true);
    expect(rpcCalls.some((c) => c.fn === "registrar_presenca")).toBe(false);
  });

  it("ausência → pts_registrar_ausencia com p_nova_data; remarcacaoAplicavel", async () => {
    setup({ gate: true, temPlano: true });
    const res = await registrarPresencaRoteada({
      vinculoId: VINC, status: "ausente", data: "2026-06-22", registradoPor: ASSIST,
    });
    expect(res.rota).toBe("plano");
    expect(res.remarcacaoAplicavel).toBe(true);
    const aus = rpcCalls.find((c) => c.fn === "pts_registrar_ausencia");
    expect(aus).toBeDefined();
    expect(aus?.args.p_nova_data).toBeTruthy();
    expect(rpcCalls.some((c) => c.fn === "registrar_presenca")).toBe(false);
  });

  it("uma invocação gera uma única chamada de gravação (idempotência de disparo)", async () => {
    setup({ gate: true, temPlano: true });
    await registrarPresencaRoteada({ vinculoId: VINC, status: "presente", data: "2026-06-22", registradoPor: ASSIST });
    expect(rpcCalls.filter((c) => c.fn === "pts_registrar_presenca")).toHaveLength(1);
  });

  it("holístico: envia horário com precedência (sessão atual > plano > tipo)", async () => {
    setup({ gate: true, temPlano: true, tipo: "holistico", holisticoHorario: "09:00" });
    // etapa ativa tem agenda vinculada com horário efetivo 14:30 (override por sessão)
    tableData["plano_tratamento_sessoes"] = [
      { status_etapa: "ativa", numero_etapa: 2, horario_previsto: "10:00", agenda_sessao_id: "sess-1" },
    ];
    tableData["agenda_tratamentos_assistido"] = [{ id: "sess-1", horario: "14:30" }];
    await registrarPresencaRoteada({ vinculoId: VINC, status: "ausente", data: "2026-06-22", registradoPor: ASSIST });
    const aus = rpcCalls.find((c) => c.fn === "pts_registrar_ausencia");
    expect(aus?.args.p_nova_horario).toBe("14:30");
  });
});

describe("roteamentoPresenca — legado", () => {
  beforeEach(resetData);

  it("plano existe mas gate inativo → legado; nunca pts_*", async () => {
    setup({ gate: false, temPlano: true });
    const res = await registrarPresencaRoteada({
      vinculoId: VINC, status: "presente", data: "2026-06-22", registradoPor: ASSIST,
    });
    expect(res.rota).toBe("legado");
    expect(rpcCalls.some((c) => c.fn.startsWith("pts_registrar"))).toBe(false);
    expect(rpcCalls.some((c) => c.fn === "registrar_presenca")).toBe(true);
  });

  it("gate ativo mas sem plano → legado; nunca pts_*", async () => {
    setup({ gate: true, temPlano: false });
    const res = await registrarPresencaRoteada({
      vinculoId: VINC, status: "ausente", data: "2026-06-22", registradoPor: ASSIST,
    });
    expect(res.rota).toBe("legado");
    expect(res.remarcacaoAplicavel).toBe(false);
    expect(rpcCalls.some((c) => c.fn.startsWith("pts_registrar"))).toBe(false);
    expect(rpcCalls.some((c) => c.fn === "registrar_presenca")).toBe(true);
  });

  it("sem plano e sem gate → legado; ausência com remarcacaoAplicavel=false", async () => {
    setup({ gate: false, temPlano: false });
    const res = await registrarPresencaRoteada({
      vinculoId: VINC, status: "ausente", data: "2026-06-22", registradoPor: ASSIST,
    });
    expect(res.rota).toBe("legado");
    expect(res.remarcacaoAplicavel).toBe(false);
  });

  it("revalida no serviço: hints stale da UI não forçam o novo modelo", async () => {
    // UI diz que é novo modelo, mas backend não tem gate nem plano.
    setup({ gate: false, temPlano: false });
    const res = await registrarPresencaRoteada({
      vinculoId: VINC, status: "ausente", data: "2026-06-22", registradoPor: ASSIST,
      temPlano: true, usaNovoModelo: true,
    });
    expect(res.rota).toBe("legado");
    expect(rpcCalls.some((c) => c.fn.startsWith("pts_registrar"))).toBe(false);
  });
});
