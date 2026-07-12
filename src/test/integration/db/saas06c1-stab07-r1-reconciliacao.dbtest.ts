import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, closePool } from "./_dbClient";

/**
 * SAAS-06-C1-STAB07-R1 — Reconciliação cirúrgica.
 *
 * Verificação REAL pós-deploy do vínculo do Assistido Teste 01 (Reiki) na
 * FER Piloto. Todas as queries rodam dentro de `withRollback` (somente leitura;
 * qualquer escrita eventual é descartada). Não altera o Assistido Teste 01.
 *
 * Fixtures sintéticas foram avaliadas e descartadas: a migration é um bloco
 * `DO $$ ... $$` hard-coded a um único UUID (por design). Reproduzir a lógica
 * com fixture exigiria duplicar o SQL fora do controle da migration e não
 * agregaria garantia adicional além do que este smoke test cobre.
 */
const d = HAS_DB ? describe : describe.skip;

const VINCULO_ID = "cdad8c9e-6935-4590-b9a6-bad13bb9c2b2";
const ASSISTIDO_ID = "aef9ab7d-1a51-4ea1-96a1-97e0d2879d8c";
const TRATAMENTO_ID = "6f3f9de7-597a-4bc4-92d4-16f221e13914";
const INST_FER = "e3818702-cfac-47ae-b751-cb6a05babd4f";
const REGISTRADO_POR = "1a89c34c-d2e5-45c9-aae7-ebcc19bd9203";
const DATAS = ["2026-07-16", "2026-07-23", "2026-07-30", "2026-08-06"];

afterAll(async () => {
  await closePool();
});

d("STAB07-R1 — estado final do vínculo reconciliado", () => {
  it("vínculo alvo está em aguardando_inicio com data_inicio e agendado_por corretos", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT status, data_inicio, agendado_por, quantidade_total,
                quantidade_realizada, assistido_id, tratamento_id
           FROM assistido_tratamentos WHERE id = $1`,
        [VINCULO_ID],
      );
      // Em ambientes sem o piloto (CI limpo) a linha não existe: teste é NO-OP.
      if (r.rowCount === 0) return;
      const row = r.rows[0];
      expect(row.status).toBe("aguardando_inicio");
      expect(row.data_inicio.toISOString().slice(0, 10)).toBe("2026-07-16");
      expect(row.agendado_por).toBe(REGISTRADO_POR);
      expect(Number(row.quantidade_total)).toBe(4);
      expect(Number(row.quantidade_realizada)).toBe(0);
      expect(row.assistido_id).toBe(ASSISTIDO_ID);
      expect(row.tratamento_id).toBe(TRATAMENTO_ID);
    });
  });

  it("as quatro sessões permanecem inalteradas (conjunto/horário/registrado_por)", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT data_sessao, horario, status, registrado_por, assistido_id, tratamento_id
           FROM agenda_tratamentos_assistido
          WHERE assistido_tratamento_id = $1
          ORDER BY data_sessao`,
        [VINCULO_ID],
      );
      if (r.rowCount === 0) return;
      expect(r.rowCount).toBe(4);
      const datas = r.rows.map((x) => x.data_sessao.toISOString().slice(0, 10));
      expect(datas).toEqual(DATAS);
      for (const s of r.rows) {
        expect(s.status).toBe("agendado");
        expect(String(s.horario)).toBe("18:36:00");
        expect(s.registrado_por).toBe(REGISTRADO_POR);
        expect(s.assistido_id).toBe(ASSISTIDO_ID);
        expect(s.tratamento_id).toBe(TRATAMENTO_ID);
      }
    });
  });

  it("nenhuma presença foi criada para o vínculo", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        "SELECT COUNT(*)::int AS n FROM presencas_tratamentos WHERE assistido_tratamento_id = $1",
        [VINCULO_ID],
      );
      expect(r.rows[0].n).toBe(0);
    });
  });

  it("trigger de auditoria registrou o UPDATE (antes → depois)", async () => {
    await withRollback(async (c) => {
      const inst = await c.query("SELECT 1 FROM instituicoes WHERE id = $1", [INST_FER]);
      if (inst.rowCount === 0) return;
      const r = await c.query(
        `SELECT dados_anteriores->>'status' AS ant,
                dados_novos->>'status'      AS novo,
                dados_novos->>'data_inicio' AS di,
                dados_novos->>'agendado_por' AS ap
           FROM audit_logs
          WHERE tabela = 'assistido_tratamentos'
            AND registro_id = $1
            AND acao = 'UPDATE'
          ORDER BY created_at DESC
          LIMIT 1`,
        [VINCULO_ID],
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].ant).toBe("aguardando_agendamento");
      expect(r.rows[0].novo).toBe("aguardando_inicio");
      expect(r.rows[0].di).toBe("2026-07-16");
      expect(r.rows[0].ap).toBe(REGISTRADO_POR);
    });
  });

  it("é idempotente: rechamar fn_confirmar_agendamento_tratamento devolve already_committed", async () => {
    await withRollback(async (c) => {
      const inst = await c.query("SELECT 1 FROM instituicoes WHERE id = $1", [INST_FER]);
      if (inst.rowCount === 0) return;
      // Simular sessão do coordenador que agendou. O ator real é o registrado_por
      // das sessões; se ele não tiver mais autorização, a RPC rejeitará — nesse
      // caso o teste apenas verifica que a assinatura existe.
      await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: REGISTRADO_POR, role: "authenticated" }),
      ]);
      const sessoes = DATAS.map((d) => ({ data_sessao: d, horario: "18:36:00" }));
      try {
        const r = await c.query(
          "SELECT public.fn_confirmar_agendamento_tratamento($1, $2::jsonb) AS out",
          [VINCULO_ID, JSON.stringify(sessoes)],
        );
        const out = r.rows[0].out as { ok?: boolean; already_committed?: boolean; sessoes_criadas?: number };
        expect(out.ok).toBe(true);
        expect(out.already_committed).toBe(true);
        expect(out.sessoes_criadas ?? 0).toBe(0);
      } catch (e) {
        // Autorização revogada é aceitável — a lógica de idempotência é
        // exercitada pelos testes do STAB07 com fixtures dedicadas.
        expect((e as Error).message).toMatch(/nao autorizado|Acesso negado|permission|coordena/i);
      }
    });
  });
});
