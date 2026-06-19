import { describe, it, expect } from "vitest";
import {
  resolverPrecedenciaDia,
  proximaOcorrenciaValida,
  gerarCandidatasSemanais,
  encontrarExcecao,
  excecaoInvalida,
  nomesEquivalentes,
  resolverEscopo,
  perguntaProximaOcorrencia,
  PRECEDENCIA_FONTES,
  type Candidata,
  type ExcecaoFato,
} from "./whatsappOrquestrador";

describe("precedência fechada entre fontes", () => {
  it("exceção operacional vence a programação padrão para a mesma atividade", () => {
    const itens: Candidata[] = [
      { atividade: "Evangelhoterapia", data: "2026-06-21", horario: "19:00", fonte: "programacao_padrao" },
      { atividade: "Evangelhoterapia", data: "2026-06-21", horario: "19:00", fonte: "excecao_operacional", status: "cancelado" },
    ];
    const r = resolverPrecedenciaDia(itens);
    expect(r).toHaveLength(1);
    expect(r[0].fonte).toBe("excecao_operacional");
  });

  it("sessão real vence a programação padrão", () => {
    const itens: Candidata[] = [
      { atividade: "Passe", data: "2026-06-21", horario: "20:00", fonte: "programacao_padrao" },
      { atividade: "Passe", data: "2026-06-21", horario: "20:30", fonte: "agenda_real" },
    ];
    const r = resolverPrecedenciaDia(itens);
    expect(r).toHaveLength(1);
    expect(r[0].fonte).toBe("agenda_real");
    expect(r[0].horario).toBe("20:30");
  });

  it("agenda pessoal vence a programação padrão", () => {
    const itens: Candidata[] = [
      { atividade: "Desobsessão", data: "2026-06-21", fonte: "programacao_padrao" },
      { atividade: "Desobsessão", data: "2026-06-21", fonte: "agenda_pessoal" },
    ];
    const r = resolverPrecedenciaDia(itens);
    expect(r[0].fonte).toBe("agenda_pessoal");
  });

  it("mantém atividades distintas sem colapsar", () => {
    const itens: Candidata[] = [
      { atividade: "Palestra", data: "2026-06-21", fonte: "programacao_padrao" },
      { atividade: "Evangelhoterapia", data: "2026-06-21", fonte: "agenda_real" },
    ];
    const r = resolverPrecedenciaDia(itens);
    expect(r).toHaveLength(2);
  });

  it("ordem de precedência é exceção > real > pessoal > padrão", () => {
    expect(PRECEDENCIA_FONTES).toEqual([
      "excecao_operacional", "agenda_real", "agenda_pessoal", "programacao_padrao",
    ]);
  });
});

describe("próxima ocorrência com validação de exceção", () => {
  const candidatas: Candidata[] = [
    { atividade: "Evangelhoterapia", data: "2026-06-21", horario: "19:00", fonte: "programacao_padrao" },
    { atividade: "Evangelhoterapia", data: "2026-06-28", horario: "19:00", fonte: "programacao_padrao" },
    { atividade: "Evangelhoterapia", data: "2026-07-05", horario: "19:00", fonte: "programacao_padrao" },
  ];

  it("descarta a próxima cancelada e aponta para a seguinte válida", () => {
    const excecoes: ExcecaoFato[] = [
      { atividade: "Evangelhoterapia", data: "2026-06-21", status: "cancelado" },
    ];
    const r = proximaOcorrenciaValida(candidatas, excecoes);
    expect(r.ocorrencia?.data).toBe("2026-06-28");
    expect(r.descartadas).toHaveLength(1);
    expect(r.descartadas[0].motivo).toBe("cancelado");
    expect(r.semValida).toBe(false);
  });

  it("descarta a próxima remarcada e aponta para a válida", () => {
    const excecoes: ExcecaoFato[] = [
      { atividade: "Evangelhoterapia", data: "2026-06-21", status: "remarcado", nova_data: "2026-06-22" },
    ];
    const r = proximaOcorrenciaValida(candidatas, excecoes);
    expect(r.ocorrencia?.data).toBe("2026-06-28");
  });

  it("descarta múltiplas inválidas em sequência (cancelada + excepcional)", () => {
    const excecoes: ExcecaoFato[] = [
      { atividade: "Evangelhoterapia", data: "2026-06-21", status: "cancelado" },
      { atividade: "Evangelhoterapia", data: "2026-06-28", status: "excepcional" },
    ];
    const r = proximaOcorrenciaValida(candidatas, excecoes);
    expect(r.ocorrencia?.data).toBe("2026-07-05");
    expect(r.descartadas).toHaveLength(2);
  });

  it("retorna semValida quando todas as candidatas estão canceladas", () => {
    const excecoes: ExcecaoFato[] = candidatas.map((c) => ({
      atividade: c.atividade, data: c.data, status: "cancelado",
    }));
    const r = proximaOcorrenciaValida(candidatas, excecoes);
    expect(r.ocorrencia).toBeNull();
    expect(r.semValida).toBe(true);
  });

  it("respeita status próprio cancelado da candidata (sem exceção registrada)", () => {
    const cands: Candidata[] = [
      { atividade: "Desobsessão", data: "2026-06-21", fonte: "agenda_pessoal", status: "cancelado", tratamento_id: "t1" },
      { atividade: "Desobsessão", data: "2026-06-28", fonte: "agenda_pessoal", status: "agendado", tratamento_id: "t1" },
    ];
    const r = proximaOcorrenciaValida(cands, []);
    expect(r.ocorrencia?.data).toBe("2026-06-28");
  });

  it("casa exceção por tratamento_id quando disponível", () => {
    const cands: Candidata[] = [
      { atividade: "Sessão", data: "2026-06-21", fonte: "agenda_pessoal", tratamento_id: "t1" },
      { atividade: "Sessão", data: "2026-06-28", fonte: "agenda_pessoal", tratamento_id: "t1" },
    ];
    const excecoes: ExcecaoFato[] = [
      { tratamento_id: "t1", data: "2026-06-21", status: "cancelada" },
    ];
    const r = proximaOcorrenciaValida(cands, excecoes);
    expect(r.ocorrencia?.data).toBe("2026-06-28");
  });

  it("a primeira válida é retornada sem descartes quando não há exceção", () => {
    const r = proximaOcorrenciaValida(candidatas, []);
    expect(r.ocorrencia?.data).toBe("2026-06-21");
    expect(r.descartadas).toHaveLength(0);
  });
});

describe("geração de candidatas semanais", () => {
  it("gera ocorrências apenas nos dias da semana configurados", () => {
    // 2026-06-19 é sexta-feira (dow=5). Domingos (0) na janela:
    const cands = gerarCandidatasSemanais({
      atividade: "Evangelhoterapia", diasSemana: [0], horario: "19:00",
      baseIso: "2026-06-19", janelaDias: 21,
    });
    expect(cands.length).toBeGreaterThanOrEqual(3);
    expect(cands[0].data).toBe("2026-06-21");
    expect(cands.every((c) => new Date(c.data + "T12:00:00Z").getUTCDay() === 0)).toBe(true);
  });
});

describe("equivalência de nomes e status inválido", () => {
  it("reconhece nomes equivalentes tolerando acentos e contém", () => {
    expect(nomesEquivalentes("Evangelhoterapia", "evangelhoterapia")).toBe(true);
    expect(nomesEquivalentes("Passe", "Passe Espiritual")).toBe(true);
    expect(nomesEquivalentes("Palestra", "Desobsessão")).toBe(false);
  });
  it("classifica status inválidos corretamente", () => {
    for (const s of ["cancelado", "cancelada", "remarcado", "remarcada", "excepcional"]) {
      expect(excecaoInvalida(s)).toBe(true);
    }
    expect(excecaoInvalida("agendado")).toBe(false);
    expect(excecaoInvalida(null)).toBe(false);
  });
  it("encontrarExcecao casa por data e nome", () => {
    const ex = encontrarExcecao(
      { atividade: "Evangelhoterapia", data: "2026-06-21", fonte: "programacao_padrao" },
      [{ atividade: "Evangelhoterapia", data: "2026-06-21", status: "cancelado" }],
    );
    expect(ex?.status).toBe("cancelado");
  });
});

describe("resolução de escopo público vs pessoal vs ambíguo", () => {
  it("pergunta pública busca programação da casa", () => {
    expect(resolverEscopo({ intencao: "programacao_publica", assistidoIdentificado: false })).toBe("publico");
    expect(resolverEscopo({ intencao: "eventos", assistidoIdentificado: true })).toBe("publico");
  });

  it("pergunta pessoal com assistido identificado busca a agenda do assistido", () => {
    expect(resolverEscopo({ intencao: "proxima_sessao", assistidoIdentificado: true })).toBe("pessoal");
    expect(resolverEscopo({ intencao: "horario_entrevista", assistidoIdentificado: true })).toBe("pessoal");
  });

  it("pergunta pessoal sem assistido identificado é ambígua (pedir esclarecimento)", () => {
    expect(resolverEscopo({ intencao: "proxima_sessao", assistidoIdentificado: false })).toBe("ambiguo");
  });

  it("tratamento_hoje sem assistido cai para programação pública da casa", () => {
    expect(resolverEscopo({ intencao: "tratamento_hoje", assistidoIdentificado: false })).toBe("publico");
    expect(resolverEscopo({ intencao: "tratamento_hoje", assistidoIdentificado: true })).toBe("pessoal");
  });

  it("intenção neutra herda escopo recente seguro do contexto", () => {
    expect(resolverEscopo({ intencao: "pedido_informacao", assistidoIdentificado: false, escopoContexto: "publico" })).toBe("publico");
    expect(resolverEscopo({ intencao: "pedido_informacao", assistidoIdentificado: true, escopoContexto: "pessoal" })).toBe("pessoal");
    expect(resolverEscopo({ intencao: "pedido_informacao", assistidoIdentificado: false })).toBe("ambiguo");
  });
});

describe("detecção de pergunta sobre próxima ocorrência", () => {
  it("detecta variações de próxima ocorrência", () => {
    expect(perguntaProximaOcorrencia("quando é a próxima evangelhoterapia?")).toBe(true);
    expect(perguntaProximaOcorrencia("qual meu próximo atendimento?")).toBe(true);
    expect(perguntaProximaOcorrencia("quando é a desobsessão?")).toBe(true);
    expect(perguntaProximaOcorrencia("tem palestra hoje?")).toBe(false);
  });
});
