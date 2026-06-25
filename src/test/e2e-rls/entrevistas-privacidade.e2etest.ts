/**
 * P1.1 — E2E real (JWT + PostgREST) — Privacidade de entrevistas fraternas por perfil.
 *
 * Prova, no caminho real de acesso, que o conteúdo sensível da entrevista
 * (observacoes/decisoes) NUNCA chega ao tarefeiro nem ao anônimo, e que o
 * payload operacional do tarefeiro vem reduzido (sem colunas sensíveis).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HAS_E2E, rest, rpc } from "./_rlsClient";
import { seed, cleanupNamespace, HAS_SERVICE, type SeedData } from "./_seed";

const ENABLED = HAS_E2E && HAS_SERVICE;

describe.skipIf(!ENABLED)("E2E RLS · Entrevistas fraternas — privacidade por perfil", () => {
  let data: SeedData;

  beforeAll(async () => {
    data = await seed();
  });
  afterAll(async () => {
    await cleanupNamespace();
  });

  it("anônimo sem JWT é bloqueado (401)", async () => {
    const r = await rest("none", `entrevistas_fraternas?id=eq.${data.entrevistaId}&select=*`);
    expect(r.status).toBe(401);
  });

  it("anônimo com anon-key não enxerga conteúdo sensível", async () => {
    const r = await rest("anon", `entrevistas_fraternas?id=eq.${data.entrevistaId}&select=*`);
    expect(JSON.stringify(r.body)).not.toContain(data.observacoesSensiveis);
    expect(r.status === 401 || (Array.isArray(r.body) && r.body.length === 0)).toBe(true);
  });

  it("tarefeiro NÃO lê a tabela de entrevistas diretamente (RLS por linha → vazio)", async () => {
    const r = await rest<unknown[]>("tarefeiro", `entrevistas_fraternas?id=eq.${data.entrevistaId}&select=*`);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body).toHaveLength(0);
    expect(JSON.stringify(r.body)).not.toContain(data.observacoesSensiveis);
    expect(JSON.stringify(r.body)).not.toContain(data.decisoesSensiveis);
  });

  it("tarefeiro via RPC operacional recebe a entrevista SEM colunas sensíveis", async () => {
    const r = await rpc<Array<Record<string, unknown>>>("tarefeiro", "fn_entrevistas_operacional");
    expect(r.ok).toBe(true);
    const item = r.body.find((e) => e.id === data.entrevistaId);
    expect(item).toBeTruthy();
    // Contrato de payload: somente colunas não sensíveis.
    expect(Object.keys(item!).sort()).toEqual(
      ["assistido_id", "data", "entrevistador_id", "id", "status", "tipo_entrevista"],
    );
    expect("observacoes" in item!).toBe(false);
    expect("decisoes" in item!).toBe(false);
    expect(JSON.stringify(r.body)).not.toContain(data.observacoesSensiveis);
    expect(JSON.stringify(r.body)).not.toContain(data.decisoesSensiveis);
  });

  it("entrevistador autorizado lê o conteúdo sensível", async () => {
    const r = await rest<Array<{ observacoes: string; decisoes: string }>>(
      "entrevistador",
      `entrevistas_fraternas?id=eq.${data.entrevistaId}&select=observacoes,decisoes`,
    );
    expect(r.ok).toBe(true);
    expect(r.body[0]?.observacoes).toBe(data.observacoesSensiveis);
    expect(r.body[0]?.decisoes).toBe(data.decisoesSensiveis);
  });

  it("admin lê o conteúdo sensível", async () => {
    const r = await rest<Array<{ observacoes: string }>>(
      "admin",
      `entrevistas_fraternas?id=eq.${data.entrevistaId}&select=observacoes`,
    );
    expect(r.ok).toBe(true);
    expect(r.body[0]?.observacoes).toBe(data.observacoesSensiveis);
  });

  it("coordenador FORA de escopo não enxerga a entrevista (RLS por linha)", async () => {
    const r = await rest<unknown[]>(
      "coordenador",
      `entrevistas_fraternas?id=eq.${data.entrevistaId}&select=*`,
    );
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body).toHaveLength(0);
    expect(JSON.stringify(r.body)).not.toContain(data.observacoesSensiveis);
  });
});
