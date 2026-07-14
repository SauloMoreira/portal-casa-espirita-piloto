/**
 * SAAS-06-C1-STAB10-C1.2-A1-FIX01-R1.c-FIX01 — Guard estático de cleanup E2E.
 *
 * Cobertura: src/test/e2e-rls/autocadastro-*.e2etest.ts (whitelist vazia).
 *
 * Regras preservadas (R1.b):
 *   - Sem DELETE amplo via fetch:
 *       * audit_logs sem id=eq. rastreado;
 *       * autocadastro_idempotencia sem idempotency_key=eq.;
 *       * filtros JSON (dados_novos->> / dados_antigos->>);
 *       * ?user_id=eq. em tabelas com id técnico rastreável;
 *       * ?instituicao_id=eq. em qualquer tabela.
 *   - cleanupTracked em modo amplo é proibido — deve ser
 *     `cleanupTracked(tracker, { strict: true })`.
 *
 * Regras novas (R1.c-FIX01):
 *   - Retorno do cleanup strict deve ser capturado (const foo = await ...
 *     ou const { auditIssues, cleanupErrors } = await ...).
 *   - residuosFinais(tracker) deve ser invocado após o cleanup.
 *   - auditIssues e cleanupErrors devem ser considerados no arquivo.
 *   - Ordem: cleanupTracked → residuosFinais → throw agregado.
 *   - Tracking do assistido (tracker.assistidos.push + auditRef com
 *     AUTOCADASTRO_PUBLICO_ASSISTIDO) deve ocorrer ANTES do primeiro expect
 *     que segue fn_autocadastro_assistido_publico.
 *   - auditRef AUTOCADASTRO_ROLLBACK_FALHOU deve ser registrado ANTES da
 *     RPC fn_autocadastro_marcar_resultado_falha com p_auth_delete_ok:false.
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

function findCleanupUsageIssues(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const lines = text.split("\n");
  if (!/cleanupTracked/.test(text)) {
    hits.push({ file, line: 0, snippet: "", reason: "arquivo deve importar/usar cleanupTracked" });
  }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    // Ignora linhas de comentário (JSDoc/linha) para evitar falso-positivo
    // com exemplos citados em docstrings.
    if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;
    const m = raw.match(/cleanupTracked\s*\(([^)]*)\)/);
    if (!m) continue;
    const args = m[1];
    if (!/strict\s*:\s*true/.test(args)) {
      hits.push({
        file, line: i + 1, snippet: raw.trim(),
        reason: "cleanupTracked deve ser chamado com { strict: true } em autocadastro-*.e2etest.ts",
      });
      continue;
    }
    // Retorno strict deve ser capturado (const ... = await cleanupTracked...
    // ou const { ... } = await cleanupTracked...). Reprova:
    //   await cleanupTracked(tracker, { strict: true });
    const contextStart = Math.max(0, i - 2);
    const contextRaw = lines.slice(contextStart, i + 1).join("\n");
    const capturedInline = /(?:const|let|var)\s+(?:\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*await\s+cleanupTracked/s.test(contextRaw);
    if (!capturedInline) {
      hits.push({
        file, line: i + 1, snippet: raw.trim(),
        reason: "cleanupTracked({ strict: true }) deve ter retorno capturado (const {...} = await cleanupTracked(...) ou const foo = await cleanupTracked(...))",
      });
    }
  }
  return hits;
}

function findOrderingIssues(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const push = (reason: string) => hits.push({ file, line: 0, snippet: "", reason });

  if (!/residuosFinais\s*\(\s*tracker\s*\)/.test(text)) {
    push("arquivo deve invocar residuosFinais(tracker) após o cleanup strict");
  }
  if (!/auditIssues/.test(text)) {
    push("arquivo deve considerar auditIssues do retorno de cleanupTracked");
  }
  if (!/cleanupErrors/.test(text)) {
    push("arquivo deve considerar cleanupErrors do retorno de cleanupTracked");
  }
  if (!/throw\s+new\s+Error\s*\(\s*`\[cleanup strict\]/.test(text)) {
    push("arquivo deve lançar erro agregado `[cleanup strict] ...` após verificar zero resíduos");
  }

  // Ordem: cleanupTracked → residuosFinais → throw agregado.
  const idxCleanup = text.search(/await\s+cleanupTracked\s*\([^)]*strict\s*:\s*true[^)]*\)/);
  const idxResiduos = text.search(/residuosFinais\s*\(\s*tracker\s*\)/);
  const idxThrow = text.search(/throw\s+new\s+Error\s*\(\s*`\[cleanup strict\]/);
  if (idxCleanup >= 0 && idxResiduos >= 0 && !(idxCleanup < idxResiduos)) {
    push("residuosFinais(tracker) deve ser invocado APÓS cleanupTracked strict");
  }
  if (idxResiduos >= 0 && idxThrow >= 0 && !(idxResiduos < idxThrow)) {
    push("throw agregado `[cleanup strict]` deve vir APÓS residuosFinais(tracker)");
  }

  return hits;
}

function findTrackingIssues(file: string, text: string): Hit[] {
  const hits: Hit[] = [];
  const push = (reason: string) =>
    hits.push({ file, line: 0, snippet: "", reason });

  // Tracking do assistido: para cada chamada a fn_autocadastro_assistido_publico,
  // exigir que o arquivo contenha um push de auditRef AUTOCADASTRO_PUBLICO_ASSISTIDO
  // e tracker.assistidos.push antes do primeiro expect sobre a resposta.
  if (/fn_autocadastro_assistido_publico/.test(text)) {
    if (!/AUTOCADASTRO_PUBLICO_ASSISTIDO/.test(text)) {
      push("arquivo deve registrar auditRef AUTOCADASTRO_PUBLICO_ASSISTIDO após fn_autocadastro_assistido_publico");
    }
    if (!/tracker\.assistidos\.push/.test(text)) {
      push("arquivo deve fazer tracker.assistidos.push antes dos expects sobre fn_autocadastro_assistido_publico");
    }
    // Heurística de ordem: em cada bloco que chama a RPC, o primeiro
    // expect(...) posterior deve vir DEPOIS de tracker.auditRefs.push com
    // AUTOCADASTRO_PUBLICO_ASSISTIDO.
    // Ordem no caminho feliz: exigir que a PRIMEIRA chamada da RPC no arquivo
    // registre auditRef AUTOCADASTRO_PUBLICO_ASSISTIDO antes do primeiro
    // expect sobre a resposta. Chamadas subsequentes (idempotência / retomada)
    // reutilizam o assistidoId já rastreado e não exigem novo push.
    const firstRpcIdx = text.search(/fn_autocadastro_assistido_publico/);
    if (firstRpcIdx >= 0) {
      const slice = text.slice(firstRpcIdx, firstRpcIdx + 6000);
      const firstExpect = slice.search(/expect\s*\(\s*[A-Za-z_$][\w$]*\s*\.\s*ok/);
      const firstAuditRefPush = slice.search(/tracker\.auditRefs\.push\s*\(\s*\{[^}]*AUTOCADASTRO_PUBLICO_ASSISTIDO/s);
      if (firstExpect >= 0 && (firstAuditRefPush < 0 || firstAuditRefPush > firstExpect)) {
        push("tracker.auditRefs.push(AUTOCADASTRO_PUBLICO_ASSISTIDO) deve ocorrer ANTES do primeiro expect sobre a resposta da RPC no caminho feliz");
      }
    }
  }

  // Tracking do ROLLBACK_FALHOU: para cada chamada de
  // fn_autocadastro_marcar_resultado_falha com p_auth_delete_ok:false,
  // exigir auditRef AUTOCADASTRO_ROLLBACK_FALHOU antes.
  if (/AUTOCADASTRO_ROLLBACK_FALHOU|fn_autocadastro_marcar_resultado_falha/.test(text)) {
    if (/p_auth_delete_ok:\s*false/.test(text) && !/AUTOCADASTRO_ROLLBACK_FALHOU/.test(text)) {
      push("arquivo com p_auth_delete_ok:false deve registrar auditRef AUTOCADASTRO_ROLLBACK_FALHOU antes da RPC");
    }
    const rollbackIdx = text.search(/AUTOCADASTRO_ROLLBACK_FALHOU/);
    const rpcFailIdx = text.search(/fn_autocadastro_marcar_resultado_falha[\s\S]{0,400}p_auth_delete_ok:\s*false/);
    if (rollbackIdx >= 0 && rpcFailIdx >= 0 && !(rollbackIdx < rpcFailIdx)) {
      push("auditRef AUTOCADASTRO_ROLLBACK_FALHOU deve ser registrado ANTES da RPC fn_autocadastro_marcar_resultado_falha(p_auth_delete_ok:false)");
    }
  }

  return hits;
}

describe("STAB10-C1.2-A1-FIX01-R1.c-FIX01 — Guard estático de cleanup E2E (autocadastro-*)", () => {
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

    it(`usa cleanupTracked strict com retorno capturado em ${f}`, () => {
      const text = readFileSync(join(E2E_DIR, f), "utf8");
      const hits = findCleanupUsageIssues(f, text);
      if (hits.length) {
        const msg = hits.map((h) => `  L${h.line}: [${h.reason}] ${h.snippet}`).join("\n");
        throw new Error(`Cleanup indireto em ${f}:\n${msg}`);
      }
      expect(hits).toEqual([]);
    });

    it(`respeita ordem cleanup → residuosFinais → throw agregado em ${f}`, () => {
      const text = readFileSync(join(E2E_DIR, f), "utf8");
      const hits = findOrderingIssues(f, text);
      if (hits.length) {
        const msg = hits.map((h) => `  [${h.reason}]`).join("\n");
        throw new Error(`Ordem/uso inválido em ${f}:\n${msg}`);
      }
      expect(hits).toEqual([]);
    });

    it(`registra tracking antes dos expects em ${f}`, () => {
      const text = readFileSync(join(E2E_DIR, f), "utf8");
      const hits = findTrackingIssues(f, text);
      if (hits.length) {
        const msg = hits.map((h) => `  [${h.reason}]`).join("\n");
        throw new Error(`Tracking inválido em ${f}:\n${msg}`);
      }
      expect(hits).toEqual([]);
    });
  }
});
