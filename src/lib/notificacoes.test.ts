import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  dentroJanela,
  limiteDiarioAtingido,
  podeEnviar,
  classificarIntencao,
  precisaHandoff,
  dedupeKey,
  parseHoraMin,
} from "./notificacoes";

describe("renderTemplate", () => {
  it("substitui variáveis simples", () => {
    expect(renderTemplate("Olá, {{nome}}!", { nome: "Ana" })).toBe("Olá, Ana!");
  });

  it("remove variáveis ausentes e espaços duplicados", () => {
    expect(renderTemplate("Sessão de {{tratamento}} em {{data}}", { data: "" }))
      .toBe("Sessão de em");
  });

  it("formata horário removendo segundos", () => {
    expect(renderTemplate("às {{horario}}", { horario: "14:30:00" })).toBe("às 14:30");
  });

  it("formata data ISO para pt-BR", () => {
    const out = renderTemplate("dia {{data}}", { data: "2026-06-20" });
    expect(out).toContain("20/06/2026");
  });
});

describe("janela horária", () => {
  it("parseHoraMin converte corretamente", () => {
    expect(parseHoraMin("08:00")).toBe(480);
    expect(parseHoraMin("20:30")).toBe(1230);
  });

  it("aceita horário dentro da janela padrão", () => {
    const d = new Date(2026, 5, 10, 10, 0);
    expect(dentroJanela(d)).toBe(true);
  });

  it("rejeita horário noturno", () => {
    const d = new Date(2026, 5, 10, 22, 0);
    expect(dentroJanela(d)).toBe(false);
  });

  it("rejeita antes do início", () => {
    const d = new Date(2026, 5, 10, 7, 0);
    expect(dentroJanela(d)).toBe(false);
  });
});

describe("limiteDiarioAtingido", () => {
  it("respeita o limite padrão", () => {
    expect(limiteDiarioAtingido(2)).toBe(false);
    expect(limiteDiarioAtingido(3)).toBe(true);
  });
});

describe("podeEnviar (gate anti-spam)", () => {
  const base = {
    whatsappAtivo: true,
    telefone: "5511999999999",
    agora: new Date(2026, 5, 10, 10, 0),
    enviadosHoje: 0,
  };

  it("permite envio quando tudo ok", () => {
    expect(podeEnviar(base)).toEqual({ enviar: true });
  });

  it("bloqueia por opt-out", () => {
    expect(podeEnviar({ ...base, whatsappAtivo: false })).toEqual({ enviar: false, motivo: "opt_out" });
  });

  it("bloqueia sem telefone", () => {
    expect(podeEnviar({ ...base, telefone: null })).toEqual({ enviar: false, motivo: "sem_telefone" });
  });

  it("bloqueia fora da janela", () => {
    expect(podeEnviar({ ...base, agora: new Date(2026, 5, 10, 23, 0) }))
      .toEqual({ enviar: false, motivo: "fora_janela" });
  });

  it("bloqueia por limite diário", () => {
    expect(podeEnviar({ ...base, enviadosHoje: 3 }))
      .toEqual({ enviar: false, motivo: "limite_diario" });
  });
});

describe("classificarIntencao", () => {
  it("detecta opt-out", () => {
    expect(classificarIntencao("quero parar de receber")).toBe("opt_out");
  });
  it("detecta próxima sessão", () => {
    expect(classificarIntencao("quando é minha próxima sessão?")).toBe("proxima_sessao");
  });
  it("detecta entrevista", () => {
    expect(classificarIntencao("qual o horário da entrevista")).toBe("horario_entrevista");
  });
  it("escala assuntos sensíveis", () => {
    expect(classificarIntencao("isso é um absurdo, vou chamar advogado")).toBe("complexo");
  });
  it("mensagem ambígua vira complexo", () => {
    expect(classificarIntencao("xyz")).toBe("complexo");
  });
});

describe("precisaHandoff", () => {
  it("não escala intenções simples", () => {
    expect(precisaHandoff("proxima_sessao")).toBe(false);
    expect(precisaHandoff("opt_out")).toBe(false);
  });
  it("escala intenção complexa", () => {
    expect(precisaHandoff("complexo")).toBe(true);
  });
});

describe("dedupeKey", () => {
  it("gera chave estável", () => {
    expect(dedupeKey("sessao_criada", "abc")).toBe("sessao_criada:abc");
    expect(dedupeKey("sessao_lembrete", "abc", "2026-06-20")).toBe("sessao_lembrete:abc:2026-06-20");
  });
});
