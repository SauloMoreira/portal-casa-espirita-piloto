import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-C1-STAB07 — contrato do frontend.
 *
 * Garante que o fluxo de agendamento no coordenador passa exclusivamente pela
 * RPC transacional, sem INSERT direto na agenda nem UPDATE direto no vínculo.
 */
function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("STAB07 — contrato do frontend do agendamento inicial", () => {
  const page = read("src/pages/CoordenadorListaEspera.tsx");
  const service = read("src/services/coordenacao/agendarInicial.ts");

  it("página do coordenador não faz INSERT direto em agenda_tratamentos_assistido", () => {
    expect(page).not.toMatch(/from\(["']agenda_tratamentos_assistido["']\)[^;]*\.insert/);
  });

  it("página do coordenador não faz UPDATE direto em assistido_tratamentos", () => {
    expect(page).not.toMatch(/from\(["']assistido_tratamentos["']\)[^;]*\.update/);
  });

  it("página do coordenador chama o service de agendamento inicial", () => {
    expect(page).toMatch(/confirmarAgendamentoInicial\s*\(/);
    expect(page).toMatch(/from\s+["']@\/services\/coordenacao\/agendarInicial["']/);
  });

  it("service usa apenas a RPC fn_confirmar_agendamento_tratamento", () => {
    expect(service).toMatch(/fn_confirmar_agendamento_tratamento/);
    expect(service).not.toMatch(/\.from\(["']agenda_tratamentos_assistido["']\)/);
    expect(service).not.toMatch(/\.from\(["']assistido_tratamentos["']\)/);
  });

  it("service mapeia códigos funcionais previstos", () => {
    for (const code of [
      "SESSOES_INCONSISTENTES",
      "STATUS_NAO_PERMITE_AGENDAMENTO",
      "NAO_AUTORIZADO",
      "PAYLOAD_INVALIDO",
      "AGENDAMENTO_TRATAMENTO_COMMIT_FAILED",
    ]) {
      expect(service).toContain(code);
    }
  });

  it("página trata SESSOES_INCONSISTENTES sem abrir carta", () => {
    // A abertura da carta (setCartaOpen(true)) só deve ocorrer no ramo de sucesso
    const sucessoIdx = page.indexOf("Tratamento agendado com sucesso");
    const cartaIdx = page.indexOf("setCartaOpen(true)");
    const inconsistIdx = page.indexOf("SESSOES_INCONSISTENTES");
    expect(sucessoIdx).toBeGreaterThan(-1);
    expect(cartaIdx).toBeGreaterThan(-1);
    expect(inconsistIdx).toBeGreaterThan(-1);
    // carta é aberta antes do bloco catch (fluxo de sucesso)
    expect(cartaIdx).toBeLessThan(inconsistIdx);
  });

  it("página inclui trava síncrona contra duplo disparo", () => {
    expect(page).toMatch(/inFlightRef/);
  });
});
