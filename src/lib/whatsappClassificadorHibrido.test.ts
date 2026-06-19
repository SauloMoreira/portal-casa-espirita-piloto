import { describe, it, expect } from "vitest";
import {
  deveAcionarHibrido,
  normalizarSaidaHibrido,
  intencoesParaPrompt,
  INTENCOES_VALIDAS,
  CONFIANCA_MINIMA,
} from "./whatsappClassificadorHibrido";

describe("acionamento do híbrido (só no gap)", () => {
  it("NÃO aciona quando o determinístico já classificou", () => {
    expect(deveAcionarHibrido("programacao_publica", "tem palestra hoje?")).toBe(false);
    expect(deveAcionarHibrido("proxima_sessao", "qual meu próximo atendimento?")).toBe(false);
    expect(deveAcionarHibrido("saudacao", "bom dia")).toBe(false);
  });

  it("aciona quando o determinístico falhou (complexo) com texto real", () => {
    expect(deveAcionarHibrido("complexo", "vcs atendem quem tem ansiedade a noite?")).toBe(true);
    expect(deveAcionarHibrido("complexo", "qria sbr d trtmnt pra mnha mae")).toBe(true);
  });

  it("NÃO aciona em mensagem vazia ou trivial (evita custo)", () => {
    expect(deveAcionarHibrido("complexo", "")).toBe(false);
    expect(deveAcionarHibrido("complexo", "  ")).toBe(false);
    expect(deveAcionarHibrido("complexo", "x")).toBe(false);
  });
});

describe("normalização e validação da saída do híbrido", () => {
  it("aceita intenção válida com confiança suficiente", () => {
    const r = normalizarSaidaHibrido({ intencao: "programacao_publica", atividade: "evangelhoterapia", confianca: 0.9 });
    expect(r.aceito).toBe(true);
    expect(r.intencao).toBe("programacao_publica");
    expect(r.atividade).toBe("evangelhoterapia");
  });

  it("reprova intenção fora do domínio fechado (fallback seguro)", () => {
    const r = normalizarSaidaHibrido({ intencao: "marcar_consulta", confianca: 0.99 });
    expect(r.aceito).toBe(false);
    expect(r.intencao).toBe("complexo");
  });

  it("reprova baixa confiança mesmo com intenção válida", () => {
    const r = normalizarSaidaHibrido({ intencao: "eventos", confianca: 0.4 });
    expect(r.aceito).toBe(false);
    expect(r.confianca).toBeCloseTo(0.4);
  });

  it("aceita exatamente no limite de confiança", () => {
    const r = normalizarSaidaHibrido({ intencao: "campanhas", confianca: CONFIANCA_MINIMA });
    expect(r.aceito).toBe(true);
  });

  it("faz parse de string JSON, inclusive com cerca ```json", () => {
    const r = normalizarSaidaHibrido('```json\n{"intencao":"acao_social","confianca":0.8}\n```');
    expect(r.aceito).toBe(true);
    expect(r.intencao).toBe("acao_social");
  });

  it("tolera texto ao redor do JSON", () => {
    const r = normalizarSaidaHibrido('Claro: {"intencao":"onde_ver_app","confianca":0.7} pronto');
    expect(r.aceito).toBe(true);
    expect(r.intencao).toBe("onde_ver_app");
  });

  it("trata atividade ausente/null com segurança", () => {
    const r = normalizarSaidaHibrido({ intencao: "eventos", confianca: 0.9, atividade: "null" });
    expect(r.atividade).toBeNull();
    const r2 = normalizarSaidaHibrido({ intencao: "eventos", confianca: 0.9 });
    expect(r2.atividade).toBeNull();
  });

  it("clampa confiança fora de [0,1] e lida com NaN", () => {
    expect(normalizarSaidaHibrido({ intencao: "eventos", confianca: 5 }).confianca).toBe(1);
    expect(normalizarSaidaHibrido({ intencao: "eventos", confianca: -2 }).confianca).toBe(0);
    expect(normalizarSaidaHibrido({ intencao: "eventos", confianca: "abc" }).confianca).toBe(0);
  });

  it("aceita chaves alternativas (intent/confidence/activity)", () => {
    const r = normalizarSaidaHibrido({ intent: "falar_humano", confidence: 0.95, activity: null });
    expect(r.aceito).toBe(true);
    expect(r.intencao).toBe("falar_humano");
  });

  it("reprova entrada totalmente inválida", () => {
    expect(normalizarSaidaHibrido(null).aceito).toBe(false);
    expect(normalizarSaidaHibrido("sem json aqui").aceito).toBe(false);
    expect(normalizarSaidaHibrido(42).aceito).toBe(false);
  });
});

describe("prompt do híbrido", () => {
  it("lista intenções válidas sem incluir complexo", () => {
    const p = intencoesParaPrompt();
    expect(p).toContain("programacao_publica");
    expect(p).toContain("proxima_sessao");
    expect(p).not.toContain("complexo");
  });
  it("o domínio fechado contém complexo como fallback", () => {
    expect(INTENCOES_VALIDAS.has("complexo")).toBe(true);
  });
});
