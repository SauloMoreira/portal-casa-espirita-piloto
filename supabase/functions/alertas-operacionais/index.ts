import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { guardCronOrStaff } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

// SAAS-05-E-EDGE-A: cron passa a operar em loop por instituição.
// Nenhuma agregação cruza tenants. Cada aviso interno é carimbado com
// `instituicao_id` da instituição avaliada. Fallback legado: se não houver
// linhas `instituicoes` cadastradas, execução original (single-tenant) é
// preservada — desativada em SAAS-05-F com o cutover.

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "authorization, x-client-info, apikey, content-type, x-cron-secret");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const guard = await guardCronOrStaff(req, ["admin"]);
  if (!guard.ok) return guard.response!;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Regras operacionais (globais nesta fase — permanecerão até T-DIR de regras
    // ganhar overrides por tenant em recorte posterior).
    const { data: regras } = await adminClient
      .from("regras_operacionais")
      .select("chave, valor, ativo, instituicao_id")
      .eq("ativo", true);

    const regrasFor = (instId: string | null) => {
      const globais = (regras || []).filter((r: any) => !r.instituicao_id);
      const locais = (regras || []).filter((r: any) => r.instituicao_id === instId);
      const merged = [...globais, ...locais];
      return (chave: string, fallback: string) => {
        const r = merged.find((r: any) => r.chave === chave);
        return r ? r.valor : fallback;
      };
    };

    // Enumerar instituições ativas. Se vazio, cair para o modo legado
    // single-tenant (mantido apenas até SAAS-05-F / cutover).
    const { data: instituicoesRows } = await adminClient
      .from("instituicoes")
      .select("id");
    const instituicoesIds: (string | null)[] =
      (instituicoesRows || []).length > 0
        ? (instituicoesRows || []).map((r: any) => r.id)
        : [null];

    // SAAS-05-I: telemetria de fallback quando instituicoesIds é [null].
    if (instituicoesIds.length === 1 && instituicoesIds[0] === null) {
      await adminClient.rpc("fn_saas05_i_log_fallback", {
        p_fallback: "alertas-operacionais",
        p_motivo: "tenants_ids_vazio",
        p_fail_closed: true,
        p_contexto: { origem: "cron_service_role" },
      });
    }


    const today = new Date().toISOString().split("T")[0];
    let insertedTotal = 0;

    for (const instId of instituicoesIds) {
      const getRegra = regrasFor(instId);
      const limiteFaltas = parseInt(getRegra("limite_faltas_alerta", "3"));
      const prazoEspera = parseInt(getRegra("prazo_maximo_espera_dias", "30"));
      const limiteCarga = parseInt(getRegra("limite_carga_tarefeiro", "20"));

      const alertas: Array<{ destinatario_id: string; titulo: string; mensagem: string; tipo: string; link?: string }> = [];

      // Admins destinatários por instituição (via instituicao_usuarios).
      // Fallback: papel global "admin" (user_roles) para linhas sem tenant.
      let adminIds: string[] = [];
      if (instId) {
        const { data: local } = await adminClient
          .from("instituicao_usuarios")
          .select("user_id")
          .eq("instituicao_id", instId)
          .eq("papel_local", "admin")
          .eq("status", "ativo");
        adminIds = (local || []).map((r: any) => r.user_id);
      }
      if (adminIds.length === 0) {
        const { data: globalAdmins } = await adminClient
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        adminIds = (globalAdmins || []).map((r: any) => r.user_id);
      }

      // Assistidos deste tenant (para escopar consultas subsequentes).
      let assistidoIds: string[] = [];
      {
        let q = adminClient.from("assistidos").select("id");
        if (instId) q = q.eq("instituicao_id", instId);
        const { data } = await q;
        assistidoIds = (data || []).map((r: any) => r.id);
      }

      // 1. Faltas recorrentes — só considerar presenças de assistidos do tenant.
      if (assistidoIds.length > 0) {
        const { data: vinculos } = await adminClient
          .from("assistido_tratamentos")
          .select("id")
          .in("assistido_id", assistidoIds);
        const vinculoIds = (vinculos || []).map((v: any) => v.id);
        if (vinculoIds.length > 0) {
          const { data: presencas } = await adminClient
            .from("presencas_tratamentos")
            .select("assistido_tratamento_id")
            .eq("status_presenca", "ausente")
            .in("assistido_tratamento_id", vinculoIds);
          const faltaCount: Record<string, number> = {};
          (presencas || []).forEach((p: any) => {
            faltaCount[p.assistido_tratamento_id] = (faltaCount[p.assistido_tratamento_id] || 0) + 1;
          });
          for (const [, count] of Object.entries(faltaCount)) {
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

        // 2. Lista de espera antiga
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - prazoEspera);
        const { data: esperaAntiga } = await adminClient
          .from("assistido_tratamentos")
          .select("id")
          .eq("status", "aguardando_agendamento")
          .lt("created_at", cutoffDate.toISOString())
          .in("assistido_id", assistidoIds);
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

        // 3. Carga por tarefeiro — restrito a tratamentos do tenant.
        const { data: tratamentos } = await adminClient
          .from("tipos_tratamento")
          .select("id, tarefeiro_id")
          .not("tarefeiro_id", "is", null);
        const tarefeiroCarga: Record<string, number> = {};
        for (const t of (tratamentos || []) as any[]) {
          const { data: vinc } = await adminClient
            .from("assistido_tratamentos")
            .select("id")
            .eq("tratamento_id", t.id)
            .in("status", ["em_andamento", "aguardando_inicio"])
            .in("assistido_id", assistidoIds);
          tarefeiroCarga[t.tarefeiro_id] = (tarefeiroCarga[t.tarefeiro_id] || 0) + (vinc?.length || 0);
        }
        for (const [, carga] of Object.entries(tarefeiroCarga)) {
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

        // 4. Sessões passadas sem presença
        const { data: sessoesSemPresenca } = await adminClient
          .from("agenda_tratamentos_assistido")
          .select("id")
          .lt("data_sessao", today)
          .eq("status", "agendado")
          .in("assistido_id", assistidoIds);
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
      }

      // Dedup + insert (carimbando instituicao_id).
      for (const alerta of alertas) {
        let dupQuery = adminClient
          .from("avisos_internos")
          .select("id")
          .eq("destinatario_id", alerta.destinatario_id)
          .eq("tipo", alerta.tipo)
          .gte("created_at", today + "T00:00:00Z")
          .limit(1);
        if (instId) dupQuery = dupQuery.eq("instituicao_id", instId);
        const { data: existing } = await dupQuery;

        if (!existing || existing.length === 0) {
          await adminClient.from("avisos_internos").insert({
            destinatario_id: alerta.destinatario_id,
            titulo: alerta.titulo,
            mensagem: alerta.mensagem,
            tipo: alerta.tipo,
            link: alerta.link || null,
            instituicao_id: instId, // SAAS-05-E-EDGE-A: aviso sempre carimbado com o tenant avaliado.
          });
          insertedTotal++;
        }
      }
    }

    return new Response(JSON.stringify({ success: true, alertas_gerados: insertedTotal, tenants_avaliados: instituicoesIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
