/**
 * SAAS-06-C1-STAB10-C1.2-A1-FIX01-R1.c-FIX02 —
 * Guard estático dos wrappers "checked" em _stab10a3Fixtures.ts.
 *
 * Regras:
 *   - Ramo strict (bloco `if (opts.strict)`) do cleanupTracked deve usar
 *     svcDeleteChecked e adminDeleteAuthUserChecked; não pode chamar
 *     svc(..., { method: "DELETE" }) nem adminDeleteAuthUser diretamente.
 *   - residuosFinais deve usar svcReadChecked, adminGetAuthUserChecked e
 *     adminListAuthUserByEmailChecked; não pode chamar svc/adminGetAuthUser
 *     /adminListAuthUserByEmail diretamente.
 *   - Ramo legado (não strict) permanece livre para usar as funções antigas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FIXTURES = "src/test/e2e-rls/_stab10a3Fixtures.ts";

function sliceBetween(text: string, startMarker: RegExp, endMarker: RegExp): string {
  const startIdx = text.search(startMarker);
  if (startIdx < 0) return "";
  const rest = text.slice(startIdx);
  const endIdx = rest.search(endMarker);
  return endIdx < 0 ? rest : rest.slice(0, endIdx);
}

describe("STAB10-FIX02 — Guard dos wrappers checked em _stab10a3Fixtures.ts", () => {
  const text = readFileSync(FIXTURES, "utf8");

  it("declara os wrappers checked", () => {
    expect(text).toMatch(/function\s+svcDeleteChecked\s*\(/);
    expect(text).toMatch(/function\s+adminDeleteAuthUserChecked\s*\(/);
    expect(text).toMatch(/function\s+svcReadChecked\s*\b/);
    expect(text).toMatch(/function\s+adminGetAuthUserChecked\s*\(/);
    expect(text).toMatch(/function\s+adminListAuthUserByEmailChecked\s*\(/);
  });

  it("ramo strict do cleanupTracked usa apenas wrappers checked", () => {
    // Recorta do `if (opts.strict) {` até o `// ------ Modo legado`.
    const strictBlock = sliceBetween(
      text,
      /if\s*\(\s*opts\.strict\s*\)\s*\{/,
      /\/\/ -+ Modo legado/,
    );
    expect(strictBlock.length).toBeGreaterThan(0);

    // Exige presença dos wrappers.
    expect(strictBlock).toMatch(/svcDeleteChecked\s*\(/);
    expect(strictBlock).toMatch(/adminDeleteAuthUserChecked\s*\(/);

    // Proíbe chamadas diretas ao svc com DELETE dentro do ramo strict.
    const badSvc = /svc\s*\([^)]*,\s*\{\s*method:\s*["']DELETE["']/s.test(strictBlock);
    expect(badSvc, "ramo strict não pode chamar svc(..., { method: 'DELETE' }) direto").toBe(false);

    // Proíbe adminDeleteAuthUser sem sufixo Checked no ramo strict.
    const badAuthDelete = /adminDeleteAuthUser\s*\(/.test(
      strictBlock.replace(/adminDeleteAuthUserChecked\s*\(/g, ""),
    );
    expect(badAuthDelete, "ramo strict não pode chamar adminDeleteAuthUser direto").toBe(false);
  });

  it("residuosFinais usa apenas wrappers checked", () => {
    const block = sliceBetween(
      text,
      /export\s+async\s+function\s+residuosFinais\s*\(/,
      /\n\}\s*$/,
    );
    expect(block.length).toBeGreaterThan(0);

    expect(block).toMatch(/svcReadChecked\b/);
    expect(block).toMatch(/adminGetAuthUserChecked\s*\(/);
    expect(block).toMatch(/adminListAuthUserByEmailChecked\s*\(/);

    // Proíbe svc< / svc( direto (fora dos wrappers) dentro de residuosFinais.
    const strippedForSvc = block.replace(/svcReadChecked\b/g, "___");
    const badSvcRead = /\bsvc\s*[<(]/.test(strippedForSvc);
    expect(badSvcRead, "residuosFinais não pode chamar svc direto — use svcReadChecked").toBe(false);

    // Proíbe adminGetAuthUser / adminListAuthUserByEmail diretos.
    const strippedGet = block.replace(/adminGetAuthUserChecked\s*\(/g, "___");
    expect(/adminGetAuthUser\s*\(/.test(strippedGet), "usar adminGetAuthUserChecked em residuosFinais").toBe(false);

    const strippedList = block.replace(/adminListAuthUserByEmailChecked\s*\(/g, "___");
    expect(/adminListAuthUserByEmail\s*\(/.test(strippedList), "usar adminListAuthUserByEmailChecked em residuosFinais").toBe(false);
  });

  it("preserva contratos legados (funções antigas continuam exportadas/definidas)", () => {
    expect(text).toMatch(/export\s+async\s+function\s+adminCreateAuthUser\s*\(/);
    expect(text).toMatch(/export\s+async\s+function\s+adminDeleteAuthUser\s*\(/);
    expect(text).toMatch(/export\s+async\s+function\s+adminGetAuthUser\s*\(/);
    expect(text).toMatch(/export\s+async\s+function\s+adminListAuthUserByEmail\s*\(/);
  });
});
