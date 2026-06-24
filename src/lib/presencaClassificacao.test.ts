import { describe, it, expect } from "vitest";
import {
  classificarPresenca,
  contaComoPresenca,
  contaComoAusencia,
  ehSomenteHistorico,
  rotuloPresenca,
} from "./presencaClassificacao";

describe("classificarPresenca — fonte única geral × operacional (L-03)", () => {
  it("presente: conta presença, avança sessão, notifica presenca_registrada", () => {
    const c = classificarPresenca("presente");
    expect(c.classificacaoGeral).toBe("presenca");
    expect(c.classificacaoOperacional).toBe("presenca_valida");
    expect(c.contaPresenca).toBe(true);
    expect(c.contaAusencia).toBe(false);
    expect(c.disparaRemarcacao).toBe(false);
    expect(c.avancaSessao).toBe(true);
    expect(c.somenteHistorico).toBe(false);
    expect(c.eventoNotificacao).toBe("presenca_registrada");
  });

  it("ausente: conta ausência, dispara remarcação, notifica falta_registrada", () => {
    const c = classificarPresenca("ausente");
    expect(c.classificacaoGeral).toBe("ausencia");
    expect(c.classificacaoOperacional).toBe("ausencia_valida");
    expect(c.contaPresenca).toBe(false);
    expect(c.contaAusencia).toBe(true);
    expect(c.disparaRemarcacao).toBe(true);
    expect(c.avancaSessao).toBe(false);
    expect(c.somenteHistorico).toBe(false);
    expect(c.eventoNotificacao).toBe("falta_registrada");
  });

  it("justificado: APENAS histórico, sem efeito operacional nem notificação", () => {
    const c = classificarPresenca("justificado");
    expect(c.classificacaoGeral).toBe("ausencia_justificada");
    expect(c.classificacaoOperacional).toBe("somente_historico");
    expect(c.contaPresenca).toBe(false);
    expect(c.contaAusencia).toBe(false);
    expect(c.disparaRemarcacao).toBe(false);
    expect(c.avancaSessao).toBe(false);
    expect(c.somenteHistorico).toBe(true);
    expect(c.eventoNotificacao).toBeNull();
  });

  it("status desconhecido/null cai em fallback seguro (só histórico)", () => {
    for (const v of ["xpto", "", null, undefined]) {
      const c = classificarPresenca(v as never);
      expect(c.somenteHistorico).toBe(true);
      expect(c.contaPresenca).toBe(false);
      expect(c.contaAusencia).toBe(false);
      expect(c.eventoNotificacao).toBeNull();
    }
  });

  it("é case-insensitive", () => {
    expect(classificarPresenca("PRESENTE").contaPresenca).toBe(true);
    expect(classificarPresenca("Ausente").contaAusencia).toBe(true);
  });

  it("geral e operacional não entram em conflito (presença e ausência mutuamente exclusivas)", () => {
    for (const s of ["presente", "ausente", "justificado"]) {
      const c = classificarPresenca(s);
      expect(c.contaPresenca && c.contaAusencia).toBe(false);
      // só histórico nunca conta operacionalmente
      if (c.somenteHistorico) {
        expect(c.contaPresenca).toBe(false);
        expect(c.contaAusencia).toBe(false);
        expect(c.disparaRemarcacao).toBe(false);
        expect(c.avancaSessao).toBe(false);
      }
    }
  });

  it("atalhos refletem o mapa", () => {
    expect(contaComoPresenca("presente")).toBe(true);
    expect(contaComoAusencia("ausente")).toBe(true);
    expect(ehSomenteHistorico("justificado")).toBe(true);
    expect(rotuloPresenca("presente")).toBe("Presença");
    expect(rotuloPresenca("justificado")).toBe("Ausência justificada");
  });
});
