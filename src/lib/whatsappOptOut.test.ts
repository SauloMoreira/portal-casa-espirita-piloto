import { describe, it, expect } from "vitest";
import { classificarIntencao } from "./whatsappInbound";

/**
 * Cobertura dos comandos de opt-out / reativação das comunicações da casa
 * via WhatsApp. A classificação é pura (stateless) e tolerante a acentos/typos.
 */
describe("comandos de opt-out das comunicações da casa", () => {
  it("reconhece SAIR / PARAR / CANCELAR (e variações de caixa)", () => {
    expect(classificarIntencao("SAIR")).toBe("opt_out");
    expect(classificarIntencao("sair")).toBe("opt_out");
    expect(classificarIntencao("PARAR")).toBe("opt_out");
    expect(classificarIntencao("Pare por favor")).toBe("opt_out");
    expect(classificarIntencao("CANCELAR")).toBe("opt_out");
    expect(classificarIntencao("cancelar mensagens")).toBe("opt_out");
    expect(classificarIntencao("não quero mais receber")).toBe("opt_out");
    expect(classificarIntencao("remover")).toBe("opt_out");
    expect(classificarIntencao("stop")).toBe("opt_out");
  });

  it("reconhece VOLTAR / ATIVAR / RECEBER para reativação", () => {
    expect(classificarIntencao("VOLTAR")).toBe("reativar");
    expect(classificarIntencao("voltar a receber")).toBe("reativar");
    expect(classificarIntencao("ATIVAR")).toBe("reativar");
    expect(classificarIntencao("reativar")).toBe("reativar");
    expect(classificarIntencao("quero receber")).toBe("reativar");
    expect(classificarIntencao("quero voltar")).toBe("reativar");
  });

  it("não confunde perguntas legítimas com opt-out", () => {
    expect(classificarIntencao("tem palestra hoje?")).toBe("programacao_publica");
    expect(classificarIntencao("quando é minha sessão?")).toBe("proxima_sessao");
  });
});
