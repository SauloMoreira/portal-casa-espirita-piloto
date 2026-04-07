import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Search,
  Eye,
  Clock,
  User,
  Filter,
  BookOpen,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isSameDay,
  isSameMonth,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";

interface Entrevista {
  id: string;
  assistido_id: string;
  entrevistador_id: string;
  data: string;
  tipo_entrevista: string;
  status: string;
  observacoes: string | null;
  assistido_nome: string;
  entrevistador_nome: string;
}

const STATUS_COLORS: Record<string, string> = {
  agendada: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  realizada: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelada: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  remarcada: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  remarcada: "Remarcada",
};

type ViewMode = "dia" | "semana" | "mes";

export default function Agenda() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [entrevistas, setEntrevistas] = useState<Entrevista[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? "dia" : "semana");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchAssistido, setSearchAssistido] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todas_ativas");
  const [filterEntrevistador, setFilterEntrevistador] = useState<string>("todos");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [selectedEntrevista, setSelectedEntrevista] = useState<Entrevista | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [entrevistadores, setEntrevistadores] = useState<{ id: string; nome: string }[]>([]);

  // Date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === "dia") {
      return { start: currentDate, end: currentDate };
    } else if (viewMode === "semana") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 0 }),
        end: endOfWeek(currentDate, { weekStartsOn: 0 }),
      };
    } else {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      return {
        start: startOfWeek(monthStart, { weekStartsOn: 0 }),
        end: endOfWeek(monthEnd, { weekStartsOn: 0 }),
      };
    }
  }, [viewMode, currentDate]);

  useEffect(() => {
    fetchEntrevistas();
  }, [dateRange]);

  const fetchEntrevistas = async () => {
    setLoading(true);
    try {
      const startStr = format(dateRange.start, "yyyy-MM-dd");
      const endStr = format(dateRange.end, "yyyy-MM-dd");

      // Fetch interviews in range - use timestamp range to cover full days
      const { data: rawEntrevistas, error } = await supabase
        .from("entrevistas_fraternas")
        .select("id, assistido_id, entrevistador_id, data, tipo_entrevista, status, observacoes")
        .gte("data", `${startStr}T00:00:00`)
        .lte("data", `${endStr}T23:59:59`)
        .order("data", { ascending: true });

      if (error) {
        console.error("Erro ao buscar entrevistas:", error);
        setEntrevistas([]);
        setLoading(false);
        return;
      }

      if (!rawEntrevistas || rawEntrevistas.length === 0) {
        setEntrevistas([]);
        setLoading(false);
        return;
      }

      // Fetch assistido names
      const assistidoIds = [...new Set(rawEntrevistas.map((e) => e.assistido_id))];
      const { data: assistidos } = await supabase
        .from("assistidos")
        .select("id, nome")
        .in("id", assistidoIds);
      const assistidoMap = Object.fromEntries((assistidos || []).map((a) => [a.id, a.nome]));

      // Fetch entrevistador names from profiles
      const entrevistadorIds = [...new Set(rawEntrevistas.map((e) => e.entrevistador_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, nome_completo")
        .in("user_id", entrevistadorIds);
      const entrevistadorMap = Object.fromEntries(
        (profiles || []).map((p) => [p.user_id, p.nome_completo || "—"])
      );

      // Build unique entrevistadores list
      const uniqueEntrevistadores = entrevistadorIds.map((id) => ({
        id,
        nome: entrevistadorMap[id] || "—",
      }));
      setEntrevistadores(uniqueEntrevistadores);

      const mapped: Entrevista[] = rawEntrevistas.map((e) => ({
        ...e,
        assistido_nome: assistidoMap[e.assistido_id] || "—",
        entrevistador_nome: entrevistadorMap[e.entrevistador_id] || "—",
      }));

      setEntrevistas(mapped);
    } catch (err) {
      console.error("Erro:", err);
      setEntrevistas([]);
    }
    setLoading(false);
  };

  // Filtering
  const filtered = useMemo(() => {
    return entrevistas.filter((e) => {
      if (searchAssistido && !e.assistido_nome.toLowerCase().includes(searchAssistido.toLowerCase())) return false;
      if (filterStatus === "todas_ativas" && e.status === "cancelada") return false;
      if (filterStatus !== "todas_ativas" && filterStatus !== "todos" && e.status !== filterStatus) return false;
      if (filterEntrevistador !== "todos" && e.entrevistador_id !== filterEntrevistador) return false;
      if (filterTipo !== "todos" && e.tipo_entrevista !== filterTipo) return false;
      return true;
    });
  }, [entrevistas, searchAssistido, filterStatus, filterEntrevistador, filterTipo]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const map = new Map<string, Entrevista[]>();
    filtered.forEach((e) => {
      const dateKey = format(parseISO(e.data), "yyyy-MM-dd");
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(e);
    });
    return map;
  }, [filtered]);

  const navigatePrev = () => {
    if (viewMode === "dia") setCurrentDate(subDays(currentDate, 1));
    else if (viewMode === "semana") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subMonths(currentDate, 1));
  };

  const navigateNext = () => {
    if (viewMode === "dia") setCurrentDate(addDays(currentDate, 1));
    else if (viewMode === "semana") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addMonths(currentDate, 1));
  };

  const goToToday = () => setCurrentDate(new Date());

  const getTitle = () => {
    if (viewMode === "dia") return format(currentDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    if (viewMode === "semana") {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      return `${format(start, "dd/MM")} — ${format(end, "dd/MM/yyyy")}`;
    }
    return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
  };

  const formatTime = (dateStr: string) => {
    const d = parseISO(dateStr);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    if (h === 0 && m === 0) return null;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <CalendarIcon className="h-6 w-6 text-primary" />
          Agenda de Entrevistas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Calendário de entrevistas fraternas</p>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        {/* View mode + navigation */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-9">
              <TabsTrigger value="dia" className="text-xs px-3">Dia</TabsTrigger>
              <TabsTrigger value="semana" className="text-xs px-3">Semana</TabsTrigger>
              <TabsTrigger value="mes" className="text-xs px-3">Mês</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={navigatePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={goToToday}>
              Hoje
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={navigateNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filtros
          </Button>
        </div>

        {/* Current period title */}
        <p className="text-sm font-semibold text-foreground capitalize">{getTitle()}</p>

        {/* Filters */}
        {showFilters && (
          <Card className="glass-card">
            <CardContent className="pt-4 pb-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar assistido..."
                    className="pl-9 h-9 text-sm"
                    value={searchAssistido}
                    onChange={(e) => setSearchAssistido(e.target.value)}
                  />
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas_ativas">Ativas (sem canceladas)</SelectItem>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="agendada">Agendada</SelectItem>
                    <SelectItem value="realizada">Realizada</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                    <SelectItem value="remarcada">Remarcada</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterEntrevistador} onValueChange={setFilterEntrevistador}>
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
                <Select value={filterTipo} onValueChange={setFilterTipo}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os tipos</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="livre">Livre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          Carregando agenda...
        </div>
      ) : viewMode === "mes" ? (
        <MonthView
          currentDate={currentDate}
          dateRange={dateRange}
          groupedByDate={groupedByDate}
          onSelectDate={(d) => {
            setCurrentDate(d);
            setViewMode("dia");
          }}
          formatTime={formatTime}
          onSelectEntrevista={setSelectedEntrevista}
        />
      ) : viewMode === "semana" ? (
        <WeekView
          currentDate={currentDate}
          dateRange={dateRange}
          groupedByDate={groupedByDate}
          formatTime={formatTime}
          onSelectEntrevista={setSelectedEntrevista}
          isMobile={isMobile}
        />
      ) : (
        <DayView
          currentDate={currentDate}
          entrevistas={filtered.filter((e) => isSameDay(parseISO(e.data), currentDate))}
          formatTime={formatTime}
          onSelectEntrevista={setSelectedEntrevista}
        />
      )}

      {/* Detail Dialog */}
      {selectedEntrevista && (
        <Dialog open={!!selectedEntrevista} onOpenChange={() => setSelectedEntrevista(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                Detalhes da Entrevista
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Assistido</p>
                  <p className="font-medium">{selectedEntrevista.assistido_nome}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Entrevistador</p>
                  <p className="font-medium">{selectedEntrevista.entrevistador_nome}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Data</p>
                  <p className="font-medium">
                    {format(parseISO(selectedEntrevista.data), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Horário</p>
                  <p className="font-medium">
                    {formatTime(selectedEntrevista.data) || "Não definido"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Tipo</p>
                  <p className="font-medium capitalize">{selectedEntrevista.tipo_entrevista}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge className={STATUS_COLORS[selectedEntrevista.status] || ""}>
                    {STATUS_LABELS[selectedEntrevista.status] || selectedEntrevista.status}
                  </Badge>
                </div>
              </div>
              {selectedEntrevista.observacoes && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Observações</p>
                  <p className="text-sm bg-muted/50 rounded-md p-2">{selectedEntrevista.observacoes}</p>
                </div>
              )}
              {/* Fazer Entrevista button - only for admin/entrevistador and agendada status */}
              {(role === "admin" || role === "entrevistador") && selectedEntrevista.status === "agendada" && (
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    const params = new URLSearchParams({
                      entrevista_id: selectedEntrevista.id,
                      assistido_id: selectedEntrevista.assistido_id,
                      tipo_entrevista: selectedEntrevista.tipo_entrevista,
                    });
                    navigate(`/fazer-entrevista?${params.toString()}`);
                  }}
                >
                  <BookOpen className="h-4 w-4" />
                  Fazer Entrevista
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ========== Month View ========== */
function MonthView({
  currentDate,
  dateRange,
  groupedByDate,
  onSelectDate,
  formatTime,
  onSelectEntrevista,
}: {
  currentDate: Date;
  dateRange: { start: Date; end: Date };
  groupedByDate: Map<string, Entrevista[]>;
  onSelectDate: (d: Date) => void;
  formatTime: (s: string) => string | null;
  onSelectEntrevista: (e: Entrevista) => void;
}) {
  const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <Card className="glass-card overflow-hidden">
      <CardContent className="p-0">
        {/* Week day headers */}
        <div className="grid grid-cols-7 border-b">
          {weekDays.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2 border-r last:border-r-0">
              {d}
            </div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEntrevistas = groupedByDate.get(key) || [];
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentDate);

            return (
              <div
                key={key}
                className={`min-h-[80px] md:min-h-[100px] border-r border-b last:border-r-0 p-1 cursor-pointer hover:bg-accent/30 transition-colors ${
                  !isCurrentMonth ? "bg-muted/30" : ""
                }`}
                onClick={() => onSelectDate(day)}
              >
                <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? "bg-primary text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayEntrevistas.slice(0, 3).map((e) => (
                    <div
                      key={e.id}
                      className={`text-[10px] leading-tight rounded px-1 py-0.5 truncate cursor-pointer ${STATUS_COLORS[e.status] || "bg-muted"}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelectEntrevista(e);
                      }}
                      title={`${e.assistido_nome} — ${formatTime(e.data) || "s/ horário"}`}
                    >
                      {formatTime(e.data) ? `${formatTime(e.data)} ` : ""}
                      {e.assistido_nome.split(" ")[0]}
                    </div>
                  ))}
                  {dayEntrevistas.length > 3 && (
                    <div className="text-[10px] text-muted-foreground pl-1">
                      +{dayEntrevistas.length - 3} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ========== Week View ========== */
function WeekView({
  currentDate,
  dateRange,
  groupedByDate,
  formatTime,
  onSelectEntrevista,
  isMobile,
}: {
  currentDate: Date;
  dateRange: { start: Date; end: Date };
  groupedByDate: Map<string, Entrevista[]>;
  formatTime: (s: string) => string | null;
  onSelectEntrevista: (e: Entrevista) => void;
  isMobile: boolean;
}) {
  const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });

  if (isMobile) {
    // Mobile: stack days vertically
    return (
      <div className="space-y-3">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayEntrevistas = groupedByDate.get(key) || [];
          const isToday = isSameDay(day, new Date());
          return (
            <Card key={key} className={`glass-card ${isToday ? "ring-2 ring-primary/50" : ""}`}>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs ${
                    isToday ? "bg-primary text-primary-foreground" : ""
                  }`}>
                    {format(day, "dd")}
                  </span>
                  <span className="capitalize">{format(day, "EEEE", { locale: ptBR })}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {dayEntrevistas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma entrevista</p>
                ) : (
                  <div className="space-y-2">
                    {dayEntrevistas.map((e) => (
                      <EntrevistaCard key={e.id} entrevista={e} formatTime={formatTime} onClick={() => onSelectEntrevista(e)} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // Desktop: columns
  return (
    <Card className="glass-card overflow-hidden">
      <CardContent className="p-0">
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEntrevistas = groupedByDate.get(key) || [];
            const isToday = isSameDay(day, new Date());
            return (
              <div key={key} className="border-r last:border-r-0 min-h-[300px]">
                {/* Header */}
                <div className={`text-center py-2 border-b ${isToday ? "bg-primary/10" : ""}`}>
                  <p className="text-[10px] text-muted-foreground uppercase">
                    {format(day, "EEE", { locale: ptBR })}
                  </p>
                  <p className={`text-sm font-semibold ${
                    isToday ? "bg-primary text-primary-foreground w-7 h-7 rounded-full flex items-center justify-center mx-auto" : ""
                  }`}>
                    {format(day, "dd")}
                  </p>
                </div>
                {/* Entries */}
                <div className="p-1 space-y-1">
                  {dayEntrevistas.map((e) => (
                    <div
                      key={e.id}
                      className={`text-[11px] rounded p-1.5 cursor-pointer hover:opacity-80 transition-opacity ${STATUS_COLORS[e.status] || "bg-muted"}`}
                      onClick={() => onSelectEntrevista(e)}
                    >
                      {formatTime(e.data) && (
                        <p className="font-semibold flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {formatTime(e.data)}
                        </p>
                      )}
                      <p className="truncate font-medium">{e.assistido_nome}</p>
                      <p className="truncate text-[10px] opacity-80">{e.entrevistador_nome}</p>
                    </div>
                  ))}
                  {dayEntrevistas.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-4">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ========== Day View ========== */
function DayView({
  currentDate,
  entrevistas,
  formatTime,
  onSelectEntrevista,
}: {
  currentDate: Date;
  entrevistas: Entrevista[];
  formatTime: (s: string) => string | null;
  onSelectEntrevista: (e: Entrevista) => void;
}) {
  // Sort by time
  const sorted = [...entrevistas].sort((a, b) => a.data.localeCompare(b.data));

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold capitalize">
          {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <CalendarIcon className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma entrevista neste dia</p>
            <p className="text-xs mt-1">Navegue para outra data ou ajuste os filtros</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((e) => (
              <EntrevistaCard key={e.id} entrevista={e} formatTime={formatTime} onClick={() => onSelectEntrevista(e)} expanded />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ========== Entrevista Card ========== */
function EntrevistaCard({
  entrevista,
  formatTime,
  onClick,
  expanded,
}: {
  entrevista: Entrevista;
  formatTime: (s: string) => string | null;
  onClick: () => void;
  expanded?: boolean;
}) {
  const time = formatTime(entrevista.data);

  return (
    <div
      className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {time && (
            <span className="text-xs font-semibold text-primary flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {time}
            </span>
          )}
          <Badge className={`text-[10px] ${STATUS_COLORS[entrevista.status] || ""}`}>
            {STATUS_LABELS[entrevista.status] || entrevista.status}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {entrevista.tipo_entrevista === "livre" ? "Livre" : "Regular"}
          </Badge>
        </div>
        <p className="text-sm font-medium truncate">{entrevista.assistido_nome}</p>
        {expanded && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <User className="h-3 w-3" />
            {entrevista.entrevistador_nome}
          </p>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
        <Eye className="h-4 w-4" />
      </Button>
    </div>
  );
}
