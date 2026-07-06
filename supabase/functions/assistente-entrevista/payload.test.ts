// ============================================================================
// Q2-A1 — Testes da minimização LGPD do payload enviado ao gateway de IA.
// Cobrem: ausência de nome/identificadores diretos no payload e preservação
// das observações necessárias à sugestão assistida.
// ============================================================================
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildUserMessage } from "./payload.ts";

Deno.test("payload não inclui o nome do assistido", () => {
  const nome = "Maria da Silva Santos";
  const observacoes = "Relata ansiedade e insônia recorrentes.";
  const msg = buildUserMessage(observacoes);
  assert(!msg.includes(nome), "o nome do assistido não deve ser enviado à IA");
  assert(!msg.toLowerCase().includes("assistido:"), "não deve rotular/identificar o assistido");
});

Deno.test("payload não inclui identificadores diretos desnecessários", () => {
  const observacoes = "Queixa de tristeza profunda.";
  const msg = buildUserMessage(observacoes);
  // Nenhum id/telefone/e-mail deve aparecer, pois só recebe observações.
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(msg), "não deve conter UUID");
  assert(!/@/.test(msg), "não deve conter e-mail");
  assert(!/\b\d{2,}\b/.test(msg.replace(observacoes, "")), "estrutura do payload não deve conter dígitos identificadores");
});

Deno.test("payload preserva as observações/queixa necessárias à sugestão", () => {
  const observacoes = "Relata ansiedade, insônia e busca por acolhimento espiritual.";
  const msg = buildUserMessage(observacoes);
  assertStringIncludes(msg, observacoes);
  assertStringIncludes(msg, "Observações da entrevista:");
});

Deno.test("payload é determinístico e depende apenas das observações", () => {
  const observacoes = "Texto de teste.";
  assertEquals(buildUserMessage(observacoes), buildUserMessage(observacoes));
});
