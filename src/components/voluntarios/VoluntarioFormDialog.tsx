import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VoluntarioDadosPessoaisSection } from "./VoluntarioDadosPessoaisSection";
import { VoluntarioEnderecoSection } from "./VoluntarioEnderecoSection";
import { VoluntarioTipoFuncaoSection } from "./VoluntarioTipoFuncaoSection";
import { VoluntarioBuscaPessoaStep } from "./VoluntarioBuscaPessoaStep";
import { VoluntarioCadastroBadge } from "./VoluntarioCadastroBadge";
import { voluntarioCadastroCompleto, type PessoaCandidata } from "@/lib/voluntarioCadastro";
import type {
  FuncaoVoluntariado,
  VoluntarioFormErrors,
  VoluntarioFormState,
} from "@/types/voluntarios";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId: string | null;
  form: VoluntarioFormState;
  errors: VoluntarioFormErrors;
  loading: boolean;
  availableFuncoes: FuncaoVoluntariado[];
  onChange: (patch: Partial<VoluntarioFormState>) => void;
  onToggleTipo: (tipo: string) => void;
  onToggleFuncao: (funcaoId: string) => void;
  onSave: () => void;
  // busca / reaproveitamento
  buscaAtiva: boolean;
  buscaTermo: string;
  buscaResultados: PessoaCandidata[];
  buscaLoading: boolean;
  onBuscaTermoChange: (v: string) => void;
  onBuscar: () => void;
  onSelecionarPessoa: (p: PessoaCandidata) => void;
  onCadastrarDoZero: () => void;
}

export function VoluntarioFormDialog({
  open,
  onOpenChange,
  editId,
  form,
  errors,
  loading,
  availableFuncoes,
  onChange,
  onToggleTipo,
  onToggleFuncao,
  onSave,
  buscaAtiva,
  buscaTermo,
  buscaResultados,
  buscaLoading,
  onBuscaTermoChange,
  onBuscar,
  onSelecionarPessoa,
  onCadastrarDoZero,
}: Props) {
  const completo = voluntarioCadastroCompleto(form);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span>
              {buscaAtiva
                ? "Novo Voluntário — buscar pessoa"
                : editId
                  ? "Editar Voluntário"
                  : "Novo Voluntário"}
            </span>
            {!buscaAtiva && <VoluntarioCadastroBadge completo={completo} />}
          </DialogTitle>
        </DialogHeader>

        {buscaAtiva ? (
          <VoluntarioBuscaPessoaStep
            termo={buscaTermo}
            resultados={buscaResultados}
            loading={buscaLoading}
            onTermoChange={onBuscaTermoChange}
            onBuscar={onBuscar}
            onSelecionar={onSelecionarPessoa}
            onDoZero={onCadastrarDoZero}
          />
        ) : (
          <div className="space-y-6">
            {!completo && (
              <p className="text-xs text-muted-foreground rounded-lg border bg-muted/30 p-2">
                Cadastro mínimo: apenas <span className="font-medium text-foreground">Nome</span>,{" "}
                <span className="font-medium text-foreground">Celular</span> e{" "}
                <span className="font-medium text-foreground">tipo</span> são obrigatórios agora. Os
                demais campos podem ser completados depois (o termo só é liberado com cadastro completo).
              </p>
            )}
            <p className="text-xs text-muted-foreground rounded-lg border border-amber-200 bg-amber-50 p-2">
              Este cadastro define a <span className="font-medium">atuação</span> na casa. Não
              concede acesso ao sistema — permissões operacionais são gerenciadas em Acesso e
              Segurança → Permissões de Acesso.
            </p>
            <VoluntarioDadosPessoaisSection form={form} errors={errors} onChange={onChange} />
            <VoluntarioEnderecoSection form={form} errors={errors} onChange={onChange} />
            <VoluntarioTipoFuncaoSection
              form={form}
              errors={errors}
              availableFuncoes={availableFuncoes}
              onChange={onChange}
              onToggleTipo={onToggleTipo}
              onToggleFuncao={onToggleFuncao}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={onSave} disabled={loading}>
                {loading ? "Salvando..." : editId ? "Salvar Alterações" : "Cadastrar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
