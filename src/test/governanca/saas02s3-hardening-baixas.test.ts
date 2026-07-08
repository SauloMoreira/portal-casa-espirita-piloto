/**
 * SAAS-02-S3 — Contrato de governança: hardening baixo residual.
 *
 * Verifica no CI (sem banco) que existe migração revogando EXECUTE de
 * PUBLIC/anon para cada função de baixo risco herdada, e que as funções
 * médias (SAAS-02-S2) e novas tenant-aware não foram reabertas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// 45 RPCs consumidas por usuários autenticados / edges — REVOKE + GRANT.
const FUNCOES_RPC = [
  "agenda_validar_horario_holistico",
  "agendar_entrevista_fraterna",
  "assistido_belongs_to_coordinator",
  "comunicadores_elegiveis",
  "contar_publico_elegivel",
  "dashboard_admin",
  "entrevista_assistido_belongs_to_coordinator",
  "fila_humana_pendente",
  "fn_avisos_ausencia_pendentes",
  "fn_buscar_pessoa_para_voluntario",
  "fn_confirmacao_agendamento_ativa",
  "fn_confirmacao_entrevista_ativa",
  "fn_eh_proxima_sessao",
  "fn_entrevistas_operacional",
  "fn_excecao_alvos",
  "fn_fila_diagnostico_pendentes",
  "fn_fila_motivo_inelegivel",
  "fn_lembrete_antecedencia_horas",
  "fn_monitor_excecao_notificacoes",
  "fn_observabilidade_operacional",
  "fn_processar_excecao_notificacoes",
  "fn_promover_proxima_sessao",
  "fn_proxima_sessao_vinculo",
  "fn_reconciliar_excecoes_notificacoes",
  "fn_registrar_aviso_ausencia",
  "fn_tratar_aviso_ausencia",
  "fn_voluntario_pendencias_cadastro",
  "gerenciar_termo_voluntario",
  "gerenciar_voluntario",
  "lista_usuarios_email",
  "metricas_ia_whatsapp",
  "migrar_assistido_legado_tratamento",
  "painel_conversas",
  "painel_whatsapp",
  "painel_whatsapp_v2",
  "pts_converter_assistido",
  "pts_registrar_ausencia",
  "pts_registrar_presenca",
  "registrar_presenca",
  "relatorio_carga_tarefeiro",
  "relatorio_faltas_periodo",
  "relatorio_frequencia_presenca",
  "relatorio_tratamentos_concluidos",
  "sou_comunicador_elegivel",
  "staff_names",
];

// 8 trigger functions — REVOKE only.
const FUNCOES_TRIGGER = [
  "fn_audit_trigger",
  "fn_stamp_actor",
  "fn_assistido_cadastro_minimo",
  "fn_notif_entrevista",
  "fn_notif_presenca",
  "fn_notif_sessao",
  "liberar_proximo_tratamento",
  "update_sessao_total_presentes",
];

const dir = join(process.cwd(), "supabase", "migrations");
const arquivos = readdirSync(dir).filter((f) => f.endsWith(".sql"));
const conteudo = arquivos.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");

describe("SAAS-02-S3 — contrato do hardening baixo residual", () => {
  it("cobre exatamente 45 RPCs baixas", () => {
    expect(FUNCOES_RPC).toHaveLength(45);
  });

  it("cobre exatamente 8 funções de trigger residuais", () => {
    expect(FUNCOES_TRIGGER).toHaveLength(8);
  });

  it("existe REVOKE EXECUTE FROM PUBLIC, anon para cada RPC baixa", () => {
    const faltando: string[] = [];
    for (const fn of FUNCOES_RPC) {
      const rx = new RegExp(
        `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\([^)]*\\)\\s+FROM\\s+PUBLIC,\\s*anon`,
        "i",
      );
      if (!rx.test(conteudo)) faltando.push(fn);
    }
    expect(faltando, `REVOKE ausente para: ${faltando.join(", ")}`).toEqual([]);
  });

  it("existe GRANT EXECUTE TO authenticated, service_role para cada RPC baixa", () => {
    const faltando: string[] = [];
    for (const fn of FUNCOES_RPC) {
      const rx = new RegExp(
        `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\([^)]*\\)\\s+TO\\s+authenticated,\\s*service_role`,
        "i",
      );
      if (!rx.test(conteudo)) faltando.push(fn);
    }
    expect(faltando, `GRANT ausente para: ${faltando.join(", ")}`).toEqual([]);
  });

  it("existe REVOKE EXECUTE FROM PUBLIC, anon para cada trigger residual", () => {
    const faltando: string[] = [];
    for (const fn of FUNCOES_TRIGGER) {
      const rx = new RegExp(
        `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\(\\s*\\)\\s+FROM\\s+PUBLIC,\\s*anon`,
        "i",
      );
      if (!rx.test(conteudo)) faltando.push(fn);
    }
    expect(faltando, `REVOKE trigger ausente para: ${faltando.join(", ")}`).toEqual([]);
  });
});

describe("SAAS-02-S3 — não reabre médias (S2) nem tenant-aware", () => {
  it("nenhuma migração S3 concede EXECUTE para PUBLIC ou anon", () => {
    // Busca só nas migrações mais recentes marcadas SAAS-02-S3.
    for (const f of arquivos) {
      const src = readFileSync(join(dir, f), "utf8");
      if (!src.includes("SAAS-02-S3")) continue;
      expect(src, `migração ${f} não pode conceder EXECUTE para PUBLIC/anon`)
        .not.toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?TO\s+(PUBLIC|anon)/i);
    }
  });

  it("edge functions dos recortes anteriores permanecem intactas", () => {
    const intactas = [
      "supabase/functions/checkin-publico/index.ts",
      "supabase/functions/alertas-operacionais/index.ts",
      "supabase/functions/central-fila-alerta/index.ts",
      "supabase/functions/notificacoes-dispatch/index.ts",
      "supabase/functions/comunicacao-dispatch/index.ts",
      "supabase/functions/whatsapp-inbound/index.ts",
      "supabase/functions/whatsapp-responder/index.ts",
      "supabase/functions/assistente-entrevista/index.ts",
      "supabase/functions/insights-dashboard/index.ts",
      "supabase/functions/ia-site-ingestao/index.ts",
      "supabase/functions/conteudo-imagem-ia/index.ts",
    ];
    for (const p of intactas) {
      const src = readFileSync(join(process.cwd(), p), "utf8");
      expect(src, `${p} não pode citar SAAS-02-S3`).not.toMatch(/SAAS-02-S3/);
    }
  });
});
