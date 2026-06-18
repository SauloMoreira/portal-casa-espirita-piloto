import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getAdapter } from "../_shared/channel-adapter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Intencao =
  | "proxima_sessao" | "horario_entrevista" | "confirmacao_agendamento"
  | "onde_ver_app" | "programacao_publica" | "opt_out" | "reativar" | "complexo";

const SENSITIVE = ["reclama", "absurdo", "pessimo", "péssimo", "horrivel", "horrível",
  "advogado", "processo", "denuncia", "denúncia", "urgente", "emergencia", "emergência"];

const KEYWORDS: Array<{ intent: Intencao; terms: string[] }> = [
  { intent: "opt_out", terms: ["parar", "cancelar mensagens", "nao quero", "não quero", "sair", "descadastr", "remover"] },
  { intent: "reativar", terms: ["voltar a receber", "reativar", "quero receber"] },
  { intent: "programacao_publica", terms: [
    "palestra", "evangelhoterapia", "evangelho terapia", "passe",
    "trabalho publico", "trabalho público", "trabalhos publicos", "trabalhos públicos",
    "atendimento publico", "atendimento público", "programacao", "programação",
    "tem hoje", "tera hoje", "terá hoje", "tem culto", "abre hoje", "vai abrir",
  ] },
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
  "proxima_sessao", "horario_entrevista", "confirmacao_agendamento", "onde_ver_app",
  "programacao_publica", "opt_out", "reativar",
];

// Intents that can only be answered automatically when we know who is asking.
const PRECISA_ASSISTIDO: Intencao[] = [
  "proxima_sessao", "horario_entrevista", "opt_out", "reativar",
];

function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "");
}

function resumo(texto: string, max = 160): string {
  const t = (texto || "").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function formatarHorario(h: string | null | undefined): string {
  if (!h) return "";
  const [hh, mm] = h.split(":");
  if (mm && mm !== "00") return `${parseInt(hh, 10)}h${mm}`;
  return `${parseInt(hh, 10)}h`;
}

interface ItemProgramacao { nome: string; horario?: string | null; }

function montarRespostaProgramacao(itens: ItemProgramacao[]): string {
  const lista = (itens || []).filter((i) => i && i.nome);
  if (lista.length === 0) {
    return "Hoje não encontrei programação pública agendada. Em caso de dúvida, nossa equipe pode ajudar. 🌿";
  }
  if (lista.length === 1) {
    const i = lista[0];
    const hora = formatarHorario(i.horario);
    return `Sim, hoje temos ${i.nome}${hora ? " às " + hora : ""}. 🌿`;
  }
  const linhas = lista
    .map((i) => `• ${i.nome}${i.horario ? " às " + formatarHorario(i.horario) : ""}`)
    .join("\n");
  return `Hoje temos:\n${linhas}\n🌿`;
}

/** Returns today's date (YYYY-MM-DD) and weekday (0=Sun..6=Sat) in America/Sao_Paulo. */
function hojeSaoPaulo(): { data: string; diaSemana: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const data = fmt.format(new Date());
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", weekday: "short",
  }).format(new Date());
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { data, diaSemana: map[weekdayName] ?? new Date().getDay() };
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

  // admin client is needed across the whole flow (and for the catch-all safety net).
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    // Z-API on-message-received webhook shape. Be defensive and also accept
    // legacy/other shapes so the parser survives provider variations.
    const data = body?.data ?? body;
    const remoteJid: string =
      body?.phone || data?.phone ||
      data?.key?.remoteJid || data?.remoteJid || "";
    const fromMe: boolean = body?.fromMe ?? data?.fromMe ?? data?.key?.fromMe ?? false;
    const texto: string =
      body?.text?.message || data?.text?.message ||
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      body?.message || body?.text || "";

    if (fromMe || !remoteJid) {
      return new Response(JSON.stringify({ ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const telefone = normalizePhone(String(remoteJid).split("@")[0]);
    const adapter = getAdapter({
      ZAPI_INSTANCE_ID: Deno.env.get("ZAPI_INSTANCE_ID"),
      ZAPI_INSTANCE_TOKEN: Deno.env.get("ZAPI_INSTANCE_TOKEN"),
      ZAPI_BASE_URL: Deno.env.get("ZAPI_BASE_URL"),
      ZAPI_CLIENT_TOKEN: Deno.env.get("ZAPI_CLIENT_TOKEN"),
    });

    // Identify assistido by phone (digits-only match on celular/telefone).
    const { data: assistidos } = await admin
      .from("assistidos")
      .select("id, nome, celular, telefone")
      .is("deleted_at", null);
    const assistido = (assistidos || []).find((a: any) =>
      normalizePhone(a.celular || "") === telefone || normalizePhone(a.telefone || "") === telefone
    );

    // Upsert conversa (records the last inbound message text + timestamp).
    let conversaId: string;
    const { data: convExist } = await admin
      .from("whatsapp_conversas").select("*").eq("telefone", telefone).maybeSingle();
    if (convExist) {
      conversaId = convExist.id;
      await admin.from("whatsapp_conversas").update({
        ultimo_contato_em: new Date().toISOString(),
        ultima_mensagem: resumo(texto),
        assistido_id: assistido?.id ?? convExist.assistido_id,
        status_conversa: "ativa",
      }).eq("id", conversaId);
    } else {
      const { data: novaConv } = await admin.from("whatsapp_conversas").insert({
        telefone, assistido_id: assistido?.id ?? null, status_conversa: "ativa",
        ultima_mensagem: resumo(texto),
      }).select("id").single();
      conversaId = novaConv!.id;
    }

    // ===== Classify + build response. Any failure here MUST fall back to handoff. =====
    let intencao: Intencao = "complexo";
    let resposta: string | null = null;
    let handoff = false;
    let handoffMotivo = "";
    let handoffOrigem = "ia";
    let respostaOk = true;
    let respostaErro: string | null = null;
    let fallbackMotivo: string | null = null;
    let respostaFonte: string | null = null;

    try {
      intencao = classificar(texto);

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
      } else if (intencao === "programacao_publica") {
        // Public, identity-free question about today's public schedule.
        const { data: hojeData, diaSemana } = hojeSaoPaulo();

        // 1) PRIMARY: real public sessions registered for today.
        const { data: sessoes } = await admin
          .from("sessoes_publicas")
          .select("horario_inicio, status, tipos_tratamento ( nome, trabalho_publico )")
          .eq("data_sessao", hojeData)
          .neq("status", "cancelada");

        let itens: ItemProgramacao[] = (sessoes || [])
          .filter((s: any) => s?.tipos_tratamento?.trabalho_publico !== false)
          .map((s: any) => ({
            nome: s?.tipos_tratamento?.nome || "Trabalho público",
            horario: s?.horario_inicio ?? null,
          }));

        if (itens.length > 0) {
          respostaFonte = "agenda_publica_real";
        } else {
          // 2) SECONDARY: configurable operational rule (fallback by weekday).
          const { data: regra } = await admin
            .from("regras_operacionais")
            .select("valor, ativo")
            .eq("chave", "programacao_publica_fallback")
            .eq("ativo", true)
            .maybeSingle();
          if (regra?.valor) {
            try {
              const cfg = JSON.parse(regra.valor);
              const doDia = cfg?.[String(diaSemana)] ?? cfg?.dias?.[String(diaSemana)] ?? [];
              itens = (Array.isArray(doDia) ? doDia : [])
                .map((i: any) => ({ nome: i?.nome, horario: i?.horario ?? null }))
                .filter((i: ItemProgramacao) => i.nome);
              if (itens.length > 0) respostaFonte = "regra_operacional";
            } catch (_) { /* malformed rule -> treated as no programming */ }
          }
        }

        // Always a safe, valid answer (even "no programming") -> no handoff needed.
        resposta = montarRespostaProgramacao(itens);
      }

      // Decide handoff: anything the IA cannot auto-resolve, or that needs an
      // identified assistido but none was found, must escalate to a human.
      if (intencao === "complexo") {
        handoff = true; handoffOrigem = "ia";
        handoffMotivo = "Mensagem que requer atendimento humano";
      } else if (!AUTORESOLVIVEIS.includes(intencao)) {
        handoff = true; handoffOrigem = "regra";
        handoffMotivo = "Intenção sem resposta automática disponível";
      } else if (PRECISA_ASSISTIDO.includes(intencao) && !assistido) {
        handoff = true; handoffOrigem = "regra";
        handoffMotivo = "Assistido não identificado";
      } else if (!resposta) {
        // IA classified an intent but produced no valid action/answer.
        handoff = true; handoffOrigem = "regra";
        handoffMotivo = "IA não produziu uma resposta válida";
      }

    } catch (procErr) {
      // Any technical failure during classification/response building -> handoff.
      fallbackMotivo = `Falha técnica no processamento da IA: ${String(procErr)}`;
      handoff = true; handoffOrigem = "regra";
      handoffMotivo = fallbackMotivo;
      resposta = null;
    }

    // Log inbound with full audit context (identification + intent + fallback).
    await admin.from("notificacoes_log").insert({
      fila_id: null, direcao: "entrada",
      payload_recebido: {
        telefone, texto, intencao,
        assistido_identificado: !!assistido,
        assistido_id: assistido?.id ?? null,
        fallback_motivo: fallbackMotivo,
      },
      status: "recebido",
    });

    if (handoff) {
      const { data: aberto } = await admin
        .from("whatsapp_handoffs").select("id").eq("conversa_id", conversaId)
        .in("status", ["aberto", "em_atendimento"]).maybeSingle();
      if (!aberto) {
        await admin.from("whatsapp_handoffs").insert({
          conversa_id: conversaId,
          motivo: handoffMotivo || "Atendimento humano necessário",
          origem: handoffOrigem,
          classificado_por_ia: handoffOrigem === "ia",
          status: "aberto",
        });
      }
      await admin.from("whatsapp_conversas").update({ em_handoff: true }).eq("id", conversaId);
      resposta = resposta || "Recebemos sua mensagem! Um de nossos atendentes vai responder em breve. 🌿";
    }

    // Send auto-reply (IA). If sending fails, ensure a handoff exists so the
    // message is never "lost": there is always either a reply or a handoff.
    if (resposta) {
      const send = await adapter.send(telefone, resposta);
      respostaOk = send.ok;
      respostaErro = send.error ?? null;
      await admin.from("notificacoes_log").insert({
        fila_id: null, direcao: "saida",
        payload_enviado: { telefone, mensagem: resposta, autor: handoff ? "sistema" : "ia" },
        payload_recebido: send.raw ?? null,
        status: send.ok ? "enviado" : "falha", erro: send.error ?? null,
      });

      if (!send.ok && !handoff) {
        // The IA answer could not be delivered -> escalate.
        handoff = true; handoffOrigem = "regra";
        handoffMotivo = `Falha ao enviar resposta automática (Z-API): ${send.error ?? "erro"}`;
        const { data: aberto2 } = await admin
          .from("whatsapp_handoffs").select("id").eq("conversa_id", conversaId)
          .in("status", ["aberto", "em_atendimento"]).maybeSingle();
        if (!aberto2) {
          await admin.from("whatsapp_handoffs").insert({
            conversa_id: conversaId, motivo: handoffMotivo, origem: "regra",
            classificado_por_ia: false, status: "aberto",
          });
        }
        await admin.from("whatsapp_conversas").update({ em_handoff: true }).eq("id", conversaId);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, intencao, handoff, resposta_enviada: !!resposta && respostaOk, erro: respostaErro }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    // Last-resort safety net: never let an inbound disappear silently.
    // Log the failure for auditing even when the main flow blew up early.
    try {
      await admin.from("notificacoes_log").insert({
        fila_id: null, direcao: "entrada",
        payload_recebido: { erro_fatal: String(e), fallback_motivo: "Falha fatal no inbound" },
        status: "falha", erro: String(e),
      });
    } catch (_) { /* ignore logging failure */ }
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
