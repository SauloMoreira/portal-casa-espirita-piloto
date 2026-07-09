import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-C1-FIX07 — Regressão: usuário com papel base `assistido` +
 * acesso operacional concedido (ex.: `tarefeiro`) estava sendo exibido
 * como ASSISTIDO e via apenas o menu de Meu Espaço, porque o
 * `AuthContext` selecionava o primeiro item da lista retornada pela API
 * (ordem indefinida) como role efetivo.
 *
 * A correção define uma ordem de prioridade determinística que garante
 * que qualquer papel operacional sobreponha `assistido` quando ambos
 * estiverem presentes, sem afetar a checagem de guards de rota (que
 * continuam usando o array completo `roles`).
 */
describe("SAAS-06-C1-FIX07 — prioridade de role operacional sobre assistido", () => {
  const src = readFileSync(
    resolve(__dirname, "..", "..", "contexts", "AuthContext.tsx"),
    "utf8",
  );

  it("define lista de prioridade explícita", () => {
    expect(src).toMatch(/const priority: AppRole\[\] = \[/);
    expect(src).toMatch(/"admin"[\s\S]*"coordenador_de_tratamento"[\s\S]*"entrevistador"[\s\S]*"tarefeiro"[\s\S]*"assistido"/);
  });

  it("usa a prioridade para escolher o role efetivo", () => {
    expect(src).toMatch(/priority\.find\(\(r\) => list\.includes\(r\)\)/);
  });

  it("mantém colapso de administrador_master/admin em 'admin'", () => {
    expect(src).toMatch(/list\.includes\("administrador_master"\) \|\| list\.includes\("admin"\)/);
  });
});
