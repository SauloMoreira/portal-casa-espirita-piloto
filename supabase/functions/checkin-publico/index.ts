import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---- Normalization helpers (anti-duplicidade) ----
function normalizeNome(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function normalizeCelular(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, ""); // strip mask
  return digits || null;
}

// Rate-limit config (lightweight, IP based via checkin_tentativas log)
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_ATTEMPTS = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const log = createLogger("checkin-publico", req);

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const logAttempt = async (token: string | null, sucesso: boolean, motivo: string | null) => {
    await supabase.from("checkin_tentativas").insert({ ip, token, sucesso, motivo }).then(() => {}, () => {});
  };

  const reject = async (status: number, error: string, token: string | null, extra: Record<string, unknown> = {}) => {
    await logAttempt(token, false, error);
    if (status >= 500) log.error("checkin_rejected", { status, error });
    else log.warn("checkin_rejected", { status, error });
    return new Response(JSON.stringify({ error, ...extra }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };


  try {
    // --- Rate limiting per IP ---
    if (ip !== "unknown") {
      const since = new Date(Date.now() - RATE_WINDOW_SECONDS * 1000).toISOString();
      const { count } = await supabase
        .from("checkin_tentativas")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", since);

      if ((count ?? 0) >= RATE_MAX_ATTEMPTS) {
        return await reject(429, "Muitas tentativas. Aguarde um momento e tente novamente.", null);
      }
    }

    const body = await req.json();
    const { token, action, assistido_id, modo_checkin } = body;
    const nome = normalizeNome(body.nome) ? body.nome.trim() : null; // keep original display, normalized for matching
    const nomeNorm = normalizeNome(body.nome);
    const celular = normalizeCelular(body.celular);
    const faixa_etaria = body.faixa_etaria || null;

    if (!token) {
      return await reject(400, "Token da sessão é obrigatório", null);
    }

    // Fetch session by token (only open sessions)
    const { data: sessao } = await supabase
      .from("sessoes_publicas")
      .select("*, tipos_tratamento:tratamento_id(nome, trabalho_publico, permite_cadastro_rapido)")
      .eq("token", token)
      .eq("status", "aberta")
      .maybeSingle();

    if (!sessao) {
      return await reject(404, "Sessão não encontrada ou encerrada", token);
    }

    // Token/QR expiration: the QR is valid only for the session day.
    const today = new Date().toISOString().slice(0, 10);
    if (sessao.data_sessao !== today) {
      return await reject(410, "Este QR Code expirou. Ele é válido apenas no dia da sessão.", token, { expired: true });
    }

    // Validate-only mode
    if (action === "validate") {
      await logAttempt(token, true, "validate");
      return new Response(
        JSON.stringify({
          valid: true,
          sessao_id: sessao.id,
          trabalho: (sessao as any).tipos_tratamento?.nome,
          data: sessao.data_sessao,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dupResponse = (assistido_nome?: string) =>
      reject(409, "Presença já registrada nesta sessão", token, { already_checked_in: true, assistido_nome });

    // Known assistido path
    if (assistido_id) {
      const { data: existing } = await supabase
        .from("checkins_publicos")
        .select("id")
        .eq("sessao_id", sessao.id)
        .eq("assistido_id", assistido_id)
        .maybeSingle();
      if (existing) return await dupResponse();

      const { error: insertErr } = await supabase.from("checkins_publicos").insert({
        sessao_id: sessao.id,
        assistido_id,
        modo_checkin: modo_checkin || "qr",
        cadastro_rapido: false,
      });
      if (insertErr) return await reject(500, insertErr.message, token);

      await logAttempt(token, true, "checkin_assistido");
      return new Response(
        JSON.stringify({ success: true, message: "Presença registrada com sucesso" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Public path: need at least a name
    if (!nomeNorm) {
      return await reject(400, "Informe o nome do participante", token);
    }

    // Duplicate check by normalized celular (when provided)
    if (celular) {
      const { data: existing } = await supabase
        .from("checkins_publicos")
        .select("id")
        .eq("sessao_id", sessao.id)
        .eq("celular", celular)
        .is("assistido_id", null)
        .maybeSingle();
      if (existing) return await dupResponse();

      // Try matching an existing assistido by normalized phone (digits only, sanitized)
      const { data: foundAssistido } = await supabase
        .from("assistidos")
        .select("id, nome, celular")
        .eq("celular", celular)
        .maybeSingle();

      if (foundAssistido) {
        const { data: existingById } = await supabase
          .from("checkins_publicos")
          .select("id")
          .eq("sessao_id", sessao.id)
          .eq("assistido_id", foundAssistido.id)
          .maybeSingle();
        if (existingById) return await dupResponse(foundAssistido.nome);

        const { error: insertErr } = await supabase.from("checkins_publicos").insert({
          sessao_id: sessao.id,
          assistido_id: foundAssistido.id,
          modo_checkin: modo_checkin || "qr",
          cadastro_rapido: false,
        });
        if (insertErr) return await reject(500, insertErr.message, token);

        await logAttempt(token, true, "checkin_match_assistido");
        return new Response(
          JSON.stringify({ success: true, message: `Presença registrada para ${foundAssistido.nome}`, assistido_nome: foundAssistido.nome }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Duplicate check by normalized name (same session, quick registration without phone)
    if (!celular) {
      const { data: sameName } = await supabase
        .from("checkins_publicos")
        .select("id, nome_participante")
        .eq("sessao_id", sessao.id)
        .is("assistido_id", null);
      const already = (sameName || []).some(
        (r: any) => normalizeNome(r.nome_participante) === nomeNorm
      );
      if (already) return await dupResponse();
    }

    // Quick registration
    const { error: insertErr } = await supabase.from("checkins_publicos").insert({
      sessao_id: sessao.id,
      nome_participante: nome,
      celular: celular,
      faixa_etaria,
      modo_checkin: modo_checkin || "qr",
      cadastro_rapido: true,
    });
    if (insertErr) return await reject(500, insertErr.message, token);

    await logAttempt(token, true, "cadastro_rapido");
    return new Response(
      JSON.stringify({ success: true, message: `Presença registrada para ${nome}`, cadastro_rapido: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    log.error("checkin_failed", { message: (err as Error).message });
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
