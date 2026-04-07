import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { token, assistido_id, nome, celular, faixa_etaria, modo_checkin } =
      await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token da sessão é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the session by token
    const { data: sessao, error: sessaoErr } = await supabase
      .from("sessoes_publicas")
      .select("*, tipos_tratamento:tratamento_id(nome, trabalho_publico, permite_cadastro_rapido)")
      .eq("token", token)
      .eq("status", "aberta")
      .single();

    if (sessaoErr || !sessao) {
      return new Response(
        JSON.stringify({ error: "Sessão não encontrada ou encerrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If assistido_id provided, check for duplicate
    if (assistido_id) {
      const { data: existing } = await supabase
        .from("checkins_publicos")
        .select("id")
        .eq("sessao_id", sessao.id)
        .eq("assistido_id", assistido_id)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ error: "Presença já registrada nesta sessão", already_checked_in: true }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // If celular provided and no assistido_id, check duplicate by celular
    if (!assistido_id && celular) {
      const { data: existing } = await supabase
        .from("checkins_publicos")
        .select("id")
        .eq("sessao_id", sessao.id)
        .eq("celular", celular)
        .is("assistido_id", null)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ error: "Presença já registrada nesta sessão", already_checked_in: true }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try to find existing assistido by celular
      const { data: foundAssistido } = await supabase
        .from("assistidos")
        .select("id, nome")
        .eq("celular", celular)
        .maybeSingle();

      if (foundAssistido) {
        // Check duplicate for found assistido
        const { data: existingById } = await supabase
          .from("checkins_publicos")
          .select("id")
          .eq("sessao_id", sessao.id)
          .eq("assistido_id", foundAssistido.id)
          .maybeSingle();

        if (existingById) {
          return new Response(
            JSON.stringify({ error: "Presença já registrada nesta sessão", already_checked_in: true }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Register with found assistido
        const { error: insertErr } = await supabase
          .from("checkins_publicos")
          .insert({
            sessao_id: sessao.id,
            assistido_id: foundAssistido.id,
            modo_checkin: modo_checkin || "qr",
            cadastro_rapido: false,
          });

        if (insertErr) {
          return new Response(
            JSON.stringify({ error: insertErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: `Presença registrada para ${foundAssistido.nome}`,
            assistido_nome: foundAssistido.nome,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Quick registration (no assistido_id found)
    if (!assistido_id && nome) {
      const { error: insertErr } = await supabase
        .from("checkins_publicos")
        .insert({
          sessao_id: sessao.id,
          nome_participante: nome,
          celular: celular || null,
          faixa_etaria: faixa_etaria || null,
          modo_checkin: modo_checkin || "qr",
          cadastro_rapido: true,
        });

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: insertErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: `Presença registrada para ${nome}`, cadastro_rapido: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Register with known assistido_id
    if (assistido_id) {
      const { error: insertErr } = await supabase
        .from("checkins_publicos")
        .insert({
          sessao_id: sessao.id,
          assistido_id,
          modo_checkin: modo_checkin || "qr",
          cadastro_rapido: false,
        });

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: insertErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Presença registrada com sucesso" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Informe nome ou ID do participante" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
