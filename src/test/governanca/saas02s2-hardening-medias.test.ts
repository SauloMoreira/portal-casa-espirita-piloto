/**
 * SAAS-02-S2 — Contrato de governança: hardening médio.
 *
 * Este teste roda no CI (sem banco). Documenta a lista aprovada de funções
 * médias e falha se a migração de hardening for removida acidentalmente.
 * Verificação de banco real fica em src/test/integration/db/saas02s2-*.dbtest.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FUNCOES_ESPERADAS = [
  "has_role", "is_active_admin", "is_active_master",
  "count_active_masters", "count_apt_admins",
  "fn_eh_gestor", "fn_eh_staff",
  "fn_block_admin_grant", "fn_protect_last_master_roles", "fn_protect_master_status",
  "solicitar_promocao_admin", "decidir_promocao_admin", "fn_conceder_acesso_base",
  "fn_conceder_acesso_operacional", "fn_revogar_acesso_operacional",
  "fn_coordena_tratamento", "fn_designar_coordenador", "fn_remover_coordenador",
  "fn_listar_coordenacao_tratamentos", "fn_tratamentos_do_coordenador",
  "fn_enqueue_notificacao", "fn_encerrar_item_fila_erro_cadastro",
  "fn_encerrar_item_fila_obsoleto", "fn_enfileirar_mensagem_manual",
  "fn_sanear_fila_notificacoes", "marcar_envio_concluido",
  "preparar_envio_institucional",
  "fn_listar_parametros_operacionais", "fn_atualizar_parametro_operacional",
  "registrar_auditoria_reconciliacao",
  "pts_persistir_plano", "pts_homologacao_auditar", "pts_rollback_piloto",
];

describe("SAAS-02-S2 — contrato do hardening médio", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const arquivos = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const conteudo = arquivos.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");

  it("existe migração que revoga EXECUTE de PUBLIC e anon para cada função média", () => {
    const faltando: string[] = [];
    for (const fn of FUNCOES_ESPERADAS) {
      const rx = new RegExp(
        `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\s*\\([^)]*\\)\\s+FROM\\s+PUBLIC,\\s*anon`,
        "i",
      );
      if (!rx.test(conteudo)) faltando.push(fn);
    }
    expect(faltando, `Migração de hardening ausente para: ${faltando.join(", ")}`).toEqual([]);
  });

  it("cobre exatamente 33 funções médias (nenhuma adicionada silenciosamente ao hardening)", () => {
    expect(FUNCOES_ESPERADAS).toHaveLength(33);
  });
});
