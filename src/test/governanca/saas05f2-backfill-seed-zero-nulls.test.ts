/**
 * SAAS-05-F2 — Contrato de governança: backfill defensivo + seed demo.
 *
 * A suíte valida (sem depender de banco vivo) que:
 *  - existe migração idempotente marcada SAAS-05-F2;
 *  - a migração cobre as 13 T-DIR com UPDATE ... WHERE instituicao_id IS NULL;
 *  - o seed sintético é limitado a T-DIR sem FK obrigatória para auth.users;
 *  - a migração NÃO aplica NOT NULL, NÃO altera policies, NÃO revoga
 *    GRANTs e NÃO reabre PUBLIC/anon;
 *  - o documento oficial existe e mapeia zero nulls / zero órfãos / F3.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DOC = join(ROOT, "docs/SAAS-05-F2-BACKFILL-SEED-ZERO-NULLS.md");
const MIG_DIR = join(ROOT, "supabase/migrations");

const T_DIR = [
  "assistidos", "voluntarios", "palestras", "sessoes_publicas",
  "avisos_internos", "campanhas", "eventos", "acao_social_alimentos",
  "regras_operacionais", "excecoes_operacionais", "programacao_padrao",
  "configuracoes_gerais", "comunicacoes_institucionais",
];

const EDGES_INTOCADAS = [
  "supabase/functions/checkin-publico/index.ts",
  "supabase/functions/alertas-operacionais/index.ts",
  "supabase/functions/central-fila-alerta/index.ts",
  "supabase/functions/notificacoes-dispatch/index.ts",
  "supabase/functions/comunicacao-dispatch/index.ts",
  "supabase/functions/whatsapp-inbound/index.ts",
  "supabase/functions/whatsapp-responder/index.ts",
  "supabase/functions/assistente-entrevista/index.ts",
  "supabase/functions/insights-dashboard/index.ts",
  "supabase/functions/ia-site-ingestao/index.ts",
  "supabase/functions/conteudo-imagem-ia/index.ts",
];

function migF2Files(): string[] {
  return readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(MIG_DIR, f), "utf8").includes("SAAS-05-F2"));
}

describe("SAAS-05-F2 — migração de backfill defensivo + seed demo", () => {
  it("existe pelo menos uma migração marcada SAAS-05-F2", () => {
    expect(migF2Files().length).toBeGreaterThan(0);
  });

  it("migração cobre backfill idempotente para as 13 T-DIR", () => {
    const src = migF2Files().map((f) => readFileSync(join(MIG_DIR, f), "utf8")).join("\n");
    const faltando: string[] = [];
    for (const t of T_DIR) {
      const rx = new RegExp(
        `UPDATE\\s+public\\.${t}\\s+SET\\s+instituicao_id\\s*=\\s*v_demo\\s+WHERE\\s+instituicao_id\\s+IS\\s+NULL`,
        "i",
      );
      if (!rx.test(src)) faltando.push(t);
    }
    expect(faltando, `backfill ausente para: ${faltando.join(", ")}`).toEqual([]);
  });

  it("migração resolve tenant demo por nome e trata ausência como no-op", () => {
    const src = migF2Files().map((f) => readFileSync(join(MIG_DIR, f), "utf8")).join("\n");
    expect(src).toMatch(/Casa Espírita Demo/);
    expect(src).toMatch(/IF\s+v_demo\s+IS\s+NULL\s+THEN[\s\S]*?RETURN;/i);
  });

  it("seed é idempotente via WHERE NOT EXISTS por marcador único", () => {
    const src = migF2Files().map((f) => readFileSync(join(MIG_DIR, f), "utf8")).join("\n");
    expect(src).toMatch(/saas05_f2_demo_marker/);
    expect(src).toMatch(/SAAS-05-F2\s*·\s*Comunicado Demo/);
    expect(src).toMatch(/SAAS-05-F2\s*·\s*Palestra Demo/);
    // Pelo menos 3 WHERE NOT EXISTS (um por seed).
    const nots = src.match(/WHERE\s+NOT\s+EXISTS/gi) ?? [];
    expect(nots.length).toBeGreaterThanOrEqual(3);
  });

  it("seed NÃO cria assistidos/voluntarios (evita FK auth.users)", () => {
    const src = migF2Files().map((f) => readFileSync(join(MIG_DIR, f), "utf8")).join("\n");
    expect(src).not.toMatch(/INSERT\s+INTO\s+public\.assistidos\b/i);
    expect(src).not.toMatch(/INSERT\s+INTO\s+public\.voluntarios\b/i);
  });
});

describe("SAAS-05-F2 — nenhuma alteração destrutiva", () => {
  it("migração F2 não aplica NOT NULL em instituicao_id", () => {
    for (const f of migF2Files()) {
      const s = readFileSync(join(MIG_DIR, f), "utf8");
      expect(s, `${f} não pode aplicar NOT NULL`).not.toMatch(
        /instituicao_id[\s\S]{0,80}SET\s+NOT\s+NULL/i,
      );
    }
  });

  it("migração F2 não altera policies", () => {
    for (const f of migF2Files()) {
      const s = readFileSync(join(MIG_DIR, f), "utf8");
      expect(s, `${f} não pode alterar policies`).not.toMatch(
        /\b(CREATE|DROP|ALTER)\s+POLICY\b/i,
      );
    }
  });

  it("migração F2 não concede EXECUTE a PUBLIC/anon nem revoga GRANTs", () => {
    for (const f of migF2Files()) {
      const s = readFileSync(join(MIG_DIR, f), "utf8");
      expect(s).not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?TO\s+(PUBLIC|anon)/i);
      expect(s).not.toMatch(/\bREVOKE\b/i);
    }
  });

  it("migração F2 não cria/dropa/altera tabelas nem colunas", () => {
    for (const f of migF2Files()) {
      const s = readFileSync(join(MIG_DIR, f), "utf8");
      expect(s).not.toMatch(/\bCREATE\s+TABLE\b/i);
      expect(s).not.toMatch(/\bDROP\s+TABLE\b/i);
      expect(s).not.toMatch(/\bALTER\s+TABLE\b/i);
    }
  });
});

describe("SAAS-05-F2 — não reabre recortes anteriores", () => {
  it("edges anteriores não foram tocadas por F2", () => {
    for (const p of EDGES_INTOCADAS) {
      const s = readFileSync(join(ROOT, p), "utf8");
      expect(s, `${p} não pode citar SAAS-05-F2`).not.toMatch(/SAAS-05-F2/);
    }
  });
});

describe("SAAS-05-F2 — documento oficial cobre o exigido", () => {
  it("documento existe", () => {
    expect(existsSync(DOC)).toBe(true);
  });

  it("documento cobre backfill, seed, zero nulls, T-HER e F3", () => {
    const src = readFileSync(DOC, "utf8");
    expect(src).toMatch(/Backfill/i);
    expect(src).toMatch(/seed sintético/i);
    expect(src).toMatch(/zero nulls/i);
    expect(src).toMatch(/T-HER/);
    expect(src).toMatch(/SAAS-05-F3/);
    expect(src).toMatch(/projeto FER original.*intocado/i);
    expect(src).toMatch(/Apto para prosseguir com F3/i);
  });
});
