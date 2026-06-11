import { useNavigate } from "react-router-dom";
import AIInsightsBlock from "@/components/dashboard/AIInsightsBlock";
import { AdminDashboardHeader } from "@/components/dashboard/admin/AdminDashboardHeader";
import { AdminMainCards } from "@/components/dashboard/admin/AdminMainCards";
import { AdminStrategicCards } from "@/components/dashboard/admin/AdminStrategicCards";
import { AdminCriticalPendencies } from "@/components/dashboard/admin/AdminCriticalPendencies";
import { AdminMainCharts } from "@/components/dashboard/admin/AdminMainCharts";
import { AdminInterviewsSection } from "@/components/dashboard/admin/AdminInterviewsSection";
import { AdminQuickLists } from "@/components/dashboard/admin/AdminQuickLists";
import { AdminShortcuts } from "@/components/dashboard/admin/AdminShortcuts";
import { AguardandoAgendamentoDialog } from "@/components/dashboard/admin/AguardandoAgendamentoDialog";
import { AdminPublicWorksSection } from "@/components/dashboard/admin/AdminPublicWorksSection";
import { useAdminDashboard } from "@/hooks/useAdminDashboard";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const {
    period, setPeriod, loading, data,
    ageData, topAge, bottomAge, presenceChart, entrevistasPorTipo, funnel,
    pendencias, topTrat, bottomTrat, topTarefeiro, aiDashboardData,
    aguardandoOpen, setAguardandoOpen, aguardandoList, openAguardando,
  } = useAdminDashboard();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Carregando dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminDashboardHeader period={period} onPeriodChange={setPeriod} />

      <AdminMainCards
        assistidosCount={data.assistidos.length}
        tratAtivos={data.tratAtivos}
        entAgendadas={data.entAgendadas}
        presencasHoje={data.presencasHoje}
        listaEspera={data.listaEspera}
        tratConcluidos={data.tratConcluidos}
      />

      <AdminStrategicCards
        topTrat={topTrat}
        bottomTrat={bottomTrat}
        topTarefeiro={topTarefeiro}
        publicoPalestras={data.publicoPalestras}
        faltasMes={data.faltasMes}
        aguardandoAgend={data.aguardandoAgend}
        topAge={topAge}
        bottomAge={bottomAge}
        onOpenAguardando={openAguardando}
      />

      <AdminCriticalPendencies
        pendencias={pendencias}
        onOpenAguardando={openAguardando}
        onNavigate={(path) => navigate(path)}
      />

      <AdminMainCharts
        tratPorTipo={data.tratPorTipo}
        presenceChart={presenceChart}
        ageData={ageData}
        funnel={funnel}
      />

      <AdminInterviewsSection
        entrevistasPorTipo={entrevistasPorTipo}
        cargaTarefeiros={data.cargaTarefeiros}
      />

      <AdminPublicWorksSection period={period} />


      <AdminQuickLists
        entRecentes={data.entRecentes}
        ageData={ageData}
        totalAssistidos={data.assistidos.length}
      />

      <AIInsightsBlock dashboardData={aiDashboardData} />

      <AdminShortcuts onNavigate={(path) => navigate(path)} />

      <AguardandoAgendamentoDialog
        open={aguardandoOpen}
        onOpenChange={setAguardandoOpen}
        items={aguardandoList}
      />
    </div>
  );
}
