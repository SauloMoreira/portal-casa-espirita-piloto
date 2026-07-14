/**
 * SAAS-06-C1-STAB10-C1.2-A1-FIX01-R1.b — Guard estático de cleanup E2E.
 *
 * Regras (autocadastro-*.e2etest.ts):
 *   - Não pode conter DELETE amplo via fetch:
 *       * audit_logs sem id=eq. previamente rastreado;
 *       * autocadastro_idempotencia sem idempotency_key=eq.;
 *       * filtros JSON (dados_novos->>... / dados_antigos->>...);
 *       * ?user_id=eq. em tabelas com id técnico rastreável;
 *       * ?instituicao_id=eq. em qualquer tabela.
 *   - `cleanupTracked(tracker)` sem opts é PROIBIDO; deve ser
 *     `cleanupTracked(tracker, { strict: true })`.
 *   - Whitelist explicitamente vazia.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const E2E_DIR = "src/test/e2e-rls";
const ALLOWLIST: string[] = []; // whitelist permanece vazia.

interface Hit { file: string; line: number; snippet: string; reason: string; }

function findForbiddenDeletes(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    const window = [raw, lines[i + 1] ?? "", lines[i + 2] ?? ""].join("\n");
    if (!/\/rest\/v1\//.test(window)) continue;
    if (!/method:\s*["']DELETE["']/.test(window)) continue;

    if (/dados_novos->>|dados_antigos->>/.test(window)) {
      hits.push({ file, line: i + 1, snippet: line, reason: "DELETE com filtro JSON (dados_novos->>...)" });
      continue;
    }
    if (/audit_logs\?/.test(window) && !/audit_logs\?id=eq\./.test(window)) {
      hits.push({ file, line: i + 1, snippet: line, reason: "audit_logs DELETE precisa ser por id=eq. previamente rastreado" });
      continue;
    }
    if (/autocadastro_idempotencia\?/.test(window) && !/autocadastro_idempotencia\?idempotency_key=eq\./.test(window)) {
      hits.push({ file, line: i + 1, snippet: line, reason: "autocadastro_idempotencia DELETE precisa ser por idempotency_key=eq." });
      continue;
    }
    if (/\?user_id=eq\./.test(window) && !/\?id=eq\./.test(window) && !/audit_logs\?id=eq\./.test(window)
        && !/autocadastro_idempotencia\?idempotency_key=eq\./.test(window)) {
      hits.push({ file, line: i + 1, snippet: line, reason: "DELETE amplo por user_id — proibido; usar id previamente rastreado" });
      continue;
    }
    if (/\?instituicao_id=eq\./.test(window) && !/autocadastro_idempotencia\?idempotency_key=eq\./.test(window)) {
      hits.push({ file, line: i + 1, snippet: line, reason: "DELETE por instituicao_id — proibido em autocadastro-*.e2etest.ts" });
      continue;
    }
  }
  return hits;
}

function findIndirectCleanupIssues(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const lines = text.split("\n");
  // Precisa importar/usar cleanupTracked
  if (!/cleanupTracked/.test(text)) {
    hits.push({ file, line: 0, snippet: "", reason: "arquivo deve importar/usar cleanupTracked" });
  }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Bloqueia chamada cleanupTracked(tracker) sem opts { strict: true }.
    // Aceita: cleanupTracked(tracker, { strict: true })
    const m = raw.match(/cleanupTracked\s*\(([^)]*)\)/);
    if (m) {
      const args = m[1];
      if (!/strict\s*:\s*true/.test(args)) {
        hits.push({
          file, line: i + 1, snippet: raw.trim(),
          reason: "cleanupTracked deve ser chamado com { strict: true } em autocadastro-*.e2etest.ts",
        });
      }
    }
  }
  return hits;
}

describe("STAB10-C1.2-A1-FIX01-R1.b — Guard estático de cleanup E2E (autocadastro-*)", () => {
  const files = readdirSync(E2E_DIR)
    .filter((f) => /^autocadastro-.*\.e2etest\.ts$/.test(f))
    .filter((f) => !ALLOWLIST.includes(f));

  it("cobre pelo menos os dois E2Es do autocadastro C1.2-A e FIX01", () => {
    expect(files).toContain("autocadastro-c12a.e2etest.ts");
    expect(files).toContain("autocadastro-c12a-fix01.e2etest.ts");
  });

  it("whitelist está vazia", () => {
    expect(ALLOWLIST).toEqual([]);
  });

  for (const f of files) {
    it(`não emite DELETE amplo em ${f}`, () => {
      const text = readFileSync(join(E2E_DIR, f), "utf8");
      const hits = findForbiddenDeletes(f, text);
      if (hits.length) {
        const msg = hits.map((h) => `  L${h.line}: [${h.reason}] ${h.snippet}`).join("\n");
        throw new Error(`DELETEs proibidos em ${f}:\n${msg}`);
      }
      expect(hits).toEqual([]);
    });

    it(`usa cleanupTracked estrito em ${f}`, () => {
      const text = readFileSync(join(E2E_DIR, f), "utf8");
      const hits = findIndirectCleanupIssues(f, text);
      if (hits.length) {
        const msg = hits.map((h) => `  L${h.line}: [${h.reason}] ${h.snippet}`).join("\n");
        throw new Error(`Cleanup indireto em ${f}:\n${msg}`);
      }
      expect(hits).toEqual([]);
    });
  }
});
