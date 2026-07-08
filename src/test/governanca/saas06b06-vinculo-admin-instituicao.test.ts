import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-B0.6 — Vinculação do administrador inicial da instituição.
 *
 * Pattern-matching sobre migração + UI + componente + doc para garantir que a
 * superfície de vínculo existe, é protegida por RPCs SECURITY DEFINER, impede
 * autopromoção a admin_instituicao e não cria conta silenciosamente.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

function migrationSources(): string {
  const dir = resolve(root, "supabase/migrations");
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(resolve(dir, f), "utf8"))
    .join("\n---\n");
}

describe("SAAS-06-B0.6 — RPCs de vínculo", () => {
  const migs = migrationSources();

  it("cria fn_listar_vinculos_instituicao SECURITY DEFINER", () => {
    expect(migs).toMatch(
      /CREATE OR REPLACE FUNCTION\s+public\.fn_listar_vinculos_instituicao/,
    );
    expect(migs).toMatch(
      /fn_listar_vinculos_instituicao[\s\S]*?SECURITY DEFINER/,
    );
  });

  it("cria fn_vincular_usuario_instituicao SECURITY DEFINER", () => {
    expect(migs).toMatch(
      /CREATE OR REPLACE FUNCTION\s+public\.fn_vincular_usuario_instituicao/,
    );
    expect(migs).toMatch(
      /fn_vincular_usuario_instituicao[\s\S]*?SECURITY DEFINER/,
    );
  });

  it("bloqueia conceder admin_instituicao fora do platform_admin", () => {
    expect(migs).toMatch(
      /apenas platform_admin pode conceder admin_instituicao/i,
    );
  });

  it("retorna 'nao_encontrado' quando o e-mail não existe (sem criar conta)", () => {
    expect(migs).toMatch(/'nao_encontrado'/);
    // Não pode chamar auth.admin.createUser dentro da migração da RPC
    expect(migs).not.toMatch(/fn_vincular_usuario_instituicao[\s\S]{0,4000}?createUser/);
  });

  it("usa upsert idempotente com ON CONFLICT em (instituicao_id,user_id,papel_local)", () => {
    expect(migs).toMatch(
      /ON CONFLICT\s*\(\s*instituicao_id\s*,\s*user_id\s*,\s*papel_local\s*\)/,
    );
    expect(migs).toMatch(
      /instituicao_usuarios_inst_user_papel_uidx/,
    );
  });

  it("fn_definir_status_vinculo bloqueia admin local de alterar admin_instituicao", () => {
    expect(migs).toMatch(
      /CREATE OR REPLACE FUNCTION\s+public\.fn_definir_status_vinculo_instituicao/,
    );
    expect(migs).toMatch(
      /apenas platform_admin pode alterar admin_instituicao/i,
    );
  });

  it("revoga execute do PUBLIC e concede apenas a authenticated", () => {
    expect(migs).toMatch(
      /REVOKE ALL ON FUNCTION public\.fn_vincular_usuario_instituicao[^\n]*FROM PUBLIC/,
    );
    expect(migs).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.fn_vincular_usuario_instituicao[^\n]*TO authenticated/,
    );
    expect(migs).toMatch(
      /REVOKE ALL ON FUNCTION public\.fn_listar_vinculos_instituicao[^\n]*FROM PUBLIC/,
    );
  });

  it("audita cada vínculo em audit_logs com acao='VINCULAR_USUARIO'", () => {
    expect(migs).toMatch(/'VINCULAR_USUARIO'/);
  });
});

describe("SAAS-06-B0.6 — UI da Central de Assinaturas", () => {
  const src = read("src/pages/PortalAssinaturas.tsx");

  it("renderiza a seção de vínculos apenas quando existe row em edição", () => {
    expect(src).toMatch(/VinculosInstituicaoSection/);
    expect(src).toMatch(/edit\.row && \(\s*<VinculosInstituicaoSection/);
  });

  it("importa o componente do módulo do Portal", () => {
    expect(src).toMatch(
      /from ["']@\/components\/portal\/VinculosInstituicaoSection["']/,
    );
  });
});

describe("SAAS-06-B0.6 — Componente VinculosInstituicaoSection", () => {
  const file = "src/components/portal/VinculosInstituicaoSection.tsx";
  const src = read(file);

  it("existe no projeto", () => {
    expect(existsSync(resolve(root, file))).toBe(true);
  });

  it("chama a RPC de vínculo passando papel local escolhido", () => {
    expect(src).toMatch(/fn_vincular_usuario_instituicao/);
    expect(src).toMatch(/p_papel_local: papel/);
  });

  it("chama a RPC de listagem para popular a tabela de vínculos", () => {
    expect(src).toMatch(/fn_listar_vinculos_instituicao/);
  });

  it("tem botão de vincular e input de e-mail com data-testid", () => {
    expect(src).toMatch(/data-testid="btn-vincular-usuario"/);
    expect(src).toMatch(/data-testid="vinculo-email-input"/);
  });

  it("expõe papéis locais previstos, incluindo admin_instituicao", () => {
    for (const p of [
      "admin_instituicao",
      "coordenador",
      "entrevistador",
      "tarefeiro",
      "assistido",
      "leitor",
    ]) {
      expect(src).toContain(p);
    }
  });

  it("permite alternar status via fn_definir_status_vinculo_instituicao", () => {
    expect(src).toMatch(/fn_definir_status_vinculo_instituicao/);
    expect(src).toMatch(/Inativar|Ativar/);
  });

  it("trata retorno 'nao_encontrado' orientando cadastro em /cadastro", () => {
    expect(src).toMatch(/nao_encontrado/);
    expect(src).toMatch(/\/cadastro/);
  });
});

describe("SAAS-06-B0.6 — Documentação", () => {
  const doc = read("docs/SAAS-06-B0-CENTRAL-ASSINATURAS.md");

  it("contém seção de vinculação do administrador inicial", () => {
    expect(doc).toMatch(/Vinculação do administrador inicial da instituição/);
  });

  it("documenta fluxo para usuário existente e para novo (convite)", () => {
    expect(doc).toMatch(/Fluxo para usuário existente/);
    expect(doc).toMatch(/Fluxo para usuário novo/);
  });

  it("distingue platform_admin de admin_instituicao", () => {
    expect(doc).toMatch(/platform_admin/);
    expect(doc).toMatch(/admin_instituicao/);
  });

  it("registra o vínculo aplicado ao piloto FER", () => {
    expect(doc).toMatch(/Fraternidade Espírita Ramatis — Piloto/);
    expect(doc).toMatch(/saulocmoreira@gmail\.com/);
  });
});
