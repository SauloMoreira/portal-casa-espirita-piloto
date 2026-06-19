import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/cors.ts";

const IMAGE_MODEL = "google/gemini-2.5-flash-image";
const BUCKET = "avatars";

/** Extrai o data URL base64 da resposta de chat/completions com modalidade de imagem. */
function extrairImagemDataUrl(json: any): string | null {
  const msg = json?.choices?.[0]?.message;
  if (!msg) return null;
  // Formato OpenRouter: message.images[].image_url.url
  const imgs = msg.images;
  if (Array.isArray(imgs) && imgs[0]?.image_url?.url) return imgs[0].image_url.url;
  // Fallback: conteúdo em blocos
  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (part?.type === "image_url" && part?.image_url?.url) return part.image_url.url;
      if (part?.type === "output_image" && part?.image_url) return part.image_url;
    }
  }
  return null;
}

function dataUrlParaBytes(dataUrl: string): { bytes: Uint8Array; contentType: string } {
  const match = dataUrl.match(/^data:(.+?);base64,(.*)$/);
  const contentType = match?.[1] ?? "image/png";
  const b64 = match ? match[2] : dataUrl;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, contentType };
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "authorization, x-client-info, apikey, content-type");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Não autorizado" }, 401);

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) return json({ error: "Sem permissão" }, 403);

    const body = await req.json();
    const modo: string = body.modo;
    const prompt: string = (body.prompt ?? "").toString();
    const imagemUrl: string | null = body.imagemUrl ?? null;

    if (modo !== "gerar" && modo !== "otimizar") return json({ error: "Modo inválido" }, 400);
    if (!prompt.trim()) return json({ error: "Prompt obrigatório" }, 400);
    if (modo === "otimizar" && !imagemUrl) return json({ error: "Imagem de origem obrigatória para otimizar" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "Serviço de IA indisponível" }, 500);

    const content: unknown[] = [{ type: "text", text: prompt }];
    if (modo === "otimizar" && imagemUrl) {
      content.push({ type: "image_url", image_url: { url: imagemUrl } });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
      }),
    });

    if (aiResp.status === 429) return json({ error: "Limite de uso da IA atingido. Tente novamente em instantes." }, 429);
    if (aiResp.status === 402) return json({ error: "Créditos de IA esgotados." }, 402);
    if (!aiResp.ok) {
      const txt = await aiResp.text().catch(() => "");
      return json({ error: `Falha na geração de imagem (${aiResp.status})`, detalhe: txt.slice(0, 300) }, 502);
    }

    const aiJson = await aiResp.json();
    const dataUrl = extrairImagemDataUrl(aiJson);
    if (!dataUrl) return json({ error: "A IA não retornou uma imagem. Tente novamente." }, 502);

    const { bytes, contentType } = dataUrlParaBytes(dataUrl);
    const ext = contentType.includes("webp") ? "webp" : contentType.includes("jpeg") ? "jpg" : "png";

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    const path = `conteudo-ia/${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (upErr) return json({ error: `Falha ao salvar imagem: ${upErr.message}` }, 500);

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    return json({ url: pub.publicUrl, origem: "ai", otimizada: modo === "otimizar" });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
