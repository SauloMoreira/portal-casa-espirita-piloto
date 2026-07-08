// SAAS-05-E-EDGE-D — ia-site-ingestao tenant-aware.
// Exige p_instituicao_id no payload; valida membership admin no tenant;
// tagueia preview e audita tenant_resolvido; sem indexação cross-tenant.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { guardCronOrStaff } from "../_shared/auth.ts";


const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-cron-secret";

// Domínio institucional permitido nesta fase. Qualquer outro é rejeitado.
const DOMINIO_PERMITIDO = "www.fermarica.com.br";

type Categoria =
  | "tratamento" | "institucional" | "contato" | "doacao"
  | "campanha" | "evento" | "comunicado" | "outros";
type Prioridade = "alta" | "media" | "baixa" | "condicionada";

function normalizar(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove ruído estrutural e extrai o texto principal de um HTML. */
function extrairTexto(html: string): { titulo: string; corpo: string } {
  let titulo = "";
  const mTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (mTitle) titulo = mTitle[1].replace(/\s+/g, " ").trim();

  let limpo = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ");

  // Título alternativo via primeiro <h1> quando <title> ausente.
  if (!titulo) {
    const mH1 = limpo.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (mH1) titulo = mH1[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const corpo = limpo
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&atilde;/gi, "ã")
    .replace(/&ccedil;/gi, "ç").replace(/&otilde;/gi, "õ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { titulo, corpo };
}

function derivarResumo(corpo: string): string {
  const txt = corpo.slice(0, 600).trim();
  const corte = txt.lastIndexOf(". ");
  return (corte > 120 ? txt.slice(0, corte + 1) : txt).slice(0, 400);
}

const KW: Record<Categoria, string[]> = {
  tratamento: ["magnetismo", "desobsessao", "evangelhoterapia", "apometria", "passe", "tratamento", "terapia", "agua fluidificada", "mediunidade"],
  contato: ["contato", "telefone", "whatsapp", "endereco", "localizacao", "como chegar", "horario de funcionamento", "e-mail", "email"],
  institucional: ["sobre", "quem somos", "historia", "missao", "fundacao", "federacao", "instituicao", "a casa"],
  doacao: ["doacao", "doar", "contribuir", "contribuicao"],
  campanha: ["campanha", "mantenedor", "socio"],
  evento: ["evento", "encontro", "seminario", "palestra especial"],
  comunicado: ["comunicado", "aviso", "noticia", "post"],
  outros: [],
};

function sugerirCategoria(texto: string): Categoria {
  const t = normalizar(texto);
  const ordem: Categoria[] = ["tratamento", "contato", "institucional", "doacao", "campanha", "evento", "comunicado"];
  let melhor: Categoria = "outros";
  let melhorScore = 0;
  for (const cat of ordem) {
    const score = KW[cat].reduce((acc, k) => acc + (t.includes(normalizar(k)) ? 1 : 0), 0);
    if (score > melhorScore) { melhorScore = score; melhor = cat; }
  }
  return melhor;
}

function sugerirPrioridade(cat: Categoria): Prioridade {
  if (cat === "tratamento" || cat === "institucional" || cat === "contato") return "alta";
  if (cat === "doacao" || cat === "campanha" || cat === "evento") return "media";
  if (cat === "comunicado") return "condicionada";
  return "media";
}

function sugerirTemporal(cat: Categoria, texto: string): boolean {
  if (cat === "evento" || cat === "comunicado" || cat === "campanha") return true;
  const t = normalizar(texto);
  return /\b(20\d{2})\b/.test(t) && (t.includes("evento") || t.includes("data") || t.includes("inscricao"));
}

async function sha256(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, ALLOW_HEADERS);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Apenas administradores autenticados.
  const guard = await guardCronOrStaff(req, ["admin"]);
  if (!guard.ok) return guard.response!;

  let body: { url?: string; p_instituicao_id?: string; instituicao_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corpo inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── SAAS-05-E-EDGE-D: tenant obrigatório + membership admin no tenant ──
  const supabaseUrlEnv = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKeyEnv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminGuard = createClient(supabaseUrlEnv, serviceRoleKeyEnv);
  const tenantResolvido: string | null = body.p_instituicao_id ?? body.instituicao_id ?? null;
  const origemTenant = "payload";

  // recuperar user (quando não for cron)
  let guardUserId: string | null = null;
  const _authHeader = req.headers.get("Authorization");
  if (_authHeader) {
    const _uc = createClient(supabaseUrlEnv, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: _authHeader } } });
    const { data: _u } = await _uc.auth.getUser();
    guardUserId = _u?.user?.id ?? null;
  }

  if (!tenantResolvido) {
    await adminGuard.from("audit_logs").insert({
      user_id: guardUserId,
      tabela: "ia_site_documentos",
      acao: "SAAS05_E_EDGE_D_TENANT_INDETERMINADO",
      dados_novos: { marcador: "saas05_e_edge_d", url: body.url ?? null },
    });
    return new Response(
      JSON.stringify({ error: "p_instituicao_id obrigatório." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (guardUserId) {
    const { data: isPa } = await adminGuard.rpc("is_platform_admin", { p_user_id: guardUserId });
    if (!isPa) {
      const { data: mem } = await adminGuard
        .from("instituicao_usuarios")
        .select("id")
        .eq("user_id", guardUserId)
        .eq("instituicao_id", tenantResolvido)
        .eq("ativo", true)
        .maybeSingle();
      if (!mem) {
        await adminGuard.from("audit_logs").insert({
          user_id: guardUserId,
          tabela: "ia_site_documentos",
          acao: "SAAS05_E_EDGE_D_TENANT_FORBIDDEN",
          dados_novos: { tenant_resolvido: tenantResolvido, origem_tenant: origemTenant, marcador: "saas05_e_edge_d" },
        });
        return new Response(
          JSON.stringify({ error: "Usuário não pertence à instituição informada." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
  }


  const rawUrl = (body.url || "").trim();
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return new Response(JSON.stringify({ error: "URL inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== DOMINIO_PERMITIDO) {
    return new Response(
      JSON.stringify({ error: `Apenas URLs https de ${DOMINIO_PERMITIDO} são aceitas nesta fase.` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Busca o HTML da página.
  let html = "";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const resp = await fetch(parsed.toString(), {
      headers: { "User-Agent": "FER-IA-Ingestao/1.0" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Falha ao buscar a página (HTTP ${resp.status}).` }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    html = await resp.text();
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Não foi possível acessar a página." }), {
      status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { titulo, corpo } = extrairTexto(html);
  if (!corpo || corpo.length < 40) {
    return new Response(JSON.stringify({ error: "A página não tem conteúdo textual suficiente." }), {
      status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const baseTexto = `${titulo} ${corpo}`;
  const categoria = sugerirCategoria(baseTexto);
  const prioridade = sugerirPrioridade(categoria);
  const temporal = sugerirTemporal(categoria, baseTexto);
  const resumo = derivarResumo(corpo);
  const hash = await sha256(corpo);

  // Verifica recaptura: compara por hash, nunca sobrescreve ativo silenciosamente.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: existente } = await admin
    .from("ia_site_documentos")
    .select("id, hash, status, usar_na_ia")
    .eq("url", parsed.toString())
    .maybeSingle();

  let situacao: "novo" | "sem_mudanca" | "atualizado" = "novo";
  if (existente) {
    situacao = existente.hash === hash ? "sem_mudanca" : "atualizado";
  }

  // Retorna a prévia extraída SEM salvar — o admin revisa e ajusta antes de gravar.
  return new Response(
    JSON.stringify({
      preview: {
        url: parsed.toString(),
        titulo: titulo || parsed.pathname,
        resumo,
        corpo,
        categoria,
        prioridade,
        temporal,
        data_conteudo: null,
        hash,
      },
      existente: existente
        ? { id: existente.id, status: existente.status, usar_na_ia: existente.usar_na_ia }
        : null,
      situacao,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
