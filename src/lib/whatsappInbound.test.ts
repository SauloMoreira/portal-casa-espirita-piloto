import { describe, it, expect } from "vitest";
import {
  classificarIntencao, decidirHandoff, resumoMensagem,
} from "./whatsappInbound";

describe("whatsappInbound — classificação de intenção", () => {
  it("classifica mensagens vazias como complexo", () => {
    expect(classificarIntencao("")).toBe("complexo");
    expect(classificarIntencao("   ")).toBe("complexo");
  });

  it("escala mensagens sensíveis para complexo (atendimento humano)", () => {
    expect(classificarIntencao("isso é um absurdo")).toBe("complexo");
    expect(classificarIntencao("vou chamar meu advogado")).toBe("complexo");
    expect(classificarIntencao("é urgente")).toBe("complexo");
  });

  it("reconhece intenções auto-resolvíveis", () => {
    expect(classificarIntencao("quando é minha próxima sessão?")).toBe("proxima_sessao");
    expect(classificarIntencao("onde vejo no app?")).toBe("onde_ver_app");
    expect(classificarIntencao("quero parar de receber")).toBe("opt_out");
    expect(classificarIntencao("quero voltar a receber")).toBe("reativar");
    expect(classificarIntencao("confirmar presença")).toBe("confirmacao_agendamento");
  });

  it("mensagens sem correspondência viram complexo", () => {
    expect(classificarIntencao("blá blá texto aleatório xyz")).toBe("complexo");
  });
});

describe("whatsappInbound — fallback obrigatório (nunca perder inbound)", () => {
  it("inbound complexo SEMPRE abre handoff de origem IA", () => {
    const d = decidirHandoff("complexo", { assistidoIdentificado: true, respostaGerada: false });
    expect(d.handoff).toBe(true);
    expect(d.origem).toBe("ia");
    expect(d.motivo).toMatch(/atendimento humano/i);
  });

  it("intenção auto-resolvível com assistido e resposta NÃO abre handoff", () => {
    const d = decidirHandoff("proxima_sessao", { assistidoIdentificado: true, respostaGerada: true });
    expect(d.handoff).toBe(false);
  });

  it("intenção que precisa de assistido sem identificação abre handoff (regra)", () => {
    const d = decidirHandoff("proxima_sessao", { assistidoIdentificado: false, respostaGerada: false });
    expect(d.handoff).toBe(true);
    expect(d.origem).toBe("regra");
    expect(d.motivo).toMatch(/não identificado/i);
  });

  it("intenção auto-resolvível sem resposta válida abre handoff (regra)", () => {
    const d = decidirHandoff("confirmacao_agendamento", { assistidoIdentificado: true, respostaGerada: false });
    expect(d.handoff).toBe(true);
    expect(d.origem).toBe("regra");
    expect(d.motivo).toMatch(/não produziu/i);
  });

  it("confirmação/onde_ver_app não exigem assistido identificado", () => {
    expect(decidirHandoff("confirmacao_agendamento", { assistidoIdentificado: false, respostaGerada: true }).handoff).toBe(false);
    expect(decidirHandoff("onde_ver_app", { assistidoIdentificado: false, respostaGerada: true }).handoff).toBe(false);
  });

  it("garante que toda intenção gera resposta OU handoff", () => {
    const intencoes = ["proxima_sessao", "horario_entrevista", "confirmacao_agendamento",
      "onde_ver_app", "opt_out", "reativar", "complexo"] as const;
    for (const i of intencoes) {
      const semResposta = decidirHandoff(i, { assistidoIdentificado: false, respostaGerada: false });
      // sem resposta gerada => obrigatoriamente handoff
      expect(semResposta.handoff).toBe(true);
    }
  });
});

describe("whatsappInbound — resumo da última mensagem", () => {
  it("mantém mensagens curtas e trunca longas", () => {
    expect(resumoMensagem("oi")).toBe("oi");
    const longa = "a".repeat(200);
    const r = resumoMensagem(longa, 160);
    expect(r.length).toBe(160);
    expect(r.endsWith("…")).toBe(true);
  });
});
