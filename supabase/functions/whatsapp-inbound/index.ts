import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getAdapter } from "../_shared/channel-adapter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Intencao =
  | "proxima_sessao" | "horario_entrevista" | "confirmacao_agendamento"
  | "onde_ver_app" | "opt_out" | "reativar" | "complexo";

const SENSITIVE = ["reclama", "absurdo", "pessimo", "péssimo", "horrivel", "horrível",
  "advogado", "processo", "denuncia", "denúncia", "urgente", "emergencia", "emergência"];

const KEYWORDS: Array<{ intent: Intencao; terms: string[] }> = [
  { intent: "opt_out", terms: ["parar", "cancelar mensagens", "nao quero", "não quero", "sair", "descadastr", "remover"] },
  { intent: "reativar", terms: ["voltar a receber", "reativar", "quero receber"] },
  { intent: "proxima_sessao", terms: ["proxima sessao", "próxima sessão", "minha sessao", "quando e minha sessao", "quando é minha sessão"] },
  { intent: "horario_entrevista", terms: ["entrevista"] },
  { intent: "confirmacao_agendamento", terms: ["confirmar", "confirmado", "ta marcado", "tá marcado", "esta marcado"] },
  { intent: "onde_ver_app", terms: ["app", "aplicativo", "onde vejo", "onde ver", "sistema", "site"] },
];

function classificar(msg: string): Intencao {
  const txt = (msg || "").toLowerCase().trim();
  if (!txt) return "complexo";
  if (SENSITIVE.some((t) => txt.includes(t))) return "complexo";
  for (const { intent, terms } of KEYWORDS) if (terms.some((t) => txt.includes(t))) return intent;
  return "complexo";
}

const AUTORESOLVIVEIS: Intencao[] = [
  "proxima_sessao", "horario_entrevista", "confirmacao_agendamento", "onde_ver_app", "opt_out", "reativar",
];

function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "");
}

function fmtData(value: string, withTime = false): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" } : {}),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    // Evolution webhook shape (messages.upsert). Be defensive.
    const data = body?.data ?? body;
    const remoteJid: string = data?.key?.remoteJid || data?.remoteJid || body?.phone || "";
    const fromMe: boolean = data?.key?.fromMe ?? false;
    const texto: string =
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      body?.message || body?.text || "";

    if (fromMe || !remoteJid) {
      return new Response(JSON.stringify({ ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const telefone = normalizePhone(remoteJid.split("@")[0]);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const adapter = getAdapter({
      EVOLUTION_API_URL: Deno.env.get("EVOLUTION_API_URL"),
      EVOLUTION_API_KEY: Deno.env.get("EVOLUTION_API_KEY"),
      EVOLUTION_INSTANCE: Deno.env.get("EVOLUTION_INSTANCE"),
    });

    // Identify assistido by phone (digits-only match on celular/telefone).
    const { data: assistidos } = await admin
      .from("assistidos")
      .select("id, nome, celular, telefone")
      .is("deleted_at", null);
    const assistido = (assistidos || []).find((a: any) =>
      normalizePhone(a.celular || "") === telefone || normalizePhone(a.telefone || "") === telefone
    );

    // Upsert conversa
    let conversaId: string;
    const { data: convExist } = await admin
      .from("whatsapp_conversas").select("*").eq("telefone", telefone).maybeSingle();
    if (convExist) {
      conversaId = convExist.id;
      await admin.from("whatsapp_conversas").update({
        ultimo_contato_em: new Date().toISOString(),
        assistido_id: assistido?.id ?? convExist.assistido_id,
        status_conversa: "ativa",
      }).eq("id", conversaId);
    } else {
      const { data: novaConv } = await admin.from("whatsapp_conversas").insert({
        telefone, assistido_id: assistido?.id ?? null, status_conversa: "ativa",
      }).select("id").single();
      conversaId = novaConv!.id;
    }

    // Log inbound
    await admin.from("notificacoes_log").insert({
      fila_id: null, direcao: "entrada",
      payload_recebido: { telefone, texto }, status: "recebido",
    });

    const intencao = classificar(texto);
    let resposta: string | null = null;
    let handoff = false;

    if (intencao === "opt_out" && assistido) {
      await admin.from("notificacoes_preferencias").upsert({
        assistido_id: assistido.id, whatsapp_ativo: false,
        opt_out_at: new Date().toISOString(), opt_out_motivo: "solicitado_via_whatsapp",
      }, { onConflict: "assistido_id" });
      resposta = "Tudo certo! Você não receberá mais mensagens operacionais por aqui. Se mudar de ideia, é só responder 'quero receber'. 🌿";
    } else if (intencao === "reativar" && assistido) {
      await admin.from("notificacoes_preferencias").upsert({
        assistido_id: assistido.id, whatsapp_ativo: true, opt_out_at: null, opt_out_motivo: null,
      }, { onConflict: "assistido_id" });
      resposta = "Pronto! Voltamos a enviar seus lembretes por aqui. 🌿";
    } else if (intencao === "proxima_sessao" && assistido) {
      const { data: sess } = await admin
        .from("agenda_tratamentos_assistido")
        .select("data_sessao, horario")
        .eq("assistido_id", assistido.id).eq("status", "agendado")
        .gte("data_sessao", new Date().toISOString().slice(0, 10))
        .order("data_sessao", { ascending: true }).limit(1).maybeSingle();
      resposta = sess
        ? `Sua próxima sessão é em ${fmtData(sess.data_sessao)}${sess.horario ? " às " + sess.horario.slice(0, 5) : ""}. 🌿`
        : "Não encontrei sessões futuras agendadas no momento. Em caso de dúvida, nossa equipe pode ajudar.";
    } else if (intencao === "horario_entrevista" && assistido) {
      const { data: ent } = await admin
        .from("entrevistas_fraternas")
        .select("data, status")
        .eq("assistido_id", assistido.id).eq("status", "agendada")
        .order("data", { ascending: true }).limit(1).maybeSingle();
      resposta = ent
        ? `Sua entrevista está agendada para ${fmtData(ent.data, true)}. 🌿`
        : "Não encontrei entrevista agendada no momento. Nossa equipe pode confirmar para você.";
    } else if (intencao === "confirmacao_agendamento") {
      resposta = "Obrigado por confirmar! Esperamos por você. 🌿";
    } else if (intencao === "onde_ver_app") {
      resposta = "Você pode ver seus agendamentos, tratamentos e avisos direto no app, na área 'Painel' e 'Agenda'. 🌿";
    }

    if (!AUTORESOLVIVEIS.includes(intencao) || (intencao !== "confirmacao_agendamento" && intencao !== "onde_ver_app" && !assistido)) {
      handoff = true;
    }

    if (handoff) {
      // Avoid duplicate open handoffs for the same conversation.
      const { data: aberto } = await admin
        .from("whatsapp_handoffs").select("id").eq("conversa_id", conversaId)
        .in("status", ["aberto", "em_atendimento"]).maybeSingle();
      if (!aberto) {
        await admin.from("whatsapp_handoffs").insert({
          conversa_id: conversaId,
          motivo: intencao === "complexo" ? "Mensagem que requer atendimento humano" : "Assistido não identificado",
          classificado_por_ia: true, status: "aberto",
        });
        await admin.from("whatsapp_conversas").update({ em_handoff: true }).eq("id", conversaId);
      }
      resposta = resposta || "Recebemos sua mensagem! Um de nossos atendentes vai responder em breve. 🌿";
    }

    if (resposta) {
      const send = await adapter.send(telefone, resposta);
      await admin.from("notificacoes_log").insert({
        fila_id: null, direcao: "saida",
        payload_enviado: { telefone, mensagem: resposta },
        payload_recebido: send.raw ?? null,
        status: send.ok ? "enviado" : "falha", erro: send.error ?? null,
      });
    }

    return new Response(JSON.stringify({ ok: true, intencao, handoff }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
