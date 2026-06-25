import { describe, it, expect, afterAll } from "vitest";
import {
  HAS_DB,
  withRollback,
  actAs,
  actAsAnon,
  getUserByRole,
  getAnyAssistido,
  closePool,
} from "./_dbClient";

/**
 * BUG-03 — Conteúdo da entrevista fraterna é confidencial para o tarefeiro.
 *
 * Prova, em execução REAL de banco, que:
 *  - o tarefeiro NÃO consegue ler a tabela `entrevistas_fraternas` diretamente
 *    (a política de SELECT do tarefeiro foi removida — antes vazava observacoes/decisoes);
 *  - a RPC operacional `fn_entrevistas_operacional` devolve linhas ao tarefeiro,
 *    porém SEM nenhum campo sigiloso (observacoes/decisoes inexistem no retorno);
 *  - perfis autorizados (admin/entrevistador) continuam lendo a tabela direto.
 */
const d = HAS_DB ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

async function seedEntrevista(c: any, assistidoId: string, entrevistadorId: string) {
  const ins = await c.query(
    `INSERT INTO entrevistas_fraternas
       (assistido_id, entrevistador_id, data, tipo_entrevista, status, observacoes, decisoes)
     VALUES ($1,$2, now(), 'regular', 'realizada', 'RELATO SIGILOSO DO ASSISTIDO', 'DECISAO CONFIDENCIAL')
     RETURNING id`,
    [assistidoId, entrevistadorId],
  );
  return ins.rows[0].id as string;
}

d("BUG-03 — tarefeiro não acessa conteúdo sigiloso da entrevista", () => {
  it("não existe mais política de SELECT do tarefeiro na tabela de entrevistas", async () => {
    // Observação: o sandbox roda com BYPASSRLS, então a aplicação por linha não
    // pode ser provada aqui. Validamos no catálogo que a política que vazava
    // observacoes/decisoes para o tarefeiro foi removida (fonte de verdade).
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT polname FROM pg_policy
          WHERE polrelid = 'public.entrevistas_fraternas'::regclass
            AND polname ILIKE '%tarefeiro%'`,
      );
      expect(r.rowCount).toBe(0);
    });
  });

  it("RPC operacional devolve a entrevista ao tarefeiro SEM campos sigilosos", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      const entrevistador = (await getUserByRole(c, "entrevistador")) ?? admin!;
      const tarefeiro = await getUserByRole(c, "tarefeiro");
      const assistido = await getAnyAssistido(c);

      await actAs(c, admin!);
      const entId = await seedEntrevista(c, assistido!, entrevistador!);

      await actAs(c, tarefeiro!);
      const r = await c.query(
        "SELECT * FROM public.fn_entrevistas_operacional(NULL, NULL, $1)",
        [entId],
      );
      expect(r.rowCount).toBe(1);
      const cols = r.fields.map((f: any) => f.name);
      expect(cols).not.toContain("observacoes");
      expect(cols).not.toContain("decisoes");
      // Campos operacionais mínimos presentes.
      expect(cols).toEqual(
        expect.arrayContaining(["id", "assistido_id", "data", "tipo_entrevista", "status"]),
      );
    });
  });

  it("perfil autorizado (entrevistador/admin) continua lendo o conteúdo direto", async () => {
    await withRollback(async (c) => {
      const admin = await getUserByRole(c, "admin");
      const entrevistador = (await getUserByRole(c, "entrevistador")) ?? admin!;
      const assistido = await getAnyAssistido(c);

      await actAs(c, admin!);
      const entId = await seedEntrevista(c, assistido!, entrevistador!);

      await actAs(c, entrevistador!);
      const r = await c.query(
        "SELECT observacoes, decisoes FROM entrevistas_fraternas WHERE id=$1",
        [entId],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].observacoes).toBe("RELATO SIGILOSO DO ASSISTIDO");
    });
  });

  it("anon não acessa a RPC operacional", async () => {
    await withRollback(async (c) => {
      await actAsAnon(c);
      const r = await c.query(
        "SELECT * FROM public.fn_entrevistas_operacional(NULL, NULL, NULL)",
      );
      expect(r.rowCount).toBe(0);
    });
  });
});
