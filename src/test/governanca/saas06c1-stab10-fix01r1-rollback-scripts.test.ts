import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAAS-06-C1-STAB10-C1.2-A1-FIX01-R1.c — Governança semântica dos rollbacks.
 *
 * Valida os três scripts docs/sql/rollback-stab10-c12a-*.sql. Preserva
 * blocos dollar-quoted ($fn$...$fn$) durante a normalização e reprova:
 *   - referências a migrations/timestamps;
 *   - placeholders/TODO;
 *   - CASCADE executável;
 *   - RPCs recriadas sem SECURITY DEFINER / search_path / REVOKE + GRANT;
 *   - rollback Total apagando qualquer objeto da fundação C1.1.
 */

const ROOT = resolve(__dirname, "../../..");
const FIX01 = resolve(ROOT, "docs/sql/rollback-stab10-c12a-fix01.sql");
const A1 = resolve(ROOT, "docs/sql/rollback-stab10-c12a-a1.sql");
const TOTAL = resolve(ROOT, "docs/sql/rollback-stab10-c12a-total.sql");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Remove comentários -- e /* * / SQL preservando o conteúdo dentro de blocos
 * dollar-quoted ($fn$...$fn$, $$...$$). Não altera whitespace dos corpos.
 */
function stripCommentsPreservingDollars(sql: string): string {
  const out: string[] = [];
  let i = 0;
  const n = sql.length;
  let inDollar: string | null = null;
  while (i < n) {
    if (inDollar) {
      const idx = sql.indexOf(inDollar, i);
      if (idx === -1) {
        out.push(sql.slice(i));
        break;
      }
      out.push(sql.slice(i, idx + inDollar.length));
      i = idx + inDollar.length;
      inDollar = null;
      continue;
    }
    // detectar abertura dollar-quoted $tag$
    const dm = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z_0-9]*)?\$/);
    if (dm) {
      inDollar = dm[0];
      out.push(dm[0]);
      i += dm[0].length;
      continue;
    }
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const eol = sql.indexOf("\n", i);
      i = eol === -1 ? n : eol;
      continue;
    }
    if (sql[i] === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    out.push(sql[i]);
    i++;
  }
  return out.join("");
}

/** Remove blocos dollar-quoted para inspecionar apenas SQL executável fora de corpos. */
function stripDollarBodies(sql: string): string {
  return sql.replace(/\$([A-Za-z_][A-Za-z_0-9]*)?\$[\s\S]*?\$\1?\$/g, " ");
}

interface Prep {
  raw: string;
  noComments: string;
  executable: string; // sem comentários E sem corpos dollar-quoted
}
function prep(path: string): Prep {
  const raw = read(path);
  const noComments = stripCommentsPreservingDollars(raw);
  const executable = stripDollarBodies(noComments);
  return { raw, noComments, executable };
}

const RPC_NAMES = [
  "fn_autocadastro_reservar",
  "fn_autocadastro_marcar_auth_criado",
  "fn_autocadastro_marcar_resultado_falha",
  "fn_autocadastro_assistido_publico",
] as const;

/** Extrai assinaturas (nome + args entre parênteses) em CREATE FUNCTION. */
function creates(noComments: string): Array<{ name: string; args: string }> {
  const out: Array<{ name: string; args: string }> = [];
  const re = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\.(fn_autocadastro_\w+)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments)) !== null) {
    out.push({ name: m[1], args: m[2].replace(/\s+/g, " ").trim() });
  }
  return out;
}

function normalizeArgs(args: string): string[] {
  // Extrai apenas os tipos, ignorando nomes de parâmetro.
  return args
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const parts = a.split(/\s+/);
      return parts[parts.length - 1].toLowerCase();
    });
}

describe("STAB10-FIX01-R1.c — rollback Total remove somente backend transacional e preserva C1.1", () => {
  it("scripts começam com BEGIN e terminam com COMMIT", () => {
    for (const path of [FIX01, A1, TOTAL]) {
      const { raw } = prep(path);
      expect(raw, path).toMatch(/^\s*(?:--[^\n]*\n|\s)*BEGIN;/);
      expect(raw.trimEnd().endsWith("COMMIT;"), path).toBe(true);
    }
  });

  it("nenhuma referência a migrations/timestamps (nem em comentários)", () => {
    for (const path of [FIX01, A1, TOTAL]) {
      const { raw } = prep(path);
      expect(raw, `${path}: timestamp 14 dígitos`).not.toMatch(/\b2026\d{10}\b/);
      expect(raw, `${path}: fragmentos numéricos históricos`).not.toMatch(
        /\b(?:195303|195717|194907|201922|202019|202343|203100|204001)\b/,
      );
      expect(raw, `${path}: caminho supabase/migrations`).not.toMatch(/supabase\/migrations/i);
    }
  });

  it("nenhum CASCADE executável e nenhum placeholder/TODO", () => {
    for (const path of [FIX01, A1, TOTAL]) {
      const { noComments, executable } = prep(path);
      expect(executable, `${path}: CASCADE executável`).not.toMatch(/\bCASCADE\b/i);
      expect(noComments, `${path}: TODO/FIXME`).not.toMatch(/\b(?:TODO|FIXME|XXX)\b/);
      // "..." dentro de corpos dollar-quoted também é proibido.
      const bodies = noComments.match(/\$fn\$[\s\S]*?\$fn\$/g) ?? [];
      for (const body of bodies) {
        expect(body.includes("..."), `${path}: "..." em corpo de função`).toBe(false);
      }
    }
  });

  it("toda RPC recriada tem SECURITY DEFINER + search_path e REVOKE/GRANT por assinatura", () => {
    for (const path of [FIX01, A1]) {
      const { raw, noComments } = prep(path);
      const decls = creates(noComments);
      expect(decls.length, `${path}: nenhuma RPC recriada`).toBeGreaterThan(0);
      for (const d of decls) {
        const argsSig = d.args; // parte entre parênteses no CREATE
        // SECURITY DEFINER + SET search_path próximos ao CREATE dessa função
        const block = new RegExp(
          `CREATE(?:\\s+OR\\s+REPLACE)?\\s+FUNCTION\\s+public\\.${d.name}\\s*\\([^)]*\\)[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET\\s+search_path\\s+TO\\s+pg_catalog,\\s*public`,
          "i",
        );
        expect(raw, `${path}: ${d.name} sem SECURITY DEFINER/search_path`).toMatch(block);
        // REVOKE/GRANT com a MESMA assinatura de tipos
        const tipos = normalizeArgs(argsSig).join(",\\s*");
        const revokePub = new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${d.name}\\s*\\(\\s*${tipos}\\s*\\)\\s+FROM\\s+PUBLIC`,
          "i",
        );
        const revokeAnon = new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${d.name}\\s*\\(\\s*${tipos}\\s*\\)\\s+FROM\\s+anon`,
          "i",
        );
        const revokeAuthn = new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${d.name}\\s*\\(\\s*${tipos}\\s*\\)\\s+FROM\\s+authenticated`,
          "i",
        );
        const grantSvc = new RegExp(
          `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${d.name}\\s*\\(\\s*${tipos}\\s*\\)\\s+TO\\s+service_role`,
          "i",
        );
        expect(raw, `${path}: REVOKE PUBLIC assinatura ${d.name}`).toMatch(revokePub);
        expect(raw, `${path}: REVOKE anon assinatura ${d.name}`).toMatch(revokeAnon);
        expect(raw, `${path}: REVOKE authenticated assinatura ${d.name}`).toMatch(revokeAuthn);
        expect(raw, `${path}: GRANT service_role assinatura ${d.name}`).toMatch(grantSvc);
      }
    }
  });

  it("rollback FIX01: índice exato, três RPCs recriadas, sem tocar em fn_autocadastro_reservar", () => {
    const { raw, noComments } = prep(FIX01);
    expect(raw).toMatch(
      /CREATE UNIQUE INDEX\s+ux_autocadastro_idem_user_ativo[\s\S]*status\s+IN\s*\(\s*'reservado'\s*,\s*'auth_criado'\s*\)/i,
    );
    // Predicado do índice não deve conter concluido / rollback_falhou.
    const idxMatch = raw.match(/CREATE UNIQUE INDEX\s+ux_autocadastro_idem_user_ativo[\s\S]*?;/i);
    expect(idxMatch, "FIX01: bloco do índice ausente").toBeTruthy();
    expect(idxMatch![0]).not.toMatch(/concluido/i);
    expect(idxMatch![0]).not.toMatch(/rollback_falhou/i);
    // Recria as três RPCs afetadas.
    const decls = creates(noComments).map((d) => d.name);
    expect(decls).toEqual(
      expect.arrayContaining([
        "fn_autocadastro_marcar_auth_criado",
        "fn_autocadastro_marcar_resultado_falha",
        "fn_autocadastro_assistido_publico",
      ]),
    );
    expect(decls).not.toContain("fn_autocadastro_reservar");
  });

  it("rollback A1: reservar assinatura (uuid,text,uuid,uuid,timestamptz) e retorno 4 colunas exatas", () => {
    const { raw, noComments } = prep(A1);
    // Todas as quatro RPCs recriadas.
    const decls = creates(noComments);
    const names = decls.map((d) => d.name).sort();
    expect(names).toEqual([...RPC_NAMES].sort());
    // Assinatura da reservar
    const reservar = decls.find((d) => d.name === "fn_autocadastro_reservar")!;
    const tipos = normalizeArgs(reservar.args);
    expect(tipos).toEqual(["uuid", "text", "uuid", "uuid", "timestamptz"]);
    // Bloco RETURNS TABLE com 4 colunas exatas
    const returnsRe =
      /CREATE\s+FUNCTION\s+public\.fn_autocadastro_reservar\s*\([^)]*\)\s*RETURNS\s+TABLE\s*\(\s*result_code\s+text\s*,\s*user_id\s+uuid\s*,\s*assistido_id\s+uuid\s*,\s*instituicao_id\s+uuid\s*\)/i;
    expect(raw, "A1: reservar RETURNS TABLE 4 colunas exatas").toMatch(returnsRe);
    // Proibições (fora de comentários)
    for (const proibido of ["canonical_request_id", "attempt_count", "p_ip_hash", "p_ua_hash"]) {
      expect(noComments, `A1: ${proibido} não deve existir`).not.toMatch(new RegExp(`\\b${proibido}\\b`));
    }
  });

  it("rollback Total: 4 DROP FUNCTION exatos, assinatura de 12 args em assistido_publico, PRESERVA C1.1", () => {
    const { raw, executable } = prep(TOTAL);
    // Quatro DROP FUNCTION nas assinaturas exatas.
    const expectedDrops: Array<[string, string]> = [
      ["fn_autocadastro_reservar", "uuid, text, uuid, uuid, timestamptz"],
      ["fn_autocadastro_marcar_auth_criado", "uuid, text, uuid, uuid"],
      ["fn_autocadastro_marcar_resultado_falha", "uuid, text, uuid, text, boolean"],
      [
        "fn_autocadastro_assistido_publico",
        "uuid, uuid, text, uuid, uuid, text, text, text, text, text, text, timestamptz",
      ],
    ];
    for (const [name, args] of expectedDrops) {
      const re = new RegExp(
        `DROP\\s+FUNCTION\\s+IF\\s+EXISTS\\s+public\\.${name}\\s*\\(\\s*${args.replace(/,\s*/g, ",\\s*")}\\s*\\)`,
        "i",
      );
      expect(raw, `Total: DROP ${name}`).toMatch(re);
    }
    // Assistido_publico com exatamente 12 args
    const assistidoDrop = raw.match(
      /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.fn_autocadastro_assistido_publico\s*\(([^)]*)\)/i,
    );
    expect(assistidoDrop, "Total: DROP assistido_publico não encontrado").toBeTruthy();
    expect(normalizeArgs(assistidoDrop![1]).length, "Total: 12 argumentos exatos").toBe(12);
    // Preservação de C1.1 — nenhum destes comandos executáveis:
    const proibicoes: Array<[RegExp, string]> = [
      [/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?public\.autocadastro_idempotencia/i, "DROP TABLE autocadastro_idempotencia"],
      [/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?autocadastro_habilitado/i, "DROP COLUMN autocadastro_habilitado"],
      [/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?autocadastro_listado/i, "DROP COLUMN autocadastro_listado"],
      [/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?autocadastro_termos_versao/i, "DROP COLUMN autocadastro_termos_versao"],
      [/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?autocadastro_privacidade_versao/i, "DROP COLUMN autocadastro_privacidade_versao"],
      [/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:public\.)?ix_assistidos_inst_user_ativo/i, "DROP INDEX ix_assistidos_inst_user_ativo"],
      [/\bCASCADE\b/i, "CASCADE"],
    ];
    for (const [re, label] of proibicoes) {
      expect(executable, `Total: ${label} não pode existir`).not.toMatch(re);
    }
    // DEVE remover índice/CHECK do backend transacional.
    expect(executable).toMatch(/DROP\s+INDEX\s+IF\s+EXISTS\s+public\.ux_autocadastro_idem_user_ativo/i);
    expect(executable).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+autocadastro_idem_estado_user_check/i);
  });
});
