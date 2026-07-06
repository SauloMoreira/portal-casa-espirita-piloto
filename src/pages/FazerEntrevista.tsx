import { useFazerEntrevista } from "@/hooks/useFazerEntrevista";
import { CartaAgendamento } from "@/components/CartaAgendamento";
import { FazerEntrevistaHeader } from "@/components/entrevista/FazerEntrevistaHeader";
import { AssistidoSearchSection } from "@/components/entrevista/AssistidoSearchSection";
import { AssistidoSummaryCard } from "@/components/entrevista/AssistidoSummaryCard";
import { DadosEntrevistaSection } from "@/components/entrevista/DadosEntrevistaSection";
import { TratamentosSection } from "@/components/entrevista/TratamentosSection";
import { EntrevistaActionsFooter } from "@/components/entrevista/EntrevistaActionsFooter";
import { NovoAssistidoDialog } from "@/components/entrevista/NovoAssistidoDialog";
import { AssistenteIaDialog } from "@/components/entrevista/AssistenteIaDialog";
import { AjusteSugestaoIaField } from "@/components/entrevista/AjusteSugestaoIaField";

export default function FazerEntrevista() {
  const e = useFazerEntrevista();

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <FazerEntrevistaHeader />

      {!e.selectedAssistido && (
        <AssistidoSearchSection
          searchTerm={e.searchTerm}
          onSearchTermChange={e.setSearchTerm}
          filteredAssistidos={e.filteredAssistidos}
          onSelect={e.selectAssistido}
          onNovo={e.openNovoAssistido}
        />
      )}

      {e.selectedAssistido && (
        <>
          <AssistidoSummaryCard
            assistido={e.selectedAssistido}
            tipoEntrevista={e.tipoEntrevista}
            minPalestras={e.minPalestras}
            onTrocar={e.clearSelection}
          />

          <DadosEntrevistaSection
            dataEntrevista={e.dataEntrevista}
            onDataChange={e.setDataEntrevista}
            tipoEntrevista={e.tipoEntrevista}
            onTipoChange={e.setTipoEntrevista}
            permitirLivre={e.permitirLivre}
            minPalestras={e.minPalestras}
            observacoes={e.observacoes}
            onObservacoesChange={e.setObservacoesManual}
            isRecording={e.isRecording}
            onToggleRecording={e.toggleRecording}
            onAiAssistant={e.handleAiAssistant}
            aiLoading={e.aiLoading}
          />

          <TratamentosSection
            tratamentos={e.tratamentos}
            quantidades={e.quantidades}
            datasIniciais={e.datasIniciais}
            horarios={e.horarios}
            totalAssigned={e.totalAssigned}
            onToggle={e.toggleTratamento}
            onSetQtd={e.setQtd}
            onClearQtd={e.clearQtd}
            onSetDataInicial={e.setDataInicial}
            onSetHorario={e.setHorario}
          />

          {e.aiSugestaoId && e.aiHasDivergencia && (
            <AjusteSugestaoIaField
              value={e.aiMotivoAjuste}
              onChange={e.setAiMotivoAjuste}
            />
          )}




          <EntrevistaActionsFooter
            onCancelar={e.clearSelection}
            onSalvar={e.handleSalvar}
            saving={e.saving}
            isApto={e.isApto}
          />
        </>
      )}

      <NovoAssistidoDialog
        open={e.novoAssistidoOpen}
        onOpenChange={e.setNovoAssistidoOpen}
        form={e.assistidoForm}
        onFormChange={e.setAssistidoForm}
        errors={e.assistidoErrors}
        saving={e.savingAssistido}
        onSalvar={e.handleSaveNovoAssistido}
      />

      <AssistenteIaDialog
        open={e.aiOpen}
        onOpenChange={e.setAiOpen}
        loading={e.aiLoading}
        sugestao={e.aiSugestao}
        estruturada={e.aiEstruturada}
        onApply={e.applySugestaoIA}
      />


      <CartaAgendamento
        open={e.cartaOpen}
        onOpenChange={e.setCartaOpen}
        assistidoId={e.cartaAssistidoId}
        entrevistaId={e.cartaEntrevistaId}
      />
    </div>
  );
}
