import { describe, it, expect, vi, beforeEach } from "vitest";

let lastRpc: { fn: string; args: Record<string, unknown> } | null = null;
let rpcPayload: unknown;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      lastRpc = { fn, args };
      return Promise.resolve({ data: rpcPayload, error: null });
    },
  },
}));

vi.mock("@/lib/tenant/currentTenant", () => ({
  requireInstituicaoId: () => "inst-e4",
  getCurrentInstituicaoId: () => "inst-e4",
}));

import { fetchAdminDashboard, getPeriodRange } from "./adminDashboard";


const fullPayload = {
  autorizado: true,
  assistidos_total: 120,
  trat_ativos: 30,
  trat_concluidos: 8,
  ent_agendadas: 5,
  presencas_hoje: 12,
  lista_espera: 4,
  aguardando_agend: 3,
  faltas_mes: 9,
  publico_palestras: 200,
  ent_recentes: [
    { id: "e1", data: "2025-06-01T10:00:00", status: "realizada", assistido_id: "a1", entrevistador_id: "u1", tipo_entrevista: "regular", assistido_nome: "Ana", entrevistador_nome: "Carlos" },
  ],
  trat_por_tipo: [{ nome: "Passe", count: 20 }, { nome: "Água", count: 10 }],
  carga_tarefeiros: [{ nome: "Carlos", total: 18 }],
  presenca_pontos: [{ data: "2025-06-01", presentes: 8, ausentes: 2 }],
  entrevistas_por_tipo: { regulares: 4, livres: 1, realizadas: 3, total: 5 },
  faixa_etaria: [{ name: "25–34", value: 40 }, { name: "35–44", value: 30 }],
};

describe("fetchAdminDashboard", () => {
  beforeEach(() => { lastRpc = null; });

  it("chama a RPC com o período resolvido", async () => {
    rpcPayload = fullPayload;
    await fetchAdminDashboard("mes");
    const range = getPeriodRange("mes");
    expect(lastRpc?.fn).toBe("dashboard_admin");
    expect(lastRpc?.args).toEqual({
      p_inicio: range.start,
      p_fim: range.end,
      p_instituicao_id: "inst-e4",
    });
  });

  it("mapeia cards, gráficos e listas do payload server-side", async () => {
    rpcPayload = fullPayload;
    const res = await fetchAdminDashboard("mes");
    expect(res.assistidosTotal).toBe(120);
    expect(res.tratAtivos).toBe(30);
    expect(res.faltasMes).toBe(9);
    expect(res.tratPorTipo[0]).toEqual({ nome: "Passe", count: 20 });
    expect(res.cargaTarefeiros[0]).toEqual({ nome: "Carlos", total: 18 });
    expect(res.entrevistasPorTipo).toEqual({ regulares: 4, livres: 1, realizadas: 3, total: 5 });
    expect(res.faixaEtaria).toHaveLength(2);
    expect(res.presencaPontos[0]).toEqual({ data: "2025-06-01", presentes: 8, ausentes: 2 });
    expect(res.entRecentes[0].assistido_nome).toBe("Ana");
  });

  it("retorna estrutura vazia quando não autorizado", async () => {
    rpcPayload = { autorizado: false };
    const res = await fetchAdminDashboard("mes");
    expect(res.assistidosTotal).toBe(0);
    expect(res.tratPorTipo).toEqual([]);
    expect(res.entrevistasPorTipo).toEqual({ regulares: 0, livres: 0, realizadas: 0, total: 0 });
  });
});
