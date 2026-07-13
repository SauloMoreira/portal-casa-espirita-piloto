/**
 * SAAS-06-C1-STAB10-C1.2-A1-FIX01-R1 — Guard estático de cleanup E2E.
 *
 * Impede regressões nos testes E2E do autocadastro público. Nenhum DELETE
 * amplo por instituição, user_id, tabela, ação isolada ou filtros JSON
 * (`dados_novos->>...`) pode existir em `autocadastro-*.e2etest.ts`.
 *
 * Regras:
 *   - `audit_logs` só pode ser removido por `audit_logs.id`, previamente
 *     localizado por combinação estrita ação + registro_id.
 *   - `autocadastro_idempotencia` só pode ser removida por `idempotency_key`.
 *   - Nada de filtros por `user_id`, `instituicao_id`, `tabela`, ou
 *     `dados_novos->>...` em DELETE.
 *
 * Whitelist explicitamente vazia.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const E2E_DIR = "src/test/e2e-rls";
const ALLOWLIST: string[] = []; // whitelist permanece vazia.

interface DeleteHit {
  file: string;
  line: number;
  snippet: string;
  reason: string;
}

/**
 * Analisa o conteúdo de um E2E e retorna DELETEs proibidos.
 * Considera proibido qualquer fetch DELETE para PostgREST cujo path filtre por:
 *   - audit_logs?user_id=eq. | audit_logs?tabela=eq. | audit_logs?acao=eq.
 *     sem estar filtrado por audit_logs?id=eq.
 *   - autocadastro_idempotencia?instituicao_id=eq. | ?user_id=eq. sem
 *     idempotency_key=eq.
 *   - qualquer DELETE que use dados_novos->>...
 *   - qualquer DELETE em tabela pública filtrado apenas por user_id
 *     (`?user_id=eq.`) sem `id=eq.` ou `idempotency_key=eq.`.
 */
function findForbiddenDeletes(file: string, text: string): DeleteHit[] {
  const hits: DeleteHit[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    // Detectar chamadas de DELETE via PostgREST — precisa citar `/rest/v1/` e
    // um `method: "DELETE"` no mesmo bloco. Usamos janela local (linha + 2).
    const window = [raw, lines[i + 1] ?? "", lines[i + 2] ?? ""].join("\n");
    if (!/\/rest\/v1\//.test(window)) continue;
    if (!/method:\s*["']DELETE["']/.test(window)) continue;

    // 1) dados_novos->> em qualquer parte da URL do DELETE
    if (/dados_novos->>|dados_antigos->>/.test(window)) {
      hits.push({ file, line: i + 1, snippet: line, reason: "DELETE com filtro JSON (dados_novos->>...)" });
      continue;
    }

    // 2) audit_logs
    if (/audit_logs\?/.test(window)) {
      if (!/audit_logs\?id=eq\./.test(window)) {
        hits.push({ file, line: i + 1, snippet: line, reason: "audit_logs DELETE precisa ser por id=eq. previamente rastreado" });
        continue;
      }
    }

    // 3) autocadastro_idempotencia
    if (/autocadastro_idempotencia\?/.test(window)) {
      if (!/autocadastro_idempotencia\?idempotency_key=eq\./.test(window)) {
        hits.push({ file, line: i + 1, snippet: line, reason: "autocadastro_idempotencia DELETE precisa ser por idempotency_key=eq." });
        continue;
      }
    }

    // 4) DELETE amplo por user_id ou instituicao_id em qualquer tabela
    if (/\?user_id=eq\./.test(window) && !/\?id=eq\./.test(window) && !/audit_logs\?id=eq\./.test(window)) {
      // exceção: autocadastro_idempotencia?idempotency_key=eq. já filtrada acima
      if (!/autocadastro_idempotencia\?idempotency_key=eq\./.test(window)) {
        hits.push({ file, line: i + 1, snippet: line, reason: "DELETE amplo por user_id — proibido; usar id previamente rastreado" });
        continue;
      }
    }
    if (/\?instituicao_id=eq\./.test(window)) {
      if (!/autocadastro_idempotencia\?idempotency_key=eq\./.test(window)) {
        hits.push({ file, line: i + 1, snippet: line, reason: "DELETE por instituicao_id — proibido em autocadastro-*.e2etest.ts" });
        continue;
      }
    }
  }
  return hits;
}

describe("STAB10-C1.2-A1-FIX01-R1 — Guard estático de cleanup E2E (autocadastro-*)", () => {
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
  }
});
