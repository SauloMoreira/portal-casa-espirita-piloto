import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Only admin and entrevistador can use
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const userRole = roles?.[0]?.role;
    if (!userRole || !["admin", "entrevistador"].includes(userRole)) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { observacoes, assistido_nome, tratamentos_disponiveis } = await req.json();

    if (!observacoes || !observacoes.trim()) {
      return new Response(JSON.stringify({ error: "Observações da entrevista são obrigatórias" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Chave de IA não configurada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tratamentosLista = (tratamentos_disponiveis || [])
      .map((t: any) => `- ${t.nome} (tipo: ${t.tipo}, sessões padrão: ${t.quantidade_padrao_sessoes})`)
      .join("\n");

    const systemPrompt = `Você é um assistente de apoio à equipe de entrevista fraterna de uma instituição espírita.
Sua função é analisar as observações registradas pelo entrevistador e fornecer:

1. **Resumo**: Um resumo objetivo e respeitoso das observações.
2. **Pontos de atenção**: Queixas, dores emocionais, físicas ou espirituais mencionadas.
3. **Sugestões de tratamentos**: Com base nos tratamentos disponíveis no sistema, sugira quais seriam adequados e a quantidade de sessões recomendada para cada um.

IMPORTANTE:
- Suas sugestões são apenas apoio. A decisão final é SEMPRE do entrevistador.
- Seja respeitoso e empático.
- Não faça diagnósticos médicos ou psicológicos.
- Baseie-se apenas no que foi registrado nas observações.

Tratamentos disponíveis no sistema:
${tratamentosLista || "Nenhum tratamento cadastrado."}

Responda em formato estruturado com as seções: Resumo, Pontos de Atenção, Sugestões de Tratamento.
Para cada tratamento sugerido, indique o nome e a quantidade de sessões recomendada.`;

    const userMessage = `Assistido: ${assistido_nome || "Não informado"}

Observações da entrevista:
${observacoes}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "Erro ao consultar assistente de IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "Sem resposta do assistente.";

    // Log audit
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await serviceClient.from("audit_logs").insert({
      user_id: user.id,
      tabela: "entrevistas_fraternas",
      acao: "ASSISTENTE_IA",
      registro_id: null,
      dados_novos: { assistido_nome, observacoes_length: observacoes.length },
    });

    return new Response(JSON.stringify({ sugestao: content }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("assistente-entrevista error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
