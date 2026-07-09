/**
 * SAAS-06-C1-FIX05 — Orientação entre atuação e acesso.
 *
 * Cobre as regras invioláveis do FIX05:
 *  - cadastro de voluntário NUNCA concede papéis operacionais;
 *  - orientação pós-cadastro aponta para Gestão de Acesso;
 *  - lista mostra o status de acesso quando houver.
 */
import { describe, it, expect } from "vitest";
import {
  OPERATIONAL_ROLES,
  TIPOS_OPERACIONAIS,
  requiresOperationalAccessHint,
  ACESSO_LABELS,
} from "@/lib/voluntarioAcesso";
import { ROUTES } from "@/constants/routes";

describe("SAAS-06-C1-FIX05 — atuação × acesso", () => {
  it("tipos operacionais disparam orientação", () => {
    expect(requiresOperationalAccessHint(["Tarefeiro"])).toBe(true);
    expect(requiresOperationalAccessHint(["Médium"])).toBe(true);
    expect(requiresOperationalAccessHint([])).toBe(false);
    expect(requiresOperationalAccessHint(null)).toBe(false);
  });

  it("catálogo operacional exposto para a UI", () => {
    expect(TIPOS_OPERACIONAIS).toContain("Tarefeiro");
    expect(TIPOS_OPERACIONAIS).toContain("Médium");
  });

  it("assistido NÃO é papel operacional (não confere acesso ao sistema)", () => {
    expect(OPERATIONAL_ROLES).not.toContain("assistido");
  });

  it("papéis operacionais reconhecidos são o conjunto fechado esperado", () => {
    expect(new Set(OPERATIONAL_ROLES)).toEqual(
      new Set([
        "tarefeiro",
        "entrevistador",
        "coordenador_de_tratamento",
        "admin",
        "administrador_master",
      ]),
    );
  });

  it("mensagens amigáveis não vazam termos técnicos", () => {
    Object.values(ACESSO_LABELS).forEach((msg) => {
      expect(msg).not.toMatch(/row-level|RLS|SQL|user_roles/i);
    });
    expect(ACESSO_LABELS.orientacao).toMatch(/Acesso e Segurança/);
  });

  it("botão 'Ir para Gestão de Acesso' aponta para a rota canônica", () => {
    expect(ROUTES.governancaAcessos).toBe("/governanca-acessos");
  });
});
