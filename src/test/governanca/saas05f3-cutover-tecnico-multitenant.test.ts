/**
 * SAAS-05-F3 — Contrato de governança: cutover técnico multi-tenant.
 *
 * Valida (sem depender de banco vivo) que:
 *  - existe migração marcada SAAS-05-F3;
 *  - a migração aplica pré-check zero nulls;
 *  - a migração aplica NOT NULL em instituicao_id nas 13 T-DIR;
 *  - a migração remove policies legadas has_role-only inseguras;
 *  - o documento oficial existe e cobre o escopo exigido;
 *  - recortes anteriores (F1/F2, edges, RPCs) não foram tocados.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DOC = join(ROOT, "docs/SAAS-05-F3-CUTOVER-TECNICO-MULTITENANT.md");
const MIG_DIR = join(ROOT, "supabase/migrations");

const T_DIR = [
  "assistidos", "voluntarios", "palestras", "sessoes_publicas",
  "avisos_internos", "campanhas", "eventos", "acao_social_alimentos",
  "regras_operacionais", "excecoes_operacionais", "programacao_padrao",
  "configuracoes_gerais", "comunicacoes_institucionais",
];

// Policies legadas confirmadas no diagnóstico F1 e removidas pelo F3.
const POLICIES_REMOVIDAS = [
  "Admins gerenciam alimentos (delete)",
  "Admins gerenciam alimentos (insert)",
  "Admins gerenciam alimentos (update)",
  "Autenticados veem alimentos ativos",
  "Admins manage assistidos",
  "Coordenador reads assistidos of own tratamentos",
  "Entrevistadores manage assistidos",
  "Tarefeiros read assistidos",
  "Admins delete avisos",
  "Admins insert avisos",
  "Admins read all avisos",
  "Entrevistadores insert avisos",
  "Admins gerenciam campanhas (delete)",
  "Admins gerenciam campanhas (insert)",
  "Admins gerenciam campanhas (update)",
  "Autenticados veem campanhas vigentes",
  "Admins gerenciam comunicacoes (delete)",
  "Admins gerenciam comunicacoes (insert)",
  "Admins gerenciam comunicacoes (select)",
  "Admins gerenciam comunicacoes (update)",
  "Admins manage config",
  "Authenticated can read config",
  "Admins gerenciam eventos (delete)",
  "Admins gerenciam eventos (insert)",
  "Admins gerenciam eventos (update)",
  "Autenticados veem eventos vigentes",
  "Admin e coordenador gerenciam excecoes - delete",
  "Admin e coordenador gerenciam excecoes - insert",
  "Admin e coordenador gerenciam excecoes - update",
  "Staff podem ver excecoes operacionais",
  "Admins manage palestras",
  "Authenticated read palestras",
  "Admin e coordenador gerenciam programacao - delete",
  "Admin e coordenador gerenciam programacao - insert",
  "Admin e coordenador gerenciam programacao - update",
  "Staff podem ver programacao padrao",
  "Admins manage regras",
  "Authenticated read non-sensitive regras",
  "Admins manage sessoes_publicas",
  "Staff read sessoes_publicas",
  "Tarefeiros manage sessoes_publicas",
  "Admins manage voluntarios",
];

const EDGES_INTOCADAS_POR_F3 = [
  "supabase/functions/checkin-publico/index.ts",
  "supabase/functions/alertas-operacionais/index.ts",
  "supabase/functions/central-fila-alerta/index.ts",
  "supabase/functions/notificacoes-dispatch/index.ts",
  "supabase/functions/comunicacao-dispatch/index.ts",
  "supabase/functions/whatsapp-inbound/index.ts",
  "supabase/functions/whatsapp-responder/index.ts",
];

function migF3Files(): string[] {
  return readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => readFileSync(join(MIG_DIR, f), "utf8").includes("SAAS-05-F3"));
}

function migF3Source(): string {
  return migF3Files().map((f) => readFileSync(join(MIG_DIR, f), "utf8")).join("\n");
}

describe("SAAS-05-F3 — migração de cutover técnico", () => {
  it("existe pelo menos uma migração marcada SAAS-05-F3", () => {
    expect(migF3Files().length).toBeGreaterThan(0);
  });

  it("migração aplica pré-check zero nulls com abort explícito", () => {
    const src = migF3Source();
    expect(src).toMatch(/RAISE\s+EXCEPTION[\s\S]{0,120}sem\s+instituicao_id/i);
    expect(src).toMatch(/WHERE\s+instituicao_id\s+IS\s+NULL/i);
  });

  it("migração aplica NOT NULL em instituicao_id nas 13 T-DIR", () => {
    const src = migF3Source();
    const faltando: string[] = [];
    for (const t of T_DIR) {
      const rx = new RegExp(
        `ALTER\\s+TABLE\\s+public\\.${t}\\s+ALTER\\s+COLUMN\\s+instituicao_id\\s+SET\\s+NOT\\s+NULL`,
        "i",
      );
      if (!rx.test(src)) faltando.push(t);
    }
    expect(faltando, `NOT NULL ausente: ${faltando.join(", ")}`).toEqual([]);
  });

  it("migração remove todas as policies legadas has_role-only", () => {
    const src = migF3Source();
    const faltando: string[] = [];
    for (const p of POLICIES_REMOVIDAS) {
      const rx = new RegExp(
        `DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+"${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
        "i",
      );
      if (!rx.test(src)) faltando.push(p);
    }
    expect(faltando, `DROP POLICY ausente: ${faltando.join(", ")}`).toEqual([]);
  });

  it("migração preserva shadow_tenant_all_* como policy tenant-scoped final", () => {
    const src = migF3Source();
    // Não deve dropar as shadow policies.
    for (const t of T_DIR) {
      const rxDrop = new RegExp(
        `DROP\\s+POLICY[\\s\\S]{0,80}shadow_tenant_all_${t}`,
        "i",
      );
      expect(rxDrop.test(src), `F3 não pode dropar shadow_tenant_all_${t}`).toBe(false);
    }
    expect(src).toMatch(/shadow_tenant_all_/);
  });

  it("migração preserva policies de autoacesso (assistido/user own)", () => {
    const src = migF3Source();
    expect(src).not.toMatch(/DROP\s+POLICY[\s\S]{0,80}"Assistido views own record"/i);
    expect(src).not.toMatch(/DROP\s+POLICY[\s\S]{0,80}"Assistido updates own record"/i);
    expect(src).not.toMatch(/DROP\s+POLICY[\s\S]{0,80}"User views own avisos"/i);
    expect(src).not.toMatch(/DROP\s+POLICY[\s\S]{0,80}"User updates own avisos"/i);
  });

  it("migração não migra dados reais", () => {
    const src = migF3Source();
    expect(src).not.toMatch(/\bINSERT\s+INTO\s+public\.assistidos\b/i);
    expect(src).not.toMatch(/\bINSERT\s+INTO\s+public\.voluntarios\b/i);
  });
});

describe("SAAS-05-F3 — inserts frontend/services já propagam tenant obrigatório", () => {
  const ARQS = [
    "src/services/acaoSocial.ts",
    "src/services/campanhas.ts",
    "src/services/eventos.ts",
    "src/services/comunicacaoInstitucional.ts",
    "src/pages/GestaoCores.tsx",
    "src/pages/RegrasOperacionais.tsx",
    "src/pages/SessoesPublicas.tsx",
  ];
  it("todos os arquivos ajustados importam requireInstituicaoId", () => {
    for (const p of ARQS) {
      const s = readFileSync(join(ROOT, p), "utf8");
      expect(s, `${p} deve importar requireInstituicaoId`).toMatch(/requireInstituicaoId/);
    }
  });
});

describe("SAAS-05-F3 — recortes anteriores intocados", () => {
  it("edges anteriores não citam SAAS-05-F3", () => {
    for (const p of EDGES_INTOCADAS_POR_F3) {
      const s = readFileSync(join(ROOT, p), "utf8");
      expect(s, `${p} não pode citar SAAS-05-F3`).not.toMatch(/SAAS-05-F3/);
    }
  });

  it("migração F3 não altera tabelas fora das 13 T-DIR listadas", () => {
    const src = migF3Source();
    // Pega toda linha ALTER TABLE public.<x>
    const matches = Array.from(src.matchAll(/ALTER\s+TABLE\s+public\.([a-z_]+)/gi));
    const tocadas = new Set(matches.map((m) => m[1].toLowerCase()));
    for (const t of tocadas) {
      expect(T_DIR.includes(t), `Tabela fora do escopo: ${t}`).toBe(true);
    }
  });
});

describe("SAAS-05-F3 — documento oficial", () => {
  it("documento existe", () => {
    expect(existsSync(DOC)).toBe(true);
  });

  it("documento cobre pré-check, NOT NULL, policies, findings S4 e fallbacks", () => {
    const src = readFileSync(DOC, "utf8");
    expect(src).toMatch(/Pré-check/i);
    expect(src).toMatch(/NOT\s+NULL/);
    expect(src).toMatch(/13\s+T-DIR/);
    expect(src).toMatch(/shadow_tenant_all_/);
    expect(src).toMatch(/findings\s+S4/i);
    expect(src).toMatch(/fallback/i);
    expect(src).toMatch(/projeto FER original.*intocado/i);
    expect(src).toMatch(/SAAS-05-G/);
  });
});
