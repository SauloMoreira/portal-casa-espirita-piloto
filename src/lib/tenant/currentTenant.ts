/**
 * SAAS-05-D — Espelho módulo-nível do tenant ativo.
 *
 * Fonte única do id da instituição ativa é o `InstituicaoContext`. Este módulo
 * é apenas um espelho controlado, sincronizado pelo próprio provider via
 * `_setCurrentInstituicaoId`, para que services/hooks fora da árvore React
 * (ou dentro dela sem acesso direto ao context) possam falhar fechado sem ler
 * armazenamento persistente por conta própria.
 *
 * Regras (SAAS-05-D):
 * - NÃO ler armazenamento persistente aqui: quem persiste é o hook do provider.
 * - NÃO aceitar instituição fora do allowedIds: quem valida é o provider.
 * - Reads/writes em tabelas T-DIR devem chamar `requireInstituicaoId()` e
 *   falhar fechado quando não houver tenant ativo.
 */


let _currentInstituicaoId: string | null = null;

/**
 * Uso interno do `InstituicaoProvider`. Não chamar em componentes/services.
 */
export function _setCurrentInstituicaoId(id: string | null): void {
  _currentInstituicaoId = id;
}

/**
 * Getter tolerante: retorna `null` se ainda não houver instituição ativa
 * selecionada. Usado por hooks que rodam antes do guard (ex.: theme loader)
 * para simplesmente pular a busca quando não há tenant.
 */
export function getCurrentInstituicaoId(): string | null {
  return _currentInstituicaoId;
}

/**
 * Fail-closed: exige instituição ativa. Se o chamador puder passar um id
 * explicitamente (fluxos server-side ou testes), aceita — mas nunca cai em
 * fallback silencioso para "todos os tenants".
 */
export function requireInstituicaoId(explicit?: string | null): string {
  const id = explicit ?? _currentInstituicaoId;
  if (!id) {
    throw new Error(
      "[SAAS-05-D] Nenhuma instituição ativa selecionada. Operação bloqueada (fail-closed).",
    );
  }
  return id;
}

/**
 * Açúcar para escopar um bloco por tenant ativo com fail-closed.
 */
export function withInstituicao<T>(cb: (instituicaoId: string) => T): T {
  return cb(requireInstituicaoId());
}
