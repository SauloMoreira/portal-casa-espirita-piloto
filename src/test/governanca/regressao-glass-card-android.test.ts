import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Regressão visual mobile (Android): tremor + linhas horizontais na tela de
 * Meus Tratamentos do assistido.
 *
 * Causa raiz: a utilitária `.glass-card` aplicava `backdrop-blur-` de forma
 * incondicional. Com muitos cards empilhados num grid (vários tratamentos),
 * o Chrome/WebView Android re-amostra cada camada de backdrop-filter a cada
 * frame durante o scroll, produzindo tremor e artefatos de linha. iOS/Safari
 * compõe de outra forma e não exibe o defeito.
 *
 * Correção travada aqui: `.glass-card` é opaca por padrão e só ativa o efeito
 * vidro (backdrop-blur-) sob `@media (hover: hover) and (pointer: fine)`
 * (desktop). Telas touch ficam com fundo sólido e estável.
 *
 * Este teste garante que o backdrop-blur- nunca volte a ser aplicado fora do
 * guard de ponteiro fino.
 */
describe("regressão: glass-card não trava o Android", () => {
  const css = readFileSync(resolve(__dirname, "../../index.css"), "utf-8");

  const baseGlass =
    css.match(/\.glass-card\s*\{[^}]*\}/g)?.[0] ?? "";

  it("definição base da .glass-card não usa backdrop-blur-", () => {
    expect(baseGlass).not.toMatch(/backdrop-blur-/);
  });

  it("backdrop-blur- só aparece dentro do guard de ponteiro fino/hover", () => {
    const guardBlock = css.match(
      /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{[\s\S]*?\}\s*\}/,
    )?.[0] ?? "";
    // Todas as ocorrências de backdrop-blur- devem estar dentro do bloco guard.
    const totalBlur = (css.match(/backdrop-blur-/g) || []).length;
    const blurNoGuard = (guardBlock.match(/backdrop-blur-/g) || []).length;
    expect(totalBlur).toBeGreaterThan(0);
    expect(blurNoGuard).toBe(totalBlur);
  });
});
