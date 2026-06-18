import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { guardCronOrStaff } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only internal cron (with secret) or admins may trigger alert generation.
  const guard = await guardCronOrStaff(req, ["admin"]);
  if (!guard.ok) return guard.response!;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Load active rules
    const { data: regras } = await adminClient
      .from("regras_operacionais")
      .select("chave, valor, ativo")
      .eq("ativo", true);

    const getRegra = (chave: string, fallback: string) => {
      const r = (regras || []).find((r: any) => r.chave === chave);
      return r ? r.valor : fallback;
    };

    const limiteFaltas = parseInt(getRegra("limite_faltas_alerta", "3"));
    const prazoEspera = parseInt(getRegra("prazo_maximo_espera_dias", "30"));
    const limiteCarga = parseInt(getRegra("limite_carga_tarefeiro", "20"));

    const alertas: Array<{ destinatario_id: string; titulo: string; mensagem: string; tipo: string; link?: string }> = [];

    // Get admin users
    const { data: adminRoles } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = (adminRoles || []).map((r: any) => r.user_id);

    // 1. Assistidos com faltas recorrentes
    const { data: presencas } = await adminClient
      .from("presencas_tratamentos")
      .select("assistido_tratamento_id")
      .eq("status_presenca", "ausente");

    if (presencas) {
      const faltaCount: Record<string, number> = {};
      presencas.forEach((p: any) => {
        faltaCount[p.assistido_tratamento_id] = (faltaCount[p.assistido_tratamento_id] || 0) + 1;
      });

      for (const [atId, count] of Object.entries(faltaCount)) {
        if (count >= limiteFaltas) {
          for (const adminId of adminIds) {
            alertas.push({
              destinatario_id: adminId,
              titulo: "Faltas recorrentes",
              mensagem: `Um assistido acumulou ${count} falta(s) em um tratamento (limite: ${limiteFaltas}).`,
              tipo: "alerta_faltas",
            });
          }
        }
      }
    }

    // 2. Itens muito tempo na lista de espera
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - prazoEspera);
    const { data: esperaAntiga } = await adminClient
      .from("assistido_tratamentos")
      .select("id, assistido_id, created_at")
      .eq("status", "aguardando_agendamento")
      .lt("created_at", cutoffDate.toISOString());

    if (esperaAntiga && esperaAntiga.length > 0) {
      for (const adminId of adminIds) {
        alertas.push({
          destinatario_id: adminId,
          titulo: "Itens antigos na lista de espera",
          mensagem: `${esperaAntiga.length} tratamento(s) aguardando agendamento há mais de ${prazoEspera} dias.`,
          tipo: "alerta_espera",
          link: "/lista-espera",
        });
      }
    }

    // 3. Carga alta por tarefeiro
    const { data: tratamentos } = await adminClient
      .from("tipos_tratamento")
      .select("id, tarefeiro_id")
      .not("tarefeiro_id", "is", null);

    if (tratamentos) {
      const tarefeiroCarga: Record<string, number> = {};
      for (const t of tratamentos as any[]) {
        const { data: vinculos } = await adminClient
          .from("assistido_tratamentos")
          .select("id")
          .eq("tratamento_id", t.id)
          .in("status", ["em_andamento", "aguardando_inicio"]);
        tarefeiroCarga[t.tarefeiro_id] = (tarefeiroCarga[t.tarefeiro_id] || 0) + (vinculos?.length || 0);
      }

      for (const [tarefId, carga] of Object.entries(tarefeiroCarga)) {
        if (carga >= limiteCarga) {
          for (const adminId of adminIds) {
            alertas.push({
              destinatario_id: adminId,
              titulo: "Carga alta de tarefeiro",
              mensagem: `Um tarefeiro tem ${carga} assistido(s) vinculados (limite: ${limiteCarga}).`,
              tipo: "alerta_carga",
            });
          }
        }
      }
    }

    // 4. Sessões passadas sem presença registrada
    const today = new Date().toISOString().split("T")[0];
    const { data: sessoesSemPresenca } = await adminClient
      .from("agenda_tratamentos_assistido")
      .select("id")
      .lt("data_sessao", today)
      .eq("status", "agendado");

    if (sessoesSemPresenca && sessoesSemPresenca.length > 0) {
      for (const adminId of adminIds) {
        alertas.push({
          destinatario_id: adminId,
          titulo: "Sessões sem presença lançada",
          mensagem: `${sessoesSemPresenca.length} sessão(ões) passada(s) sem registro de presença.`,
          tipo: "alerta_presenca",
          link: "/presenca",
        });
      }
    }

    // Deduplicate: don't insert if same type+destinatario exists today
    let inserted = 0;
    for (const alerta of alertas) {
      const { data: existing } = await adminClient
        .from("avisos_internos")
        .select("id")
        .eq("destinatario_id", alerta.destinatario_id)
        .eq("tipo", alerta.tipo)
        .gte("created_at", today + "T00:00:00Z")
        .limit(1);

      if (!existing || existing.length === 0) {
        await adminClient.from("avisos_internos").insert({
          destinatario_id: alerta.destinatario_id,
          titulo: alerta.titulo,
          mensagem: alerta.mensagem,
          tipo: alerta.tipo,
          link: alerta.link || null,
        });
        inserted++;
      }
    }

    return new Response(JSON.stringify({ success: true, alertas_gerados: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
