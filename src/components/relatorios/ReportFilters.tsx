import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface FilterValues {
  dataInicio: string;
  dataFim: string;
  tratamentoId: string;
  tipoTratamento: string;
  assistidoId: string;
  tarefeiroId: string;
  coordenadorId: string;
  entrevistadorId: string;
  status: string;
  tipoEntrevista: string;
}

interface Option { id: string; nome: string; }

interface Props {
  values: FilterValues;
  onChange: (v: FilterValues) => void;
  show?: Array<keyof FilterValues>;
}

const defaultStart = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split("T")[0];
};

export const defaultFilters = (): FilterValues => ({
  dataInicio: defaultStart(),
  dataFim: new Date().toISOString().split("T")[0],
  tratamentoId: "todos",
  tipoTratamento: "todos",
  assistidoId: "todos",
  tarefeiroId: "todos",
  coordenadorId: "todos",
  entrevistadorId: "todos",
  status: "todos",
  tipoEntrevista: "todos",
});

export default function ReportFilters({ values, onChange, show = [] }: Props) {
  const [tratamentos, setTratamentos] = useState<Option[]>([]);
  const [tiposTratamento, setTiposTratamento] = useState<string[]>([]);
  const [assistidos, setAssistidos] = useState<Option[]>([]);
  const [tarefeiros, setTarefeiros] = useState<Option[]>([]);
  const [coordenadores, setCoordenadores] = useState<Option[]>([]);
  const [entrevistadores, setEntrevistadores] = useState<Option[]>([]);

  useEffect(() => {
    const load = async () => {
      const promises: PromiseLike<void>[] = [];

      if (show.includes("tratamentoId") || show.includes("tipoTratamento")) {
        promises.push(
          supabase.from("tipos_tratamento").select("id, nome, tipo").order("nome").then(({ data }) => {
            setTratamentos((data || []).map((t: any) => ({ id: t.id, nome: t.nome })));
            setTiposTratamento([...new Set((data || []).map((t: any) => t.tipo as string).filter(Boolean))]);
          })
        );
      }
      if (show.includes("assistidoId")) {
        promises.push(
          supabase.from("assistidos").select("id, nome").is("deleted_at", null).order("nome").then(({ data }) => {
            setAssistidos((data || []).map((a) => ({ id: a.id, nome: a.nome })));
          })
        );
      }
      if (show.includes("tarefeiroId")) {
        promises.push(
          supabase.from("tipos_tratamento").select("tarefeiro_id").not("tarefeiro_id", "is", null).then(async ({ data }) => {
            const ids = [...new Set((data || []).map((t) => t.tarefeiro_id).filter(Boolean))] as string[];
            if (ids.length > 0) {
              const { data: profiles } = await supabase.rpc("staff_names", { _ids: ids });
              setTarefeiros((profiles || []).map((p) => ({ id: p.user_id, nome: p.nome_completo || "Sem nome" })));
            }
          })
        );
      }
      if (show.includes("coordenadorId")) {
        promises.push(
          supabase.from("coordenacao_tratamento").select("coordenador_id").then(async ({ data }) => {
            const ids = [...new Set((data || []).map((t) => t.coordenador_id).filter(Boolean))] as string[];
            if (ids.length > 0) {
              const { data: profiles } = await supabase.rpc("staff_names", { _ids: ids });
              setCoordenadores((profiles || []).map((p) => ({ id: p.user_id, nome: p.nome_completo || "Sem nome" })));
            }
          })
        );
      }
      if (show.includes("entrevistadorId")) {
        promises.push(
          supabase.from("user_roles").select("user_id").eq("role", "entrevistador").then(async ({ data }) => {
            const ids = (data || []).map((r) => r.user_id);
            if (ids.length > 0) {
              const { data: profiles } = await supabase.rpc("staff_names", { _ids: ids });
              setEntrevistadores((profiles || []).map((p) => ({ id: p.user_id, nome: p.nome_completo || "Sem nome" })));
            }
          })
        );
      }

      await Promise.all(promises);
    };
    load();
  }, []);

  const set = (key: keyof FilterValues, val: string) => onChange({ ...values, [key]: val });

  const visible = (key: keyof FilterValues) => show.length === 0 || show.includes(key);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {visible("dataInicio") && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Data Início</Label>
          <Input type="date" value={values.dataInicio} onChange={(e) => set("dataInicio", e.target.value)} />
        </div>
      )}
      {visible("dataFim") && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Data Fim</Label>
          <Input type="date" value={values.dataFim} onChange={(e) => set("dataFim", e.target.value)} />
        </div>
      )}
      {visible("tratamentoId") && tratamentos.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tratamento</Label>
          <Select value={values.tratamentoId} onValueChange={(v) => set("tratamentoId", v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {tratamentos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {visible("assistidoId") && assistidos.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Assistido</Label>
          <Select value={values.assistidoId} onValueChange={(v) => set("assistidoId", v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {assistidos.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {visible("tarefeiroId") && tarefeiros.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tarefeiro</Label>
          <Select value={values.tarefeiroId} onValueChange={(v) => set("tarefeiroId", v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {tarefeiros.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {visible("coordenadorId") && coordenadores.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Coordenador</Label>
          <Select value={values.coordenadorId} onValueChange={(v) => set("coordenadorId", v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {coordenadores.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {visible("entrevistadorId") && entrevistadores.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Entrevistador</Label>
          <Select value={values.entrevistadorId} onValueChange={(v) => set("entrevistadorId", v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {entrevistadores.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {visible("tipoTratamento") && tiposTratamento.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo Tratamento</Label>
          <Select value={values.tipoTratamento} onValueChange={(v) => set("tipoTratamento", v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {tiposTratamento.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {visible("status") && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={values.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="aguardando_inicio">Aguardando Início</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
              <SelectItem value="suspenso">Suspenso</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {visible("tipoEntrevista") && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo Entrevista</Label>
          <Select value={values.tipoEntrevista} onValueChange={(v) => set("tipoEntrevista", v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="regular">Regular</SelectItem>
              <SelectItem value="retorno">Retorno</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}