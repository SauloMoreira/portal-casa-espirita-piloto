import { describe, it, expect } from "vitest";
import {
  isTratamentoHolistico,
  validarHorarioHolistico,
  construirPlanoEtapas,
} from "@/lib/agendaRules";

describe("isTratamentoHolistico", () => {
  it("identifica holístico exclusivamente por tipo === 'holistico'", () => {
    expect(isTratamentoHolistico("holistico")).toBe(true);
    expect(isTratamentoHolistico(" Holistico ")).toBe(true);
    expect(isTratamentoHolistico("HOLISTICO")).toBe(true);
  });

  it("não classifica outros tipos como holístico", () => {
    expect(isTratamentoHolistico("espiritual")).toBe(false);
    expect(isTratamentoHolistico("")).toBe(false);
    expect(isTratamentoHolistico(null)).toBe(false);
    expect(isTratamentoHolistico(undefined)).toBe(false);
  });
});

describe("validarHorarioHolistico", () => {
  it("holístico exige horário válido", () => {
    expect(validarHorarioHolistico({ holistico: true, horario: "14:30" }).valido).toBe(true);
    const semHora = validarHorarioHolistico({ holistico: true, horario: null });
    expect(semHora.valido).toBe(false);
    expect(semHora.erro).toBeTruthy();
    expect(validarHorarioHolistico({ holistico: true, horario: "" }).valido).toBe(false);
  });

  it("não holístico nunca exige horário", () => {
    expect(validarHorarioHolistico({ holistico: false, horario: null }).valido).toBe(true);
    expect(validarHorarioHolistico({ holistico: false, horario: "" }).valido).toBe(true);
  });
});

describe("construirPlanoEtapas — horario_previsto", () => {
  const BASE = new Date("2026-06-20T12:00:00");

  it("propaga o horário padrão do tipo às etapas futuras e mantém null nas realizadas", () => {
    const plano = construirPlanoEtapas({
      status: "em_andamento",
      quantidade_total: 3,
      quantidade_realizada: 1,
      ordem_tratamento: 1,
      modo_agendamento: "sequencial_bloqueante",
      tipo: {
        dia_semana: 6,
        horario: "15:00",
        frequencia_valor: 1,
        frequencia_unidade: "semanas",
      },
      dataInicio: BASE,
      baseStart: BASE,
    });

    const realizada = plano.etapas.find((e) => e.numero_etapa === 1);
    const futuras = plano.etapas.filter((e) => e.numero_etapa > 1);
    expect(realizada?.horario_previsto).toBeNull();
    expect(futuras.length).toBeGreaterThan(0);
    for (const e of futuras) expect(e.horario_previsto).toBe("15:00");
    expect(plano.sessaoAtiva?.horario).toBe("15:00");
  });

  it("mantém horario_previsto null quando o tipo não tem horário (legado/não holístico)", () => {
    const plano = construirPlanoEtapas({
      status: "em_andamento",
      quantidade_total: 2,
      quantidade_realizada: 0,
      ordem_tratamento: 1,
      modo_agendamento: "sequencial_bloqueante",
      tipo: {
        dia_semana: 6,
        horario: null,
        frequencia_valor: 1,
        frequencia_unidade: "semanas",
      },
      dataInicio: BASE,
      baseStart: BASE,
    });
    for (const e of plano.etapas) expect(e.horario_previsto).toBeNull();
  });
});
