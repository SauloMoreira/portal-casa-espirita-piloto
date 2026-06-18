import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildCorsHeaders } from "../_shared/cors.ts";


serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // --- Authentication & authorization ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roles } = await authClient.from("user_roles").select("role").eq("user_id", user.id);
    const roleList = (roles || []).map((r: any) => r.role);
    if (!roleList.some((r) => ["admin", "coordenador_de_tratamento"].includes(r))) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { dashboardData } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `Você é um analista de dados de uma instituição espírita que oferece tratamentos espirituais e assistência a pessoas. Seu papel é analisar dados operacionais e gerar insights práticos e recomendações para a administração.

REGRAS:
- Use APENAS os dados fornecidos, nunca invente números.
- Seja objetivo, claro e direto.
- Referencie os dados que motivaram cada insight.
- Evite generalidades vagas.
- Foque em identificar: públicos com baixa demanda, faixas etárias sub-representadas, queda de presença, baixa entrada, concentração excessiva, baixa retenção.
- Categorize as recomendações em: Comunicação, Operação, Acolhimento ou Monitoramento.
- Limite a resposta a no máximo 5 insights, priorizando os mais relevantes.
- Cada insight deve ter: título curto, diagnóstico (1-2 frases com dados), impacto, recomendação prática e prioridade (alta/média/baixa).

Responda APENAS com JSON válido no formato:
{
  "resumo": "Frase resumo geral da análise (1-2 frases)",
  "insights": [
    {
      "titulo": "Título curto do insight",
      "categoria": "Comunicação|Operação|Acolhimento|Monitoramento",
      "diagnostico": "Descrição objetiva com dados",
      "impacto": "Consequência se nada for feito",
      "recomendacao": "Ação prática sugerida",
      "prioridade": "alta|media|baixa"
    }
  ]
}`;

    const userPrompt = `Analise os seguintes dados operacionais do período e gere insights e recomendações:

DADOS DO DASHBOARD:
${JSON.stringify(dashboardData, null, 2)}

Gere insights focados em identificar públicos com baixa demanda, oportunidades de melhoria e ações práticas.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao consultar IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    // Parse JSON from response (handle markdown code blocks)
    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { resumo: content, insights: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("insights-dashboard error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
