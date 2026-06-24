import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Phone, Stethoscope, CalendarClock, CheckCircle2, Filter, X, AlertTriangle, CalendarPlus } from "lucide-react";
import {
  filtrarFila, ordenarFila, filaItemNome, filaItemTratamento,
  type FilaItem, type FilaFiltros, type FilaOrdenacao,
} from "@/services/notificacoes/notificacoesService";
import { ehEventoExcecao, ehMensagemManual } from "@/lib/notificacaoElegibilidade";
import { formatarDataBR } from "@/lib/notificacoes";

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  agendado: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  enviado: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  falha: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  cancelado: "bg-muted text-muted-foreground",
};

function dt(value?: string | null) {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yy HH:mm", { locale: ptBR });
}

const ORDER_LABEL: Record<FilaOrdenacao, string> = {
  previsao_proxima: "Previsão mais próxima",
  previsao_recente: "Previsão mais recente",
  enviado_recente: "Enviado mais recente",
  nome: "Nome (A-Z)",
  tratamento: "Tratamento (A-Z)",
};

interface FilaTabProps {
  fila: FilaItem[];
  onSelect: (f: FilaItem) => void;
}

const FILTROS_VAZIOS: FilaFiltros = { status: "todos" };

export function FilaTab({ fila, onSelect }: FilaTabProps) {
  const [filtros, setFiltros] = useState<FilaFiltros>(FILTROS_VAZIOS);
  const [ordenacao, setOrdenacao] = useState<FilaOrdenacao>("previsao_proxima");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const canais = useMemo(
    () => Array.from(new Set(fila.map((f) => f.canal).filter(Boolean))),
    [fila],
  );

  const resultado = useMemo(
    () => ordenarFila(filtrarFila(fila, filtros), ordenacao),
    [fila, filtros, ordenacao],
  );

  const set = (patch: Partial<FilaFiltros>) => setFiltros((p) => ({ ...p, ...patch }));
  const limpar = () => setFiltros(FILTROS_VAZIOS);
  const algumFiltro = Object.entries(filtros).some(
    ([k, v]) => v && !(k === "status" && v === "todos"),
  );

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
        <CardTitle className="text-base">Fila e mensagens enviadas</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filtros.status} onValueChange={(v) => set({ status: v })}>
            <SelectTrigger className="w-[160px] h-9" aria-label="Filtrar status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="enviado">Enviadas</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="agendado">Agendadas</SelectItem>
              <SelectItem value="falha">Falhas</SelectItem>
              <SelectItem value="cancelado">Canceladas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as FilaOrdenacao)}>
            <SelectTrigger className="w-[200px] h-9" aria-label="Ordenar"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ORDER_LABEL) as FilaOrdenacao[]).map((k) => (
                <SelectItem key={k} value={k}>{ORDER_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={mostrarFiltros ? "secondary" : "outline"}
            size="sm"
            onClick={() => setMostrarFiltros((v) => !v)}
          >
            <Filter className="h-4 w-4 mr-1" /> Filtros
          </Button>
        </div>
      </CardHeader>

      {mostrarFiltros && (
        <div className="px-6 pb-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 rounded-xl border bg-muted/20 p-3">
            <div>
              <label className="text-xs text-muted-foreground">Nome da pessoa</label>
              <Input value={filtros.nome ?? ""} onChange={(e) => set({ nome: e.target.value })} placeholder="Buscar nome" className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Telefone</label>
              <Input value={filtros.telefone ?? ""} onChange={(e) => set({ telefone: e.target.value })} placeholder="Buscar telefone" className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tratamento</label>
              <Input value={filtros.tratamento ?? ""} onChange={(e) => set({ tratamento: e.target.value })} placeholder="Buscar tratamento" className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Evento / template</label>
              <Input value={filtros.evento ?? ""} onChange={(e) => set({ evento: e.target.value })} placeholder="Ex.: sessao_lembrete" className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Canal</label>
              <Select value={filtros.canal ?? "todos"} onValueChange={(v) => set({ canal: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os canais</SelectItem>
                  {canais.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Previsão de</label>
                <Input type="date" value={filtros.previsaoDe ?? ""} onChange={(e) => set({ previsaoDe: e.target.value })} className="h-9" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Previsão até</label>
                <Input type="date" value={filtros.previsaoAte ?? ""} onChange={(e) => set({ previsaoAte: e.target.value })} className="h-9" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Enviado de</label>
                <Input type="date" value={filtros.envioDe ?? ""} onChange={(e) => set({ envioDe: e.target.value })} className="h-9" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Enviado até</label>
                <Input type="date" value={filtros.envioAte ?? ""} onChange={(e) => set({ envioAte: e.target.value })} className="h-9" />
              </div>
            </div>
            <div className="flex items-end">
              {algumFiltro && (
                <Button variant="ghost" size="sm" onClick={limpar}>
                  <X className="h-4 w-4 mr-1" /> Limpar filtros
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <CardContent>
        <p className="text-xs text-muted-foreground mb-2">{resultado.length} {resultado.length === 1 ? "mensagem" : "mensagens"}</p>
        {resultado.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum item nesta visão.</p>
        ) : (
          <div className="space-y-2">
            {resultado.map((f) => {
              const nome = filaItemNome(f);
              const tratamento = filaItemTratamento(f);
              const porExcecao = ehEventoExcecao(f.evento_origem);
              const p = (f.payload_json ?? {}) as Record<string, unknown>;
              const dataImpactada = typeof p.data_impactada === "string" ? p.data_impactada : null;
              const novaData = typeof p.nova_data === "string" ? p.nova_data : null;
              return (
                <button
                  key={f.id}
                  onClick={() => onSelect(f)}
                  className="w-full text-left rounded-xl border p-3 text-sm hover:bg-muted/40 transition-colors"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[f.status] || ""}`}>{f.status}</span>
                    <span className="font-medium text-foreground">{nome || f.telefone_normalizado || "Sem identificação"}</span>
                    {tratamento && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px]">
                        <Stethoscope className="h-3 w-3" /> {tratamento}
                      </span>
                    )}
                    {porExcecao && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 px-2 py-0.5 text-[10px]">
                        <AlertTriangle className="h-3 w-3" /> Gerado por exceção operacional
                      </span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarClock className="h-3 w-3" /> Previsão: {dt(f.scheduled_at)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{f.evento_origem}</span>
                    {f.template_codigo && <span>{f.template_codigo}</span>}
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {f.telefone_normalizado || "sem telefone"}</span>
                    {dataImpactada && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" /> Impactada: {formatarDataBR(dataImpactada)}
                      </span>
                    )}
                    {novaData && (
                      <span className="inline-flex items-center gap-1 text-foreground/80">
                        <CalendarPlus className="h-3 w-3" /> Nova data: {formatarDataBR(novaData)}
                      </span>
                    )}
                    {f.status === "enviado" && (
                      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3" /> Enviado em: {dt(f.sent_at)}
                      </span>
                    )}
                  </div>
                  {f.erro && <p className="mt-1 text-xs text-destructive">{f.erro}</p>}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
