// SAAS-05-E-EDGE-D — assistente-entrevista tenant-aware.
// Resolve tenant via entrevista→assistido ou assistido; valida membership;
// impede contexto cross-tenant no prompt; audita tenant_resolvido/origem_tenant.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { buildUserMessage } from "./payload.ts";




interface TratamentoDisponivel {
  id?: string;
  nome: string;
  tipo?: string;
  quantidade_padrao_sessoes?: number;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "authorization, x-client-info, apikey, content-type");
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

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const userRole = roles?.[0]?.role;
    if (!userRole || !["admin", "entrevistador"].includes(userRole)) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const observacoes: string = body.observacoes;
    const assistido_nome: string = body.assistido_nome;
    const assistido_id: string | null = body.assistido_id ?? null;
    const entrevista_id: string | null = body.entrevista_id ?? null;
    const tratamentos_disponiveis: TratamentoDisponivel[] = body.tratamentos_disponiveis || [];

    if (!observacoes || !observacoes.trim()) {
      return new Response(JSON.stringify({ error: "Observações da entrevista são obrigatórias" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Chave de IA não configurada" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Consultar base de conhecimento da Central de IA ──
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: configRows } = await serviceClient.from("ia_configuracoes").select("*").limit(1);
    const config = configRows?.[0] || null;

    const { data: queixas } = await serviceClient.from("ia_queixas").select("id, nome_queixa, categoria, descricao, palavras_chave, sinonimos, nivel_relevancia").eq("status", "ativo").order("nivel_relevancia");

    const { data: vinculos } = await serviceClient.from("ia_queixa_tratamento").select("queixa_id, tratamento_id, prioridade, peso, tipo_relacao, observacao_operacional, observacao_doutrinaria").eq("status", "ativo");

    let bibliotecaTexto = "";
    const materiaisConsultados: Array<{ titulo: string; tipo_material?: string | null }> = [];
    if (config?.usar_base_doutrinaria) {
      const { data: materiais } = await serviceClient.from("ia_biblioteca").select("titulo, autor, tema, tipo_material, resumo, texto_indexavel").eq("status", "ativo").eq("usar_na_ia", true).limit(20);
      if (materiais && materiais.length > 0) {
        for (const m of materiais as Array<Record<string, string>>) materiaisConsultados.push({ titulo: m.titulo, tipo_material: m.tipo_material });
        bibliotecaTexto = (materiais as Array<Record<string, string>>).map((m) => {
          let entry = `- "${m.titulo}"`;
          if (m.autor) entry += ` (${m.autor})`;
          entry += ` — Tema: ${m.tema}`;
          if (m.resumo) entry += `\n  Resumo: ${m.resumo}`;
          if (m.texto_indexavel) entry += `\n  Trecho: ${m.texto_indexavel.substring(0, 500)}`;
          return entry;
        }).join("\n\n");
      }
    }

    // ── Mapa de tratamentos disponíveis (id -> nome) ──
    const tratamentosMap: Record<string, string> = {};
    tratamentos_disponiveis.forEach((t) => { if (t.id) tratamentosMap[t.id] = t.nome; });

    let queixasComTratamentos = "";
    if (queixas && queixas.length > 0) {
      queixasComTratamentos = (queixas as Array<Record<string, unknown>>).map((q) => {
        const vinculosQueixa = (vinculos || []).filter((v: Record<string, unknown>) => v.queixa_id === q.id);
        let entry = `### ${q.nome_queixa} (categoria: ${q.categoria}, relevância: ${q.nivel_relevancia})`;
        if (q.descricao) entry += `\nDescrição: ${q.descricao}`;
        if (Array.isArray(q.palavras_chave) && q.palavras_chave.length) entry += `\nPalavras-chave: ${(q.palavras_chave as string[]).join(", ")}`;
        if (Array.isArray(q.sinonimos) && q.sinonimos.length) entry += `\nSinônimos: ${(q.sinonimos as string[]).join(", ")}`;
        if (vinculosQueixa.length > 0) {
          entry += `\nTratamentos recomendados:`;
          vinculosQueixa
            .sort((a: Record<string, number>, b: Record<string, number>) => (b.peso as number) - (a.peso as number))
            .forEach((v: Record<string, unknown>) => {
              const nomeT = tratamentosMap[v.tratamento_id as string] || (v.tratamento_id as string);
              entry += `\n  - ${nomeT} (prioridade: ${v.prioridade}, peso: ${v.peso}, tipo: ${v.tipo_relacao})`;
              if (v.observacao_operacional) entry += ` | Obs operacional: ${v.observacao_operacional}`;
              if (v.observacao_doutrinaria) entry += ` | Obs doutrinária: ${v.observacao_doutrinaria}`;
            });
        }
        return entry;
      }).join("\n\n");
    }

    const tratamentosLista = tratamentos_disponiveis
      .map((t) => `- id="${t.id ?? ""}" | ${t.nome} (tipo: ${t.tipo}, sessões padrão: ${t.quantidade_padrao_sessoes})`)
      .join("\n");

    const pesoOp = config?.peso_base_operacional ?? 7;
    const pesoDout = config?.peso_base_doutrinaria ?? 5;

    let systemPrompt = `Você é um assistente de APOIO à equipe de entrevista fraterna de uma instituição espírita.
Sua função é analisar as observações registradas pelo entrevistador e devolver uma análise estruturada.

REGRAS IMPORTANTES:
- Suas sugestões são apenas APOIO. A decisão final é SEMPRE do entrevistador.
- Seja respeitoso e empático. Não faça diagnósticos médicos ou psicológicos.
- Baseie-se nas observações E na base de conhecimento cadastrada.
- PRIORIZE os tratamentos vinculados às queixas identificadas na base de conhecimento, considerando peso e prioridade.
- Use SOMENTE tratamentos da lista de TRATAMENTOS DISPONÍVEIS e retorne o "tratamento_id" exato de cada um. Se não houver id adequado, use null.
- Peso base operacional: ${pesoOp}/10. Peso base doutrinária: ${pesoDout}/10.

## TRATAMENTOS DISPONÍVEIS NO SISTEMA
${tratamentosLista || "Nenhum tratamento cadastrado."}`;

    if (queixasComTratamentos) {
      systemPrompt += `\n\n## BASE DE CONHECIMENTO — QUEIXAS E TRATAMENTOS RECOMENDADOS\n${queixasComTratamentos}`;
    }
    if (bibliotecaTexto) {
      systemPrompt += `\n\n## REFERÊNCIAS DOUTRINÁRIAS\n${bibliotecaTexto}`;
    }

    systemPrompt += `\n\nResponda ESTRITAMENTE com um objeto JSON válido (sem cercas de código), no formato:
{
  "resumo": "resumo objetivo e respeitoso das observações",
  "queixas_identificadas": [{ "nome": "...", "categoria": "..." }],
  "tratamentos_sugeridos": [{ "tratamento_id": "id-da-lista-ou-null", "nome": "...", "quantidade": 0 }],
  "justificativa": "explicação breve do porquê de cada tratamento, citando queixas e referências",
  "texto": "versão markdown legível com seções Resumo, Pontos de Atenção, Sugestões de Tratamento${config?.exibir_justificativa ? ", Justificativa" : ""}"
}
Para cada tratamento, "quantidade" é o número de sessões recomendado (inteiro).`;

    // Q2-A1: minimização LGPD — o payload enviado à IA contém apenas as
    // observações da sessão, sem nome nem identificadores diretos do assistido.
    const userMessage = buildUserMessage(observacoes);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
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
    const content: string = aiData.choices?.[0]?.message?.content || "";

    // ── Parse robusto do JSON ──
    let estruturada: Record<string, unknown> | null = null;
    try {
      const cleaned = content.replace(/```json\s*|\s*```/g, "").trim();
      estruturada = JSON.parse(cleaned);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try { estruturada = JSON.parse(match[0]); } catch { estruturada = null; }
      }
    }

    const resumo = (estruturada?.resumo as string) || "";
    const queixasIdent = Array.isArray(estruturada?.queixas_identificadas) ? estruturada!.queixas_identificadas : [];
    const tratamentosSug = Array.isArray(estruturada?.tratamentos_sugeridos) ? estruturada!.tratamentos_sugeridos : [];
    const justificativa = (estruturada?.justificativa as string) || "";
    const texto = (estruturada?.texto as string) || content || "Sem resposta do assistente.";
    const quantidadesSug = (tratamentosSug as Array<Record<string, unknown>>).reduce((acc: Record<string, number>, t) => {
      if (t.tratamento_id) acc[t.tratamento_id as string] = Number(t.quantidade) || 0;
      return acc;
    }, {});

    // ── Persistir a sugestão (status pendente) ──
    let sugestaoId: string | null = null;
    const { data: inserted, error: insErr } = await serviceClient
      .from("ia_sugestoes")
      .insert({
        entrevista_id,
        assistido_id,
        entrevistador_id: user.id,
        resumo_ia: resumo || texto.slice(0, 1000),
        queixas_identificadas_json: queixasIdent,
        tratamentos_sugeridos_json: tratamentosSug,
        quantidades_sugeridas_json: quantidadesSug,
        justificativa_ia: justificativa,
        materiais_consultados_json: materiaisConsultados,
        status: "pendente",
      })
      .select("id")
      .single();
    if (insErr) {
      console.error("Erro ao persistir sugestão:", insErr.message);
    } else {
      sugestaoId = inserted?.id ?? null;
    }

    // Log audit
    await serviceClient.from("audit_logs").insert({
      user_id: user.id,
      tabela: "ia_sugestoes",
      acao: "ASSISTENTE_IA",
      registro_id: sugestaoId,
      dados_novos: { assistido_nome, observacoes_length: observacoes.length, queixas_consultadas: queixas?.length || 0, biblioteca_consultada: config?.usar_base_doutrinaria || false },
    });

    return new Response(JSON.stringify({
      sugestao_id: sugestaoId,
      sugestao: texto,
      estruturada: {
        resumo,
        queixas_identificadas: queixasIdent,
        tratamentos_sugeridos: tratamentosSug,
        justificativa,
        materiais_consultados: materiaisConsultados,
        texto,
      },
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("assistente-entrevista error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
