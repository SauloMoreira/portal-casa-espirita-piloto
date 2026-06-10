import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import {
  AGENDA_STATUS_FILTER_OPTIONS,
  AGENDA_TIPO_FILTER_OPTIONS,
} from "@/constants/agenda";
import type { AgendaEntrevistador, AgendaFilterState } from "@/types/agenda";

interface Props {
  filters: AgendaFilterState;
  onChange: <K extends keyof AgendaFilterState>(key: K, value: AgendaFilterState[K]) => void;
  entrevistadores: AgendaEntrevistador[];
}

export function AgendaFilters({ filters, onChange, entrevistadores }: Props) {
  return (
    <Card className="glass-card">
      <CardContent className="pt-4 pb-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar assistido..."
              className="pl-9 h-9 text-sm"
              value={filters.searchAssistido}
              onChange={(e) => onChange("searchAssistido", e.target.value)}
            />
          </div>

          <Select value={filters.status} onValueChange={(v) => onChange("status", v)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {AGENDA_STATUS_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.entrevistador} onValueChange={(v) => onChange("entrevistador", v)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Entrevistador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos entrevistadores</SelectItem>
              {entrevistadores.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.tipo} onValueChange={(v) => onChange("tipo", v)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              {AGENDA_TIPO_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
