import { describe, it, expect } from "vitest";
import {
  projetarAgendaConsolidada,
  isTratamentoPublicoLivre,
  ocorrenciaContaParaTratamentoPublico,
  construirPlanoEtapas,
  type TratamentoProjecaoInput,
} from "@/lib/agendaRules";

const tipo = (dia: number, horario: string) => ({
  dia_semana: dia,
  horario,
  frequencia_valor: 1,
  frequencia_unidade: "semanas",
});

// Base: sábado 20/06/2026, espelhando o caso piloto Ana Carmen.
const BASE = new Date("2026-06-20T12:00:00");

describe("projetarAgendaConsolidada — encadeamento sequencial bloqueante", () => {
  it("encadeia tratamentos sequenciais por ordem, sem sobreposição de datas", () => {
    const tratamentos: TratamentoProjecaoInput[] = [
      // concluído: não gera agenda e não avança a cadeia
      {
        ref: "desob",
        tratamento_id: "t1",
        status: "concluido",
        quantidade_total: 7,
        quantidade_realizada: 7,
        modo_agendamento: "sequencial_bloqueante",
        ordem_tratamento: 1,
        tipo: tipo(3, "19:00"),
      },
      {
        ref: "anti",
        tratamento_id: "t2",
        status: "em_andamento",
        quantidade_total: 7,
        quantidade_realizada: 2,
        modo_agendamento: "sequencial_bloqueante",
        ordem_tratamento: 2,
        tipo: tipo(2, "19:00"),
      },
      {
        ref: "mag",
        tratamento_id: "t3",
        status: "aguardando_inicio",
        quantidade_total: 7,
        quantidade_realizada: 0,
        modo_agendamento: "sequencial_bloqueante",
        ordem_tratamento: 3,
        tipo: tipo(1, "19:00"),
      },
      {
        ref: "cura",
        tratamento_id: "t4",
        status: "aguardando_inicio",
        quantidade_total: 7,
        quantidade_realizada: 0,
        modo_agendamento: "sequencial_bloqueante",
        ordem_tratamento: 4,
        tipo: tipo(1, "18:00"),
      },
      {
        ref: "evang",
        tratamento_id: "t5",
        status: "aguardando_inicio",
        quantidade_total: 7,
        quantidade_realizada: 0,
        modo_agendamento: "livre_concomitante",
        ordem_tratamento: 5,
        tipo: tipo(5, "19:00"),
      },
    ];

    const res = projetarAgendaConsolidada(tratamentos, BASE);
    const byRef = Object.fromEntries(res.map((r) => [r.ref, r]));

    // Desobsessão concluída → sem agenda
    expect(byRef.desob.sessoes).toHaveLength(0);

    // Anti-Goécia: 5 restantes a partir da próxima terça
    expect(byRef.anti.sessoes.map((s) => s.data_sessao)).toEqual([
      "2026-06-23",
      "2026-06-30",
      "2026-07-07",
      "2026-07-14",
      "2026-07-21",
    ]);

    // Magnetismo: encadeado APÓS o término do Anti-Goécia (21/07)
    expect(byRef.mag.sessoes[0].data_sessao).toBe("2026-07-27");
    expect(byRef.mag.sessoes).toHaveLength(7);
    expect(byRef.mag.sessoes[6].data_sessao).toBe("2026-09-07");

    // Cura: encadeada APÓS o término do Magnetismo (07/09)
    expect(byRef.cura.sessoes[0].data_sessao).toBe("2026-09-14");
    expect(byRef.cura.sessoes[6].data_sessao).toBe("2026-10-26");

    // Evangelhoterapia (livre): independente, a partir da base
    expect(byRef.evang.sessoes[0].data_sessao).toBe("2026-06-26");
  });

  it("não gera agenda para tratamentos concluídos/cancelados", () => {
    const res = projetarAgendaConsolidada(
      [
        {
          ref: "c",
          tratamento_id: "x",
          status: "cancelado",
          quantidade_total: 7,
          quantidade_realizada: 0,
          modo_agendamento: "sequencial_bloqueante",
          ordem_tratamento: 1,
          tipo: tipo(2, "19:00"),
        },
      ],
      BASE,
    );
    expect(res[0].geraAgenda).toBe(false);
    expect(res[0].sessoes).toHaveLength(0);
  });
});

// Caso piloto Andréa Vilela: DOIS sequenciais concluídos no início, terceiro em
// andamento, quarto aguardando (encadeado) e público após a cadeia.
describe("projetarAgendaConsolidada — caso piloto Andréa Vilela", () => {
  const andrea = (): TratamentoProjecaoInput[] => [
    {
      ref: "desob",
      tratamento_id: "td",
      status: "concluido",
      quantidade_total: 7,
      quantidade_realizada: 7,
      modo_agendamento: "sequencial_bloqueante",
      ordem_tratamento: 1,
      tipo: tipo(3, "19:00"),
    },
    {
      ref: "anti",
      tratamento_id: "ta",
      status: "concluido",
      quantidade_total: 7,
      quantidade_realizada: 7,
      modo_agendamento: "sequencial_bloqueante",
      ordem_tratamento: 2,
      tipo: tipo(2, "19:00"),
    },
    {
      ref: "mag",
      tratamento_id: "tm",
      status: "em_andamento",
      quantidade_total: 7,
      quantidade_realizada: 2,
      modo_agendamento: "sequencial_bloqueante",
      ordem_tratamento: 3,
      tipo: tipo(1, "19:00"),
    },
    {
      ref: "cura",
      tratamento_id: "tc",
      status: "aguardando_inicio",
      quantidade_total: 7,
      quantidade_realizada: 0,
      modo_agendamento: "sequencial_bloqueante",
      ordem_tratamento: 4,
      tipo: tipo(1, "18:00"),
    },
    {
      ref: "evang",
      tratamento_id: "te",
      status: "aguardando_inicio",
      quantidade_total: 7,
      quantidade_realizada: 0,
      modo_agendamento: "livre_concomitante",
      ordem_tratamento: 5,
      tipo: tipo(5, "19:00"),
      trabalhoPublico: true,
      permiteEntradaSemAgendamento: true,
    },
  ];

  it("gera agenda rígida só para Magnetismo (5) e Cura (7); público vira sugestão", () => {
    const res = projetarAgendaConsolidada(andrea(), BASE);
    const byRef = Object.fromEntries(res.map((r) => [r.ref, r]));

    // Concluídos → sem agenda
    expect(byRef.desob.sessoes).toHaveLength(0);
    expect(byRef.anti.sessoes).toHaveLength(0);

    // Magnetismo: 5 restantes a partir da próxima segunda (22/06)
    expect(byRef.mag.geraAgenda).toBe(true);
    expect(byRef.mag.sessoes.map((s) => s.data_sessao)).toEqual([
      "2026-06-22",
      "2026-06-29",
      "2026-07-06",
      "2026-07-13",
      "2026-07-20",
    ]);

    // Cura: 7, encadeada APÓS o término do Magnetismo (20/07) → 27/07
    expect(byRef.cura.geraAgenda).toBe(true);
    expect(byRef.cura.sessoes).toHaveLength(7);
    expect(byRef.cura.sessoes[0].data_sessao).toBe("2026-07-27");
    expect(byRef.cura.sessoes[6].data_sessao).toBe("2026-09-07");

    // Evangelhoterapia: público livre → sugestão após a cadeia, sem agenda rígida
    expect(byRef.evang.geraAgenda).toBe(false);
    expect(byRef.evang.sessoes).toHaveLength(0);
    expect(byRef.evang.tratamentoPublicoComSugestao).toBe(true);
    expect(byRef.evang.liberadoDesde).toBe("2026-06-20");
    // cadeia termina 07/09 (seg) → marco 08/09 → primeira sexta 11/09
    expect(byRef.evang.sugestoesAPartirDe).toBe("2026-09-11");
  });
});

const publico = (over: Partial<TratamentoProjecaoInput> = {}): TratamentoProjecaoInput => ({
  ref: "evang",
  tratamento_id: "tev",
  status: "em_andamento",
  quantidade_total: 10,
  quantidade_realizada: 2,
  modo_agendamento: "livre_concomitante",
  ordem_tratamento: 9,
  tipo: tipo(5, "19:00"), // sexta
  trabalhoPublico: true,
  permiteEntradaSemAgendamento: true,
  ...over,
});

describe("isTratamentoPublicoLivre — detecção apenas por metadados", () => {
  it("detecta público livre por flags estruturais (sem hardcode)", () => {
    expect(
      isTratamentoPublicoLivre({
        modo_agendamento: "livre_concomitante",
        trabalhoPublico: true,
        permiteEntradaSemAgendamento: true,
      }),
    ).toBe(true);
  });
  it("não detecta quando falta qualquer flag ou modo difere", () => {
    expect(
      isTratamentoPublicoLivre({ modo_agendamento: "livre_concomitante", trabalhoPublico: true }),
    ).toBe(false);
    expect(
      isTratamentoPublicoLivre({
        modo_agendamento: "sequencial_bloqueante",
        trabalhoPublico: true,
        permiteEntradaSemAgendamento: true,
      }),
    ).toBe(false);
  });
});

describe("tratamento público livre com sugestões", () => {
  it("não gera agenda rígida; libera desde a base e sugere após a cadeia bloqueante", () => {
    const tratamentos: TratamentoProjecaoInput[] = [
      {
        ref: "anti",
        tratamento_id: "t2",
        status: "em_andamento",
        quantidade_total: 7,
        quantidade_realizada: 2,
        modo_agendamento: "sequencial_bloqueante",
        ordem_tratamento: 2,
        tipo: tipo(2, "19:00"),
      },
      publico(),
    ];
    const res = projetarAgendaConsolidada(tratamentos, BASE);
    const ev = res.find((r) => r.ref === "evang")!;

    expect(ev.geraAgenda).toBe(false);
    expect(ev.sessoes).toHaveLength(0);
    expect(ev.tratamentoPublicoComSugestao).toBe(true);
    expect(ev.liberadoParaComparecimento).toBe(true);
    expect(ev.liberadoDesde).toBe("2026-06-20");
    // Anti-Goécia termina 21/07 (terça); marco posterior → primeira sexta válida
    expect(ev.sugestoesAPartirDe).toBe("2026-07-24");
    expect(ev.sugestoes!.length).toBeGreaterThan(0);
    expect(ev.sugestoes![0].data_sessao).toBe("2026-07-24");
  });

  it("sem cadeia bloqueante aplicável, sugestões nascem da base resolvida", () => {
    const res = projetarAgendaConsolidada([publico()], BASE);
    const ev = res[0];
    expect(ev.tratamentoPublicoComSugestao).toBe(true);
    // Primeira sexta em/após a base (sáb 20/06) → 26/06
    expect(ev.sugestoesAPartirDe).toBe("2026-06-26");
  });

  it("não sugere quando concluído (restante 0)", () => {
    const res = projetarAgendaConsolidada(
      [publico({ status: "concluido", quantidade_realizada: 10 })],
      BASE,
    );
    expect(res[0].sugestoes).toHaveLength(0);
    expect(res[0].sugestoesAPartirDe).toBeNull();
  });
});

describe("ocorrenciaContaParaTratamentoPublico — predicado de progresso", () => {
  const baseOco = {
    ocorrencia_id: "o1",
    tratamento_id: "tev",
    assistido_tratamento_id: "v1",
    data_ocorrencia: "2026-06-26",
    vinculadaAoTrabalhoPublico: true,
  };
  const args = { tratamentoId: "tev", liberadoDesde: "2026-06-20", vinculoId: "v1" };

  it("conta presença válida do próprio tratamento após liberação", () => {
    expect(ocorrenciaContaParaTratamentoPublico({ ocorrencia: baseOco, ...args })).toBe(true);
  });
  it("não conta palestra/evento genérico não vinculado", () => {
    expect(
      ocorrenciaContaParaTratamentoPublico({
        ocorrencia: { ...baseOco, vinculadaAoTrabalhoPublico: false },
        ...args,
      }),
    ).toBe(false);
  });
  it("não conta ocorrência de outro tratamento", () => {
    expect(
      ocorrenciaContaParaTratamentoPublico({
        ocorrencia: { ...baseOco, tratamento_id: "outro" },
        ...args,
      }),
    ).toBe(false);
  });
  it("não conta antes da liberação", () => {
    expect(
      ocorrenciaContaParaTratamentoPublico({
        ocorrencia: { ...baseOco, data_ocorrencia: "2026-06-10" },
        ...args,
      }),
    ).toBe(false);
  });
  it("não conta consumo duplicado da mesma ocorrência", () => {
    expect(
      ocorrenciaContaParaTratamentoPublico({
        ocorrencia: baseOco,
        ...args,
        consumidas: new Set(["o1"]),
      }),
    ).toBe(false);
  });
});

// ===========================================================================
// NOVO MODELO — construirPlanoEtapas (plano previsto + agenda ativa)
// ===========================================================================
describe("construirPlanoEtapas — plano previsto + agenda ativa", () => {
  const tipoSeq = {
    dia_semana: 6, // sábado
    horario: "20:00",
    frequencia_valor: 1,
    frequencia_unidade: "semanas",
  };

  it("respeita a quantidade parametrizada (sem hardcode) e ativa só a próxima etapa", () => {
    const plano = construirPlanoEtapas({
      status: "em_andamento",
      quantidade_total: 7,
      quantidade_realizada: 2,
      ordem_tratamento: 1,
      modo_agendamento: "sequencial_bloqueante",
      tipo: tipoSeq,
      dataInicio: BASE,
      baseStart: BASE,
    });

    expect(plano.etapas).toHaveLength(7);
    // 2 realizadas
    expect(plano.etapas.filter((e) => e.status_etapa === "realizada")).toHaveLength(2);
    // exatamente 1 ativa
    const ativas = plano.etapas.filter((e) => e.status_etapa === "ativa");
    expect(ativas).toHaveLength(1);
    expect(ativas[0].numero_etapa).toBe(3);
    // restante previsto
    expect(plano.etapas.filter((e) => e.status_etapa === "prevista")).toHaveLength(4);
    // sessão ativa aponta para a etapa 3 com data real
    expect(plano.sessaoAtiva?.numero_etapa).toBe(3);
    expect(plano.sessaoAtiva?.data).toBeTruthy();
  });

  it("usa a quantidade parametrizada diferente (ex.: Reiki = 4)", () => {
    const plano = construirPlanoEtapas({
      status: "aguardando_inicio",
      quantidade_total: 4,
      quantidade_realizada: 0,
      ordem_tratamento: 1,
      modo_agendamento: "sequencial_bloqueante",
      tipo: tipoSeq,
      dataInicio: BASE,
      baseStart: BASE,
    });
    expect(plano.etapas).toHaveLength(4);
    expect(plano.sessaoAtiva?.numero_etapa).toBe(1);
  });

  it("conclui: tudo realizado não gera etapa ativa nem sessão", () => {
    const plano = construirPlanoEtapas({
      status: "concluido",
      quantidade_total: 7,
      quantidade_realizada: 7,
      ordem_tratamento: 1,
      modo_agendamento: "sequencial_bloqueante",
      tipo: tipoSeq,
      dataInicio: BASE,
      baseStart: BASE,
    });
    expect(plano.etapas.every((e) => e.status_etapa === "realizada")).toBe(true);
    expect(plano.sessaoAtiva).toBeNull();
  });

  it("preserva histórico via statusPorEtapa (etapa ausente não vira ativa)", () => {
    const plano = construirPlanoEtapas({
      status: "em_andamento",
      quantidade_total: 7,
      quantidade_realizada: 1,
      ordem_tratamento: 1,
      modo_agendamento: "sequencial_bloqueante",
      tipo: tipoSeq,
      dataInicio: BASE,
      baseStart: BASE,
      statusPorEtapa: { 2: "ausente" },
    });
    expect(plano.etapas[1].status_etapa).toBe("ausente");
  });

  it("público livre: não gera sessão rígida, etapas ficam liberadas com sugestão", () => {
    const plano = construirPlanoEtapas({
      status: "em_andamento",
      quantidade_total: 7,
      quantidade_realizada: 1,
      ordem_tratamento: 5,
      modo_agendamento: "livre_concomitante",
      tipo: { ...tipoSeq, dia_semana: 4 },
      dataInicio: BASE,
      baseStart: BASE,
      trabalhoPublico: true,
      permiteEntradaSemAgendamento: true,
    });
    expect(plano.publicoLivre).toBe(true);
    expect(plano.sessaoAtiva).toBeNull();
    expect(plano.liberadoDesde).toBeTruthy();
    expect(plano.sugestoesAPartirDe).toBeTruthy();
    expect(
      plano.etapas.filter((e) => e.status_etapa === "liberada_para_comparecimento_publico").length,
    ).toBeGreaterThan(0);
  });
});

// ===========================================================================
// construirPlanoConsolidado — conversão para o novo modelo (caso Andréa)
// ===========================================================================
import { construirPlanoConsolidado, type PlanoConsolidadoInput } from "@/lib/agendaRules";

describe("construirPlanoConsolidado — apenas a próxima etapa necessária ativa", () => {
  const cenarioAndrea = (): PlanoConsolidadoInput[] => [
    {
      ref: "desob",
      tratamento_id: "t1",
      status: "concluido",
      quantidade_total: 7,
      quantidade_realizada: 7,
      modo_agendamento: "sequencial_bloqueante",
      ordem_tratamento: 1,
      tipo: tipo(3, "19:00"),
    },
    {
      ref: "anti",
      tratamento_id: "t2",
      status: "concluido",
      quantidade_total: 7,
      quantidade_realizada: 7,
      modo_agendamento: "sequencial_bloqueante",
      ordem_tratamento: 2,
      tipo: tipo(3, "19:00"),
    },
    {
      ref: "magnet",
      tratamento_id: "t3",
      status: "em_andamento",
      quantidade_total: 7,
      quantidade_realizada: 2,
      modo_agendamento: "sequencial_bloqueante",
      ordem_tratamento: 3,
      tipo: tipo(3, "19:00"),
    },
    {
      ref: "cura",
      tratamento_id: "t4",
      status: "aguardando_inicio",
      quantidade_total: 7,
      quantidade_realizada: 0,
      modo_agendamento: "sequencial_bloqueante",
      ordem_tratamento: 4,
      tipo: tipo(3, "19:00"),
    },
    {
      ref: "evang",
      tratamento_id: "t5",
      status: "aguardando_inicio",
      quantidade_total: 7,
      quantidade_realizada: 0,
      modo_agendamento: "livre_concomitante",
      ordem_tratamento: 5,
      tipo: tipo(4, "20:00"),
      trabalhoPublico: true,
      permiteEntradaSemAgendamento: true,
    },
  ];

  it("ativa apenas o sequencial em andamento e mantém o próximo previsto", () => {
    const planos = construirPlanoConsolidado(cenarioAndrea(), BASE);
    const byRef = new Map(planos.map((p) => [p.ref, p]));

    // Exatamente UMA etapa ativa em todo o plano (somente Magnetismo).
    const ativasTotais = planos.flatMap((p) =>
      p.plano.etapas.filter((e) => e.status_etapa === "ativa"),
    );
    expect(ativasTotais.length).toBe(1);

    const magnet = byRef.get("magnet")!;
    expect(magnet.plano.sessaoAtiva).not.toBeNull();
    expect(magnet.plano.sessaoAtiva!.numero_etapa).toBe(3);

    // Cura: sem etapa ativa, todas previstas (bloqueada pela cadeia).
    const cura = byRef.get("cura")!;
    expect(cura.plano.sessaoAtiva).toBeNull();
    expect(cura.plano.etapas.every((e) => e.status_etapa === "prevista")).toBe(true);
  });

  it("preserva tratamento público livre (liberado, sem agenda rígida)", () => {
    const planos = construirPlanoConsolidado(cenarioAndrea(), BASE);
    const evang = planos.find((p) => p.ref === "evang")!;
    expect(evang.plano.publicoLivre).toBe(true);
    expect(evang.plano.sessaoAtiva).toBeNull();
    expect(
      evang.plano.etapas.some(
        (e) => e.status_etapa === "liberada_para_comparecimento_publico",
      ),
    ).toBe(true);
  });

  it("respeita estados terminais já gravados (histórico preservado)", () => {
    const inputs = cenarioAndrea();
    inputs[2].statusPorEtapa = { 1: "realizada", 2: "realizada" };
    const planos = construirPlanoConsolidado(inputs, BASE);
    const magnet = planos.find((p) => p.ref === "magnet")!;
    expect(magnet.plano.etapas[0].status_etapa).toBe("realizada");
    expect(magnet.plano.etapas[1].status_etapa).toBe("realizada");
  });

  it("não ativa nada quando não há sequencial elegível", () => {
    const concluidos = cenarioAndrea().map((t) =>
      t.ref === "magnet"
        ? { ...t, status: "concluido", quantidade_realizada: 7 }
        : t,
    );
    // Remove o público para isolar: nenhuma etapa rígida ativa esperada.
    const semPublico = concluidos.filter((t) => t.ref !== "evang");
    const planos = construirPlanoConsolidado(semPublico, BASE);
    const ativas = planos.flatMap((p) =>
      p.plano.etapas.filter((e) => e.status_etapa === "ativa"),
    );
    // Cura (aguardando_inicio) vira a vez quando Magnetismo conclui.
    expect(ativas.length).toBe(1);
    expect(planos.find((p) => p.ref === "cura")!.plano.sessaoAtiva).not.toBeNull();
  });
});



