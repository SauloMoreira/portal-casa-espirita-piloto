/**
 * SAAS-06-C1-STAB10-A.2 — Detector puro do payload legado do fluxo de acesso
 * de assistidos. Presença é medida por `hasOwnProperty`, portanto valores
 * null/false/vazio contam como presentes.
 */
export interface LegacyDetection {
  hasAssistidoId: boolean;
  hasAssistidoUpdate: boolean;
  isLegacy: boolean;
}

export function detectLegacyAssistidoPayload(body: unknown): LegacyDetection {
  const safe = (body ?? {}) as Record<string, unknown>;
  const hasAssistidoId = Object.prototype.hasOwnProperty.call(safe, "assistido_id");
  const hasAssistidoUpdate = Object.prototype.hasOwnProperty.call(safe, "assistido_update");
  return {
    hasAssistidoId,
    hasAssistidoUpdate,
    isLegacy: hasAssistidoId || hasAssistidoUpdate,
  };
}
