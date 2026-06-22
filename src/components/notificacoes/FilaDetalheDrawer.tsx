import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, MessageSquare, CheckCircle2, AlertTriangle, Hash, Clock, Send,
} from "lucide-react";
import {
  getFilaItemDetalhe,
  type FilaItem, type FilaItemDetalhe,
} from "@/services/notificacoes/notificacoesService";

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

interface Props {
  item: FilaItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function InfoRow({ icon: Icon, label, children }: { icon: any; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground min-w-[110px]">{label}</span>
      <span className="font-medium break-all text-right ml-auto">{children}</span>
    </div>
  );
}

export function FilaDetalheDrawer({ item, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [detalhe, setDetalhe] = useState<FilaItemDetalhe | null>(null);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    if (!item) return;
    setLoading(true);
    try {
      setDetalhe(await getFilaItemDetalhe(item));
    } catch (e: any) {
      toast({ title: "Erro ao carregar detalhe", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [item, toast]);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);

  if (!item) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="p-5 pb-3">
          <SheetTitle className="flex items-center gap-2">
            {detalhe?.assistido_nome || "Mensagem"}
            <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[item.status] || ""}`}>
              {item.status}
            </span>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-1.5 text-left">
            <Phone className="h-3.5 w-3.5" /> {item.telefone_normalizado || "sem telefone"}
          </SheetDescription>
        </SheetHeader>

        <Separator />

        <ScrollArea className="flex-1 px-5">
          <div className="py-4 space-y-5">
            {/* Dados do envio */}
            <div className="space-y-2 rounded-xl border p-3">
              <InfoRow icon={Send} label="Evento">{item.evento_origem}</InfoRow>
              <InfoRow icon={MessageSquare} label="Template">{item.template_codigo || "—"}</InfoRow>
              <InfoRow icon={Send} label="Canal">{item.canal}</InfoRow>
              <InfoRow icon={Clock} label="Agendado">{dt(item.scheduled_at)}</InfoRow>
              <InfoRow icon={CheckCircle2} label="Enviado em">{dt(item.sent_at)}</InfoRow>
              <InfoRow icon={Hash} label="ID externo">{item.external_message_id || "—"}</InfoRow>
              <InfoRow icon={AlertTriangle} label="Tentativas">{item.retry_count}</InfoRow>
              {item.erro && (
                <InfoRow icon={AlertTriangle} label="Erro">
                  <span className="text-destructive">{item.erro}</span>
                </InfoRow>
              )}
            </div>

            {/* Conteúdo enviado */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Mensagem enviada
              </h3>
              {loading ? (
                <Skeleton className="h-16 rounded-lg" />
              ) : detalhe?.mensagem_enviada ? (
                <div className="rounded-2xl rounded-tr-sm bg-secondary text-secondary-foreground px-3 py-2 text-sm whitespace-pre-wrap">
                  {detalhe.mensagem_enviada}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  {item.status === "enviado"
                    ? "Conteúdo não registrado no log."
                    : "Ainda não enviada."}
                </p>
              )}
            </div>

            {/* Trilha do log */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Histórico técnico (log)
              </h3>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
                </div>
              ) : !detalhe || detalhe.logs.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Sem registros de log para este item.</p>
              ) : (
                <div className="space-y-2">
                  {detalhe.logs.map((l) => (
                    <div key={l.id} className="rounded-xl border p-3 text-xs space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={l.direcao === "saida" ? "default" : "secondary"} className="text-[10px]">
                          {l.direcao === "saida" ? "Saída" : "Entrada"}
                        </Badge>
                        {l.status && (
                          <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[l.status] || "bg-muted text-muted-foreground"}`}>
                            {l.status}
                          </span>
                        )}
                        <span className="ml-auto text-muted-foreground">{dt(l.created_at)}</span>
                      </div>
                      {l.mensagem && <p className="text-foreground/80 whitespace-pre-wrap">{l.mensagem}</p>}
                      {l.external_message_id && (
                        <p className="text-muted-foreground">ID externo: {l.external_message_id}</p>
                      )}
                      {l.erro && <p className="text-destructive">Erro: {l.erro}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
