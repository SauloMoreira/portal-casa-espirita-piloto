/**
 * BLOCO: Invariantes de exceção operacional.
 *
 * Garante separação entre cancelamento e remarcação, ausência de disparo cego
 * para público e respeito ao escopo real da exceção. Exercita os espelhos
 * oficiais `tipoEventoExcecao`, `eventoExcecao` e `alvoExcecaoElegivel`
 * (contraparte de `fn_excecao_alvos` / `fn_processar_excecao_notificacoes`).
 *
 * Invariantes protegidas:
 *  - INV-EXC-001 — cancelamento e remarcação são eventos distintos
 *  - INV-EXC-002 — público sem alvo rastreável não notifica
 *  - INV-EXC-003 — exceção só afeta o que está no escopo válido
 */
import { describe, it, expect } from "vitest";
import {
  tipoEventoExcecao,
  eventoExcecao,
  alvoExcecaoElegivel,
} from "@/lib/notificacaoElegibilidade";

const AGORA = new Date("2026-06-24T12:00:00-03:00");

describe("INV-EXC-001 — cancelamento e remarcação são eventos distintos", () => {
  it("remarcado com nova_data válida → remarcacao", () => {
    expect(tipoEventoExcecao("remarcado", "2026-07-01")).toBe("remarcacao");
  });

  it("remarcado SEM nova_data → trata como cancelamento (não finge remarcação)", () => {
    expect(tipoEventoExcecao("remarcado", null)).toBe("cancelamento");
    expect(tipoEventoExcecao("remarcado", "  ")).toBe("cancelamento");
  });

  it("cada (domínio, tipo) mapeia para um evento específico", () => {
    expect(eventoExcecao("tratamento", "cancelamento")).toBe("sessao_cancelada_por_excecao");
    expect(eventoExcecao("tratamento", "remarcacao")).toBe("sessao_remarcada_por_excecao");
    expect(eventoExcecao("entrevista", "cancelamento")).toBe("entrevista_cancelada_por_excecao");
    expect(eventoExcecao("entrevista", "remarcacao")).toBe("entrevista_remarcada_por_excecao");
    expect(eventoExcecao("publico", "cancelamento")).toBe("publico_cancelado_por_excecao");
    expect(eventoExcecao("publico", "remarcacao")).toBe("publico_remarcado_por_excecao");
  });
});

describe("INV-EXC-002 — público sem alvo rastreável NÃO notifica", () => {
  it("público sem alvo rastreável é inelegível (sem disparo cego)", () => {
    expect(
      alvoExcecaoElegivel({
        dominio: "publico",
        existe: true,
        status: "agendado",
        alvoRastreavel: false,
      }),
    ).toBe(false);
  });

  it("público com alvo rastreável é elegível", () => {
    expect(
      alvoExcecaoElegivel({
        dominio: "publico",
        existe: true,
        status: "agendado",
        alvoRastreavel: true,
      }),
    ).toBe(true);
  });

  it("público cancelado nunca notifica", () => {
    expect(
      alvoExcecaoElegivel({
        dominio: "publico",
        existe: true,
        status: "cancelado",
        alvoRastreavel: true,
      }),
    ).toBe(false);
  });
});

describe("INV-EXC-003 — exceção só afeta compromissos do escopo válido", () => {
  it("tratamento só é alvo quando está agendado e não vencido", () => {
    expect(
      alvoExcecaoElegivel({
        dominio: "tratamento",
        existe: true,
        status: "agendado",
        dataCompromisso: "2026-07-15",
        horario: "15:00",
        agora: AGORA,
      }),
    ).toBe(true);

    expect(
      alvoExcecaoElegivel({
        dominio: "tratamento",
        existe: true,
        status: "cancelado",
        dataCompromisso: "2026-07-15",
        horario: "15:00",
        agora: AGORA,
      }),
    ).toBe(false);

    // vencida não é mais alvo
    expect(
      alvoExcecaoElegivel({
        dominio: "tratamento",
        existe: true,
        status: "agendado",
        dataCompromisso: "2026-06-20",
        horario: "15:00",
        agora: AGORA,
      }),
    ).toBe(false);
  });

  it("compromisso inexistente nunca é alvo", () => {
    expect(alvoExcecaoElegivel({ dominio: "tratamento", existe: false })).toBe(false);
  });

  it("entrevista já encerrada/cancelada não é alvo", () => {
    for (const status of ["cancelada", "remarcada", "concluida", "realizada"]) {
      expect(
        alvoExcecaoElegivel({
          dominio: "entrevista",
          existe: true,
          status,
          dataCompromisso: "2026-07-15",
          agora: AGORA,
        }),
      ).toBe(false);
    }
  });
});
