/**
 * SAAS-06-B0.2 — Auditoria e recorte comercial de módulos.
 *
 * Contratos: Tratamentos é o único módulo comercial construído; agenda,
 * entrevistas, presença, relatórios, comunicação operacional e Central IA
 * são funcionalidades INTERNAS de Tratamentos e nunca módulos comerciais
 * separados. Caixa/Cantina, Biblioteca, Portal Institucional e Financeiro
 * são módulos comerciais FUTUROS.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { MODULO_ROTA } from "@/hooks/usePortalHub";

const MODULOS_COMERCIAIS_OFICIAIS = [
  "tratamentos",
  "caixa",
  "biblioteca",
  "portal",
  "financeiro",
] as const;

const FUNCIONALIDADES_INTERNAS_NAO_COMERCIAIS = [
  "agenda",
  "entrevistas",
  "presenca",
  "relatorios",
  "comunicacao",
  "comunicacao_operacional",
  "voluntarios",
  "palestras",
  "sessoes_publicas",
  "central_ia",
  "ia_tratamentos",
  "whatsapp",
  "avisos_ausencia",
  "lista_espera",
  "regras_operacionais",
  "programacao_padrao",
  "excecoes_operacionais",
  "assistidos",
];

describe("SAAS-06-B0.2 — recorte comercial de módulos", () => {
  it("Tratamentos é o único módulo comercial ATIVO (com rota)", () => {
    const comRota = Object.entries(MODULO_ROTA)
      .filter(([, rota]) => rota !== null)
      .map(([codigo]) => codigo);
    expect(comRota).toEqual(["tratamentos"]);
  });

  it("catálogo comercial cobre exatamente os módulos oficiais", () => {
    const catalogo = Object.keys(MODULO_ROTA).sort();
    expect(catalogo).toEqual([...MODULOS_COMERCIAIS_OFICIAIS].sort());
  });

  it("Caixa/Cantina, Biblioteca, Portal Institucional e Financeiro são módulos futuros (rota=null)", () => {
    for (const codigo of ["caixa", "biblioteca", "portal", "financeiro"]) {
      expect(MODULO_ROTA[codigo]).toBeNull();
    }
  });

  it("funcionalidades internas de Tratamentos NÃO aparecem como módulos comerciais", () => {
    for (const interno of FUNCIONALIDADES_INTERNAS_NAO_COMERCIAIS) {
      expect(Object.keys(MODULO_ROTA)).not.toContain(interno);
    }
  });

  it("documento SAAS-06-B0.2 existe e descreve o conceito de módulo comercial", () => {
    const doc = resolve("docs/SAAS-06-B0.2-AUDITORIA-MODULOS-PERMISSOES.md");
    expect(existsSync(doc)).toBe(true);
    const conteudo = readFileSync(doc, "utf8");
    expect(conteudo).toMatch(/M[óo]dulos comerciais oficiais/i);
    expect(conteudo).toMatch(/Tratamentos/);
    expect(conteudo).toMatch(/Caixa \/ Cantina/);
    expect(conteudo).toMatch(/Portal Institucional/);
    expect(conteudo).toMatch(/Financeiro/);
    expect(conteudo).toMatch(/producao_assistida/);
  });

  it("migração B0.2 declara os novos itens comerciais", () => {
    const mig = "supabase/migrations";
    // Basta grep no repositório de migrações — a migração B0.2 foi aplicada
    // e o snapshot de dados é validado por outras suítes.
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const arquivos = readdirSync(mig).filter((f) => f.endsWith(".sql"));
    const conteudo = arquivos
      .map((f) => readFileSync(resolve(mig, f), "utf8"))
      .join("\n");
    expect(conteudo).toMatch(/'financeiro'/);
    expect(conteudo).toMatch(/'producao_assistida'/);
    expect(conteudo).toMatch(/Caixa \/ Cantina/);
    expect(conteudo).toMatch(/Portal Institucional/);
  });
});
