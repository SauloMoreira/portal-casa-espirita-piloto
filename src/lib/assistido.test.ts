import { describe, it, expect } from "vitest";
import { progressoPct, diaSemanaDe, horarioCurto, proximaSessao } from "./assistido";

describe("assistido helpers", () => {
  it("calcula percentual de progresso limitado", () => {
    expect(progressoPct(0, 10)).toBe(0);
    expect(progressoPct(5, 10)).toBe(50);
    expect(progressoPct(10, 10)).toBe(100);
    expect(progressoPct(12, 10)).toBe(100);
    expect(progressoPct(1, 0)).toBe(0);
  });

  it("retorna dia da semana correto", () => {
    // 2026-06-11 é uma quinta-feira.
    expect(diaSemanaDe("2026-06-11")).toBe("Quinta-feira");
    // 2026-06-14 é um domingo.
    expect(diaSemanaDe("2026-06-14")).toBe("Domingo");
  });

  it("encurta horário e trata ausência", () => {
    expect(horarioCurto("14:30:00")).toBe("14:30");
    expect(horarioCurto(null)).toBeNull();
    expect(horarioCurto(undefined)).toBeNull();
  });

  it("seleciona a próxima sessão agendada futura mais próxima", () => {
    const sessoes = [
      { data_sessao: "2026-06-20", status: "agendado" },
      { data_sessao: "2026-06-12", status: "agendado" },
      { data_sessao: "2026-06-01", status: "realizado" },
      { data_sessao: "2026-06-05", status: "agendado" }, // passado
    ];
    expect(proximaSessao(sessoes, "2026-06-11")?.data_sessao).toBe("2026-06-12");
  });

  it("retorna null quando não há sessões futuras agendadas", () => {
    const sessoes = [
      { data_sessao: "2026-06-01", status: "realizado" },
      { data_sessao: "2026-06-05", status: "ausente" },
    ];
    expect(proximaSessao(sessoes, "2026-06-11")).toBeNull();
  });
});
