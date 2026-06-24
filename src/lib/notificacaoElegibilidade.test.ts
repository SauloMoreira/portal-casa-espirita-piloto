import { describe, it, expect } from "vitest";
import {
  motivoInelegibilidadeLembrete,
  sessaoElegivelParaLembrete,
  rotuloMotivo,
  MOTIVO_LABEL,
  podeEncerrarPorErroCadastro,
  MOTIVOS_ERRO_CADASTRO,
} from "@/lib/notificacaoElegibilidade";

// Avaliação fixa: "agora" = 2026-06-22 12:00 (horário de São Paulo).
const AGORA = new Date("2026-06-22T15:00:00Z"); // 12:00 -03:00
const FUTURO = "2026-06-25"; // 3 dias à frente
const HORA = "19:00";

describe("motivoInelegibilidadeLembrete", () => {
  it("Caso 1/4 — sessão ativa válida e futura gera lembrete", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBeNull();
    expect(
      sessaoElegivelParaLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBe(true);
  });

  it("sessão substituída por novo plano não gera (Caso 3 / remarcação)", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "substituida_plano",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBe("sessao_substituida");
  });

  it("Caso 2 — sessão cancelada não gera", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "cancelado",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBe("sessao_cancelada");
  });

  it("sessão órfã/inexistente não gera", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_criada",
        existeAgenda: false,
        agora: AGORA,
      }),
    ).toBe("sessao_inexistente");
  });

  it("sessão fora do estado agendado não gera (não é a agenda ativa)", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "realizada",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBe("sessao_nao_agendada");
  });

  it("sessão vencida (já passou) não gera, mesmo agendada", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: "2026-06-20",
        horario: "19:00",
        agora: AGORA,
      }),
    ).toBe("lembrete_vencido");
  });

  it("Caso 5 — evento não atrelado à agenda (sugestão/público) é ignorado por esta regra", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "checkin_publico",
        existeAgenda: false,
        agora: AGORA,
      }),
    ).toBeNull();
  });

  it("prioriza substituída sobre vencida quando ambos se aplicam", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "substituida_plano",
        sessaoData: "2026-06-20",
        horario: "19:00",
        agora: AGORA,
      }),
    ).toBe("sessao_substituida");
  });

  it("sessão futura prevista (não é a próxima do vínculo) não gera lembrete", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: FUTURO,
        horario: HORA,
        ehProxima: false,
        agora: AGORA,
      }),
    ).toBe("sessao_futura_nao_proxima");
  });

  it("a próxima sessão real do vínculo permanece elegível", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: FUTURO,
        horario: HORA,
        ehProxima: true,
        agora: AGORA,
      }),
    ).toBeNull();
  });

  it("ehProxima ausente não bloqueia (compatibilidade)", () => {
    expect(
      sessaoElegivelParaLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBe(true);
  });
});

describe("rotuloMotivo", () => {
  it("traduz motivos conhecidos", () => {
    expect(rotuloMotivo("sessao_substituida")).toBe(MOTIVO_LABEL.sessao_substituida);
    expect(rotuloMotivo("lembrete_vencido")).toBe(MOTIVO_LABEL.lembrete_vencido);
  });
  it("devolve o código quando desconhecido e null quando vazio", () => {
    expect(rotuloMotivo("motivo_inexistente_x")).toBe("motivo_inexistente_x");
    expect(rotuloMotivo(null)).toBeNull();
    expect(rotuloMotivo(undefined)).toBeNull();
  });
});
