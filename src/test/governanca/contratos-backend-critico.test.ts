/**
 * BLOCO: Contratos de backend crítico.
 *
 * Protege a SEMÂNTICA e o conjunto de retornos estáveis dos espelhos oficiais
 * das funções de banco. Se o backend mudar a forma/semântica e o espelho não
 * acompanhar (ou vice-versa), estes contratos quebram — detectando divergência
 * entre fonte de verdade e espelho frontend.
 *
 * Contratos cobertos:
 *  - `fn_fila_motivo_inelegivel` (sessão e entrevista) → conjunto de motivos
 *  - `fn_presenca_classificacao` → classificação operacional
 */
import { describe, it, expect } from "vitest";
import {
  motivoInelegibilidadeLembrete,
  motivoInelegibilidadeEntrevista,
} from "@/lib/notificacaoElegibilidade";
import { classificarPresenca, STATUS_PRESENCA } from "@/lib/presencaClassificacao";

const AGORA = new Date("2026-06-24T12:00:00-03:00");

describe("CONTRATO fn_fila_motivo_inelegivel — motivos de sessão estáveis", () => {
  it("a ordem de decisão produz exatamente os motivos esperados", () => {
    const motivos = new Set<string | null>();
    motivos.add(motivoInelegibilidadeLembrete({ evento: "sessao_lembrete", existeAgenda: false, agora: AGORA }));
    motivos.add(motivoInelegibilidadeLembrete({ evento: "sessao_lembrete", existeAgenda: true, agendaStatus: "substituida_plano", sessaoData: "2026-07-15", ehProxima: true, agora: AGORA }));
    motivos.add(motivoInelegibilidadeLembrete({ evento: "sessao_lembrete", existeAgenda: true, agendaStatus: "cancelado", sessaoData: "2026-07-15", ehProxima: true, agora: AGORA }));
    motivos.add(motivoInelegibilidadeLembrete({ evento: "sessao_lembrete", existeAgenda: true, agendaStatus: "remarcado", sessaoData: "2026-07-15", ehProxima: true, agora: AGORA }));
    motivos.add(motivoInelegibilidadeLembrete({ evento: "sessao_lembrete", existeAgenda: true, agendaStatus: "agendado", sessaoData: "2026-06-20", horario: "15:00", ehProxima: true, agora: AGORA }));
    motivos.add(motivoInelegibilidadeLembrete({ evento: "sessao_lembrete", existeAgenda: true, agendaStatus: "agendado", sessaoData: "2026-09-01", horario: "15:00", ehProxima: false, agora: AGORA }));

    expect(motivos).toEqual(
      new Set([
        "sessao_inexistente",
        "sessao_substituida",
        "sessao_cancelada",
        "sessao_nao_agendada",
        "lembrete_vencido",
        "sessao_futura_nao_proxima",
      ]),
    );
  });
});

describe("CONTRATO fn_fila_motivo_inelegivel — motivos de entrevista estáveis", () => {
  it("a ordem de decisão produz exatamente os motivos esperados", () => {
    const motivos = new Set<string | null>();
    motivos.add(motivoInelegibilidadeEntrevista({ evento: "entrevista_lembrete", existeEntrevista: false, agora: AGORA }));
    motivos.add(motivoInelegibilidadeEntrevista({ evento: "entrevista_lembrete", existeEntrevista: true, entrevistaStatus: "cancelada", entrevistaData: "2026-07-15", agora: AGORA }));
    motivos.add(motivoInelegibilidadeEntrevista({ evento: "entrevista_lembrete", existeEntrevista: true, entrevistaStatus: "agendada", entrevistaData: "2026-07-15", mesmaVersao: false, agora: AGORA }));
    motivos.add(motivoInelegibilidadeEntrevista({ evento: "entrevista_lembrete", existeEntrevista: true, entrevistaStatus: "agendada", entrevistaData: "2026-06-23", agora: AGORA }));

    expect(motivos).toEqual(
      new Set([
        "entrevista_inexistente",
        "entrevista_cancelada",
        "entrevista_remarcada",
        "entrevista_vencida",
      ]),
    );
  });
});

describe("CONTRATO fn_presenca_classificacao — semântica operacional por status", () => {
  it("expõe os campos operacionais esperados para cada status oficial", () => {
    const campos = [
      "classificacaoGeral",
      "classificacaoOperacional",
      "contaPresenca",
      "contaAusencia",
      "disparaRemarcacao",
      "avancaSessao",
      "somenteHistorico",
      "eventoNotificacao",
    ];
    for (const status of Object.values(STATUS_PRESENCA)) {
      const c = classificarPresenca(status) as unknown as Record<string, unknown>;
      for (const campo of campos) expect(c).toHaveProperty(campo);
    }
  });

  it("classificações operacionais possíveis pertencem ao enum do contrato", () => {
    const permitidas = new Set(["presenca_valida", "ausencia_valida", "somente_historico"]);
    for (const status of Object.values(STATUS_PRESENCA)) {
      expect(permitidas.has(classificarPresenca(status).classificacaoOperacional)).toBe(true);
    }
  });
});
