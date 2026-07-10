import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Heart, RotateCcw } from "lucide-react";
import { getDay } from "date-fns";
import { DIAS_SEMANA, MODO_AGENDAMENTO } from "@/constants/fazerEntrevista";
import { isTratamentoHolistico } from "@/lib/agendaRules";
import type { EntrevistaTipoTratamento } from "@/types/fazerEntrevista";

interface Props {
  tratamentos: EntrevistaTipoTratamento[];
  quantidades: Record<string, string>;
  datasIniciais: Record<string, string>;
  horarios: Record<string, string>;
  totalAssigned: number;
  onToggle: (id: string) => void;
  onSetQtd: (id: string, val: string) => void;
  onClearQtd: (id: string) => void;
  onSetDataInicial: (id: string, val: string) => void;
  onSetHorario: (id: string, val: string) => void;
}

function TratamentoCard({
  t,
  quantidades,
  datasIniciais,
  horarios,
  onToggle,
  onSetQtd,
  onClearQtd,
  onSetDataInicial,
  onSetHorario,
}: {
  t: EntrevistaTipoTratamento;
} & Pick<
  Props,
  | "quantidades"
  | "datasIniciais"
  | "horarios"
  | "onToggle"
  | "onSetQtd"
  | "onClearQtd"
  | "onSetDataInicial"
  | "onSetHorario"
>) {
  const qtyStr = quantidades[t.id];
  const isActive = t.id in quantidades;
  const needsStartDate = t.modo_agendamento === MODO_AGENDAMENTO.agendadoPorDataInicial;
  const startDateVal = datasIniciais[t.id] || "";
  const defaultQty = t.quantidade_padrao_sessoes;
  const isHolistico = isTratamentoHolistico(t.tipo);
  const horarioVal = horarios[t.id] || "";

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 transition-colors cursor-pointer ${
        isActive ? "border-primary/40 bg-primary/5" : "hover:border-muted-foreground/30"
      }`}
      onClick={() => {
        if (!isActive) onToggle(t.id);
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
            {t.nome}
          </p>
          {needsStartDate && (
            <p className="text-[10px] text-muted-foreground">Agendado por data inicial</p>
          )}
          <p className="text-[10px] text-muted-foreground">Padrão: {defaultQty} sessão(ões)</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isActive && (
            <Input
              type="number"
              min={1}
              value={qtyStr || ""}
              placeholder={String(defaultQty)}
              onChange={(e) => onSetQtd(t.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-16 h-8 text-center text-sm"
            />
          )}
          {isActive && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onClearQtd(t.id)}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              title="Limpar"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {needsStartDate && isActive && (
        <div className="space-y-1">
          <Label className="text-xs">
            1ª sessão {t.dia_semana !== null ? `(${DIAS_SEMANA[t.dia_semana]})` : ""}
          </Label>
          <Input
            type="date"
            value={startDateVal}
            onChange={(e) => onSetDataInicial(t.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="h-8 text-sm"
          />
          {startDateVal &&
            t.dia_semana !== null &&
            getDay(new Date(startDateVal + "T12:00:00")) !== t.dia_semana && (
              <p className="text-xs text-destructive">A data deve ser {DIAS_SEMANA[t.dia_semana]}</p>
            )}
          {!startDateVal && (
            <p className="text-xs text-muted-foreground">
              Sem data → este tratamento será encaminhado para agendamento pelo coordenador.
            </p>
          )}
          {startDateVal && (
            <div className="space-y-1 pt-1">
              <Label className="text-xs">Horário da consulta *</Label>
              <Input
                type="time"
                value={horarioVal}
                onChange={(e) => onSetHorario(t.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="h-8 text-sm w-32"
              />
              {!horarioVal && (
                <p className="text-xs text-destructive">
                  Informe o horário da consulta ou remova a data para deixar o agendamento com o coordenador.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {!needsStartDate && isHolistico && isActive && (
        <div className="space-y-1">
          <Label className="text-xs">Horário da consulta *</Label>
          <Input
            type="time"
            value={horarioVal}
            onChange={(e) => onSetHorario(t.id, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="h-8 text-sm w-32"
          />
          {!horarioVal && (
            <p className="text-xs text-destructive">
              Informe o horário da consulta para este tratamento.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function TratamentosSection(props: Props) {
  const { tratamentos, totalAssigned } = props;
  const espirituais = tratamentos.filter((t) => t.tipo === "espiritual");
  const holisticos = tratamentos.filter((t) => t.tipo !== "espiritual");

  const renderGroup = (title: string, items: EntrevistaTipoTratamento[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((t) => (
            <TratamentoCard key={t.id} t={t} {...props} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            Tratamentos
          </CardTitle>
          {totalAssigned > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalAssigned} selecionado(s)
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {tratamentos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum tratamento ativo cadastrado
          </p>
        ) : (
          <>
            {renderGroup("Espirituais", espirituais)}
            {renderGroup("Holísticos", holisticos)}
          </>
        )}
      </CardContent>
    </Card>
  );
}
