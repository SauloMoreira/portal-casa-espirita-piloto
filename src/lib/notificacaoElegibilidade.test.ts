import { describe, it, expect } from "vitest";
import {
  motivoInelegibilidadeLembrete,
  sessaoElegivelParaLembrete,
  rotuloMotivo,
  MOTIVO_LABEL,
  podeEncerrarPorErroCadastro,
  MOTIVOS_ERRO_CADASTRO,
  validarMensagemManual,
  ehMensagemManual,
  MENSAGEM_MANUAL_MAX,
  rotuloDiagnosticoPendencia,
} from "@/lib/notificacaoElegibilidade";

// Avaliação fixa: "agora" = 2026-06-22 12:00 (horário de São Paulo).
const AGORA = new Date("2026-06-22T15:00:00Z"); // 12:00 -03:00
const FUTURO = "2026-06-25"; // 3 dias à frente
const HORA = "19:00";

describe("motivoInelegibilidadeLembrete", () => {
  it("Caso 1/4 — sessão ativa válida e futura gera lembrete", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBeNull();
    expect(
      sessaoElegivelParaLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBe(true);
  });

  it("sessão substituída por novo plano não gera (Caso 3 / remarcação)", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "substituida_plano",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBe("sessao_substituida");
  });

  it("Caso 2 — sessão cancelada não gera", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "cancelado",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBe("sessao_cancelada");
  });

  it("sessão órfã/inexistente não gera", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_criada",
        existeAgenda: false,
        agora: AGORA,
      }),
    ).toBe("sessao_inexistente");
  });

  it("sessão fora do estado agendado não gera (não é a agenda ativa)", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "realizada",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBe("sessao_nao_agendada");
  });

  it("sessão vencida (já passou) não gera, mesmo agendada", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: "2026-06-20",
        horario: "19:00",
        agora: AGORA,
      }),
    ).toBe("lembrete_vencido");
  });

  it("Caso 5 — evento não atrelado à agenda (sugestão/público) é ignorado por esta regra", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "checkin_publico",
        existeAgenda: false,
        agora: AGORA,
      }),
    ).toBeNull();
  });

  it("prioriza substituída sobre vencida quando ambos se aplicam", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "substituida_plano",
        sessaoData: "2026-06-20",
        horario: "19:00",
        agora: AGORA,
      }),
    ).toBe("sessao_substituida");
  });

  it("sessão futura prevista (não é a próxima do vínculo) não gera lembrete", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: FUTURO,
        horario: HORA,
        ehProxima: false,
        agora: AGORA,
      }),
    ).toBe("sessao_futura_nao_proxima");
  });

  it("a próxima sessão real do vínculo permanece elegível", () => {
    expect(
      motivoInelegibilidadeLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: FUTURO,
        horario: HORA,
        ehProxima: true,
        agora: AGORA,
      }),
    ).toBeNull();
  });

  it("ehProxima ausente não bloqueia (compatibilidade)", () => {
    expect(
      sessaoElegivelParaLembrete({
        evento: "sessao_lembrete",
        existeAgenda: true,
        agendaStatus: "agendado",
        sessaoData: FUTURO,
        horario: HORA,
        agora: AGORA,
      }),
    ).toBe(true);
  });
});

describe("rotuloMotivo", () => {
  it("traduz motivos conhecidos", () => {
    expect(rotuloMotivo("sessao_substituida")).toBe(MOTIVO_LABEL.sessao_substituida);
    expect(rotuloMotivo("lembrete_vencido")).toBe(MOTIVO_LABEL.lembrete_vencido);
  });
  it("devolve o código quando desconhecido e null quando vazio", () => {
    expect(rotuloMotivo("motivo_inexistente_x")).toBe("motivo_inexistente_x");
    expect(rotuloMotivo(null)).toBeNull();
    expect(rotuloMotivo(undefined)).toBeNull();
  });
});

describe("podeEncerrarPorErroCadastro", () => {
  it("permite encerrar item com erro de cadastro ainda ativo na fila", () => {
    for (const erro of MOTIVOS_ERRO_CADASTRO) {
      expect(podeEncerrarPorErroCadastro({ status: "falha", erro })).toBe(true);
      expect(podeEncerrarPorErroCadastro({ status: "pendente", erro })).toBe(true);
      expect(podeEncerrarPorErroCadastro({ status: "agendado", erro })).toBe(true);
    }
  });

  it("bloqueia item sem erro de cadastro (ex.: regra de agenda ou opt-out)", () => {
    expect(podeEncerrarPorErroCadastro({ status: "falha", erro: "template_indisponivel" })).toBe(false);
    expect(podeEncerrarPorErroCadastro({ status: "cancelado", erro: "sessao_substituida" })).toBe(false);
    expect(podeEncerrarPorErroCadastro({ status: "cancelado", erro: "opt_out" })).toBe(false);
    expect(podeEncerrarPorErroCadastro({ status: "agendado", erro: "sessao_futura_nao_proxima" })).toBe(false);
  });

  it("bloqueia item já enviado ou já cancelado", () => {
    expect(podeEncerrarPorErroCadastro({ status: "enviado", erro: "sem_telefone" })).toBe(false);
    expect(podeEncerrarPorErroCadastro({ status: "cancelado", erro: "sem_telefone" })).toBe(false);
  });

  it("bloqueia item sem motivo definido", () => {
    expect(podeEncerrarPorErroCadastro({ status: "falha", erro: null })).toBe(false);
    expect(podeEncerrarPorErroCadastro({ status: "pendente", erro: undefined })).toBe(false);
  });
});

describe("validarMensagemManual", () => {
  it("aceita texto válido e normaliza espaços", () => {
    const r = validarMensagemManual("  Olá   pessoa  ");
    expect(r.ok).toBe(true);
    expect(r.texto).toBe("Olá pessoa");
    expect(r.erro).toBeUndefined();
  });

  it("rejeita mensagem vazia ou só com espaços", () => {
    expect(validarMensagemManual("").erro).toBe("mensagem_vazia");
    expect(validarMensagemManual("   ").erro).toBe("mensagem_vazia");
    expect(validarMensagemManual(null).erro).toBe("mensagem_vazia");
    expect(validarMensagemManual(undefined).erro).toBe("mensagem_vazia");
  });

  it("rejeita mensagem acima do limite", () => {
    const longa = "a".repeat(MENSAGEM_MANUAL_MAX + 1);
    const r = validarMensagemManual(longa);
    expect(r.ok).toBe(false);
    expect(r.erro).toBe("mensagem_muito_longa");
  });

  it("aceita mensagem exatamente no limite", () => {
    const exata = "a".repeat(MENSAGEM_MANUAL_MAX);
    expect(validarMensagemManual(exata).ok).toBe(true);
  });
});

describe("ehMensagemManual", () => {
  it("identifica o evento de mensagem manual", () => {
    expect(ehMensagemManual("mensagem_manual")).toBe(true);
    expect(ehMensagemManual("sessao_lembrete")).toBe(false);
    expect(ehMensagemManual(null)).toBe(false);
    expect(ehMensagemManual(undefined)).toBe(false);
  });
});

describe("rótulos de mensagem manual", () => {
  it("traduz erros da ação manual", () => {
    expect(rotuloMotivo("mensagem_vazia")).toBe(MOTIVO_LABEL.mensagem_vazia);
    expect(rotuloMotivo("permissao_negada")).toBe(MOTIVO_LABEL.permissao_negada);
    expect(rotuloMotivo("destinatario_invalido")).toBe(MOTIVO_LABEL.destinatario_invalido);
  });
});

describe("rotuloDiagnosticoPendencia (L-02)", () => {
  it("retorna null sem código", () => {
    expect(rotuloDiagnosticoPendencia(null)).toBeNull();
    expect(rotuloDiagnosticoPendencia(undefined)).toBeNull();
  });

  it("aguardando janela = tom de espera", () => {
    const r = rotuloDiagnosticoPendencia("aguardando_janela");
    expect(r?.tom).toBe("espera");
    expect(r?.label).toMatch(/janela/i);
  });

  it("aguardando limite diário = tom de espera", () => {
    const r = rotuloDiagnosticoPendencia("aguardando_limite_diario");
    expect(r?.tom).toBe("espera");
    expect(r?.label).toMatch(/limite/i);
  });

  it("pendente normal = tom neutro", () => {
    const r = rotuloDiagnosticoPendencia("pendente");
    expect(r?.tom).toBe("neutro");
  });

  it("opt_out / sem_telefone = tom de bloqueio", () => {
    expect(rotuloDiagnosticoPendencia("opt_out")?.tom).toBe("bloqueio");
    expect(rotuloDiagnosticoPendencia("sem_telefone")?.tom).toBe("bloqueio");
  });

  it("bloqueado_inelegivel:<motivo> traduz o motivo interno", () => {
    const r = rotuloDiagnosticoPendencia("bloqueado_inelegivel:sessao_cancelada");
    expect(r?.tom).toBe("bloqueio");
    expect(r?.descricao).toBe(rotuloMotivo("sessao_cancelada"));
  });

  it("código desconhecido cai em rótulo neutro seguro", () => {
    const r = rotuloDiagnosticoPendencia("xpto_desconhecido");
    expect(r?.tom).toBe("neutro");
    expect(r?.label).toBeTruthy();
  });
});
