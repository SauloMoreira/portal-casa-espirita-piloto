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
  referenciaTemporalLembrete,
  diffDiasCalendario,
  lembreteVencido,
  formatarDataBR,
} from "./notificacoes";

describe("referência temporal do lembrete", () => {
  // 22/06/2026 14:00 em São Paulo (UTC-3) => 17:00Z.
  const agora = new Date("2026-06-22T17:00:00Z");

  it("usa 'hoje' quando a sessão é no mesmo dia local", () => {
    expect(referenciaTemporalLembrete("2026-06-22", agora)).toBe("hoje, 22/06/2026");
  });

  it("usa 'amanhã' quando a sessão é no dia local seguinte", () => {
    expect(referenciaTemporalLembrete("2026-06-23", agora)).toBe("amanhã, 23/06/2026");
  });

  it("usa data completa quando a diferença é maior que 1 dia", () => {
    expect(referenciaTemporalLembrete("2026-06-24", agora)).toBe("no dia 24/06/2026");
  });

  it("nunca mistura relativo incoerente com a data", () => {
    const texto = referenciaTemporalLembrete("2026-06-22", agora);
    expect(texto).not.toContain("amanhã");
    expect(texto).toContain("hoje, 22/06/2026");
  });

  it("respeita a timezone na virada do dia", () => {
    // 23/06 01:00Z = 22/06 22:00 em São Paulo → ainda 'hoje' para sessão 22/06.
    const tarde = new Date("2026-06-23T01:00:00Z");
    expect(referenciaTemporalLembrete("2026-06-22", tarde)).toBe("hoje, 22/06/2026");
    expect(referenciaTemporalLembrete("2026-06-23", tarde)).toBe("amanhã, 23/06/2026");
  });

  it("diffDiasCalendario calcula dias inteiros", () => {
    expect(diffDiasCalendario("2026-06-22", agora)).toBe(0);
    expect(diffDiasCalendario("2026-06-23", agora)).toBe(1);
    expect(diffDiasCalendario("2026-06-25", agora)).toBe(3);
  });

  it("formatarDataBR converte ISO para DD/MM/YYYY", () => {
    expect(formatarDataBR("2026-06-24")).toBe("24/06/2026");
    expect(formatarDataBR("2026-06-24T19:00:00")).toBe("24/06/2026");
  });
});

describe("guarda de lembrete vencido", () => {
  it("não considera vencido antes do horário da sessão", () => {
    const agora = new Date("2026-06-22T20:00:00Z"); // 17:00 SP
    expect(lembreteVencido("2026-06-22", "19:00", agora)).toBe(false);
  });

  it("considera vencido quando a sessão já começou", () => {
    const agora = new Date("2026-06-22T22:30:00Z"); // 19:30 SP
    expect(lembreteVencido("2026-06-22", "19:00", agora)).toBe(true);
  });

  it("considera vencido em dia anterior já passado", () => {
    const agora = new Date("2026-06-23T12:00:00Z");
    expect(lembreteVencido("2026-06-22", "19:00", agora)).toBe(true);
  });

  it("renderiza o template oficial com referência natural", () => {
    const corpo = "Olá, {{nome}}! 🌿 Lembrete da sua sessão de {{tratamento}} {{quando}} às {{horario}}. Até breve!";
    const out = renderTemplate(corpo, {
      nome: "Andréa Vilela",
      tratamento: "Magnetismo",
      quando: "hoje, 22/06/2026",
      horario: "19:00:00",
    });
    expect(out).toBe("Olá, Andréa Vilela! 🌿 Lembrete da sua sessão de Magnetismo hoje, 22/06/2026 às 19:00. Até breve!");
  });
});


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

  it("não vaza UTC: entrevista à meia-noite UTC NÃO vira 21:00 do dia anterior", () => {
    // timestamptz de entrevista date-only serializado pelo Postgres.
    const out = renderTemplate(
      "Sua entrevista foi agendada para {{data}}.",
      { data: "2026-06-23T00:00:00+00:00" },
    );
    expect(out).toBe("Sua entrevista foi agendada para 23/06/2026.");
    expect(out).not.toContain("21:00");
    expect(out).not.toContain("22/06/2026");
  });

  it("trata meia-noite UTC em formato .000Z como data pura", () => {
    const out = renderTemplate("{{data}}", { data: "2026-06-23T00:00:00.000Z" });
    expect(out).toBe("23/06/2026");
  });

  it("mantém hora real do compromisso quando presente", () => {
    // 18:00 SP (UTC-3) === 21:00Z → deve exibir a hora local, não a UTC.
    const out = renderTemplate("{{data}}", { data: "2026-06-23T21:00:00+00:00" });
    expect(out).toBe("23/06/2026, 18:00");
  });

  // L-01 — governança da confirmação de entrevista NÃO pode reabrir o bug de
  // data: confirmação e lembrete de entrevista date-only devem renderizar sem
  // inventar horário e sem deslocar o dia por UTC, independente da flag.
  it("L-01: confirmação de entrevista date-only não inventa horário", () => {
    const out = renderTemplate(
      "Sua entrevista foi confirmada para {{data}}.",
      { data: "2026-06-23T00:00:00+00:00" },
    );
    expect(out).toBe("Sua entrevista foi confirmada para 23/06/2026.");
    expect(out).not.toMatch(/\d{2}:\d{2}/);
  });

  it("L-01: lembrete de entrevista date-only não desloca o dia por UTC", () => {
    const out = renderTemplate(
      "Lembrete: entrevista em {{data}}.",
      { data: "2026-06-23T00:00:00.000Z" },
    );
    expect(out).toBe("Lembrete: entrevista em 23/06/2026.");
    expect(out).not.toContain("22/06/2026");
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
