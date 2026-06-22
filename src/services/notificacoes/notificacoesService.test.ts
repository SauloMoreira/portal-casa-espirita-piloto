import { describe, it, expect, vi, beforeEach } from "vitest";

let lastRpc: { fn: string; args: Record<string, unknown> } | null = null;
let rpcPayload: unknown;
let nextData: unknown = null;
const fromCalls: any[] = [];

function chain() {
  const calls: any[] = [];
  const builder: any = {};
  const methods = ["update", "insert", "select", "eq", "neq", "or", "order", "limit"];
  for (const m of methods) {
    builder[m] = (...args: unknown[]) => { calls.push({ m, args }); return builder; };
  }
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
  builder.then = (resolve: any) => resolve({ data: nextData, error: null });
  builder._calls = calls;
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      lastRpc = { fn, args };
      return Promise.resolve({ data: rpcPayload, error: null });
    },
    from: (table: string) => {
      const c = chain();
      fromCalls.push({ table, builder: c });
      return c;
    },
  },
}));

import {
  listConversasEnriquecidas, encerrarConversa, reabrirConversa,
  atualizarStatusConversa, marcarConversaRevisada,
  getConversaMensagens, rotuloTipoMensagemConversa,
  filaItemNome, filaItemTratamento, filaItemPrevisao,
  filtrarFila, ordenarFila,
  type FilaItem,
} from "./notificacoesService";

function mkFila(p: Partial<FilaItem> = {}): FilaItem {
  return {
    id: p.id ?? "f1",
    evento_origem: p.evento_origem ?? "sessao_lembrete",
    assistido_id: p.assistido_id ?? "a1",
    telefone_normalizado: p.telefone_normalizado ?? "5511999999999",
    canal: p.canal ?? "whatsapp",
    template_codigo: p.template_codigo ?? "sessao_lembrete",
    status: p.status ?? "agendado",
    scheduled_at: p.scheduled_at ?? "2026-06-24T19:00:00Z",
    sent_at: p.sent_at ?? null,
    retry_count: p.retry_count ?? 0,
    external_message_id: p.external_message_id ?? null,
    erro: p.erro ?? null,
    created_at: p.created_at ?? "2026-06-20T10:00:00Z",
    payload_json: p.payload_json ?? { nome: "Ana Rosa", tratamento: "Desobsessão" },
  };
}

describe("Fila — resolução de campos a partir do payload oficial", () => {
  it("exibe nome quando houver no payload", () => {
    expect(filaItemNome(mkFila())).toBe("Ana Rosa");
  });
  it("retorna null (fallback) quando não houver nome", () => {
    expect(filaItemNome(mkFila({ payload_json: {} }))).toBeNull();
    expect(filaItemNome(mkFila({ payload_json: null }))).toBeNull();
  });
  it("exibe tratamento quando houver", () => {
    expect(filaItemTratamento(mkFila())).toBe("Desobsessão");
  });
  it("não quebra e retorna null quando não houver tratamento", () => {
    expect(filaItemTratamento(mkFila({ payload_json: { nome: "X" } }))).toBeNull();
  });
  it("previsão de envio vem de scheduled_at", () => {
    expect(filaItemPrevisao(mkFila({ scheduled_at: "2026-06-24T19:00:00Z" }))).toBe("2026-06-24T19:00:00Z");
  });
});

describe("Fila — filtros combináveis", () => {
  const base = [
    mkFila({ id: "a", status: "agendado", payload_json: { nome: "Ana", tratamento: "Desobsessão" }, telefone_normalizado: "5511111", scheduled_at: "2026-06-24T19:00:00Z" }),
    mkFila({ id: "b", status: "enviado", payload_json: { nome: "Bruno", tratamento: "Anti-Goécia" }, telefone_normalizado: "5522222", scheduled_at: "2026-06-23T19:00:00Z", sent_at: "2026-06-23T19:01:00Z" }),
    mkFila({ id: "c", status: "cancelado", payload_json: {}, telefone_normalizado: "5533333", scheduled_at: "2026-06-25T19:00:00Z" }),
  ];
  it("filtra por status", () => {
    expect(filtrarFila(base, { status: "enviado" }).map((f) => f.id)).toEqual(["b"]);
  });
  it("status 'todos' não filtra", () => {
    expect(filtrarFila(base, { status: "todos" })).toHaveLength(3);
  });
  it("filtra por nome", () => {
    expect(filtrarFila(base, { nome: "ana" }).map((f) => f.id)).toEqual(["a"]);
  });
  it("filtra por telefone", () => {
    expect(filtrarFila(base, { telefone: "22222" }).map((f) => f.id)).toEqual(["b"]);
  });
  it("filtra por tratamento", () => {
    expect(filtrarFila(base, { tratamento: "goécia" }).map((f) => f.id)).toEqual(["b"]);
  });
  it("filtra por período de previsão", () => {
    expect(filtrarFila(base, { previsaoDe: "2026-06-24", previsaoAte: "2026-06-24" }).map((f) => f.id)).toEqual(["a"]);
  });
  it("filtra por período de envio real", () => {
    expect(filtrarFila(base, { envioDe: "2026-06-23", envioAte: "2026-06-23" }).map((f) => f.id)).toEqual(["b"]);
  });
  it("combina filtros sem confusão", () => {
    expect(filtrarFila(base, { status: "agendado", tratamento: "deso" }).map((f) => f.id)).toEqual(["a"]);
    expect(filtrarFila(base, { status: "enviado", tratamento: "deso" })).toHaveLength(0);
  });
});

describe("Fila — ordenação", () => {
  const base = [
    mkFila({ id: "a", scheduled_at: "2026-06-24T19:00:00Z", sent_at: null, payload_json: { nome: "Bruno" } }),
    mkFila({ id: "b", scheduled_at: "2026-06-23T19:00:00Z", sent_at: "2026-06-23T19:01:00Z", payload_json: { nome: "Ana" } }),
    mkFila({ id: "c", scheduled_at: "2026-06-25T19:00:00Z", sent_at: null, payload_json: { nome: "Carlos" } }),
  ];
  it("ordena por previsão mais próxima", () => {
    expect(ordenarFila(base, "previsao_proxima").map((f) => f.id)).toEqual(["b", "a", "c"]);
  });
  it("ordena por previsão mais recente", () => {
    expect(ordenarFila(base, "previsao_recente").map((f) => f.id)).toEqual(["c", "a", "b"]);
  });
  it("ordena por nome", () => {
    expect(ordenarFila(base, "nome").map((f) => f.id)).toEqual(["b", "a", "c"]);
  });
});


const payload = {
  autorizado: true,
  total: 2,
  rows: [
    {
      id: "c1", telefone: "5511999999999", assistido_id: "a1", assistido_nome: "Ana",
      identificado: true, status_conversa: "ativa", em_handoff: true,
      ultimo_contato_em: "2026-06-18T10:00:00Z", ultima_mensagem: "Oi",
      total_mensagens: 5, ultimo_autor: "ia", intencao: "proxima_sessao",
      respondida_ia: true, handoff_motivo: "Mensagem complexa", handoff_origem: "ia",
      handoff_status: "aberto", handoff_atendente_id: null, tem_handoff: true,
      atendente_nome: null, canal: "whatsapp",
    },
    {
      id: "c2", telefone: "5511888888888", assistido_id: null, assistido_nome: null,
      identificado: false, status_conversa: "encerrada", em_handoff: false,
      ultimo_contato_em: "2026-06-17T10:00:00Z", ultima_mensagem: "Tchau",
      total_mensagens: 2, ultimo_autor: "assistido", intencao: null,
      respondida_ia: false, handoff_motivo: null, handoff_origem: null,
      handoff_status: null, handoff_atendente_id: null, tem_handoff: false,
      atendente_nome: null, canal: "whatsapp",
    },
  ],
};

describe("listConversasEnriquecidas", () => {
  beforeEach(() => { lastRpc = null; fromCalls.length = 0; });

  it("chama a RPC painel_conversas mapeando filtros", async () => {
    rpcPayload = payload;
    await listConversasEnriquecidas({
      inicio: "2026-06-01", fim: "2026-06-18", status: "ativa",
      identificado: true, handoff: false, resolucaoIa: true,
      pendente: true, busca: "Ana", atendente: "u1",
    });
    expect(lastRpc?.fn).toBe("painel_conversas");
    expect(lastRpc?.args).toMatchObject({
      p_inicio: "2026-06-01", p_fim: "2026-06-18", p_status: "ativa",
      p_identificado: true, p_handoff: false, p_resolucao_ia: true,
      p_pendente: true, p_busca: "Ana", p_atendente: "u1",
    });
  });

  it("normaliza filtros vazios para null", async () => {
    rpcPayload = payload;
    await listConversasEnriquecidas({ busca: "  " });
    expect(lastRpc?.args).toMatchObject({
      p_inicio: null, p_fim: null, p_status: null, p_identificado: null,
      p_handoff: null, p_resolucao_ia: null, p_pendente: null, p_busca: null,
    });
  });

  it("mapeia linhas IA, humano, sistema e assistido", async () => {
    rpcPayload = payload;
    const res = await listConversasEnriquecidas();
    expect(res.total).toBe(2);
    expect(res.rows[0].ultimo_autor).toBe("ia");
    expect(res.rows[0].handoff_motivo).toBe("Mensagem complexa");
    expect(res.rows[0].identificado).toBe(true);
    expect(res.rows[1].identificado).toBe(false);
    expect(res.rows[1].ultimo_autor).toBe("assistido");
  });

  it("retorna vazio quando não autorizado", async () => {
    rpcPayload = { autorizado: false };
    const res = await listConversasEnriquecidas();
    expect(res.autorizado).toBe(false);
    expect(res.rows).toEqual([]);
    expect(res.total).toBe(0);
  });
});

describe("ações de conversa", () => {
  beforeEach(() => { fromCalls.length = 0; });

  it("encerrarConversa fecha handoffs e marca conversa encerrada", async () => {
    await encerrarConversa("c1");
    const tabelas = fromCalls.map((f) => f.table);
    expect(tabelas).toContain("whatsapp_handoffs");
    expect(tabelas).toContain("whatsapp_conversas");
    const conv = fromCalls.find((f) => f.table === "whatsapp_conversas");
    const upd = conv.builder._calls.find((c: any) => c.m === "update");
    expect(upd.args[0]).toMatchObject({ em_handoff: false, status_conversa: "encerrada" });
  });

  it("reabrirConversa volta status para ativa", async () => {
    await reabrirConversa("c1");
    const conv = fromCalls.find((f) => f.table === "whatsapp_conversas");
    const upd = conv.builder._calls.find((c: any) => c.m === "update");
    expect(upd.args[0]).toMatchObject({ status_conversa: "ativa" });
  });

  it("atualizarStatusConversa aplica o status informado", async () => {
    await atualizarStatusConversa("c1", "encerrada");
    const conv = fromCalls.find((f) => f.table === "whatsapp_conversas");
    const upd = conv.builder._calls.find((c: any) => c.m === "update");
    expect(upd.args[0]).toMatchObject({ status_conversa: "encerrada" });
  });

  it("marcarConversaRevisada grava revisora e timestamp", async () => {
    await marcarConversaRevisada("c1", "u1", true);
    const conv = fromCalls.find((f) => f.table === "whatsapp_conversas");
    const upd = conv.builder._calls.find((c: any) => c.m === "update");
    expect(upd.args[0].revisada_por).toBe("u1");
    expect(upd.args[0].revisada_em).toBeTruthy();
  });

  it("marcarConversaRevisada(false) limpa os campos", async () => {
    await marcarConversaRevisada("c1", "u1", false);
    const conv = fromCalls.find((f) => f.table === "whatsapp_conversas");
    const upd = conv.builder._calls.find((c: any) => c.m === "update");
    expect(upd.args[0].revisada_por).toBeNull();
    expect(upd.args[0].revisada_em).toBeNull();
  });
});

describe("getConversaMensagens — observabilidade do inbound", () => {
  beforeEach(() => { fromCalls.length = 0; nextData = null; });

  it("renderiza mensagem inbound textual e a resposta da IA na mesma conversa", async () => {
    nextData = [
      {
        id: "in1", direcao: "entrada", status: "recebido", erro: null,
        created_at: "2026-06-22T20:00:00Z",
        payload_recebido: { telefone: "5511999", texto: "Posso confirmar minha sessão?", tipo_mensagem: "texto" },
      },
      {
        id: "out1", direcao: "saida", status: "enviado", erro: null,
        created_at: "2026-06-22T20:00:01Z",
        payload_enviado: { telefone: "5511999", mensagem: "Vou te encaminhar.", autor: "ia" },
      },
    ];
    const msgs = await getConversaMensagens("5511999");
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ direcao: "entrada", autor: "assistido", texto: "Posso confirmar minha sessão?" });
    expect(msgs[1]).toMatchObject({ direcao: "saida", autor: "ia" });
  });

  it("não esconde inbound não textual e usa placeholder pelo tipo", async () => {
    nextData = [
      {
        id: "in2", direcao: "entrada", status: "recebido", erro: null,
        created_at: "2026-06-22T20:33:18Z",
        payload_recebido: { telefone: "5511999", texto: "", tipo_mensagem: "audio" },
      },
    ];
    const msgs = await getConversaMensagens("5511999");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].midia).toBe(true);
    expect(msgs[0].tipo_mensagem).toBe("audio");
    expect(msgs[0].texto).toContain("áudio");
  });

  it("prioriza conteudo_exibicao (legenda) quando presente", async () => {
    nextData = [
      {
        id: "in3", direcao: "entrada", status: "recebido", erro: null,
        created_at: "2026-06-22T20:34:00Z",
        payload_recebido: { telefone: "5511999", texto: "olha isso", tipo_mensagem: "imagem", conteudo_exibicao: "🖼️ Usuário enviou uma imagem: olha isso" },
      },
    ];
    const msgs = await getConversaMensagens("5511999");
    expect(msgs[0].texto).toBe("🖼️ Usuário enviou uma imagem: olha isso");
    expect(msgs[0].midia).toBe(true);
  });

  it("rotuloTipoMensagemConversa cobre os tipos conhecidos", () => {
    expect(rotuloTipoMensagemConversa("audio")).toContain("áudio");
    expect(rotuloTipoMensagemConversa("imagem")).toContain("imagem");
    expect(rotuloTipoMensagemConversa("documento")).toContain("documento");
    expect(rotuloTipoMensagemConversa("localizacao")).toContain("localização");
    expect(rotuloTipoMensagemConversa("qualquer")).toContain("mensagem");
  });
});
