import { describe, it, expect } from "vitest";
import { navGroups } from "./AppSidebar";

/**
 * BUG-01 — Coerência entre menu, rota e semântica.
 * O item de menu deve abrir a rota cuja tela tem semântica equivalente.
 * A rota /agenda carrega a tela de "Agenda de Entrevistas" (calendário de
 * entrevistas fraternas). A rota /coordenador-agenda carrega a "Agenda do
 * Tratamento". Estes testes travam essas correspondências contra regressão.
 */
describe("AppSidebar — coerência menu × rota × semântica", () => {
  const allItems = navGroups.flatMap((g) => g.items);
  const byUrl = (url: string) => allItems.find((i) => i.url === url);

  it("/agenda é rotulada como Agenda de Entrevistas (não de Tratamentos)", () => {
    const item = byUrl("/agenda");
    expect(item).toBeDefined();
    expect(item!.title).toBe("Agenda de Entrevistas");
    expect(item!.title.toLowerCase()).not.toContain("tratamento");
  });

  it("rota da agenda de tratamentos do coordenador permanece coerente", () => {
    const item = byUrl("/coordenador-agenda");
    expect(item).toBeDefined();
    expect(item!.title).toContain("Tratamento");
    expect(item!.title.toLowerCase()).not.toContain("entrevista");
  });

  it("não há títulos de menu duplicados dentro do mesmo grupo", () => {
    for (const group of navGroups) {
      const titles = group.items.map((i) => i.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it("todo item de menu tem url e ao menos um papel", () => {
    for (const item of allItems) {
      expect(item.url).toMatch(/^\//);
      expect(item.roles.length).toBeGreaterThan(0);
    }
  });
});
