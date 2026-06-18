import { describe, it, expect } from "vitest";
import {
  pct, taxaSucesso, taxaResposta, taxaOptOut, taxaHandoff, reducaoFaltas,
  comparecimentoAposLembrete, formatDuracao, csvCell, buildCsv, tipoLabel, intentLabel,
} from "./whatsappMetrics";

describe("whatsappMetrics — fórmulas de indicadores", () => {
  it("pct lida com denominador zero ou negativo", () => {
    expect(pct(5, 0)).toBe(0);
    expect(pct(5, -1)).toBe(0);
    expect(pct(0, 10)).toBe(0);
  });

  it("taxa de sucesso de envio = enviadas / geradas", () => {
    expect(taxaSucesso(80, 100)).toBe(80);
    expect(taxaSucesso(1, 3)).toBe(33);
    expect(taxaSucesso(0, 0)).toBe(0);
  });

  it("taxa de resposta = inbound / enviadas", () => {
    expect(taxaResposta(25, 100)).toBe(25);
    expect(taxaResposta(0, 0)).toBe(0);
  });

  it("taxa de opt-out = opt-outs / assistidos impactados", () => {
    expect(taxaOptOut(2, 50)).toBe(4);
    expect(taxaOptOut(3, 0)).toBe(0);
  });

  it("taxa de handoff = handoffs / inbound", () => {
    expect(taxaHandoff(3, 12)).toBe(25);
    expect(taxaHandoff(1, 0)).toBe(0);
  });

  it("redução de faltas = (antes - depois) / antes", () => {
    expect(reducaoFaltas(20, 10)).toBe(50);
    expect(reducaoFaltas(10, 12)).toBe(-20);
    expect(reducaoFaltas(0, 5)).toBe(0);
  });

  it("comparecimento após lembrete = comparecimentos / total", () => {
    expect(comparecimentoAposLembrete(45, 50)).toBe(90);
    expect(comparecimentoAposLembrete(0, 0)).toBe(0);
  });
});

describe("whatsappMetrics — formatação de duração", () => {
  it("formata segundos, minutos e horas", () => {
    expect(formatDuracao(0)).toBe("—");
    expect(formatDuracao(null)).toBe("—");
    expect(formatDuracao(45)).toBe("45s");
    expect(formatDuracao(120)).toBe("2min");
    expect(formatDuracao(3600)).toBe("1h");
    expect(formatDuracao(3900)).toBe("1h5min");
  });
});

describe("whatsappMetrics — exportação CSV", () => {
  it("escapa células com separadores e aspas", () => {
    expect(csvCell("simples")).toBe("simples");
    expect(csvCell('com "aspas"')).toBe('"com ""aspas"""');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("monta CSV com cabeçalho e linhas consistentes com os números", () => {
    const csv = buildCsv(
      ["Indicador", "Valor"],
      [["Enviadas", 80], ["Taxa de sucesso (%)", taxaSucesso(80, 100)]],
    );
    expect(csv).toBe("Indicador;Valor\nEnviadas;80\nTaxa de sucesso (%);80");
  });

  it("monta CSV só com cabeçalho quando não há linhas", () => {
    expect(buildCsv(["A", "B"], [])).toBe("A;B");
  });
});

describe("whatsappMetrics — labels", () => {
  it("traduz códigos conhecidos e mantém desconhecidos", () => {
    expect(tipoLabel("sessao_lembrete")).toBe("Lembrete de sessão");
    expect(tipoLabel("custom_x")).toBe("custom_x");
    expect(tipoLabel(null)).toBe("—");
    expect(intentLabel("complexo")).toBe("Atendimento humano");
    expect(intentLabel("xyz")).toBe("xyz");
  });
});
