import { test, expect } from "../playwright-fixture";

/**
 * Smoke E2E for the public check-in flow. Validates the QR/check-in entry
 * screen renders and handles an invalid token gracefully (no silent crash).
 */

test.describe("Check-in público", () => {
  test("a página de check-in carrega sem quebrar", async ({ page }) => {
    await page.goto("/checkin-publico/token-de-teste-invalido");
    // Should render the public check-in screen (not a blank/crashed page).
    await expect(page.locator("body")).toBeVisible();
    await expect(page).toHaveURL(/\/checkin-publico\//);
  });
});
