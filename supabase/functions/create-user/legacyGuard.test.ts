// ============================================================================
// SAAS-06-C1-STAB10-A.2 — Bloqueio do fluxo legado create-user (unit)
// Cobre a detecção do payload legado: presença por hasOwnProperty (null,
// vazio, false, objeto), presença isolada ou combinada e ausência total.
// ============================================================================
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectLegacyAssistidoPayload } from "./legacyGuard.ts";

Deno.test("assistido_id com UUID válido => legacy", () => {
  const r = detectLegacyAssistidoPayload({
    email: "x@y.com",
    password: "abc",
    role: "assistido",
    assistido_id: "ff97a606-6b27-4cb7-baca-68d5f1b78f66",
  });
  assertEquals(r.hasAssistidoId, true);
  assertEquals(r.isLegacy, true);
});

Deno.test("assistido_id = null => legacy (presença conta, não valor)", () => {
  const r = detectLegacyAssistidoPayload({ role: "assistido", assistido_id: null });
  assertEquals(r.hasAssistidoId, true);
  assertEquals(r.isLegacy, true);
});

Deno.test("assistido_id = '' (string vazia) => legacy", () => {
  const r = detectLegacyAssistidoPayload({ assistido_id: "" });
  assertEquals(r.hasAssistidoId, true);
  assertEquals(r.isLegacy, true);
});

Deno.test("assistido_id = false => legacy", () => {
  const r = detectLegacyAssistidoPayload({ assistido_id: false });
  assertEquals(r.hasAssistidoId, true);
  assertEquals(r.isLegacy, true);
});

Deno.test("assistido_update objeto => legacy", () => {
  const r = detectLegacyAssistidoPayload({ assistido_update: { status: "ativo" } });
  assertEquals(r.hasAssistidoUpdate, true);
  assertEquals(r.isLegacy, true);
});

Deno.test("assistido_update = null => legacy", () => {
  const r = detectLegacyAssistidoPayload({ assistido_update: null });
  assertEquals(r.hasAssistidoUpdate, true);
  assertEquals(r.isLegacy, true);
});

Deno.test("ambos presentes => legacy", () => {
  const r = detectLegacyAssistidoPayload({
    assistido_id: "abc",
    assistido_update: { status: "x" },
  });
  assertEquals(r.hasAssistidoId, true);
  assertEquals(r.hasAssistidoUpdate, true);
  assertEquals(r.isLegacy, true);
});

Deno.test("payload de Gestão de Usuários (sem campos legados) => NÃO legacy", () => {
  const r = detectLegacyAssistidoPayload({
    email: "novo@x.com",
    password: "senha1234",
    role: "assistido",
    profile: { nome_completo: "Fulano", cpf: "12345678900" },
  });
  assertEquals(r.hasAssistidoId, false);
  assertEquals(r.hasAssistidoUpdate, false);
  assertEquals(r.isLegacy, false);
});

Deno.test("body null/undefined => NÃO legacy (guarda robusta)", () => {
  assertEquals(detectLegacyAssistidoPayload(null).isLegacy, false);
  assertEquals(detectLegacyAssistidoPayload(undefined).isLegacy, false);
  assertEquals(detectLegacyAssistidoPayload({}).isLegacy, false);
});

Deno.test("simulação de bundle antigo (payload real capturado no diagnóstico) => bloqueado", () => {
  const bundleAntigo = {
    email: "assistido02@example.com",
    password: "REDACTED",
    role: "assistido",
    profile: { nome_completo: "Assistido02" },
    assistido_id: "ff97a606-6b27-4cb7-baca-68d5f1b78f66",
    assistido_update: { status: "ativo" },
  };
  const r = detectLegacyAssistidoPayload(bundleAntigo);
  assert(r.isLegacy, "bundle antigo deve ser bloqueado");
});
