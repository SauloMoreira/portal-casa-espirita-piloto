import { useNavigate } from "react-router-dom";
import { isSameDay, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useAgendaEntrevistas } from "@/hooks/useAgendaEntrevistas";
import { AgendaHeader } from "@/components/agenda/AgendaHeader";
import { AgendaToolbar } from "@/components/agenda/AgendaToolbar";
import { AgendaFilters } from "@/components/agenda/AgendaFilters";
import { AgendaMonthView } from "@/components/agenda/AgendaMonthView";
import { AgendaWeekView } from "@/components/agenda/AgendaWeekView";
import { AgendaDayView } from "@/components/agenda/AgendaDayView";
import { AgendaEventDetailsDialog } from "@/components/agenda/AgendaEventDetailsDialog";
import type { EntrevistaAgendaItem } from "@/types/agenda";

export default function Agenda() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const {
    isMobile, loading, viewMode, setViewMode, currentDate, setCurrentDate,
    filters, setFilter, showFilters, setShowFilters, entrevistadores,
    dateRange, filtered, groupedByDate, navigatePrev, navigateNext, goToToday,
    title, selectedEntrevista, setSelectedEntrevista,
  } = useAgendaEntrevistas();

  const canRealizar = role === "admin" || role === "entrevistador";

  const handleRealizar = (entrevista: EntrevistaAgendaItem) => {
    const params = new URLSearchParams({
      entrevista_id: entrevista.id,
      assistido_id: entrevista.assistido_id,
      tipo_entrevista: entrevista.tipo_entrevista,
    });
    navigate(`/fazer-entrevista?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <AgendaHeader />

      <AgendaToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPrev={navigatePrev}
        onNext={navigateNext}
        onToday={goToToday}
        onToggleFilters={() => setShowFilters(!showFilters)}
        title={title}
      />

      {showFilters && (
        <AgendaFilters filters={filters} onChange={setFilter} entrevistadores={entrevistadores} />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          Carregando agenda...
        </div>
      ) : viewMode === "mes" ? (
        <AgendaMonthView
          currentDate={currentDate}
          dateRange={dateRange}
          groupedByDate={groupedByDate}
          onSelectDate={(d) => {
            setCurrentDate(d);
            setViewMode("dia");
          }}
          onSelectEntrevista={setSelectedEntrevista}
        />
      ) : viewMode === "semana" ? (
        <AgendaWeekView
          dateRange={dateRange}
          groupedByDate={groupedByDate}
          onSelectEntrevista={setSelectedEntrevista}
          isMobile={isMobile}
        />
      ) : (
        <AgendaDayView
          currentDate={currentDate}
          entrevistas={filtered.filter((e) => isSameDay(parseISO(e.data), currentDate))}
          onSelectEntrevista={setSelectedEntrevista}
        />
      )}

      <AgendaEventDetailsDialog
        entrevista={selectedEntrevista}
        onClose={() => setSelectedEntrevista(null)}
        canRealizar={canRealizar}
        onRealizar={handleRealizar}
      />
    </div>
  );
}
