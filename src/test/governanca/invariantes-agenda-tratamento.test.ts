/**
 * BLOCO: Invariantes de agenda e tratamento.
 *
 * Protege as regras estruturais que garantem que a fila/dispatch só tratem o
 * compromisso REAL válido de cada vínculo, nunca cadeia futura prevista nem
 * sessões superadas. Exercita o espelho oficial `notificacaoElegibilidade.ts`
 * (contraparte de `fn_fila_motivo_inelegivel`).
 *
 * Invariantes protegidas:
 *  - INV-AGD-002 — um vínculo só tem uma próxima sessão real válida por vez
 *  - INV-AGD-003 — remarcação invalida a sessão anterior
 *  - INV-AGD-004 — cancelamento invalida operacionalmente a sessão
 *  - INV-FILA-002 — um único lembrete válido por vínculo
 *  - INV-FILA-003 — sessão prevista não gera lembrete
 */
import { describe, it, expect } from "vitest";
import {
  motivoInelegibilidadeLembrete,
  sessaoElegivelParaLembrete,
} from "@/lib/notificacaoElegibilidade";

const AGORA = new Date("2026-06-24T12:00:00-03:00");
const FUTURO = "2026-07-15";

describe("INV-AGD-002 — um vínculo só tem uma próxima sessão real válida", () => {
  it("a próxima sessão real agendada é elegível", () => {
    expect(
      sessaoElegivelParaLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: FUTURO,
        horario: "15:00",
        ehProxima: true,
        agora: AGORA,
      }),
    ).toBe(true);
  });

  it("INV-FILA-003 — uma sessão futura que NÃO é a próxima do vínculo é inelegível", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: "2026-09-01",
        horario: "15:00",
        ehProxima: false,
        agora: AGORA,
      }),
    ).toBe("sessao_futura_nao_proxima");
  });
});

describe("INV-AGD-003 — remarcação invalida a sessão anterior", () => {
  it("sessão substituída por novo plano deixa de ser elegível", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "substituida_plano",
        sessaoData: FUTURO,
        horario: "15:00",
        ehProxima: true,
        agora: AGORA,
      }),
    ).toBe("sessao_substituida");
  });

  it("sessão que não está mais 'agendado' não é mais a agenda ativa", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "remarcado",
        sessaoData: FUTURO,
        horario: "15:00",
        ehProxima: true,
        agora: AGORA,
      }),
    ).toBe("sessao_nao_agendada");
  });
});

describe("INV-AGD-004 — cancelamento invalida operacionalmente a sessão", () => {
  it("sessão cancelada deixa de ser elegível para lembrete", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "cancelado",
        sessaoData: FUTURO,
        horario: "15:00",
        ehProxima: true,
        agora: AGORA,
      }),
    ).toBe("sessao_cancelada");
  });
});

describe("INV-FILA-002/003 — lembrete só nasce de sessão real agendada", () => {
  it("agenda inexistente (plano previsto/órfão) não gera lembrete", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: false,
        agora: AGORA,
      }),
    ).toBe("sessao_inexistente");
  });

  it("lembrete cuja sessão já passou está vencido (não pode reenviar)", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: "2026-06-20",
        horario: "15:00",
        ehProxima: true,
        agora: AGORA,
      }),
    ).toBe("lembrete_vencido");
  });
});
