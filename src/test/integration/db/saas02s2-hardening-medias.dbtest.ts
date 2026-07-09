/**
 * SAAS-02-S2 — Testes de integração (banco REAL) do hardening médio.
 *
 * Verifica, via catálogo Postgres (pg_proc + has_function_privilege), que as
 * 33 funções médias identificadas no SAAS-02-S1 estão sem EXECUTE para
 * `anon` e `public`, e com EXECUTE para `authenticated`.
 *
 * Não executa as funções (não há alteração de corpo neste recorte). O
 * comportamento funcional é coberto pela suíte de governança existente.
 *
 * Rodar fora do CI: `npm run test:db`.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const FUNCOES_MEDIAS: Array<{ nome: string; args: string }> = [
  // 4.1 Autorização / roles / promoção admin
  { nome: "has_role", args: "uuid, app_role" },
  { nome: "is_active_admin", args: "uuid" },
  { nome: "is_active_master", args: "uuid" },
  { nome: "count_active_masters", args: "" },
  { nome: "count_apt_admins", args: "" },
  { nome: "fn_eh_gestor", args: "uuid" },
  { nome: "fn_eh_staff", args: "uuid" },
  { nome: "fn_block_admin_grant", args: "" },
  { nome: "fn_protect_last_master_roles", args: "" },
  { nome: "fn_protect_master_status", args: "" },
  { nome: "solicitar_promocao_admin", args: "uuid, text, text" },
  { nome: "decidir_promocao_admin", args: "uuid, text, text" },
  { nome: "fn_conceder_acesso_base", args: "" },
  // 4.2 Acesso operacional / coordenação
  { nome: "fn_conceder_acesso_operacional", args: "uuid, app_role, text, uuid" },
  { nome: "fn_revogar_acesso_operacional", args: "uuid, app_role, text" },
  { nome: "fn_coordena_tratamento", args: "uuid, uuid" },
  { nome: "fn_designar_coordenador", args: "uuid, uuid" },
  { nome: "fn_remover_coordenador", args: "uuid, uuid" },
  { nome: "fn_listar_coordenacao_tratamentos", args: "" },
  { nome: "fn_tratamentos_do_coordenador", args: "uuid" },
  // 4.6 Notificações / fila / dispatch (escritas)
  {
    nome: "fn_enqueue_notificacao",
    args: "notif_evento, uuid, text, jsonb, timestamp with time zone, text",
  },
  { nome: "fn_encerrar_item_fila_erro_cadastro", args: "uuid, text, text" },
  { nome: "fn_encerrar_item_fila_obsoleto", args: "uuid, text" },
  { nome: "fn_enfileirar_mensagem_manual", args: "uuid, text, text" },
  { nome: "fn_sanear_fila_notificacoes", args: "" },
  { nome: "marcar_envio_concluido", args: "uuid" },
  { nome: "preparar_envio_institucional", args: "uuid, text, integer" },
  // 4.11 Parâmetros / auditoria (escritas)
  { nome: "fn_listar_parametros_operacionais", args: "" },
  { nome: "fn_atualizar_parametro_operacional", args: "text, text, text" },
  { nome: "registrar_auditoria_reconciliacao", args: "uuid, jsonb" },
  // 4.5 Piloto agenda / homologação
  { nome: "pts_persistir_plano", args: "uuid, jsonb, jsonb" },
  { nome: "pts_homologacao_auditar", args: "uuid, text, jsonb" },
  { nome: "pts_rollback_piloto", args: "uuid" },
];

// Funções de trigger não precisam de EXECUTE para authenticated (o trigger
// executa como owner). Apenas garantimos que anon/public foram revogados.
const TRIGGER_FUNCTIONS = new Set([
  "fn_block_admin_grant",
  "fn_protect_last_master_roles",
  "fn_protect_master_status",
  "fn_conceder_acesso_base",
]);

const hasCreds = !!SUPABASE_URL && !!SERVICE_ROLE;
const d = hasCreds ? describe : describe.skip;

d("SAAS-02-S2 — hardening médio das funções SECURITY DEFINER", () => {
  const admin = hasCreds ? createClient(SUPABASE_URL, SERVICE_ROLE) : (null as never);

  it("todas as 33 funções médias possuem anon EXECUTE = false e public EXECUTE = false; authenticated permitido (exceto triggers)", async () => {
    const nomes = FUNCOES_MEDIAS.map((f) => f.nome);
    const { data, error } = await admin.rpc("exec_sql" as never, {} as never).then(
      async () => {
        // fallback via REST: consulta direta via PostgREST não disponível para pg_proc.
        // Usamos supabase.raw via SQL endpoint simulado por RPC não existente — então
        // dependemos de uma view/RPC dedicada. Este teste usa a query direta padrão do repo.
        return { data: null, error: null };
      },
    );

    // Estratégia alternativa: consulta direta via pg (via env DATABASE_URL) — o repo
    // já possui infra em src/test/integration/db para isso. Aqui reutilizamos o
    // padrão: assumimos existência do helper `runSql` compartilhado; se ausente,
    // o teste é ignorado sem falha via check acima.
    void data;
    void error;

    const { Client } = await import("pg");
    const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!conn) {
      console.warn("SUPABASE_DB_URL/DATABASE_URL ausente — teste ignorado");
      return;
    }
    const client = new Client({ connectionString: conn });
    await client.connect();
    try {
      const res = await client.query(
        `SELECT p.proname,
                pg_get_function_identity_arguments(p.oid) AS args,
                has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
                has_function_privilege('public', p.oid, 'EXECUTE') AS pub_exec,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = ANY($1::text[])`,
        [nomes],
      );

      const problemas: string[] = [];
      for (const alvo of FUNCOES_MEDIAS) {
        const linhas = res.rows.filter(
          (r) => r.proname === alvo.nome && (r.args ?? "") === alvo.args,
        );
        if (linhas.length === 0) {
          problemas.push(`AUSENTE: ${alvo.nome}(${alvo.args})`);
          continue;
        }
        for (const l of linhas) {
          if (l.anon_exec) problemas.push(`anon EXECUTE ativo: ${alvo.nome}`);
          if (l.pub_exec) problemas.push(`public EXECUTE ativo: ${alvo.nome}`);
          if (!TRIGGER_FUNCTIONS.has(alvo.nome) && !l.auth_exec) {
            problemas.push(`authenticated bloqueado: ${alvo.nome}`);
          }
        }
      }
      expect(problemas, problemas.join("\n")).toEqual([]);
    } finally {
      await client.end();
    }
  });
});
