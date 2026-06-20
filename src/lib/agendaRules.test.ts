import { describe, it, expect } from "vitest";
import {
  projetarAgendaConsolidada,
  isTratamentoPublicoLivre,
  ocorrenciaContaParaTratamentoPublico,
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
