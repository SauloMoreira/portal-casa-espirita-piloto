import { describe, it, expect } from "vitest";
import {
  pct,
  truncar,
  calcularDelta,
  calcularJanelas,
  topN,
  categorizarFalha,
  agruparPadroesFalha,
  calcularImpacto,
  gerarBacklog,
  montarKpis,
  ROTULO_CATEGORIA,
  type ItemAmbiguidade,
  type MetricasIaWhatsapp,
} from "./whatsappMetricas";

describe("pct", () => {
  it("calcula percentual com 1 casa", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(50, 100)).toBe(50);
  });
  it("retorna 0 quando total <= 0", () => {
    expect(pct(5, 0)).toBe(0);
    expect(pct(5, -2)).toBe(0);
  });
});

describe("truncar", () => {
  it("mantém texto curto e normaliza espaços", () => {
    expect(truncar("  ola   mundo ")).toBe("ola mundo");
  });
  it("trunca com reticências respeitando max", () => {
    const r = truncar("abcdefghij", 5);
    expect(r).toBe("abcd…");
    expect(r.length).toBe(5);
  });
  it("lida com null/undefined", () => {
    expect(truncar(null)).toBe("");
    expect(truncar(undefined)).toBe("");
  });
});

describe("calcularDelta", () => {
  it("calcula subida com variação percentual", () => {
    const d = calcularDelta(120, 100);
    expect(d.diferenca).toBe(20);
    expect(d.variacaoPct).toBe(20);
    expect(d.direcao).toBe("subiu");
  });
  it("descida", () => {
    const d = calcularDelta(80, 100);
    expect(d.direcao).toBe("desceu");
    expect(d.variacaoPct).toBe(-20);
  });
  it("anterior zero e atual positivo -> variacaoPct null", () => {
    const d = calcularDelta(10, 0);
    expect(d.variacaoPct).toBeNull();
    expect(d.direcao).toBe("subiu");
  });
  it("ambos zero -> estavel", () => {
    const d = calcularDelta(0, 0);
    expect(d.direcao).toBe("estavel");
    expect(d.variacaoPct).toBe(0);
  });
});

describe("calcularJanelas", () => {
  it("gera janela atual e anterior contíguas", () => {
    const agora = new Date("2026-06-19T12:00:00.000Z");
    const { atual, anterior } = calcularJanelas(7, agora);
    expect(atual.fim).toBe(agora.toISOString());
    expect(atual.inicio).toBe(new Date("2026-06-12T12:00:00.000Z").toISOString());
    expect(anterior.fim).toBe(atual.inicio);
    expect(anterior.inicio).toBe(new Date("2026-06-05T12:00:00.000Z").toISOString());
  });
});

describe("topN", () => {
  it("ordena por total desc e limita", () => {
    const itens = [{ total: 1 }, { total: 9 }, { total: 5 }];
    expect(topN(itens, 2)).toEqual([{ total: 9 }, { total: 5 }]);
  });
  it("aplica teto de 20", () => {
    const itens = Array.from({ length: 30 }, (_, i) => ({ total: i }));
    expect(topN(itens, 50).length).toBe(20);
  });
  it("lida com lista vazia/undefined", () => {
    expect(topN([] as { total: number }[])).toEqual([]);
    expect(topN(undefined as unknown as { total: number }[])).toEqual([]);
  });
});

describe("categorizarFalha", () => {
  it("pessoal sem identificação", () => {
    expect(categorizarFalha({ texto: "tenho tratamento hoje?", escopo: "pessoal" }))
      .toBe("pessoal_sem_identificacao");
  });
  it("desambiguação público x pessoal (escopo ambíguo + atividade)", () => {
    expect(categorizarFalha({ texto: "e a desobsessão?", escopo: "ambiguo" }))
      .toBe("desambiguacao_publico_pessoal");
  });
  it("erro temporal", () => {
    expect(categorizarFalha({ texto: "quando é amanhã?", escopo: "publico" }))
      .toBe("erro_temporal");
  });
  it("erro de atividade", () => {
    expect(categorizarFalha({ texto: "o passe está disponível", escopo: "publico" }))
      .toBe("erro_atividade");
  });
  it("mensagem curta ambígua", () => {
    expect(categorizarFalha({ texto: "oi", escopo: "geral" })).toBe("mensagem_curta_ambigua");
  });
  it("fallback por baixa confiança", () => {
    expect(categorizarFalha({ texto: "algo bem diferente disso aqui agora", escopo: "publico", hibrido_baixa_conf: true }))
      .toBe("fallback_baixa_confianca");
  });
});

describe("agruparPadroesFalha", () => {
  const ambiguidades: ItemAmbiguidade[] = [
    { texto: "tenho passe hoje?", total: 5, intencao: "complexo", escopo: "pessoal", fallback_motivo: null, hibrido_baixa_conf: false },
    { texto: "quando é amanhã?", total: 3, intencao: "complexo", escopo: "publico", fallback_motivo: null, hibrido_baixa_conf: false },
    { texto: "quando tem sessão?", total: 2, intencao: "complexo", escopo: "publico", fallback_motivo: null, hibrido_baixa_conf: false },
  ];
  it("agrupa e ordena por total", () => {
    const grupos = agruparPadroesFalha(ambiguidades);
    const temporal = grupos.find((g) => g.categoria === "erro_temporal");
    expect(temporal?.total).toBe(5); // 3 + 2
    const pessoal = grupos.find((g) => g.categoria === "pessoal_sem_identificacao");
    expect(pessoal?.total).toBe(5);
    expect(pessoal?.rotulo).toBe(ROTULO_CATEGORIA.pessoal_sem_identificacao);
  });
  it("limita exemplos", () => {
    const grupos = agruparPadroesFalha(ambiguidades, 1);
    grupos.forEach((g) => expect(g.exemplos.length).toBeLessThanOrEqual(1));
  });
});

describe("calcularImpacto", () => {
  it("alto por proporção elevada", () => {
    expect(calcularImpacto(15, 100, false)).toBe("alto");
  });
  it("médio por frequência moderada", () => {
    expect(calcularImpacto(6, 1000, false)).toBe("medio");
  });
  it("baixo por frequência pequena", () => {
    expect(calcularImpacto(2, 1000, false)).toBe("baixo");
  });
  it("associação crítica eleva o nível", () => {
    expect(calcularImpacto(6, 1000, true)).toBe("alto");
  });
});

describe("gerarBacklog", () => {
  it("gera itens ordenados por impacto e frequência", () => {
    const grupos = [
      { categoria: "erro_temporal" as const, rotulo: "Erro temporal", total: 2, exemplos: [] },
      { categoria: "pessoal_sem_identificacao" as const, rotulo: "Pessoal", total: 30, exemplos: [] },
    ];
    const backlog = gerarBacklog(grupos, 100);
    expect(backlog[0].categoria).toBe("pessoal_sem_identificacao");
    expect(backlog[0].impacto).toBe("alto");
    expect(backlog[0].sugestao).toContain("identificação");
  });
  it("ignora grupos sem ocorrência", () => {
    const backlog = gerarBacklog([{ categoria: "outro" as const, rotulo: "Outro", total: 0, exemplos: [] }], 100);
    expect(backlog.length).toBe(0);
  });
});

const baseMetricas = (over: Partial<MetricasIaWhatsapp> = {}): MetricasIaWhatsapp => ({
  autorizado: true,
  periodo: { inicio: "2026-06-12T00:00:00Z", fim: "2026-06-19T00:00:00Z" },
  volume: { mensagens_recebidas: 100, respostas_ia: 90, conversas: 40 },
  handoff: { total: 10, pct_sobre_mensagens: 10, classificado_por_ia: 4, top_motivos: [], por_status: [] },
  classificacao: { top_intents: [], pct_sem_fallback: 80, top_fallback: [], top_complexo: [], total_complexo: 5 },
  hibrido: { total_turnos: 8, pct_sobre_total: 8, confianca_media: 0.7, respostas_com_llm: 12 },
  escopo: { distribuicao: [], pessoais: 20, pessoais_nao_identificados: 5, pct_pessoais_nao_ident: 25 },
  ambiguidades: [],
  ...over,
});

describe("montarKpis", () => {
  it("calcula deltas vs período anterior", () => {
    const atual = baseMetricas();
    const anterior = baseMetricas({ volume: { mensagens_recebidas: 80, respostas_ia: 70, conversas: 30 } });
    const kpis = montarKpis(atual, anterior);
    expect(kpis.mensagens.atual).toBe(100);
    expect(kpis.mensagens.anterior).toBe(80);
    expect(kpis.mensagens.direcao).toBe("subiu");
  });
  it("funciona sem período anterior", () => {
    const kpis = montarKpis(baseMetricas(), null);
    expect(kpis.mensagens.anterior).toBe(0);
  });
});
