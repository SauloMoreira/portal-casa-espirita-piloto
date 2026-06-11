// ============================================================================
// Utilitários puros de paginação real (testáveis, sem efeitos colaterais).
// Usados por listas e relatórios para paginação server-side via Supabase.
// ============================================================================

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** Total de páginas para uma quantidade de registros (mínimo 1). */
export function getPageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** Garante que a página esteja dentro de [1, totalPaginas]. */
export function clampPage(page: number, total: number, pageSize: number): number {
  const count = getPageCount(total, pageSize);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), count);
}

/**
 * Intervalo [from, to] (inclusivo, base 0) para o método `.range()` do Supabase.
 * Respeita a página corrente e o tamanho de página.
 */
export function getRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const size = pageSize > 0 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  const from = (safePage - 1) * size;
  return { from, to: from + size - 1 };
}

/** Texto amigável "X–Y de Z" para o registro inicial/final exibido. */
export function getRangeLabel(page: number, pageSize: number, total: number): string {
  if (total <= 0) return "0 de 0";
  const { from } = getRange(page, pageSize);
  const start = from + 1;
  const end = Math.min(from + pageSize, total);
  return `${start}–${end} de ${total}`;
}
