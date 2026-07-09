import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, TIPOS_VOLUNTARIO } from "@/constants/voluntarios";
import type {
  FuncaoVoluntariado,
  VoluntarioFormErrors,
  VoluntarioFormState,
} from "@/types/voluntarios";

interface Props {
  form: VoluntarioFormState;
  errors: VoluntarioFormErrors;
  availableFuncoes: FuncaoVoluntariado[];
  onChange: (patch: Partial<VoluntarioFormState>) => void;
  onToggleTipo: (tipo: string) => void;
  onToggleFuncao: (funcaoId: string) => void;
}

export function VoluntarioTipoFuncaoSection({
  form,
  errors,
  availableFuncoes,
  onChange,
  onToggleTipo,
  onToggleFuncao,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Atuação
        </h3>
        <p className="text-xs text-muted-foreground">
          Define o que a pessoa faz na casa (tipo e funções de voluntariado).
          Atuação não concede acesso ao sistema — os acessos são geridos
          exclusivamente em Gestão de Acesso.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Data de Ingresso no Sistema *</Label>
          <Input
            type="date"
            value={form.data_ingresso_sistema}
            onChange={(e) => onChange({ data_ingresso_sistema: e.target.value })}
            className={errors.data_ingresso_sistema ? "border-destructive" : ""}
          />
          {errors.data_ingresso_sistema && (
            <p className="text-xs text-destructive">{errors.data_ingresso_sistema}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Data de Adesão ao Voluntariado</Label>
          <Input
            type="date"
            value={form.data_adesao_voluntariado}
            onChange={(e) => onChange({ data_adesao_voluntariado: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label>Tipo de Voluntário *</Label>
          <div className="flex gap-4">
            {TIPOS_VOLUNTARIO.map((tipo) => (
              <div key={tipo} className="flex items-center gap-2">
                <Checkbox
                  checked={form.tipos_voluntario.includes(tipo)}
                  onCheckedChange={() => onToggleTipo(tipo)}
                />
                <span className="text-sm">{tipo}</span>
              </div>
            ))}
          </div>
          {errors.tipos_voluntario && (
            <p className="text-xs text-destructive">{errors.tipos_voluntario}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => onChange({ status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.status === "desligado" && (
          <div className="space-y-1">
            <Label>Data de Desligamento</Label>
            <Input
              type="date"
              value={form.data_desligamento}
              onChange={(e) => onChange({ data_desligamento: e.target.value })}
            />
          </div>
        )}
        {availableFuncoes.length > 0 && (
          <div className="sm:col-span-2 space-y-2">
            <Label>Funções / Atuação *</Label>
            <div className="flex gap-3 flex-wrap">
              {availableFuncoes.map((func) => (
                <div key={func.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={form.funcoes_ids.includes(func.id)}
                    onCheckedChange={() => onToggleFuncao(func.id)}
                  />
                  <span className="text-sm">{func.nome_funcao}</span>
                  <Badge variant="outline" className="text-[10px] py-0">
                    {func.tipo_voluntario}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
        {form.tipos_voluntario.length > 0 && availableFuncoes.length === 0 && (
          <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
            <p className="text-xs text-amber-800">
              Nenhuma função de voluntariado cadastrada para os tipos selecionados.
              Você pode salvar o voluntário assim mesmo e vincular funções depois em{" "}
              <span className="font-medium">Pessoas → Funções de Voluntariado</span>.
            </p>
          </div>
        )}

        {form.tipos_voluntario.length === 0 && (
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">
              Selecione um tipo de voluntário para ver as funções disponíveis.
            </p>
          </div>
        )}
        <div className="sm:col-span-2 space-y-1">
          <Label>Observações adicionais sobre a atuação</Label>
          <Textarea
            value={form.atuacao_detalhada}
            onChange={(e) => onChange({ atuacao_detalhada: e.target.value })}
            placeholder="Informações complementares (opcional)..."
            rows={2}
          />
        </div>
        <div className="sm:col-span-2 space-y-1">
          <Label>Observações</Label>
          <Textarea
            value={form.observacoes}
            onChange={(e) => onChange({ observacoes: e.target.value })}
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}
