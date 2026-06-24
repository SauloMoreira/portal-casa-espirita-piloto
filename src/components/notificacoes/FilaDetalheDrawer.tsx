import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, MessageSquare, CheckCircle2, AlertTriangle, Hash, Clock, Send, UserX, ShieldCheck,
} from "lucide-react";
import {
  getFilaItemDetalhe, encerrarItemFilaErroCadastro,
  type FilaItem, type FilaItemDetalhe,
} from "@/services/notificacoes/notificacoesService";
import { rotuloMotivo, podeEncerrarPorErroCadastro } from "@/lib/notificacaoElegibilidade";


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
  /** Chamado após uma ação que altera o item (ex.: encerramento manual). */
  onChanged?: () => void;
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

export function FilaDetalheDrawer({ item, open, onOpenChange, onChanged }: Props) {
  const { toast } = useToast();
  const { roles } = useAuth();
  const [detalhe, setDetalhe] = useState<FilaItemDetalhe | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [encerrando, setEncerrando] = useState(false);

  const isAdmin = roles.includes("admin") || roles.includes("administrador_master");
  const podeEncerrar =
    !!item && isAdmin && podeEncerrarPorErroCadastro({ status: item.status, erro: item.erro });

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

  useEffect(() => { if (open) { carregar(); setObservacao(""); } }, [open, carregar]);

  const handleEncerrar = useCallback(async () => {
    if (!item) return;
    setEncerrando(true);
    try {
      await encerrarItemFilaErroCadastro(item.id, observacao);
      toast({
        title: "Item encerrado",
        description: "Apenas esta notificação foi encerrada. O assistido não foi bloqueado.",
      });
      setConfirmOpen(false);
      onOpenChange(false);
      onChanged?.();
    } catch (e: any) {
      const msg = e?.message?.includes("permissao_negada")
        ? "Você não tem permissão para esta ação."
        : e?.message?.includes("motivo_nao_elegivel")
        ? "Este item não é elegível (não é um erro de cadastro)."
        : e?.message ?? "Erro ao encerrar item.";
      toast({ title: "Não foi possível encerrar", description: msg, variant: "destructive" });
    } finally {
      setEncerrando(false);
    }
  }, [item, observacao, toast, onOpenChange, onChanged]);

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
            {/* Banner de invalidação/cancelamento (transparência ao admin) */}
            {item.status === "cancelado" && item.erro && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                <div>
                  <p className="font-medium text-destructive">Lembrete não enviado</p>
                  <p className="text-muted-foreground">
                    Motivo: {rotuloMotivo(item.erro)}
                  </p>
                </div>
              </div>
            )}

            {/* Detalhe de encerramento manual por erro de cadastro (auditoria visível) */}
            {item.erro === "erro_cadastro" && item.payload_json?.encerramento && (() => {
              const e = item.payload_json!.encerramento as Record<string, any>;
              return (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
                  <ShieldCheck className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="font-medium text-amber-700 dark:text-amber-300">
                      Item encerrado manualmente (erro de cadastro)
                    </p>
                    <p className="text-muted-foreground">
                      O assistido <strong>não foi bloqueado</strong>. Futuras mensagens continuam possíveis.
                    </p>
                    {e.motivo_anterior && (
                      <p className="text-muted-foreground">Motivo original: {rotuloMotivo(e.motivo_anterior)}</p>
                    )}
                    <p className="text-muted-foreground">Origem: central de notificações (ação manual)</p>
                    {e.encerrado_em && <p className="text-muted-foreground">Quando: {dt(e.encerrado_em)}</p>}
                    {e.observacao && <p className="text-muted-foreground">Observação: {e.observacao}</p>}
                  </div>
                </div>
              );
            })()}

            {/* Ação: Encerrar item com erro de cadastro (somente admin e itens elegíveis) */}
            {podeEncerrar && (
              <div className="rounded-xl border border-amber-300/40 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
                <div className="flex items-start gap-2 text-sm">
                  <UserX className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div>
                    <p className="font-medium">Erro de cadastro nesta notificação</p>
                    <p className="text-muted-foreground">
                      Motivo: {rotuloMotivo(item.erro)}. Você pode encerrar apenas esta ocorrência sem bloquear o assistido.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  onClick={() => setConfirmOpen(true)}
                >
                  <UserX className="h-4 w-4 mr-1" /> Encerrar item com erro de cadastro
                </Button>
              </div>
            )}

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
                <InfoRow icon={AlertTriangle} label="Motivo">
                  <span className="text-destructive">{rotuloMotivo(item.erro)}</span>
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
                      {l.erro && <p className="text-destructive">Motivo: {rotuloMotivo(l.erro)}</p>}
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
