/**
 * SAAS-06-C1-STAB09 — Coordenador puro perde menu/rota de Inteligência e
 * Monitoramento; página "Tratamentos sob minha coordenação" renomeada.
 *
 * Testes estáticos de contrato: leem o código fonte e asseguram que
 *  - o array `roles` das entradas do sidebar não inclui coordenador;
 *  - o `allowedRoles` dos ProtectedRoute correspondentes também não;
 *  - o menu de coordenação exibe o novo rótulo;
 *  - o título/subtítulo da página estão atualizados;
 *  - a rota /coordenador-tratamentos foi preservada;
 *  - o filtro de status da query da página permanece intacto (não regride
 *    para incluir aguardando_agendamento — dependência do STAB07).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) =>
  readFileSync(resolve(__dirname, "..", "..", ...p.split("/")), "utf8");

const sidebar = read("components/AppSidebar.tsx");
const app = read("App.tsx");
const page = read("pages/CoordenadorTratamentos.tsx");

const ADMIN_MENU_ITEMS = [
  "Fila de Notificações",
  "Observabilidade",
  "Relatórios",
  "Programação Padrão",
  "Exceções Operacionais",
];

const ADMIN_ROUTES = [
  "centralNotificacoes",
  "observabilidade",
  "relatorios",
  "programacaoPadrao",
  "excecoesOperacionais",
];

describe("STAB09-A — menu do coordenador (Inteligência e Monitoramento)", () => {
  for (const title of ADMIN_MENU_ITEMS) {
    it(`sidebar: item "${title}" NÃO autoriza coordenador_de_tratamento`, () => {
      // Casa a linha do item e verifica que o array roles não contém coordenador
      const re = new RegExp(
        `title:\\s*"${title.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"[^\\n]*roles:\\s*\\[([^\\]]*)\\]`,
      );
      const m = sidebar.match(re);
      expect(m, `entrada "${title}" não encontrada no sidebar`).toBeTruthy();
      expect(m![1]).not.toMatch(/coordenador_de_tratamento/);
    });
  }

  for (const route of ADMIN_ROUTES) {
    it(`App.tsx: rota ${route} NÃO autoriza coordenador_de_tratamento`, () => {
      const re = new RegExp(
        `ROUTES\\.${route}[^\\n]*allowedRoles=\\{\\[([^\\]]*)\\]\\}`,
      );
      const m = app.match(re);
      expect(m, `rota ${route} não encontrada`).toBeTruthy();
      expect(m![1]).not.toMatch(/coordenador_de_tratamento/);
    });
  }

  it("coordenador continua com Lista de Espera, Coordenador-Tratamentos e Coordenador-Agenda", () => {
    expect(sidebar).toMatch(
      /title:\s*"Lista de Espera"[^\n]*roles:\s*\[[^\]]*coordenador_de_tratamento/,
    );
    expect(sidebar).toMatch(
      /title:\s*"Tratamentos sob minha coordenação"[^\n]*roles:\s*\[[^\]]*coordenador_de_tratamento/,
    );
    expect(sidebar).toMatch(
      /title:\s*"Agenda do Tratamento"[^\n]*roles:\s*\[[^\]]*coordenador_de_tratamento/,
    );
  });

  it("admin continua autorizado em todas as 5 rotas administrativas", () => {
    for (const route of ADMIN_ROUTES) {
      const re = new RegExp(
        `ROUTES\\.${route}[^\\n]*allowedRoles=\\{\\[([^\\]]*)\\]\\}`,
      );
      expect(app.match(re)![1]).toMatch(/"admin"/);
    }
  });

  it("ProtectedRoute usa o array completo `roles` (acesso cumulativo preservado)", () => {
    const guard = read("components/ProtectedRoute.tsx");
    expect(guard).toMatch(/new Set<AppRole>\(roles\)/);
    expect(guard).toMatch(/allowedRoles\.some\(\(r\) => effectiveRoles\.has\(r\)\)/);
  });
});

describe("STAB09-B — renomeação de Meus Tratamentos → Tratamentos sob minha coordenação", () => {
  it("item do sidebar de Coordenação usa o novo rótulo", () => {
    expect(sidebar).toMatch(
      /title:\s*"Tratamentos sob minha coordenação"[^\n]*url:\s*"\/coordenador-tratamentos"/,
    );
    // O rótulo antigo não deve aparecer apontando para a rota de coordenação
    expect(sidebar).not.toMatch(
      /"Meus Tratamentos"[^\n]*"\/coordenador-tratamentos"/,
    );
  });

  it("página exibe título e subtítulo esperados", () => {
    expect(page).toMatch(/Tratamentos sob minha coordenação/);
    expect(page).toMatch(
      /Assistidos em tratamento nos trabalhos sob sua responsabilidade\./,
    );
  });

  it("rota /coordenador-tratamentos preservada no App", () => {
    expect(app).toMatch(/ROUTES\.coordenadorTratamentos/);
    expect(app).toMatch(
      /ROUTES\.coordenadorTratamentos[^\n]*allowedRoles=\{\["coordenador_de_tratamento"\]\}/,
    );
  });

  it("query/filtro de status da página NÃO foi ampliada (STAB07 permanece pendente)", () => {
    // Continua aceitando apenas aguardando_inicio e em_andamento.
    expect(page).toMatch(
      /\.in\("status",\s*\["aguardando_inicio",\s*"em_andamento"\]\)/,
    );
    // Nunca aceitar aguardando_agendamento no filtro .in("status", [...]).
    expect(page).not.toMatch(/\.in\("status",[^)]*aguardando_agendamento/);
  });
});
