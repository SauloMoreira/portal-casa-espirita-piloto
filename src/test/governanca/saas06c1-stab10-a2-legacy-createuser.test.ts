// ============================================================================
// SAAS-06-C1-STAB10-A.2 — Contratos estáticos: bloqueio do fluxo legado
// `create-user` para geração de acesso de assistidos.
//
// Cobre:
//   • Apenas Usuarios.tsx pode invocar `create-user` no frontend.
//   • Nenhum consumidor envia `assistido_id` ou `assistido_update`.
//   • GerarAcessoAssistido usa exclusivamente `provisionar-acesso-assistido`.
//   • Guard ocorre ANTES de qualquer escrita (auth.admin.createUser etc).
//   • Fluxo genérico da Gestão de Usuários permanece funcional (não bloqueado).
// ============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

describe("STAB10-A.2 · Contratos frontend do fluxo de acesso do assistido", () => {
  const srcFiles = walk(resolve(root, "src")).filter(
    (p) => !/\/test\//.test(p) && !p.endsWith(".d.ts"),
  );

  it("apenas src/pages/Usuarios.tsx consome supabase.functions.invoke('create-user')", () => {
    const offenders = srcFiles.filter((p) => {
      const rel = p.replace(root + "/", "");
      if (rel === "src/pages/Usuarios.tsx") return false;
      const content = readFileSync(p, "utf8");
      return /functions\.invoke\(\s*['"`]create-user['"`]/.test(content);
    });
    expect(offenders).toEqual([]);
  });

  it("Usuarios.tsx (fluxo genérico) NÃO envia assistido_id nem assistido_update", () => {
    const src = read("src/pages/Usuarios.tsx");
    // localizar o(s) bloco(s) de invoke('create-user', { body: {...} }) e
    // conferir que o body não menciona os campos legados.
    const idx = src.indexOf("create-user");
    expect(idx).toBeGreaterThan(-1);
    const janela = src.slice(idx, idx + 2000);
    expect(janela).not.toMatch(/assistido_id\s*:/);
    expect(janela).not.toMatch(/assistido_update\s*:/);
  });

  it("GerarAcessoAssistido invoca somente 'provisionar-acesso-assistido' (nunca create-user)", () => {
    const componente = read("src/components/GerarAcessoAssistido.tsx");
    expect(componente).not.toMatch(/create-user/);
    const service = read("src/services/acesso/provisionarAcessoAssistido.ts");
    expect(service).toMatch(/functions\.invoke\(["']provisionar-acesso-assistido["']/);
    expect(service).not.toMatch(/create-user/);
  });
});

describe("STAB10-A.2 · Guard fail-closed na Edge Function create-user", () => {
  const edge = read("supabase/functions/create-user/index.ts");

  it("importa e usa o detector puro `detectLegacyAssistidoPayload`", () => {
    expect(edge).toMatch(/from ["']\.\/legacyGuard\.ts["']/);
    expect(edge).toMatch(/detectLegacyAssistidoPayload\(/);
  });

  it("o guard ocorre ANTES de auth.admin.createUser (nenhuma escrita antes)", () => {
    const iCreate = edge.indexOf("auth.admin.createUser");
    const iGuard = edge.indexOf("FLUXO_ASSISTIDO_LEGADO_BLOQUEADO");
    expect(iGuard).toBeGreaterThan(-1);
    expect(iCreate).toBeGreaterThan(-1);
    expect(iGuard).toBeLessThan(iCreate);
  });

  it("o guard ocorre ANTES do primeiro insert em user_roles/profiles/assistidos", () => {
    const iGuard = edge.indexOf("FLUXO_ASSISTIDO_LEGADO_BLOQUEADO");
    const first = Math.min(
      ...['from("user_roles")', 'from("profiles")', 'from("assistidos")']
        .map((s) => edge.indexOf(s))
        .filter((i) => i > -1),
    );
    expect(first).toBeGreaterThan(iGuard);
  });

  it("responde HTTP 200 + success:false + code funcional (compatível com bundle antigo)", () => {
    // O bloco do guard deve conter status 200 e o code funcional.
    const bloco = edge.slice(
      edge.indexOf("legacy_assistido_flow_blocked"),
      edge.indexOf("legacy_assistido_flow_blocked") + 900,
    );
    expect(bloco).toMatch(/status:\s*200/);
    expect(bloco).toMatch(/success:\s*false/);
    expect(bloco).toMatch(/FLUXO_ASSISTIDO_LEGADO_BLOQUEADO/);
    expect(bloco).toMatch(/Recarregue a página/);
  });

  it("log estruturado não emite dados sensíveis (email/senha/CPF/celular/nome/assistido_id cru)", () => {
    const bloco = edge.slice(
      edge.indexOf("log.warn(\"legacy_assistido_flow_blocked\""),
      edge.indexOf("log.warn(\"legacy_assistido_flow_blocked\"") + 400,
    );
    for (const proibido of ["email", "password", "senha", "cpf", "celular", "nome", "profile", "token"]) {
      expect(bloco.toLowerCase()).not.toMatch(new RegExp(`\\b${proibido}\\b`));
    }
    // assistido_id cru NÃO deve ser logado (apenas o boolean has_assistido_id).
    expect(bloco).not.toMatch(/assistido_id:\s*[^,}\s]/);
    // permitido: booleanos de presença e caller_id
    expect(bloco).toMatch(/has_assistido_id/);
    expect(bloco).toMatch(/has_assistido_update/);
    expect(bloco).toMatch(/caller_id/);
  });

  it("fluxo genérico (sem campos legados) permanece intacto — cria user_roles e profiles", () => {
    // As inserções canônicas continuam presentes após o guard.
    expect(edge).toMatch(/adminClient\.auth\.admin\.createUser/);
    expect(edge).toMatch(/\.from\("user_roles"\)\.insert/);
    expect(edge).toMatch(/\.from\("profiles"\)\.insert/);
    // O antigo update em assistidos foi removido — canônico agora é provisionar-acesso-assistido.
    expect(edge).not.toMatch(/\.from\("assistidos"\)\.update/);
  });
});
