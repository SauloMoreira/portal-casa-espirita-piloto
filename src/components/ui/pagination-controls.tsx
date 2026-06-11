import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { getPageCount, getRangeLabel, PAGE_SIZE_OPTIONS } from "@/lib/pagination";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  loading?: boolean;
}

/** Controle reutilizável de paginação real (server-side). */
export function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  loading,
}: Props) {
  const pageCount = getPageCount(total, pageSize);
  const canPrev = page > 1;
  const canNext = page < pageCount;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3">
      <p className="text-xs text-muted-foreground">
        {loading ? "Carregando..." : getRangeLabel(page, pageSize, total)}
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>{s} / página</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!canPrev} onClick={() => onPageChange(1)} aria-label="Primeira página">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!canPrev} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground px-2 tabular-nums">
            {page} / {pageCount}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!canNext} onClick={() => onPageChange(page + 1)} aria-label="Próxima página">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!canNext} onClick={() => onPageChange(pageCount)} aria-label="Última página">
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
