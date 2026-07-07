import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, closePool } from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * Q2-D2 — Blindagem de testes do autocadastro assistido (banco REAL).
 *
 * Este recorte é EXCLUSIVAMENTE de testes. Nenhuma alteração produtiva é feita:
 * todo trabalho ocorre dentro de transações SEMPRE revertidas (withRollback).
 *
 * NOTA sobre a edge function `request-signup`:
 * A edge function roda em Deno com SUPABASE_SERVICE_ROLE_KEY e usa a Auth Admin
 * API (createUser/deleteUser), que NÃO é reproduzível no runner de testes atual
 * (sem service role, sem inserir em auth.users). Por isso, os EFEITOS DE BANCO
 * do fluxo público são validados aqui de forma fiel: inserir o profile como
 * 'ativo' dispara o gatilho de concessão do papel base, registra a solicitação
 * como 'aprovado' e a auditoria 'CADASTRO_AUTOCADASTRO' — exatamente a sequência
 * executada pela edge function após o createUser. Nada da lógica de validação
 * (email/CPF/senha) é produtivo aqui; ela é coberta indiretamente na própria
 * função e não altera o estado do banco.
 */
const d = HAS_DB ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

/** Conta auth existente com papel elevado, sem profile e sem base `assistido`. */
async function getContaElevadaSemBaseSemProfile(c: PoolClient): Promise<string | null> {
  const r = await c.query(
    `SELECT ur.user_id
       FROM user_roles ur
      WHERE ur.role <> 'assistido'
        AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = ur.user_id)
        AND NOT EXISTS (SELECT 1 FROM user_roles b WHERE b.user_id = ur.user_id AND b.role = 'assistido')
      LIMIT 1`,
  );
  return r.rows[0]?.user_id ?? null;
}

async function rolesDe(c: PoolClient, uid: string): Promise<string[]> {
  const r = await c.query("SELECT role::text FROM user_roles WHERE user_id = $1 ORDER BY role", [uid]);
  return r.rows.map((x) => x.role);
}

const PAPEIS_ELEVADOS = [
  "admin",
  "administrador_master",
  "coordenador_de_tratamento",
  "tarefeiro",
  "entrevistador",
];

d("Q2-D2 — efeitos de banco do fluxo request-signup (banco real)", () => {
  it("profile 'ativo' + solicitação 'aprovado' + auditoria CADASTRO_AUTOCADASTRO, base concedida", async () => {
    await withRollback(async (c) => {
      const uid = await getContaElevadaSemBaseSemProfile(c);
      if (!uid) return; // ambiente sem conta elegível

      const antes = await rolesDe(c, uid);
      expect(antes).not.toContain("assistido");

      // (1) profile criado como ATIVO -> dispara gatilho de concessão base
      await c.query(
        "INSERT INTO public.profiles (user_id, nome_completo, status) VALUES ($1, 'Teste Autocadastro', 'ativo')",
        [uid],
      );

      // (2) solicitação registrada como aprovada (acesso base imediato)
      const sol = await c.query(
        `INSERT INTO public.cadastro_solicitacoes
           (user_id, nome_completo, email, status, decidido_em)
         VALUES ($1, 'Teste Autocadastro', 'q2d2.autocadastro@example.test', 'aprovado', now())
         RETURNING id`,
        [uid],
      );
      const solId = sol.rows[0].id as string;

      // (3) auditoria do autocadastro
      await c.query(
        `INSERT INTO public.audit_logs (user_id, tabela, acao, registro_id, dados_novos)
         VALUES ($1, 'cadastro_solicitacoes', 'CADASTRO_AUTOCADASTRO', $2,
                 '{"origem":"tela_login","papel_inicial":"assistido","acesso":"imediato"}'::jsonb)`,
        [uid, solId],
      );

      // profile é 'ativo' (não bloqueante)
      const st = await c.query("SELECT status FROM profiles WHERE user_id = $1", [uid]);
      expect(st.rows[0].status).toBe("ativo");

      // base concedida pelo gatilho
      expect(await rolesDe(c, uid)).toContain("assistido");

      // solicitação aprovada
      const sc = await c.query("SELECT status FROM cadastro_solicitacoes WHERE id = $1", [solId]);
      expect(sc.rows[0].status).toBe("aprovado");

      // auditoria presente
      const au = await c.query(
        "SELECT count(*)::int n FROM audit_logs WHERE registro_id = $1 AND acao = 'CADASTRO_AUTOCADASTRO'",
        [solId],
      );
      expect(au.rows[0].n).toBe(1);
    });
  });

  it("autocadastro NÃO concede nenhum papel elevado", async () => {
    await withRollback(async (c) => {
      const uid = await getContaElevadaSemBaseSemProfile(c);
      if (!uid) return;
      const antes = await rolesDe(c, uid);

      await c.query(
        "INSERT INTO public.profiles (user_id, status) VALUES ($1, 'ativo')",
        [uid],
      );

      const depois = await rolesDe(c, uid);
      const novos = depois.filter((r) => !antes.includes(r));
      expect(novos).toEqual(["assistido"]);
      for (const p of PAPEIS_ELEVADOS) {
        if (!antes.includes(p)) expect(novos).not.toContain(p);
      }
    });
  });

  it("separação B×D: autocadastro NÃO cria registro funcional em assistidos", async () => {
    await withRollback(async (c) => {
      const uid = await getContaElevadaSemBaseSemProfile(c);
      if (!uid) return;

      await c.query(
        "INSERT INTO public.profiles (user_id, status) VALUES ($1, 'ativo')",
        [uid],
      );

      // camada B concedida
      expect(await rolesDe(c, uid)).toContain("assistido");
      // camada D NÃO materializada automaticamente
      const asst = await c.query(
        "SELECT count(*)::int n FROM assistidos WHERE user_id = $1",
        [uid],
      );
      expect(asst.rows[0].n).toBe(0);
    });
  });

  it("idempotência: reexecutar a concessão base não duplica user_roles", async () => {
    await withRollback(async (c) => {
      const uid = await getContaElevadaSemBaseSemProfile(c);
      if (!uid) return;

      await c.query("INSERT INTO public.profiles (user_id, status) VALUES ($1, 'ativo')", [uid]);

      const grant = () =>
        c.query(
          `INSERT INTO public.user_roles (user_id, role)
             VALUES ($1, 'assistido'::app_role)
           ON CONFLICT (user_id, role) DO NOTHING`,
          [uid],
        );
      await grant();
      await grant();
      await grant();

      const r = await c.query(
        "SELECT count(*)::int n FROM user_roles WHERE user_id = $1 AND role = 'assistido'",
        [uid],
      );
      expect(r.rows[0].n).toBe(1);
    });
  });

  it("integridade: nenhum profile pode ficar sem o papel base (backfill)", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT count(*)::int n
           FROM profiles p
          WHERE NOT EXISTS (
            SELECT 1 FROM user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'assistido'
          )`,
      );
      expect(r.rows[0].n).toBe(0);
    });
  });
});
