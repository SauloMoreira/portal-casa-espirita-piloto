import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-B0.4 (ext.) — Notificações comerciais persistentes.
 *
 * Pattern-matching sobre migração + UI + constantes + doc para garantir:
 *  - fila de alertas com repetição em 2h/24h/48h/72h úteis;
 *  - idempotência via dedupe_key;
 *  - RPC de "assumir atendimento" restrita ao platform_admin;
 *  - trigger que interrompe a repetição ao sair de pendente;
 *  - auditoria com o marcador saas06_b04_solicitacao_comercial_alerta;
 *  - UI do platform_admin com prioridade, próximo alerta, assumir;
 *  - UI do admin local com novos tipos e sem alterar plano/status/módulos;
 *  - documento com a seção obrigatória.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

function migrations(): string {
  const dir = resolve(root, "supabase/migrations");
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(resolve(dir, f), "utf8"))
    .join("\n---\n");
}

describe("SAAS-06-B0.4 ext — migração", () => {
  const sql = migrations();

  it("amplia tipos com os novos previstos", () => {
    for (const t of [
      "solicitar_novo_modulo",
      "solicitar_desabilitar_modulo",
      "informar_pagamento",
      "solicitar_cancelamento",
      "falar_com_comercial",
      "suporte_comercial",
    ]) {
      expect(sql).toContain(t);
    }
  });

  it("amplia status com aguardando_cliente", () => {
    expect(sql).toMatch(/aguardando_cliente/);
  });

  it("adiciona colunas de notificação/atendimento", () => {
    for (const col of [
      "prioridade",
      "primeiro_alerta_em",
      "ultimo_alerta_em",
      "proximo_alerta_em",
      "quantidade_alertas",
      "responsavel_user_id",
      "atendimento_assumido_em",
      "dedupe_key",
    ]) {
      expect(sql).toContain(col);
    }
  });

  it("define intervalos 2h/24h/48h/72h úteis", () => {
    expect(sql).toMatch(/fn_solicitacao_proximo_alerta/);
    expect(sql).toMatch(/WHEN _qtd <= 0 THEN 2/);
    expect(sql).toMatch(/WHEN _qtd = 1 THEN 24/);
    expect(sql).toMatch(/WHEN _qtd = 2 THEN 48/);
    expect(sql).toMatch(/ELSE 72/);
    expect(sql).toMatch(/fn_add_business_hours/);
  });

  it("trigger AFTER INSERT agenda alerta imediato e audita criação", () => {
    expect(sql).toMatch(/trg_solicitacao_comercial_after_insert/);
    expect(sql).toMatch(
      /saas06_b04_solicitacao_comercial_alerta:solicitacao_criada/,
    );
  });

  it("trigger BEFORE UPDATE zera proximo_alerta ao sair de pendente", () => {
    expect(sql).toMatch(/trg_solicitacao_comercial_before_update/);
    expect(sql).toMatch(
      /OLD\.status = 'pendente' AND NEW\.status <> 'pendente'[\s\S]{0,120}proximo_alerta_em := NULL/,
    );
  });

  it("processador é idempotente por dedupe_key e escreve auditoria", () => {
    expect(sql).toMatch(/fn_processar_alertas_comerciais/);
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(sql).toMatch(
      /saas06_b04_solicitacao_comercial_alerta:alerta_enviado/,
    );
    expect(sql).toMatch(/dedupe_key/);
  });

  it("marca prioridade crítica a partir do 4º alerta", () => {
    expect(sql).toMatch(/WHEN v_qtd >= 4 THEN 'critica'/);
  });

  it("RPC de assumir é SECURITY DEFINER, restrita a platform_admin, e revogada de anon", () => {
    expect(sql).toMatch(/fn_assumir_solicitacao_comercial/);
    expect(sql).toMatch(
      /fn_assumir_solicitacao_comercial[\s\S]{0,400}SECURITY DEFINER/,
    );
    expect(sql).toMatch(
      /fn_assumir_solicitacao_comercial[\s\S]{0,600}fn_is_platform_admin\(v_user\)/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.fn_assumir_solicitacao_comercial[\s\S]{0,80}anon/,
    );
  });

  it("assumir interrompe repetição e vira em_analise se estava pendente", () => {
    expect(sql).toMatch(
      /fn_assumir_solicitacao_comercial[\s\S]{0,600}proximo_alerta_em = NULL/,
    );
    expect(sql).toMatch(
      /fn_assumir_solicitacao_comercial[\s\S]{0,600}CASE WHEN status = 'pendente' THEN 'em_analise'/,
    );
  });
});

describe("SAAS-06-B0.4 ext — constantes centralizadas", () => {
  const file = read("src/constants/solicitacoesComerciais.ts");
  it("expõe prazos e marcador de auditoria", () => {
    expect(file).toMatch(/PRAZOS_ALERTA_HORAS_UTEIS/);
    expect(file).toMatch(/segundo:\s*2/);
    expect(file).toMatch(/terceiro:\s*24/);
    expect(file).toMatch(/quarto:\s*48/);
    expect(file).toMatch(/quintoEmDiante:\s*72/);
    expect(file).toMatch(
      /AUDIT_MARKER_SOLICITACAO_COMERCIAL[\s\S]{0,80}saas06_b04_solicitacao_comercial_alerta/,
    );
  });
  it("lista status que interrompem alerta", () => {
    for (const s of [
      "em_analise",
      "aguardando_cliente",
      "aguardando_pagamento",
      "aprovada",
      "recusada",
      "concluida",
      "cancelada",
    ]) {
      expect(file).toContain(`"${s}"`);
    }
  });
});

describe("SAAS-06-B0.4 ext — UI platform_admin", () => {
  const page = read("src/pages/PortalSolicitacoesComerciais.tsx");
  it("exibe prioridade, próximo alerta, quantidade de alertas e responsável", () => {
    expect(page).toMatch(/PRIORIDADE_LABEL/);
    expect(page).toMatch(/proximo_alerta_em/);
    expect(page).toMatch(/quantidade_alertas/);
    expect(page).toMatch(/responsavel_user_id/);
  });
  it("expõe botão Assumir usando RPC fn_assumir_solicitacao_comercial", () => {
    expect(page).toMatch(/Assumir/);
    expect(page).toMatch(/fn_assumir_solicitacao_comercial/);
  });
  it("declara explicitamente que aprovar não habilita módulo", () => {
    expect(page.toLowerCase()).toMatch(/não habilita módulo/);
  });
});

describe("SAAS-06-B0.4 ext — UI admin local", () => {
  const page = read("src/pages/PortalPlanoAssinatura.tsx");
  it("usa tipos novos vindos das constantes", () => {
    expect(page).toMatch(/TIPOS_ATIVOS_UI/);
    expect(page).toMatch(/falar_com_comercial/);
    expect(page).toMatch(/solicitar_novo_modulo/);
  });
  it("continua sem alterar plano/status/módulos diretamente", () => {
    expect(page).not.toMatch(
      /from\(["']assinaturas["']\)[\s\S]{0,80}\.update\(/,
    );
    expect(page).not.toMatch(
      /from\(["']assinatura_modulos["']\)[\s\S]{0,80}\.(update|upsert|insert|delete)\(/,
    );
    expect(page).toMatch(
      /from\(["']solicitacoes_comerciais["']\)[\s\S]{0,80}\.insert\(/,
    );
  });
});

describe("SAAS-06-B0.4 ext — documentação", () => {
  const doc = read("docs/SAAS-06-B0.4-PORTAL-CLIENTE-PLANO-ASSINATURA.md");
  it("cobre a seção de notificações comerciais e repetição", () => {
    expect(doc).toMatch(
      /Notificações comerciais e repetição até atendimento/i,
    );
  });
  it("cita os prazos e o critério de parada", () => {
    expect(doc).toMatch(/2\s*h/);
    expect(doc).toMatch(/24\s*h/);
    expect(doc).toMatch(/48\s*h/);
    expect(doc).toMatch(/72\s*h/);
    expect(doc.toLowerCase()).toMatch(/crít/);
    expect(doc).toMatch(/assumido/i);
  });
  it("reafirma ausência de automação de venda", () => {
    expect(doc.toLowerCase()).toMatch(/não.*(habilita|automatiz|gateway)/);
  });
});
