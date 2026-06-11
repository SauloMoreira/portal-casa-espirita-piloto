import { describe, it, expect } from "vitest";
import { contarNovos, modoLabel, checkinUrl } from "./sessoesPublicas";

describe("sessoesPublicas helpers", () => {
  it("conta apenas check-ins de cadastro rápido como novos", () => {
    const checkins = [
      { cadastro_rapido: true },
      { cadastro_rapido: false },
      { cadastro_rapido: true },
      {},
    ];
    expect(contarNovos(checkins)).toBe(2);
  });

  it("retorna 0 quando não há novos", () => {
    expect(contarNovos([{ cadastro_rapido: false }, {}])).toBe(0);
  });

  it("rotula corretamente a origem do check-in", () => {
    expect(modoLabel("qr")).toBe("QR");
    expect(modoLabel("manual")).toBe("Manual");
    expect(modoLabel(null)).toBe("Manual");
  });

  it("monta a URL pública de check-in com token", () => {
    expect(checkinUrl("https://app.test", "abc123")).toBe("https://app.test/checkin-publico/abc123");
  });

  it("retorna string vazia sem token", () => {
    expect(checkinUrl("https://app.test", null)).toBe("");
  });
});
