import { describe, it, expect } from "vitest";
import { generateSessionDates, buildValidDesignacoes } from "./fazerEntrevista";

describe("generateSessionDates", () => {
  it("generates the requested number of sessions on the right weekday", () => {
    // 2026-06-10 is a Wednesday (getDay === 3)
    const base = new Date("2026-06-10T12:00:00");
    const sessions = generateSessionDates(base, 3, "19:00", 1, "semanas", 3);
    expect(sessions).toHaveLength(3);
    expect(sessions[0].data_sessao).toBe("2026-06-10");
    expect(sessions[1].data_sessao).toBe("2026-06-17");
    expect(sessions[2].data_sessao).toBe("2026-06-24");
    expect(sessions.every((s) => s.horario === "19:00")).toBe(true);
  });

  it("rolls forward to the next matching weekday when interview is on another day", () => {
    const base = new Date("2026-06-10T12:00:00"); // Wednesday
    const sessions = generateSessionDates(base, 1, null, 1, "semanas", 2);
    // next Monday after 2026-06-10
    expect(sessions[0].data_sessao).toBe("2026-06-15");
    expect(sessions[1].data_sessao).toBe("2026-06-22");
  });

  it("falls back to day-after cadence when no weekday is fixed", () => {
    const base = new Date("2026-06-10T12:00:00");
    const sessions = generateSessionDates(base, null, null, 2, "dias", 2);
    expect(sessions[0].data_sessao).toBe("2026-06-11");
    expect(sessions[1].data_sessao).toBe("2026-06-13");
  });
});

describe("buildValidDesignacoes", () => {
  const map = {
    t1: { quantidade_padrao_sessoes: 4 },
    t2: { quantidade_padrao_sessoes: 6 },
  };

  it("uses explicit quantity when provided", () => {
    const result = buildValidDesignacoes({ t1: "10" }, map);
    expect(result).toEqual([{ tratamento_id: "t1", quantidade_total: 10 }]);
  });

  it("applies default quantity when field is blank", () => {
    const result = buildValidDesignacoes({ t2: "" }, map);
    expect(result).toEqual([{ tratamento_id: "t2", quantidade_total: 6 }]);
  });

  it("ignores unknown treatments and zero-effective quantities", () => {
    const zeroMap = { t3: { quantidade_padrao_sessoes: 0 } };
    expect(buildValidDesignacoes({ unknown: "5" }, map)).toEqual([]);
    expect(buildValidDesignacoes({ t3: "" }, zeroMap)).toEqual([]);
  });
});
