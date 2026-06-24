/**
 * BLOCO: Regressão de bugs históricos (proteção permanente).
 *
 * Cada teste aqui representa um bug REAL que já foi doloroso e foi corrigido.
 * Eles existem para impedir a reabertura desses bugs em qualquer refatoração
 * futura. Cada caso aponta a invariante que o bug violava.
 */
import { describe, it, expect } from "vitest";
import { renderTemplate } from "@/lib/notificacoes";
import {
  motivoInelegibilidadeLembrete,
  motivoInelegibilidadeEntrevista,
} from "@/lib/notificacaoElegibilidade";
import { classificarPresenca } from "@/lib/presencaClassificacao";

const AGORA = new Date("2026-06-24T12:00:00-03:00");

describe("REGRESSÃO: horário fantasma em entrevista (INV-TEMPO-001)", () => {
  it("data pura serializada como meia-noite UTC nunca vira 21:00", () => {
    for (const data of ["2026-07-15", "2026-07-15T00:00:00Z", "2026-07-15T00:00:00+00:00"]) {
      const out = renderTemplate("{{data}}", { data });
      expect(out).toBe("15/07/2026");
      expect(out).not.toMatch(/\d{2}:\d{2}/);
    }
  });
});

describe("REGRESSÃO: cadeia futura de lembretes (INV-FILA-003)", () => {
  it("sessão futura prevista que não é a próxima não pode gerar lembrete", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: "2026-10-01",
        horario: "15:00",
        ehProxima: false,
        agora: AGORA,
      }),
    ).toBe("sessao_futura_nao_proxima");
  });
});

describe("REGRESSÃO: confirmação antecipada indevida de tratamento (INV-FILA-005)", () => {
  it("sessão remarcada/substituída não permanece elegível (lembrete antigo morre)", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "substituida_plano",
        sessaoData: "2026-07-15",
        horario: "15:00",
        ehProxima: true,
        agora: AGORA,
      }),
    ).toBe("sessao_substituida");
  });
});

describe("REGRESSÃO: justificado contando como falta operacional (INV-PRES-002)", () => {
  it("justificado NÃO conta ausência nem dispara remarcação", () => {
    const c = classificarPresenca("justificado");
    expect(c.contaAusencia).toBe(false);
    expect(c.disparaRemarcacao).toBe(false);
    expect(c.somenteHistorico).toBe(true);
  });
});

describe("REGRESSÃO: entrevista inválida sobrevivendo na fila saneada (INV-FILA-006)", () => {
  it("entrevista cancelada/remarcada/vencida/inexistente é sempre barrada", () => {
    expect(motivoInelegibilidadeEntrevista({ evento: "entrevista_lembrete", existeEntrevista: false, agora: AGORA })).toBe("entrevista_inexistente");
    expect(motivoInelegibilidadeEntrevista({ evento: "entrevista_lembrete", existeEntrevista: true, entrevistaStatus: "cancelada", entrevistaData: "2026-07-15", agora: AGORA })).toBe("entrevista_cancelada");
    expect(motivoInelegibilidadeEntrevista({ evento: "entrevista_lembrete", existeEntrevista: true, entrevistaStatus: "agendada", entrevistaData: "2026-07-15", mesmaVersao: false, agora: AGORA })).toBe("entrevista_remarcada");
    expect(motivoInelegibilidadeEntrevista({ evento: "entrevista_lembrete", existeEntrevista: true, entrevistaStatus: "agendada", entrevistaData: "2026-06-23", agora: AGORA })).toBe("entrevista_vencida");
  });
});

describe("REGRESSÃO: ausência/remarcação não geram lembrete duplicado (INV-FILA-002)", () => {
  it("sessão não-agendada (já consumida/remarcada) não é mais elegível", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "remarcado",
        sessaoData: "2026-07-15",
        horario: "15:00",
        ehProxima: true,
        agora: AGORA,
      }),
    ).toBe("sessao_nao_agendada");
  });
});
