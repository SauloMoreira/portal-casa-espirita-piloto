import { test, expect } from "../playwright-fixture";

/**
 * Smoke E2E for public/auth routes that do not require authentication.
 * These protect navigation, routing and critical entry screens from
 * regressions without depending on seeded credentials.
 */

test.describe("Autenticação e rotas públicas", () => {
  test("a página de login renderiza o formulário", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
  });

  test("rota protegida redireciona para login quando não autenticado", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("agenda exige autenticação", async ({ page }) => {
    await page.goto("/agenda");
    await expect(page).toHaveURL(/\/login/);
  });

  test("esqueci minha senha é acessível", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.locator("input[type='email']")).toBeVisible();
  });
});
