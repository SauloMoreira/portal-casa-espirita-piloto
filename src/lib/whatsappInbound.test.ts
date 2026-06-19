import { describe, it, expect } from "vitest";
import {
  classificarIntencao, decidirHandoff, resumoMensagem,
  montarRespostaProgramacao, formatarHorario, ehPerguntaPessoal,
  montarRespostaTratamentoHoje, montarRespostaProximaSessao, formatarDataCurta,
  resolverDataAlvo, detectarAtividade, montarRespostaExcecao,
  ehConversacional, montarRespostaConversacional, jaSaudadoRecentemente,
  gerarRespostaConversacional, escolherFrase, SAUDACAO_SUFIXOS, PONTE_FRASES,
  extrairSaudacaoDoTexto,
  primeiroNomeSeguro, montarSaudacaoInicial, decidirPedidoHumano,
  RETENCAO_HUMANO_MENSAGEM, ENCAMINHAMENTO_HUMANO_MENSAGEM,
} from "./whatsappInbound";

describe("whatsappInbound — identificação e saudação do Daniel", () => {
  it("extrai primeiro nome seguro e descarta valores inconsistentes", () => {
    expect(primeiroNomeSeguro("Saulo da Costa Moreira")).toBe("Saulo");
    expect(primeiroNomeSeguro("lucas")).toBe("Lucas");
    expect(primeiroNomeSeguro("  maria  aparecida ")).toBe("Maria");
    expect(primeiroNomeSeguro(null)).toBeNull();
    expect(primeiroNomeSeguro("")).toBeNull();
    expect(primeiroNomeSeguro("   ")).toBeNull();
    expect(primeiroNomeSeguro("123")).toBeNull();
    expect(primeiroNomeSeguro("J")).toBeNull();
  });

  it("usa o nome do usuário na saudação quando disponível", () => {
    const msg = montarSaudacaoInicial({ nome: "Lucas Pereira", horaLocal: 15 });
    expect(msg).toContain("Boa tarde, Lucas.");
    expect(msg).toContain("Sou o Daniel, assistente virtual da FER");
    expect(msg).toContain("encaminhar você para um atendimento humano");
    expect(msg).toContain("horário comercial");
  });

  it("usa fallback neutro quando o nome não está disponível", () => {
    const msg = montarSaudacaoInicial({ nome: null, horaLocal: 9 });
    expect(msg).toContain("Bom dia.");
    expect(msg).not.toMatch(/Bom dia,/);
    expect(msg).toContain("Sou o Daniel, assistente virtual da FER");
    expect(msg).toContain("atendimento humano");
  });

  it("a saudação do primeiro contato é a mensagem do Daniel (não do assistido)", () => {
    const msg = gerarRespostaConversacional("saudacao", {
      texto: "Olá! Estou falando pela plataforma da FER. 🌿",
      jaSaudado: false, horaLocal: 15, nome: "Saulo da Costa Moreira",
    });
    expect(msg).toContain("Boa tarde, Saulo.");
    expect(msg).toContain("Sou o Daniel, assistente virtual da FER");
  });
});

describe("whatsappInbound — pedido de atendimento humano", () => {
  it("classifica pedidos explícitos de humano", () => {
    expect(classificarIntencao("quero falar com um atendente")).toBe("falar_humano");
    expect(classificarIntencao("posso falar com uma pessoa?")).toBe("falar_humano");
    expect(classificarIntencao("atendimento humano por favor")).toBe("falar_humano");
  });

  it("primeira solicitação faz retenção gentil, sem handoff", () => {
    const r = decidirPedidoHumano(0);
    expect(r.handoff).toBe(false);
    expect(r.resposta).toBe(RETENCAO_HUMANO_MENSAGEM);
    expect(r.resposta).toContain("Antes disso, posso tentar te ajudar");
  });

  it("segunda solicitação encaminha para handoff", () => {
    const r = decidirPedidoHumano(1);
    expect(r.handoff).toBe(true);
    expect(r.resposta).toBe(ENCAMINHAMENTO_HUMANO_MENSAGEM);
  });
});

describe("whatsappInbound — camada conversacional básica", () => {
  it("classifica saudações isoladas como saudacao", () => {
    expect(classificarIntencao("oi")).toBe("saudacao");
    expect(classificarIntencao("olá")).toBe("saudacao");
    expect(classificarIntencao("bom dia")).toBe("saudacao");
    expect(classificarIntencao("boa tarde")).toBe("saudacao");
    expect(classificarIntencao("boa noite")).toBe("saudacao");
    expect(classificarIntencao("tudo bem?")).toBe("saudacao");
  });

  it("classifica agradecimentos/ok como agradecimento", () => {
    expect(classificarIntencao("obrigado")).toBe("agradecimento");
    expect(classificarIntencao("valeu")).toBe("agradecimento");
    expect(classificarIntencao("ok")).toBe("agradecimento");
    expect(classificarIntencao("certo")).toBe("agradecimento");
  });

  it("saudação isolada NÃO gera handoff", () => {
    expect(ehConversacional("saudacao")).toBe(true);
    expect(ehConversacional("agradecimento")).toBe(true);
    const d = decidirHandoff("saudacao", { assistidoIdentificado: false, respostaGerada: true });
    expect(d.handoff).toBe(false);
    const d2 = decidirHandoff("agradecimento", { assistidoIdentificado: false, respostaGerada: true });
    expect(d2.handoff).toBe(false);
  });

  it("saudação + pergunta operacional segue para a lógica de negócio", () => {
    expect(classificarIntencao("boa tarde, tem palestra hoje?")).toBe("programacao_publica");
    expect(classificarIntencao("oi, tenho tratamento hoje?")).toBe("tratamento_hoje");
    expect(classificarIntencao("bom dia, quando é minha próxima sessão?")).toBe("proxima_sessao");
  });

  it("monta resposta social humana, com persona Daniel/FER e período do dia", () => {
    expect(montarRespostaConversacional("saudacao", 9)).toMatch(/^Bom dia\. Sou o Daniel, assistente virtual da FER\./u);
    expect(montarRespostaConversacional("saudacao", 14)).toMatch(/^Boa tarde\. Sou o Daniel/u);
    expect(montarRespostaConversacional("saudacao", 20)).toMatch(/^Boa noite\. Sou o Daniel/u);
    expect(montarRespostaConversacional("saudacao")).toMatch(/^Olá\. Sou o Daniel/u);
    expect(montarRespostaConversacional("agradecimento")).toMatch(/^Disponha!/);
  });
});


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

  it("reconhece perguntas públicas sobre a programação da casa", () => {
    expect(classificarIntencao("tem palestra hoje?")).toBe("programacao_publica");
    expect(classificarIntencao("terá palestra hoje?")).toBe("programacao_publica");
    expect(classificarIntencao("hoje tem palestra?")).toBe("programacao_publica");
    expect(classificarIntencao("qual o horário da palestra?")).toBe("programacao_publica");
    expect(classificarIntencao("tem evangelhoterapia hoje?")).toBe("programacao_publica");
    expect(classificarIntencao("quais trabalhos públicos tem hoje?")).toBe("programacao_publica");
    expect(classificarIntencao("que horas começa a palestra?")).toBe("programacao_publica");
    expect(classificarIntencao("tem atendimento público hoje?")).toBe("programacao_publica");
});

describe("whatsappInbound — distinção entre pergunta pública e pessoal", () => {
  it("classifica perguntas pessoais sobre tratamento de hoje", () => {
    expect(classificarIntencao("tenho tratamento hoje?")).toBe("tratamento_hoje");
    expect(classificarIntencao("tenho sessão hoje?")).toBe("tratamento_hoje");
    expect(classificarIntencao("tenho atendimento hoje?")).toBe("tratamento_hoje");
  });

  it("classifica perguntas pessoais sobre próxima sessão/tratamento", () => {
    expect(classificarIntencao("qual meu próximo tratamento?")).toBe("proxima_sessao");
    expect(classificarIntencao("quando é minha próxima sessão?")).toBe("proxima_sessao");
    expect(classificarIntencao("quando é meu próximo atendimento?")).toBe("proxima_sessao");
    expect(classificarIntencao("que horas é minha sessão?")).toBe("proxima_sessao");
  });

  it("classifica perguntas pessoais sobre entrevista", () => {
    expect(classificarIntencao("tenho entrevista marcada?")).toBe("horario_entrevista");
    expect(classificarIntencao("quando é minha entrevista?")).toBe("horario_entrevista");
  });

  it("perguntas públicas continuam públicas", () => {
    expect(classificarIntencao("tem palestra hoje?")).toBe("programacao_publica");
    expect(classificarIntencao("amanhã tem evangelhoterapia?")).toBe("programacao_publica");
    expect(classificarIntencao("que horas é a palestra?")).toBe("programacao_publica");
  });

  it("marca corretamente intenções pessoais", () => {
    expect(ehPerguntaPessoal("tratamento_hoje")).toBe(true);
    expect(ehPerguntaPessoal("proxima_sessao")).toBe(true);
    expect(ehPerguntaPessoal("horario_entrevista")).toBe(true);
    expect(ehPerguntaPessoal("programacao_publica")).toBe(false);
  });

  it("perguntas pessoais exigem assistido identificado (handoff sem identificação)", () => {
    expect(decidirHandoff("tratamento_hoje", { assistidoIdentificado: false, respostaGerada: false }).handoff).toBe(true);
    expect(decidirHandoff("tratamento_hoje", { assistidoIdentificado: true, respostaGerada: true }).handoff).toBe(false);
  });
});

describe("whatsappInbound — respostas pessoais com dados reais", () => {
  it("responde tratamento de hoje a partir da agenda real", () => {
    expect(montarRespostaTratamentoHoje([{ nome: "Passe", data: "2026-06-18", horario: "19:00", status: "agendado" }]))
      .toMatch(/hoje você tem Passe às 19h/i);
    expect(montarRespostaTratamentoHoje([])).toMatch(/não tem tratamento agendado/i);
  });

  it("considera exceção operacional (cancelamento) no tratamento de hoje", () => {
    const r = montarRespostaTratamentoHoje([{ nome: "Passe", data: "2026-06-18", status: "cancelado" }]);
    expect(r).toMatch(/cancelado/i);
  });

  it("responde próxima sessão real com nome e data", () => {
    const r = montarRespostaProximaSessao({ nome: "Evangelhoterapia", data: "2026-06-25", horario: "20:00", status: "agendado" });
    expect(r).toMatch(/Evangelhoterapia em 25\/06 às 20h/);
  });

  it("não inventa quando não há próxima sessão", () => {
    expect(montarRespostaProximaSessao(null)).toMatch(/não encontrei sessões futuras/i);
  });

  it("formata data curta", () => {
    expect(formatarDataCurta("2026-06-18")).toBe("18/06");
    expect(formatarDataCurta(null)).toBe("");
  });
});
});

describe("whatsappInbound — programação pública (intent público, sem identificação)", () => {
  it("não exige assistido identificado e não abre handoff quando há resposta", () => {
    const d = decidirHandoff("programacao_publica", { assistidoIdentificado: false, respostaGerada: true });
    expect(d.handoff).toBe(false);
  });

  it("formata horários de forma amigável", () => {
    expect(formatarHorario("19:00")).toBe("19h");
    expect(formatarHorario("19:00:00")).toBe("19h");
    expect(formatarHorario("20:30")).toBe("20h30");
    expect(formatarHorario(null)).toBe("");
  });

  it("monta resposta com uma sessão pública real", () => {
    const r = montarRespostaProgramacao([{ nome: "Palestra Pública", horario: "19:00" }]);
    expect(r).toMatch(/Palestra Pública às 19h/);
  });

  it("monta resposta com múltiplos trabalhos públicos", () => {
    const r = montarRespostaProgramacao([
      { nome: "Palestra Pública", horario: "19:00" },
      { nome: "Evangelhoterapia", horario: "20:00" },
    ]);
    expect(r).toMatch(/Palestra Pública às 19h/);
    expect(r).toMatch(/Evangelhoterapia às 20h/);
  });

  it("responde com segurança quando não há programação (sem handoff)", () => {
    const r = montarRespostaProgramacao([]);
    expect(r).toMatch(/não encontrei programação pública/i);
    const d = decidirHandoff("programacao_publica", { assistidoIdentificado: false, respostaGerada: true });
    expect(d.handoff).toBe(false);
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

describe("whatsappInbound — contexto temporal (cada mensagem é independente)", () => {
  // 2026-06-18 is a Thursday (diaSemana=4).
  const base = "2026-06-18";

  it("resolve 'hoje' / 'amanhã' / 'depois de amanhã'", () => {
    expect(resolverDataAlvo("tem palestra hoje?", base).iso).toBe("2026-06-18");
    expect(resolverDataAlvo("amanhã tem evangelhoterapia?", base).iso).toBe("2026-06-19");
    expect(resolverDataAlvo("depois de amanhã tem passe?", base).iso).toBe("2026-06-20");
  });

  it("a mudança de contexto entre mensagens muda a data alvo (sem repetir resposta antiga)", () => {
    const m1 = resolverDataAlvo("tem palestra hoje?", base);
    const m2 = resolverDataAlvo("amanhã tem evangelhoterapia?", base);
    expect(m1.label).toBe("hoje");
    expect(m2.label).toBe("amanhã");
    expect(m1.iso).not.toBe(m2.iso);
  });

  it("resolve dia da semana (próxima quinta = +7)", () => {
    expect(resolverDataAlvo("próxima quinta tem palestra?", base).iso).toBe("2026-06-25");
    expect(resolverDataAlvo("sexta tem evangelhoterapia?", base).iso).toBe("2026-06-19");
  });

  it("detecta a atividade pública perguntada", () => {
    expect(detectarAtividade("amanhã tem evangelhoterapia?")).toBe("Evangelhoterapia");
    expect(detectarAtividade("que horas é a palestra?")).toBe("Palestra Pública");
    expect(detectarAtividade("tem alguma coisa hoje?")).toBeNull();
  });

  it("a resposta pública usa o rótulo do dia perguntado", () => {
    const r = montarRespostaProgramacao([{ nome: "Evangelhoterapia", horario: "19:00" }], "amanhã");
    expect(r).toMatch(/Sim, amanhã temos Evangelhoterapia às 19h/);
  });
});

describe("whatsappInbound — exceções operacionais (fonte preferencial)", () => {
  it("usa a mensagem sugerida pela administração quando existe", () => {
    const r = montarRespostaExcecao({
      atividade: "Evangelhoterapia", status: "cancelado",
      mensagem_ia: "A Evangelhoterapia de hoje foi cancelada por causa do jogo do Brasil. 🌿",
    });
    expect(r).toMatch(/jogo do Brasil/);
  });

  it("monta resposta de cancelamento a partir dos dados estruturados", () => {
    const r = montarRespostaExcecao({
      atividade: "Palestra Pública", status: "cancelado", motivo: "feriado",
    }, "amanhã");
    expect(r).toMatch(/Amanhã não haverá Palestra Pública/);
    expect(r).toMatch(/feriado/);
  });

  it("monta resposta de remarcação com nova data/horário", () => {
    const r = montarRespostaExcecao({
      atividade: "Passe", status: "remarcado", nova_data: "2026-06-25", novo_horario: "20:00",
    });
    expect(r).toMatch(/remarcada para 25\/06 às 20h/);
  });
});

describe("whatsappInbound — camada de ponte e condução da conversa", () => {
  it("classifica pedidos genéricos de informação como pedido_informacao", () => {
    expect(classificarIntencao("gostaria de algumas informações")).toBe("pedido_informacao");
    expect(classificarIntencao("queria tirar uma dúvida")).toBe("pedido_informacao");
    expect(classificarIntencao("preciso de ajuda")).toBe("pedido_informacao");
    expect(classificarIntencao("posso fazer uma pergunta?")).toBe("pedido_informacao");
  });

  it("continuação de conversa (saudação + pedido) vira ponte, não saudação", () => {
    expect(classificarIntencao("tudo bem gostaria de algumas informações?")).toBe("pedido_informacao");
  });

  it("pergunta operacional vence a ponte mesmo com saudação", () => {
    expect(classificarIntencao("boa tarde, tem palestra hoje?")).toBe("programacao_publica");
    expect(classificarIntencao("oi, queria saber se tem palestra hoje")).toBe("programacao_publica");
  });

  it("classifica encerramentos simples", () => {
    expect(classificarIntencao("tchau")).toBe("encerramento");
    expect(classificarIntencao("era só isso, obrigado")).toBe("encerramento");
  });

  it("ponte e encerramento são conversacionais e não geram handoff", () => {
    for (const i of ["pedido_informacao", "encerramento"] as const) {
      expect(ehConversacional(i)).toBe(true);
      const d = decidirHandoff(i, { assistidoIdentificado: false, respostaGerada: true });
      expect(d.handoff).toBe(false);
    }
  });

  it("resposta de ponte convida a continuar, sem repetir saudação", () => {
    const r = gerarRespostaConversacional("pedido_informacao", { texto: "queria uma informação" });
    expect(r).toMatch(/disposição|ajudar|consultar|saber/i);
    expect(r).not.toMatch(/Bom dia|Boa tarde|Boa noite/);
  });

  it("apresenta a persona Daniel da FER apenas no primeiro contato", () => {
    const inicio = gerarRespostaConversacional("saudacao", { horaLocal: 14, texto: "oi" });
    expect(inicio).toMatch(/Sou Daniel, assistente virtual da FER/);
    // No meio da conversa não reapresenta a persona.
    const meio = gerarRespostaConversacional("pedido_informacao", { texto: "uma dúvida", jaSaudado: true });
    expect(meio).not.toMatch(/Sou Daniel/);
  });


  it("não repete a saudação nem reapresenta a persona quando já saudado", () => {
    const jaSaudado = gerarRespostaConversacional("saudacao", { horaLocal: 14, jaSaudado: true, texto: "oi" });
    expect(jaSaudado).not.toMatch(/Bom dia|Boa tarde|Boa noite/);
    expect(jaSaudado).not.toMatch(/Sou Daniel/);
    expect(jaSaudado).toMatch(/[✨🌿🙏💙]/u);
    // First contact greeting presents the persona Daniel/FER.
    expect(gerarRespostaConversacional("saudacao", { horaLocal: 14, texto: "boa tarde" }))
      .toMatch(/^Boa tarde! [✨🌿🙏] Sou Daniel, assistente virtual da FER\./u);
  });

  it("acolhe no início e encerra com gentileza da casa", () => {
    expect(gerarRespostaConversacional("saudacao", { horaLocal: 20, texto: "boa noite" }))
      .toMatch(/^Boa noite! [✨🌿🙏] Sou Daniel/u);
    expect(gerarRespostaConversacional("encerramento", { texto: "era só isso" })).toMatch(/[🙏🌿💙]/u);
  });

  it("responde perguntas de bem-estar de forma natural", () => {
    const r = gerarRespostaConversacional("saudacao", { texto: "tudo bem?" });
    expect(r).toMatch(/Tudo (bem|ótimo)/);
  });

  it("usa paleta de emojis variada conforme o contexto", () => {
    const pessoais = new Set<string>();
    for (const txt of ["obrigado", "muito obrigado", "valeu demais", "agradeço"]) {
      const r = gerarRespostaConversacional("agradecimento", { texto: txt });
      const m = r.match(/[✨🌿🙏💙]/u);
      if (m) pessoais.add(m[0]);
    }
    // O sistema não fica preso a um único emoji.
    expect(pessoais.size).toBeGreaterThan(1);
  });

  it("não repete o mesmo emoji da última resposta", () => {
    const primeiro = gerarRespostaConversacional("encerramento", { texto: "era só isso" });
    const emojiAnt = primeiro.match(/[✨🌿🙏💙]/u)?.[0] ?? null;
    const segundo = gerarRespostaConversacional("encerramento", { texto: "era só isso", ultimaResposta: primeiro });
    const emojiNovo = segundo.match(/[✨🌿🙏💙]/u)?.[0] ?? null;
    expect(emojiNovo).not.toBe(emojiAnt);
  });

  it("varia a formulação conforme a mensagem (não é frase fixa)", () => {
    const a = gerarRespostaConversacional("saudacao", { horaLocal: 9, texto: "bom dia" });
    const b = gerarRespostaConversacional("saudacao", { horaLocal: 9, texto: "oi" });
    expect(a).toMatch(/^Bom dia! [✨🌿🙏] Sou Daniel/u);
    expect(b).toMatch(/^Bom dia! [✨🌿🙏] Sou Daniel/u);
    // Different inbound text maps to different repertoire paths, both valid.
    expect(a).not.toBe(b);
  });

  it("anti-repetição: não repete verbatim a última resposta enviada", () => {
    const lista = PONTE_FRASES;
    for (let seed = 0; seed < 12; seed++) {
      const escolhido = escolherFrase(lista, seed);
      const proximo = escolherFrase(lista, seed, escolhido);
      expect(proximo).not.toBe(escolhido);
    }
  });

  it("anti-repetição na geração conversacional com ultimaResposta", () => {
    const primeiro = gerarRespostaConversacional("agradecimento", { texto: "obrigado" });
    const segundo = gerarRespostaConversacional("agradecimento", { texto: "obrigado", ultimaResposta: primeiro });
    expect(segundo).not.toBe(primeiro);
  });

  it("jaSaudadoRecentemente detecta contato recente dentro da janela", () => {
    const agora = Date.parse("2026-06-18T14:00:00Z");
    expect(jaSaudadoRecentemente("2026-06-18T13:30:00Z", agora)).toBe(true);
    expect(jaSaudadoRecentemente("2026-06-18T08:00:00Z", agora)).toBe(false);
    expect(jaSaudadoRecentemente(null, agora)).toBe(false);
    expect(jaSaudadoRecentemente("data-invalida", agora)).toBe(false);
  });
});

describe("whatsappInbound — retribuição gentil de saudação", () => {
  it("extrai saudação de tempo do texto", () => {
    expect(extrairSaudacaoDoTexto("bom dia")).toBe("Bom dia");
    expect(extrairSaudacaoDoTexto("boa tarde")).toBe("Boa tarde");
    expect(extrairSaudacaoDoTexto("boa noite")).toBe("Boa noite");
    expect(extrairSaudacaoDoTexto("oi")).toBeNull();
    expect(extrairSaudacaoDoTexto("olá, bom dia!")).toBe("Bom dia");
  });

  it("retribui bom dia mesmo quando já saudado", () => {
    const r = gerarRespostaConversacional("saudacao", { horaLocal: 14, jaSaudado: true, texto: "bom dia" });
    expect(r).toMatch(/^Bom dia! /); expect(r).toMatch(/[✨🌿🙏]/u);
    expect(r).not.toMatch(/Sou Daniel/);
    expect(r).toMatch(/ajudar/i);
  });

  it("retribui boa tarde mesmo quando já saudado", () => {
    const r = gerarRespostaConversacional("saudacao", { horaLocal: 9, jaSaudado: true, texto: "boa tarde" });
    expect(r).toMatch(/^Boa tarde! /); expect(r).toMatch(/[✨🌿🙏]/u);
    expect(r).toMatch(/ajudar|saber/i);
  });

  it("retribui boa noite mesmo quando já saudado", () => {
    const r = gerarRespostaConversacional("saudacao", { horaLocal: 9, jaSaudado: true, texto: "boa noite" });
    expect(r).toMatch(/^Boa noite! /); expect(r).toMatch(/[✨🌿🙏]/u);
    expect(r).toMatch(/ajudar/i);
  });

  it("não retribui saudação de tempo para saudação genérica (oi)", () => {
    const r = gerarRespostaConversacional("saudacao", { horaLocal: 14, jaSaudado: true, texto: "oi" });
    expect(r).not.toMatch(/^Bom dia/);
    expect(r).not.toMatch(/^Boa tarde/);
    expect(r).not.toMatch(/^Boa noite/);
    expect(r).toMatch(/[✨🌿🙏💙]/u);
  });
});
