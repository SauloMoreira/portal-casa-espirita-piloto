import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-A — Kit de Produção Assistida e Onboarding Comercial
 *
 * Recorte puramente documental. Esta suíte garante que os 10 entregáveis
 * existam em disco, sejam autossuficientes e mencionem explicitamente a
 * natureza assistida do piloto e a ausência de migração automática de dados
 * reais da FER.
 */

const ROOT = resolve(__dirname, "../../..");
const BASE = resolve(ROOT, "docs/saas-06-a");
const INDEX = resolve(ROOT, "docs/SAAS-06-A-KIT-PRODUCAO-ASSISTIDA.md");

const ENTREGAVEIS: Array<{ file: string; titulo: string }> = [
  { file: "01-proposta-comercial.md", titulo: "Proposta Comercial" },
  { file: "02-termo-adesao-saas.md", titulo: "Termo de Adesão" },
  { file: "03-anexo-lgpd.md", titulo: "Anexo LGPD" },
  { file: "04-politica-suporte.md", titulo: "Política de Suporte" },
  { file: "05-checklist-onboarding.md", titulo: "Checklist de Onboarding" },
  { file: "06-roteiro-treinamento.md", titulo: "Roteiro de Treinamento" },
  { file: "07-mensagem-convite.md", titulo: "Mensagem de Convite" },
  { file: "08-plano-cobranca.md", titulo: "Plano de Cobrança" },
  { file: "09-matriz-escopo.md", titulo: "Matriz de Escopo" },
  { file: "10-criterios-aceite.md", titulo: "Critérios de Aceite" },
];

function read(p: string): string {
  return readFileSync(p, "utf8");
}

describe("SAAS-06-A — Kit de produção assistida", () => {
  it("índice mestre existe", () => {
    expect(existsSync(INDEX)).toBe(true);
  });

  it("índice mestre referencia todos os 10 entregáveis", () => {
    const txt = read(INDEX);
    for (const e of ENTREGAVEIS) {
      expect(txt).toContain(e.file);
    }
  });

  it.each(ENTREGAVEIS)("entregável $file existe e é não-trivial", ({ file }) => {
    const full = resolve(BASE, file);
    expect(existsSync(full)).toBe(true);
    const txt = read(full);
    expect(txt.length).toBeGreaterThan(400);
  });

  it("proposta e termo declaram natureza assistida do piloto", () => {
    const proposta = read(resolve(BASE, "01-proposta-comercial.md"));
    const termo = read(resolve(BASE, "02-termo-adesao-saas.md"));
    expect(proposta.toLowerCase()).toMatch(/produção assistida|piloto/);
    expect(termo.toLowerCase()).toMatch(/produção assistida|piloto/);
  });

  it("piloto declara duração entre 60 e 90 dias", () => {
    const proposta = read(resolve(BASE, "01-proposta-comercial.md"));
    expect(proposta).toMatch(/60\s*a\s*90\s*dias/i);
  });

  it("matriz de escopo veta migração automática e alteração do FER original", () => {
    const matriz = read(resolve(BASE, "09-matriz-escopo.md"));
    expect(matriz).toMatch(/Migração automática/i);
    expect(matriz).toMatch(/Tratamentos FER/i);
    expect(matriz.toLowerCase()).toContain("intocado");
  });

  it("plano de cobrança é 100% manual (PIX, boleto ou link)", () => {
    const cobranca = read(resolve(BASE, "08-plano-cobranca.md"));
    expect(cobranca.toLowerCase()).toContain("manual");
    expect(cobranca).toMatch(/PIX/);
    expect(cobranca.toLowerCase()).toContain("boleto");
    expect(cobranca.toLowerCase()).toContain("link");
  });

  it("anexo LGPD define papéis controlador × operador", () => {
    const lgpd = read(resolve(BASE, "03-anexo-lgpd.md"));
    expect(lgpd.toLowerCase()).toContain("controlador");
    expect(lgpd.toLowerCase()).toContain("operador");
    expect(lgpd).toMatch(/LGPD/);
  });

  it("política de suporte declara best-effort e não SLA contratual com multa", () => {
    const sup = read(resolve(BASE, "04-politica-suporte.md"));
    expect(sup.toLowerCase()).toMatch(/melhores esforços|best.?effort/);
    expect(sup.toLowerCase()).toContain("não sla");
  });

  it("checklist de onboarding cobre provisionamento, treinamento e piloto", () => {
    const chk = read(resolve(BASE, "05-checklist-onboarding.md"));
    expect(chk.toLowerCase()).toContain("provisionamento");
    expect(chk.toLowerCase()).toContain("treinamento");
    expect(chk.toLowerCase()).toContain("piloto");
  });

  it("critérios de aceite reiteram que projeto FER original não foi alterado", () => {
    const ac = read(resolve(BASE, "10-criterios-aceite.md"));
    expect(ac).toMatch(/Tratamentos FER/i);
    expect(ac.toLowerCase()).toMatch(/não foi alterado|intocado/);
  });

  it("mensagem de convite tem versões WhatsApp e e-mail", () => {
    const msg = read(resolve(BASE, "07-mensagem-convite.md"));
    expect(msg.toLowerCase()).toContain("whatsapp");
    expect(msg.toLowerCase()).toContain("e-mail");
  });

  it("índice reafirma indicadores zero (0028/0025/0029)", () => {
    const txt = read(INDEX);
    expect(txt).toMatch(/0028.*\+0/);
    expect(txt).toMatch(/0025.*\+0/);
    expect(txt).toMatch(/0029.*\+0/);
  });
});
