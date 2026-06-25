/**
 * P1.1 — E2E real (JWT + PostgREST) — Avisos de ausência: conteúdo restrito.
 *
 * Prova que o tarefeiro só vê metadados operacionais (motivo nulo,
 * pode_ver_conteudo=false), que a equipe autorizada vê o conteúdo, que o
 * assistido só acessa o próprio aviso, e que ninguém indevido lê a tabela.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { HAS_E2E, rest, rpc } from "./_rlsClient";
import { seed, cleanupNamespace, HAS_SERVICE, NS, type SeedData } from "./_seed";

const ENABLED = HAS_E2E && HAS_SERVICE;
const MOTIVO = `${NS} motivo fake de ausencia`;

interface AvisoPayload {
  id: string;
  assistido_id: string;
  motivo: string | null;
  resolucao: string | null;
  pode_ver_conteudo: boolean;
}

describe.skipIf(!ENABLED)("E2E RLS · Avisos de ausência — conteúdo restrito por perfil", () => {
  let data: SeedData;

  beforeAll(async () => {
    data = await seed();
  });
  afterAll(async () => {
    await cleanupNamespace();
  });

  it("anônimo sem JWT é bloqueado (401)", async () => {
    const r = await rest("none", `avisos_ausencia?id=eq.${data.avisoId}&select=*`);
    expect(r.status).toBe(401);
  });

  it("tarefeiro NÃO lê a tabela de avisos diretamente (RLS por linha → vazio)", async () => {
    const r = await rest<unknown[]>("tarefeiro", `avisos_ausencia?select=*`);
    expect(Array.isArray(r.body)).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain(MOTIVO);
  });

  it("tarefeiro via RPC vê metadados operacionais SEM motivo (pode_ver_conteudo=false)", async () => {
    const r = await rpc<AvisoPayload[]>("tarefeiro", "fn_avisos_ausencia_pendentes");
    expect(r.ok).toBe(true);
    const item = r.body.find((a) => a.id === data.avisoId);
    expect(item).toBeTruthy();
    expect(item!.pode_ver_conteudo).toBe(false);
    expect(item!.motivo).toBeNull();
    expect(item!.resolucao).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain(MOTIVO);
  });

  it("coordenação vê o conteúdo completo do aviso (pode_ver_conteudo=true)", async () => {
    const r = await rpc<AvisoPayload[]>("coordenador", "fn_avisos_ausencia_pendentes");
    expect(r.ok).toBe(true);
    const item = r.body.find((a) => a.id === data.avisoId);
    expect(item).toBeTruthy();
    expect(item!.pode_ver_conteudo).toBe(true);
    expect(item!.motivo).toBe(MOTIVO);
  });

  it("entrevistador autorizado vê o conteúdo completo", async () => {
    const r = await rpc<AvisoPayload[]>("entrevistador", "fn_avisos_ausencia_pendentes");
    const item = r.body.find((a) => a.id === data.avisoId);
    expect(item?.motivo).toBe(MOTIVO);
  });

  it("assistido só acessa o PRÓPRIO aviso na tabela (RLS por linha)", async () => {
    const r = await rest<AvisoPayload[]>("assistido", `avisos_ausencia?select=*`);
    expect(r.ok).toBe(true);
    expect(r.body.length).toBeGreaterThan(0);
    // Toda linha visível pertence ao assistido autenticado.
    for (const row of r.body) {
      expect(row.assistido_id).toBe(data.assistidoId);
    }
    expect(r.body.some((a) => a.id === data.avisoId)).toBe(true);
  });

  it("assistido NÃO acessa aviso de outro assistido (filtro forjado retorna vazio)", async () => {
    // Tenta ler explicitamente por um assistido_id arbitrário diferente do seu.
    const outro = "00000000-0000-0000-0000-0000000000aa";
    const r = await rest<AvisoPayload[]>("assistido", `avisos_ausencia?assistido_id=eq.${outro}&select=*`);
    expect(r.ok).toBe(true);
    expect(r.body).toHaveLength(0);
  });
});
