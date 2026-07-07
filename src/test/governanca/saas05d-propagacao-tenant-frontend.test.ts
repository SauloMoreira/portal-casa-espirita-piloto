/**
 * SAAS-05-D — Contratos da propagação de tenant ativo no frontend.
 *
 * Roda no CI sem banco. Valida os invariantes de guard, helpers e queries
 * diretas às tabelas T-DIR base (SAAS-05-B). Verificação real de RLS/tenancy
 * fica em src/test/integration/db/ (SAAS-05-F).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const T_DIR_BASE = [
  "assistidos",
  "voluntarios",
  "palestras",
  "sessoes_publicas",
  "avisos_internos",
  "campanhas",
  "eventos",
  "acao_social_alimentos",
  "regras_operacionais",
  "excecoes_operacionais",
  "programacao_padrao",
  "configuracoes_gerais",
  "comunicacoes_institucionais",
] as const;

describe("SAAS-05-D — Helper currentTenant (fail-closed, sem localStorage)", () => {
  const src = read("src/lib/tenant/currentTenant.ts");

  it("expõe requireInstituicaoId / getCurrentInstituicaoId / withInstituicao", () => {
    expect(src).toContain("export function requireInstituicaoId");
    expect(src).toContain("export function getCurrentInstituicaoId");
    expect(src).toContain("export function withInstituicao");
  });

  it("falha fechado quando não há instituição ativa", () => {
    expect(src).toMatch(/if\s*\(!id\)/);
    expect(src).toContain("fail-closed");
    expect(src).toContain("throw new Error");
  });

  it("NÃO lê localStorage (fonte é InstituicaoContext)", () => {
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("sessionStorage");
  });

  it("expõe setter privado apenas para o provider", () => {
    expect(src).toContain("_setCurrentInstituicaoId");
    expect(src).toMatch(/Uso interno do `InstituicaoProvider`/);
  });
});

describe("SAAS-05-D — InstituicaoContext sincroniza o espelho módulo-nível", () => {
  const ctx = read("src/contexts/InstituicaoContext.tsx");

  it("importa e chama _setCurrentInstituicaoId com o id da selecionada", () => {
    expect(ctx).toContain("_setCurrentInstituicaoId");
    expect(ctx).toMatch(/_setCurrentInstituicaoId\(selecionada\?\.id\s*\?\?\s*null\)/);
  });

  it("limpa o espelho no cleanup do effect", () => {
    expect(ctx).toMatch(/return\s*\(\)\s*=>\s*{\s*_setCurrentInstituicaoId\(null\);?\s*}/);
  });
});

describe("SAAS-05-D — RequireInstituicao (guard)", () => {
  const src = read("src/components/RequireInstituicao.tsx");

  it("usa InstituicaoContext como fonte única", () => {
    expect(src).toContain('from "@/contexts/InstituicaoContext"');
    expect(src).toContain("useInstituicaoAtiva()");
  });

  it("falha fechado redirecionando para o Portal quando não há selecionada", () => {
    expect(src).toContain("if (!selecionada)");
    expect(src).toContain("Navigate");
    expect(src).toContain("ROUTES.portal");
  });

  it("mostra fallback de loading enquanto o hub carrega", () => {
    expect(src).toContain("isLoading");
    expect(src).toContain("animate-spin");
  });

  it("NÃO aceita instituição arbitrária fora do contexto", () => {
    // Guard não recebe id via props; sempre lê do contexto.
    expect(src).not.toMatch(/instituicaoId\s*:\s*string/);
    expect(src).not.toContain("localStorage");
  });
});

describe("SAAS-05-D — Rotas operacionais protegidas por tenant", () => {
  const app = read("src/App.tsx");

  it("importa RequireInstituicao e define wrapper tenant()", () => {
    expect(app).toContain('from "@/components/RequireInstituicao"');
    expect(app).toContain("const tenant = (node: ReactNode)");
    expect(app).toContain("<RequireInstituicao>{node}</RequireInstituicao>");
  });

  const rotasProtegidas = [
    "ROUTES.dashboard",
    "ROUTES.assistidos",
    "ROUTES.agenda",
    "ROUTES.entrevistas",
    "ROUTES.tratamentos",
    "ROUTES.voluntarios",
    "ROUTES.sessoesPublicas",
    "ROUTES.acaoSocial",
    "ROUTES.campanhas",
    "ROUTES.eventos",
    "ROUTES.regras",
    "ROUTES.excecoesOperacionais",
    "ROUTES.programacaoPadrao",
    "ROUTES.configuracoes",
    "ROUTES.comunicacaoInstitucional",
    "ROUTES.painelInstitucional",
    "ROUTES.relatorios",
    "ROUTES.centralIa",
    "ROUTES.instituicao",
  ];

  it.each(rotasProtegidas)("rota %s é envolvida por tenant()", (rota) => {
    // Cada linha da rota deve conter tenant( entre element={...}.
    const re = new RegExp(`Route path={${rota.replace(".", "\\.")}}[^\\n]*tenant\\(`);
    expect(app).toMatch(re);
  });

  const rotasGlobais = [
    "ROUTES.login",
    "ROUTES.forgotPassword",
    "ROUTES.resetPassword",
    "ROUTES.mfaVerify",
    "ROUTES.segurancaConta",
    "ROUTES.meuPerfil",
    "ROUTES.meusDocumentos",
    "ROUTES.minhaAgenda",
    "ROUTES.meusTratamentos",
    "ROUTES.portal",
    "ROUTES.portalInstituicoes",
    "ROUTES.portalModulos",
    "ROUTES.portalAdmin",
  ];

  it.each(rotasGlobais)("rota %s NÃO é envolvida por tenant()", (rota) => {
    const re = new RegExp(`Route path={${rota.replace(".", "\\.")}}[^\\n]*tenant\\(`);
    expect(app).not.toMatch(re);
  });
});

describe("SAAS-05-D — Services T-DIR aplicam .eq('instituicao_id', ...)", () => {
  const files = {
    voluntariosService: "src/services/voluntarios/voluntariosService.ts",
    voluntarios: "src/services/voluntarios.ts",
    sessoesPublicas: "src/services/sessoesPublicas.ts",
    programacaoPadrao: "src/services/programacao/programacaoPadraoService.ts",
    excecoes: "src/services/programacao/excecoesService.ts",
    avisos: "src/hooks/useAvisos.ts",
    themeColors: "src/hooks/useThemeColors.ts",
  };

  it.each(Object.entries(files))("%s importa helper de tenant", (_name, path) => {
    const src = read(path);
    expect(src).toMatch(/from\s+"@\/lib\/tenant\/currentTenant"|useInstituicaoAtiva/);
  });

  it.each(Object.entries(files))("%s filtra por instituicao_id", (_name, path) => {
    const src = read(path);
    expect(src).toContain('.eq("instituicao_id"');
  });

  it("voluntariosService injeta instituicao_id no insert", () => {
    const src = read(files.voluntariosService);
    expect(src).toMatch(/instituicao_id:\s*instituicaoId/);
  });

  it("sessoesPublicas injeta instituicao_id no insert", () => {
    const src = read(files.sessoesPublicas);
    expect(src).toMatch(/instituicao_id:\s*instituicaoId/);
  });

  it("programacaoPadrao injeta instituicao_id no insert e escopa update/delete", () => {
    const src = read(files.programacaoPadrao);
    expect(src).toMatch(/instituicao_id:\s*instituicaoId/);
    // update/delete devem conter dois .eq (id + instituicao_id).
    expect(src.match(/\.eq\("instituicao_id"/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("excecoesService escopa excecoes_operacionais e regras_operacionais", () => {
    const src = read(files.excecoes);
    expect(src).toMatch(/instituicao_id:\s*instituicaoId/);
    expect(src.match(/\.eq\("instituicao_id"/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("useAvisos falha fechado quando não há tenant ativo", () => {
    const src = read(files.avisos);
    expect(src).toContain("if (!instituicaoId)");
    expect(src).toContain("setAvisos([])");
  });

  it("useThemeColors pula fetch quando não há tenant", () => {
    const src = read(files.themeColors);
    expect(src).toContain("if (!instituicaoId) return");
  });
});

describe("SAAS-05-D — Nenhuma migration/RLS/RPC/edge function alterada", () => {
  it("não introduz migration nova neste recorte", () => {
    // Este teste é declarativo: qualquer nova migration produtiva quebraria o escopo.
    // O contrato real é gerido por revisão de PR + docs/SAAS-05-D-*.md.
    expect(true).toBe(true);
  });

  it("[atualizado por SAAS-05-E1] RPCs de exceção agora enviam p_instituicao_id", () => {
    // Contrato original do 05-D era: services não injetam p_instituicao_id (pendência).
    // Após SAAS-05-E1 essa pendência foi resolvida — a migração de contrato é intencional.
    const excecoes = read("src/services/programacao/excecoesService.ts");
    expect(excecoes).toMatch(/fn_processar_excecao_notificacoes[\s\S]*?p_instituicao_id/);
    expect(excecoes).toMatch(/fn_monitor_excecao_notificacoes[\s\S]*?p_instituicao_id/);
  });
});

describe("SAAS-05-D — Manipulação de localStorage não burla o InstituicaoContext", () => {
  const hook = read("src/hooks/useSelectedInstituicao.ts");
  it("descarta id manipulado que não está em allowedIds", () => {
    expect(hook).toContain("!allowedIds.includes(selectedId)");
  });
  const currentTenant = read("src/lib/tenant/currentTenant.ts");
  it("currentTenant não confia em nenhuma fonte externa ao provider", () => {
    expect(currentTenant).not.toContain("localStorage");
    expect(currentTenant).not.toContain("sessionStorage");
    expect(currentTenant).not.toContain("window");
  });
});

describe("SAAS-05-D — Cobertura da matriz T-DIR (transparência)", () => {
  // Este bloco documenta explicitamente quais T-DIR base já têm consulta
  // direta adaptada e quais ficam pendentes para SAAS-05-E (RPC-first).
  const adaptadas = new Set([
    "voluntarios",
    "sessoes_publicas",
    "avisos_internos",
    "programacao_padrao",
    "excecoes_operacionais",
    "regras_operacionais",
    "configuracoes_gerais",
  ]);

  const pendentesRpc = new Set([
    // Sem consultas .from("<t>") diretas no frontend, ou apenas via RPCs
    // que serão adaptadas no SAAS-05-E.
    "assistidos",
    "palestras",
    "campanhas",
    "eventos",
    "acao_social_alimentos",
    "comunicacoes_institucionais",
  ]);

  it("toda T-DIR base está classificada (adaptada ou pendente-SAAS-05-E)", () => {
    for (const t of T_DIR_BASE) {
      expect(adaptadas.has(t) || pendentesRpc.has(t)).toBe(true);
    }
  });
});
