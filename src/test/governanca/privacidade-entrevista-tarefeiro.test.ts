/**
 * BLOCO: Privacidade da entrevista fraterna x perfil tarefeiro (BUG-03).
 *
 * O conteúdo sigiloso da entrevista fraterna (observacoes / decisoes / relato)
 * NUNCA pode trafegar para o perfil tarefeiro — nem por backend, nem por UI.
 *
 * Estes contratos estruturais protegem a correção contra regressão:
 *  - A leitura operacional (agenda, listagem, carta) passa pela RPC
 *    `fn_entrevistas_operacional`, cujo retorno tipado NÃO contém campos sigilosos.
 *  - O tipo de agenda (EntrevistaAgendaItem) não expõe `observacoes`.
 *  - O detalhe de agenda não renderiza conteúdo sigiloso.
 *  - As superfícies operacionais (agenda/carta) não fazem SELECT direto de
 *    `observacoes`/`decisoes` na tabela `entrevistas_fraternas`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("BUG-03 — contrato de retorno da RPC operacional", () => {
  it("fn_entrevistas_operacional não retorna observacoes/decisoes nos tipos", () => {
    const types = read("src/integrations/supabase/types.ts");
    const idx = types.indexOf("fn_entrevistas_operacional:");
    expect(idx).toBeGreaterThan(-1);
    // Recorta o bloco da função (até a próxima definição de função/encerramento).
    const bloco = types.slice(idx, idx + 1200);
    const returns = bloco.slice(bloco.indexOf("Returns:"));
    expect(returns).not.toMatch(/observacoes/);
    expect(returns).not.toMatch(/decisoes/);
    // Garante que os campos operacionais mínimos seguem presentes.
    expect(returns).toMatch(/assistido_id/);
    expect(returns).toMatch(/status/);
  });
});

describe("BUG-03 — tipo de agenda sem conteúdo sigiloso", () => {
  it("EntrevistaAgendaItem não declara observacoes", () => {
    const t = read("src/types/agenda.ts");
    const start = t.indexOf("interface EntrevistaAgendaItem");
    const bloco = t.slice(start, t.indexOf("}", start));
    expect(bloco).not.toMatch(/observacoes/);
    expect(bloco).not.toMatch(/decisoes/);
  });
});

describe("BUG-03 — superfícies operacionais não leem conteúdo sigiloso", () => {
  it("o serviço da agenda usa a RPC e não faz SELECT de observacoes", () => {
    const svc = read("src/services/agenda/agendaEntrevistas.ts");
    expect(svc).toMatch(/fn_entrevistas_operacional/);
    expect(svc).not.toMatch(/\.select\([^)]*observacoes/);
    expect(svc).not.toMatch(/\.select\([^)]*decisoes/);
  });

  it("a carta de agendamento lê a data pela RPC operacional, sem acesso direto", () => {
    const carta = read("src/components/CartaAgendamento.tsx");
    expect(carta).toMatch(/fn_entrevistas_operacional/);
    expect(carta).not.toMatch(/from\("entrevistas_fraternas"\)/);
  });

  it("o detalhe da agenda não renderiza observacoes/conteúdo sigiloso", () => {
    const dlg = read("src/components/agenda/AgendaEventDetailsDialog.tsx");
    expect(dlg).not.toMatch(/entrevista\.observacoes/);
  });
});
