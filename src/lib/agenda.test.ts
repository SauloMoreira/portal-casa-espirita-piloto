import { describe, it, expect } from "vitest";
import { formatEntrevistaTime, rotuloHorarioEntrevista } from "./agenda";

describe("formatEntrevistaTime", () => {
  it("returns null when time is midnight (no explicit time)", () => {
    expect(formatEntrevistaTime("2026-06-10T00:00:00Z")).toBeNull();
  });
  it("formats the UTC time portion", () => {
    expect(formatEntrevistaTime("2026-06-10T14:30:00Z")).toBe("14:30");
    expect(formatEntrevistaTime("2026-06-10T09:05:00Z")).toBe("09:05");
  });
});

describe("rotuloHorarioEntrevista", () => {
  it("shows the real time when one is set, regardless of status", () => {
    expect(rotuloHorarioEntrevista("2026-06-10T14:30:00Z", "agendada")).toBe("14:30");
    expect(rotuloHorarioEntrevista("2026-06-10T14:30:00Z", "realizada")).toBe("14:30");
  });
  it("communicates date-only realized interviews as a valid domain state", () => {
    // Operational 'Realizar Entrevista' flow stores date-only + status realizada.
    expect(rotuloHorarioEntrevista("2026-06-23T00:00:00Z", "realizada")).toBe(
      "Sem horário registrado",
    );
  });
  it("labels a scheduled date-only interview as pending a time", () => {
    expect(rotuloHorarioEntrevista("2026-06-23T00:00:00Z", "agendada")).toBe("Horário a definir");
    expect(rotuloHorarioEntrevista("2026-06-23T00:00:00Z", "remarcada")).toBe("Horário a definir");
  });
  it("never renders the ambiguous 'Não definido'", () => {
    for (const status of ["agendada", "realizada", "cancelada", "remarcada", undefined]) {
      expect(rotuloHorarioEntrevista("2026-06-23T00:00:00Z", status)).not.toBe("Não definido");
    }
  });
});
