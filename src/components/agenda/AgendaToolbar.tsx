import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { AGENDA_VIEW_OPTIONS } from "@/constants/agenda";
import type { AgendaViewMode } from "@/types/agenda";

interface Props {
  viewMode: AgendaViewMode;
  onViewModeChange: (mode: AgendaViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onToggleFilters: () => void;
  title: string;
}

export function AgendaToolbar({
  viewMode, onViewModeChange, onPrev, onNext, onToday, onToggleFilters, title,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <Tabs value={viewMode} onValueChange={(v) => onViewModeChange(v as AgendaViewMode)}>
          <TabsList className="h-9">
            {AGENDA_VIEW_OPTIONS.map((opt) => (
              <TabsTrigger key={opt.value} value={opt.value} className="text-xs px-3">
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onToday}>
            Hoje
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={onToggleFilters}>
          <Filter className="h-3.5 w-3.5" />
          Filtros
        </Button>
      </div>

      <p className="text-sm font-semibold text-foreground capitalize">{title}</p>
    </div>
  );
}
