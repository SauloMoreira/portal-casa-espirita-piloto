import { describe, it, expect } from "vitest";
import {
  validateTratamentoLegado,
  buildAssistidoLegadoInsert,
  buildVinculoLegadoInsert,
  buildProximaSessaoInsert,
  isStatusValido,
  statusPermiteProximaSessao,
  previewAgendaTratamento,
  previewAgendaMigracao,
  quantidadeRestante,
  type TratamentoLegadoInput,
  type TipoMigracao,
} from "./migracaoLegado";
import {
  elegibilidadeAgenda,
  projetarAgendaRestante,
  sessoesIguais,
  normalizarSessoes,
  type ParametrosTipoAgenda,
} from "./agendaRules";
import { generateSessionDates } from "./fazerEntrevista";

const futuro = (offsetDays: number, weekdayTarget?: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  if (weekdayTarget !== undefined) {
    while (d.getDay() !== weekdayTarget) d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
};

const baseInput = (over: Partial<TratamentoLegadoInput> = {}): TratamentoLegadoInput => ({
  tratamento_id: "t1",
  status: "em_andamento",
  quantidade_total: 10,
  quantidade_realizada: 4,
  ...over,
});

describe("status helpers", () => {
  it("identifica status válidos", () => {
    expect(isStatusValido("em_andamento")).toBe(true);
    expect(isStatusValido("inexistente")).toBe(false);
  });
  it("controla compatibilidade de próxima sessão", () => {
    expect(statusPermiteProximaSessao("liberado")).toBe(true);
    expect(statusPermiteProximaSessao("concluido")).toBe(false);
    expect(statusPermiteProximaSessao("cancelado")).toBe(false);
  });
});

describe("validateTratamentoLegado", () => {
  it("aceita payload coerente sem próxima sessão", () => {
    expect(validateTratamentoLegado(baseInput())).toEqual([]);
  });

  it("rejeita realizada > total", () => {
    const errs = validateTratamentoLegado(baseInput({ quantidade_realizada: 12 }));
    expect(errs.some((e) => /realizada não pode ser maior/.test(e))).toBe(true);
  });

  it("rejeita status inválido", () => {
    const errs = validateTratamentoLegado(baseInput({ status: "xpto" }));
    expect(errs.some((e) => /Status de tratamento inválido/.test(e))).toBe(true);
  });

  it("bloqueia próxima sessão em status incompatível sem confirmação", () => {
    const errs = validateTratamentoLegado(
      baseInput({ status: "suspenso", proxima_sessao_data: futuro(7) }),
    );
    expect(errs.some((e) => /não permite agendar/.test(e))).toBe(true);
  });

  it("permite próxima sessão em status incompatível com confirmação", () => {
    const errs = validateTratamentoLegado(
      baseInput({ status: "suspenso", proxima_sessao_data: futuro(7) }),
      { confirmarStatusIncompativel: true },
    );
    expect(errs.some((e) => /não permite agendar/.test(e))).toBe(false);
  });

  it("rejeita data no passado", () => {
    const errs = validateTratamentoLegado(
      baseInput({ proxima_sessao_data: "2020-01-01" }),
    );
    expect(errs.some((e) => /passado/.test(e))).toBe(true);
  });

  it("valida coerência com dia_semana", () => {
    const data = futuro(3, 1); // segunda-feira
    const okMonday = validateTratamentoLegado(
      baseInput({ proxima_sessao_data: data }),
      { diaSemana: 1 },
    );
    expect(okMonday).toEqual([]);
    const errWrong = validateTratamentoLegado(
      baseInput({ proxima_sessao_data: data }),
      { diaSemana: 3 },
    );
    expect(errWrong.some((e) => /deve cair em/.test(e))).toBe(true);
  });

  it("bloqueia colisão com sessão futura sem confirmação", () => {
    const data = futuro(7);
    const errs = validateTratamentoLegado(
      baseInput({ proxima_sessao_data: data }),
      { sessoesFuturas: [data] },
    );
    expect(errs.some((e) => /sessão futura/.test(e))).toBe(true);
    const ok = validateTratamentoLegado(
      baseInput({ proxima_sessao_data: data }),
      { sessoesFuturas: [data], confirmarColisaoSessaoFutura: true },
    );
    expect(ok.some((e) => /sessão futura/.test(e))).toBe(false);
  });

  it("bloqueia duplicidade de vínculo ativo sem confirmação", () => {
    const errs = validateTratamentoLegado(baseInput(), { vinculoAtivoExistente: true });
    expect(errs.some((e) => /vínculo ativo/.test(e))).toBe(true);
    const ok = validateTratamentoLegado(baseInput(), {
      vinculoAtivoExistente: true,
      confirmarDuplicidade: true,
    });
    expect(ok.some((e) => /vínculo ativo/.test(e))).toBe(false);
  });
});

describe("builders", () => {
  it("monta assistido legado com flags corretas", () => {
    const payload = buildAssistidoLegadoInsert(
      { nome: "  Maria  ", cpf: "123.456.789-00", celular: "(11) 99999-8888", estado: "sp" },
      { userId: "u1", dataMigracao: "2026-06-20T00:00:00Z", observacaoMigracao: "Veio da rotina manual" },
    );
    expect(payload.origem_cadastro).toBe("legado");
    expect(payload.migrado_legado).toBe(true);
    expect(payload.status).toBe("em_tratamento");
    expect(payload.nome).toBe("Maria");
    expect(payload.cpf).toBe("12345678900");
    expect(payload.celular).toBe("11999998888");
    expect(payload.estado).toBe("SP");
    expect(payload.created_by).toBe("u1");
  });

  it("monta vínculo legado sem entrevista", () => {
    const v = buildVinculoLegadoInsert("a1", baseInput({ observacao: "já em desobsessão" }), "u1");
    expect(v.entrevista_id).toBeNull();
    expect(v.origem).toBe("legado");
    expect(v.status).toBe("em_andamento");
    expect(v.quantidade_total).toBe(10);
    expect(v.quantidade_realizada).toBe(4);
    expect(v.observacao_migracao).toBe("já em desobsessão");
  });

  it("não monta próxima sessão sem data", () => {
    expect(buildProximaSessaoInsert("a1", "v1", baseInput(), "u1")).toBeNull();
  });

  it("monta próxima sessão agendada quando há data", () => {
    const data = futuro(7);
    const row = buildProximaSessaoInsert(
      "a1",
      "v1",
      baseInput({ proxima_sessao_data: data, proxima_sessao_horario: "19:30" }),
      "u1",
    );
    expect(row).not.toBeNull();
    expect(row!.status).toBe("agendado");
    expect(row!.data_sessao).toBe(data);
    expect(row!.horario).toBe("19:30");
  });
});

const tipoBase = (over: Partial<ParametrosTipoAgenda> = {}): ParametrosTipoAgenda => ({
  dia_semana: 1, // segunda
  horario: "19:00",
  frequencia_valor: 1,
  frequencia_unidade: "semanas",
  ...over,
});

describe("quantidadeRestante", () => {
  it("calcula restante e nunca fica negativo", () => {
    expect(quantidadeRestante(7, 2)).toBe(5);
    expect(quantidadeRestante(7, 7)).toBe(0);
    expect(quantidadeRestante(7, 10)).toBe(0);
  });
});

describe("elegibilidadeAgenda (fonte única)", () => {
  it("gera para aguardando_inicio/liberado/em_andamento com restante e data", () => {
    for (const status of ["aguardando_inicio", "liberado", "em_andamento"]) {
      expect(
        elegibilidadeAgenda({ status, restante: 5, temDataInicio: true }).geraAgenda,
      ).toBe(true);
    }
  });

  it("não gera para concluido/cancelado/suspenso, com motivo", () => {
    for (const status of ["concluido", "cancelado", "suspenso"]) {
      const r = elegibilidadeAgenda({ status, restante: 5, temDataInicio: true });
      expect(r.geraAgenda).toBe(false);
      expect(r.motivoNaoGera).toBeTruthy();
    }
  });

  it("não gera quando restante = 0", () => {
    const r = elegibilidadeAgenda({ status: "em_andamento", restante: 0, temDataInicio: true });
    expect(r.geraAgenda).toBe(false);
    expect(r.motivoNaoGera).toMatch(/restante/i);
  });

  it("aguardando_agendamento sem data segue para fila (regra normal)", () => {
    const r = elegibilidadeAgenda({ status: "aguardando_agendamento", restante: 5, temDataInicio: false });
    expect(r.geraAgenda).toBe(false);
    expect(r.motivoNaoGera).toMatch(/fila/i);
  });

  it("não gera sem data de início mesmo em status gerador", () => {
    const r = elegibilidadeAgenda({ status: "em_andamento", restante: 5, temDataInicio: false });
    expect(r.geraAgenda).toBe(false);
  });
});

describe("previewAgendaTratamento", () => {
  it("gera todas as sessões restantes pela regra oficial", () => {
    const data = futuro(2, 1); // segunda
    const p = previewAgendaTratamento(
      baseInput({ status: "em_andamento", quantidade_total: 7, quantidade_realizada: 2, proxima_sessao_data: data }),
      tipoBase(),
      data,
    );
    expect(p.geraAgenda).toBe(true);
    expect(p.restante).toBe(5);
    expect(p.sessoes).toHaveLength(5);
    for (const s of p.sessoes) {
      expect(new Date(s.data_sessao + "T00:00:00").getDay()).toBe(1);
    }
  });

  it("não gera quando concluído (com motivo)", () => {
    const p = previewAgendaTratamento(
      baseInput({ status: "concluido", quantidade_total: 7, quantidade_realizada: 7 }),
      tipoBase(),
      futuro(2, 1),
    );
    expect(p.geraAgenda).toBe(false);
    expect(p.sessoes).toHaveLength(0);
    expect(p.motivoNaoGera).toBeTruthy();
  });

  it("não gera sem data de início (fica elegível para fila)", () => {
    const p = previewAgendaTratamento(
      baseInput({ status: "em_andamento" }),
      tipoBase(),
      null,
    );
    expect(p.geraAgenda).toBe(false);
    expect(p.sessoes).toHaveLength(0);
  });
});

describe("paridade fluxo normal x legado", () => {
  it("mesma projeção restante para total/realizada equivalentes", () => {
    const data = futuro(2, 1);
    const inicio = new Date(data + "T12:00:00");
    const tipo = tipoBase();

    const restante = 7 - 2;
    const normal = normalizarSessoes(
      generateSessionDates(inicio, tipo.dia_semana, tipo.horario, tipo.frequencia_valor!, tipo.frequencia_unidade!, restante),
    );

    const legado = previewAgendaTratamento(
      baseInput({ status: "em_andamento", quantidade_total: 7, quantidade_realizada: 2, proxima_sessao_data: data }),
      tipo,
      data,
    );

    expect(sessoesIguais(normal, legado.sessoes)).toBe(true);
  });
});

describe("comparação canônica de payloads (prévia == gravação)", () => {
  it("considera iguais payloads com ordem/horário equivalentes", () => {
    const a = [
      { data_sessao: "2026-07-06", horario: "19:00" },
      { data_sessao: "2026-06-29", horario: "19:00:00" },
    ];
    const b = [
      { data_sessao: "2026-06-29", horario: "19:00" },
      { data_sessao: "2026-07-06", horario: "19:00" },
    ];
    expect(sessoesIguais(a, b)).toBe(true);
  });

  it("detecta divergência real de datas (payload da UI rejeitado)", () => {
    const canonico = projetarAgendaRestante({
      status: "em_andamento",
      quantidade_total: 7,
      quantidade_realizada: 2,
      tipo: tipoBase(),
      dataInicio: new Date(futuro(2, 1) + "T12:00:00"),
    }).sessoes;
    const adulterado = canonico.map((s, i) =>
      i === 0 ? { ...s, data_sessao: "2099-01-01" } : s,
    );
    expect(sessoesIguais(canonico, adulterado)).toBe(false);
  });
});

describe("previewAgendaMigracao — projeção consolidada na migração", () => {
  const BASE = "2026-06-20"; // sábado
  const tipos: Record<string, TipoMigracao> = {
    anti: {
      dia_semana: 2,
      horario: "19:00",
      frequencia_valor: 1,
      frequencia_unidade: "semanas",
      modo_agendamento: "sequencial_bloqueante",
      ordem_tratamento: 2,
    },
    mag: {
      dia_semana: 1,
      horario: "19:00",
      frequencia_valor: 1,
      frequencia_unidade: "semanas",
      modo_agendamento: "sequencial_bloqueante",
      ordem_tratamento: 3,
    },
    livre: {
      dia_semana: 4,
      horario: "20:00",
      frequencia_valor: 1,
      frequencia_unidade: "semanas",
      modo_agendamento: "livre_concomitante",
      ordem_tratamento: 5,
    },
    dataInicial: {
      dia_semana: 3,
      horario: "19:00",
      frequencia_valor: 1,
      frequencia_unidade: "semanas",
      modo_agendamento: "agendado_por_data_inicial",
      ordem_tratamento: 6,
    },
    publico: {
      dia_semana: 5,
      horario: "19:00",
      frequencia_valor: 1,
      frequencia_unidade: "semanas",
      modo_agendamento: "livre_concomitante",
      ordem_tratamento: 9,
      trabalho_publico: true,
      permite_entrada_sem_agendamento: true,
    },
  };

  it("infere sequencial e livre sem data manual", () => {
    const res = previewAgendaMigracao(
      [
        { tratamento_id: "anti", status: "em_andamento", quantidade_total: 7, quantidade_realizada: 2 },
        { tratamento_id: "livre", status: "em_andamento", quantidade_total: 5, quantidade_realizada: 0 },
      ],
      tipos,
      BASE,
    );
    expect(res[0].geraAgenda).toBe(true);
    expect(res[0].exigeDataManual).toBe(false);
    expect(res[1].geraAgenda).toBe(true);
    expect(res[1].exigeDataManual).toBe(false);
  });

  it("exige data manual apenas para agendado_por_data_inicial", () => {
    const semData = previewAgendaMigracao(
      [{ tratamento_id: "dataInicial", status: "em_andamento", quantidade_total: 4, quantidade_realizada: 0 }],
      tipos,
      BASE,
    );
    expect(semData[0].exigeDataManual).toBe(true);
    expect(semData[0].geraAgenda).toBe(false);

    const comData = previewAgendaMigracao(
      [
        {
          tratamento_id: "dataInicial",
          status: "em_andamento",
          quantidade_total: 4,
          quantidade_realizada: 0,
          dataInicio: "2026-06-24", // quarta
        },
      ],
      tipos,
      BASE,
    );
    expect(comData[0].exigeDataManual).toBe(false);
    expect(comData[0].geraAgenda).toBe(true);
  });

  it("trata público livre com sugestões, sem agenda rígida", () => {
    const res = previewAgendaMigracao(
      [
        { tratamento_id: "anti", status: "em_andamento", quantidade_total: 7, quantidade_realizada: 2 },
        { tratamento_id: "publico", status: "em_andamento", quantidade_total: 8, quantidade_realizada: 1 },
      ],
      tipos,
      BASE,
    );
    const pub = res[1];
    expect(pub.geraAgenda).toBe(false);
    expect(pub.sessoes).toHaveLength(0);
    expect(pub.tratamentoPublicoComSugestao).toBe(true);
    // Base aplica piso em "hoje": liberadoDesde é o maior entre BASE e hoje.
    expect(pub.liberadoDesde! >= BASE).toBe(true);
    expect(pub.sugestoes!.length).toBeGreaterThan(0);
    expect(pub.sugestoesAPartirDe).toBeTruthy();
  });

  it("aplica piso em hoje na data base (contexto migração)", () => {
    const res = previewAgendaMigracao(
      [{ tratamento_id: "anti", status: "em_andamento", quantidade_total: 7, quantidade_realizada: 0 }],
      tipos,
      "2000-01-01", // passado → piso hoje
    );
    const hoje = new Date().toISOString().slice(0, 10);
    expect(res[0].sessoes.every((s) => s.data_sessao >= hoje)).toBe(true);
  });
});


