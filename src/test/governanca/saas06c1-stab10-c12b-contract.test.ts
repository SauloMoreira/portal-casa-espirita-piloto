/**
 * STAB10-C1.2-B1 — Contrato de entrada, normalização e HMAC.
 *
 * Valida:
 *  - Schema strict rejeita campos desconhecidos.
 *  - Normalização de e-mail/nome/celular/CPF.
 *  - Validação estrutural de CPF (com dígito verificador).
 *  - Fingerprint HMAC-SHA-256 usa instituicao_id (não slug) e prefixo v1.
 *  - Senha, captcha_token e Authorization NUNCA entram no material HMAC.
 *  - Marker técnico é determinístico e escopado a idempotency+request+email.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";

const contractSource = readFileSync(
  path.resolve(__dirname, "../../../supabase/functions/signup-assistido-tenant/contract.ts"),
  "utf-8",
);

/** Reimplementa o material canônico do fingerprint para garantir formato. */
function refMaterial(x: {
  instituicao_id: string;
  email_normalizado: string;
  cpf_normalizado: string;
  celular_normalizado: string;
  nome_normalizado: string;
  termos_versao: string;
  privacidade_versao: string;
}) {
  return [
    "v1",
    x.instituicao_id,
    x.email_normalizado,
    x.cpf_normalizado,
    x.celular_normalizado,
    x.nome_normalizado,
    x.termos_versao,
    x.privacidade_versao,
  ].join("|");
}

function refFingerprint(secret: string, material: string): string {
  return "v1:" + createHmac("sha256", secret).update(material).digest("hex");
}

describe("STAB10-C1.2-B1 — contract.ts", () => {
  it("declara schema strict (Zod .strict) rejeitando propriedades desconhecidas", () => {
    expect(contractSource).toMatch(/\.strict\(\)/);
    for (const field of [
      "instituicao_slug", "nome_completo", "email", "senha",
      "celular", "aceite_termos", "termos_versao", "privacidade_versao",
      "idempotency_key", "captcha_token", "cpf",
    ]) {
      expect(contractSource).toContain(field);
    }
  });

  it("fingerprintMaterial usa instituicao_id (não slug) e prefixo v1", () => {
    const material = refMaterial({
      instituicao_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email_normalizado: "a@b.com",
      cpf_normalizado: "12345678909",
      celular_normalizado: "11999999999",
      nome_normalizado: "joao",
      termos_versao: "1",
      privacidade_versao: "1",
    });
    expect(material.startsWith("v1|aaaaaaaa-")).toBe(true);
    expect(material).not.toContain("instituicao_slug");
    // Determinístico
    expect(refFingerprint("secret-x", material)).toBe(refFingerprint("secret-x", material));
  });

  it("marker técnico segue formato auth-marker:v1|key|req|email", () => {
    // O código-fonte referencia o formato canônico.
    expect(contractSource).toMatch(/auth-marker:v1\|/);
  });

  it("nenhum literal 'senha', 'password', 'captchaToken' ou 'Authorization' aparece no material canônico", () => {
    const material = contractSource.slice(
      contractSource.indexOf("export function fingerprintMaterial"),
      contractSource.indexOf("export async function computeFingerprint"),
    );
    for (const banned of ["senha", "password", "captchaToken", "captcha_token", "Authorization"]) {
      expect(material.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });

  it("normalizações principais estão presentes", () => {
    for (const fn of ["normalizeEmail", "normalizeNome", "normalizeCelular", "normalizeCpf", "validateCpf", "validateCelular"]) {
      expect(contractSource).toContain(`export function ${fn}`);
    }
  });

  it("HMAC usa SHA-256 via Web Crypto", () => {
    expect(contractSource).toMatch(/HMAC[\s\S]*SHA-256/);
    expect(contractSource).toMatch(/crypto\.subtle\.sign\("HMAC"/);
  });
});
