import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "minhas_notificacoes",
  title: "Minhas notificações",
  description:
    "Lista os avisos internos mais recentes do usuário autenticado. Opcionalmente filtra apenas os não lidos.",
  inputSchema: {
    apenas_nao_lidos: z
      .boolean()
      .default(false)
      .describe("Se true, retorna apenas avisos ainda não lidos."),
    limite: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Quantidade máxima de avisos a retornar (1 a 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ apenas_nao_lidos, limite }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("avisos_internos")
      .select("id, tipo, titulo, mensagem, lido, link, created_at")
      .order("created_at", { ascending: false })
      .limit(limite);
    if (apenas_nao_lidos) query = query.eq("lido", false);
    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const avisos = data ?? [];
    return {
      content: [
        {
          type: "text",
          text: avisos.length
            ? JSON.stringify(avisos, null, 2)
            : "Nenhum aviso encontrado.",
        },
      ],
      structuredContent: { avisos },
    };
  },
});
