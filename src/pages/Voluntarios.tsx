import { useVoluntarios } from "@/hooks/useVoluntarios";
import { VoluntariosHeader } from "@/components/voluntarios/VoluntariosHeader";
import { VoluntariosFilters } from "@/components/voluntarios/VoluntariosFilters";
import { VoluntariosList } from "@/components/voluntarios/VoluntariosList";
import { VoluntarioFormDialog } from "@/components/voluntarios/VoluntarioFormDialog";
import { TermoAdesao } from "@/components/voluntarios/TermoAdesao";
import { FichaVoluntario } from "@/components/voluntarios/FichaVoluntario";
import { DeleteVoluntarioDialog } from "@/components/voluntarios/DeleteVoluntarioDialog";
import { TermoVoluntarioDialog } from "@/components/voluntarios/TermoVoluntarioDialog";
import { PosCadastroAcessoDialog } from "@/components/voluntarios/PosCadastroAcessoDialog";
import { PaginationControls } from "@/components/ui/pagination-controls";

export default function Voluntarios() {
  const v = useVoluntarios();

  return (
    <div className="space-y-6">
      <VoluntariosHeader onNew={v.openNew} />

      <VoluntariosFilters filters={v.filters} onChange={v.setFilter} funcoes={v.allFuncoes} />

      <VoluntariosList
        voluntarios={v.paginated}
        acessoOperacionalIds={v.acessoOperacionalIds}
        onEdit={v.openEdit}
        onFicha={v.openFicha}
        onTermo={v.openTermoFlow}
        onInactivate={(vol) => {
          if (window.confirm(`Inativar o voluntário ${vol.nome_completo}? O histórico será preservado.`)) {
            v.handleInactivate(vol);
          }
        }}
        onReactivate={(vol) => {
          if (window.confirm(`Reativar o voluntário ${vol.nome_completo}?`)) {
            v.handleReactivate(vol);
          }
        }}
        onDelete={v.openDelete}
      />

      {v.total > 0 && (
        <PaginationControls
          page={v.page}
          pageSize={v.pageSize}
          total={v.total}
          onPageChange={v.setPage}
          onPageSizeChange={v.setPageSize}
        />
      )}

      <VoluntarioFormDialog
        open={v.open}
        onOpenChange={v.setOpen}
        editId={v.editId}
        form={v.form}
        errors={v.errors}
        loading={v.loading}
        availableFuncoes={v.availableFuncoes}
        onChange={(patch) => v.setForm((prev) => ({ ...prev, ...patch }))}
        onToggleTipo={v.toggleTipo}
        onToggleFuncao={v.toggleFuncao}
        onSave={v.handleSave}
        buscaAtiva={v.buscaAtiva}
        buscaTermo={v.buscaTermo}
        buscaResultados={v.buscaResultados}
        buscaLoading={v.buscaLoading}
        onBuscaTermoChange={v.setBuscaTermo}
        onBuscar={v.buscarPessoas}
        onSelecionarPessoa={v.aplicarPessoa}
        onCadastrarDoZero={v.cadastrarDoZero}
      />

      <PosCadastroAcessoDialog
        open={v.posCadastroOpen}
        onOpenChange={v.setPosCadastroOpen}
        nome={v.posCadastroNome}
      />




      {v.selectedVoluntario && (
        <TermoAdesao
          open={v.termoOpen}
          onClose={() => v.setTermoOpen(false)}
          voluntario={v.selectedVoluntario}
          instituicao={v.instData}
          funcoesNomes={v.getFuncaoNames(v.selectedVoluntario.id)}
        />
      )}

      {v.selectedVoluntario && (
        <FichaVoluntario
          open={v.fichaOpen}
          onClose={() => v.setFichaOpen(false)}
          voluntario={v.selectedVoluntario}
          funcoesNomes={v.getFuncaoNames(v.selectedVoluntario.id)}
        />
      )}

      {v.deleteTarget && (
        <DeleteVoluntarioDialog
          open={v.deleteOpen}
          onOpenChange={v.setDeleteOpen}
          voluntarioId={v.deleteTarget.id}
          voluntarioNome={v.deleteTarget.nome_completo}
          onDeleted={v.onDeleted}
          onInactivate={(motivo) => v.deleteTarget && v.handleInactivate(v.deleteTarget, motivo)}
        />
      )}

      {v.termoFlowVoluntario && (
        <TermoVoluntarioDialog
          open={v.termoFlowOpen}
          onOpenChange={v.setTermoFlowOpen}
          voluntario={v.termoFlowVoluntario}
          onOpenPrint={v.openTermoPrint}
          onChanged={v.onTermoChanged}
        />
      )}
    </div>
  );
}
