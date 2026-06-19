import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bot, User, UserCog, SendHorizontal, CheckCircle2, Phone, AlertTriangle,
  Headphones, RotateCcw, BadgeCheck,
} from "lucide-react";
import {
  getConversaMensagens, responderConversa, assumirConversa, encerrarConversa,
  reabrirConversa, marcarConversaRevisada,
  type ConversaEnriquecida, type MensagemConversa,
} from "@/services/notificacoes/notificacoesService";
import { DanielAvatar } from "./DanielAvatar";
import { DanielTypingIndicator } from "./DanielTypingIndicator";
import { deveExibirDigitando } from "@/lib/danielChat";

const ORIGEM_LABEL: Record<string, string> = {
  ia: "IA", regra: "Regra automática", manual: "Manual",
};

function dt(value?: string | null) {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yy HH:mm", { locale: ptBR });
}

function AutorBadge({ autor }: { autor: MensagemConversa["autor"] }) {
  if (autor === "ia") return <Badge variant="secondary" className="gap-1 text-[10px]"><Bot className="h-3 w-3" /> IA</Badge>;
  if (autor === "humano") return <Badge variant="secondary" className="gap-1 text-[10px]"><UserCog className="h-3 w-3" /> Atendente</Badge>;
  if (autor === "sistema") return <Badge variant="outline" className="text-[10px]">Sistema</Badge>;
  return <Badge variant="outline" className="gap-1 text-[10px]"><User className="h-3 w-3" /> Assistido</Badge>;
}

interface Props {
  conversa: ConversaEnriquecida | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}

export function ConversaDetalheDrawer({ conversa, open, onOpenChange, onChanged }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [mensagens, setMensagens] = useState<MensagemConversa[]>([]);
  const [loading, setLoading] = useState(false);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    if (!conversa?.telefone) { setMensagens([]); return; }
    setLoading(true);
    try {
      setMensagens(await getConversaMensagens(conversa.telefone));
    } catch (e: any) {
      toast({ title: "Erro ao carregar conversa", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [conversa?.telefone, toast]);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensagens]);

  if (!conversa) return null;

  const encerrada = conversa.status_conversa === "encerrada";

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast({ title: ok });
      onChanged();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const enviar = async () => {
    const msg = texto.trim();
    if (!msg) return;
    setBusy("responder");
    try {
      const r = await responderConversa(conversa.id, msg);
      if (r.ok) {
        setTexto("");
        toast({ title: "Mensagem enviada" });
        await carregar();
        onChanged();
      } else {
        toast({ title: "Falha ao enviar", description: r.erro ?? "Erro no envio", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="p-5 pb-3">
          <SheetTitle className="flex items-center gap-2">
            {conversa.identificado ? conversa.assistido_nome || "Assistido" : "Contato não identificado"}
            {conversa.identificado
              ? <Badge variant="secondary" className="text-[10px]">Identificado</Badge>
              : <Badge variant="outline" className="gap-1 text-[10px]"><AlertTriangle className="h-3 w-3" /> Não identificado</Badge>}
          </SheetTitle>
          <SheetDescription className="flex flex-col gap-1 text-left">
            <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {conversa.telefone || "—"}</span>
            <span className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant={encerrada ? "secondary" : "default"} className="text-[10px]">{conversa.status_conversa}</Badge>
              {conversa.tem_handoff && (
                <Badge variant="outline" className="text-[10px]">Handoff: {conversa.handoff_status || "—"}</Badge>
              )}
              {conversa.handoff_origem && (
                <Badge variant="outline" className="text-[10px]">Origem: {ORIGEM_LABEL[conversa.handoff_origem] || conversa.handoff_origem}</Badge>
              )}
              {conversa.atendente_nome && <Badge variant="outline" className="text-[10px]">Atend.: {conversa.atendente_nome}</Badge>}
              {conversa.intencao && <Badge variant="outline" className="text-[10px]">IA: {conversa.intencao}</Badge>}
            </span>
            {conversa.handoff_motivo && (
              <span className="pt-1 text-xs"><strong>Motivo do handoff:</strong> {conversa.handoff_motivo}</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <Separator />

        <ScrollArea className="flex-1 px-5">
          <div className="py-4 space-y-3">
            {loading ? (
              <>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</>
            ) : mensagens.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma mensagem registrada nesta conversa.</p>
            ) : (
              mensagens.map((m) => (
                <div key={m.id} className={`flex flex-col gap-1 ${m.direcao === "entrada" ? "items-start" : "items-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.direcao === "entrada"
                      ? "bg-muted text-foreground rounded-tl-sm"
                      : m.autor === "humano"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : m.autor === "sistema"
                          ? "bg-accent text-accent-foreground rounded-tr-sm"
                          : "bg-secondary text-secondary-foreground rounded-tr-sm"
                  }`}>
                    {m.texto || <span className="italic opacity-70">(sem texto)</span>}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <AutorBadge autor={m.autor} />
                    <span>{dt(m.created_at)}</span>
                    {m.status === "falha" && <span className="text-destructive">falha no envio</span>}
                  </div>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>
        </ScrollArea>

        <Separator />

        <div className="p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            {!conversa.em_handoff && !encerrada && (
              <Button size="sm" variant="outline" disabled={!!busy || !user}
                onClick={() => user && run("assumir", () => assumirConversa(conversa.id, user.id), "Conversa assumida")}>
                <Headphones className="h-4 w-4 mr-1" /> Assumir
              </Button>
            )}
            {!encerrada ? (
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => run("encerrar", () => encerrarConversa(conversa.id), "Conversa encerrada")}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Encerrar
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={!!busy}
                onClick={() => run("reabrir", () => reabrirConversa(conversa.id), "Conversa reaberta")}>
                <RotateCcw className="h-4 w-4 mr-1" /> Reabrir
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={!!busy || !user}
              onClick={() => user && run("revisar", () => marcarConversaRevisada(conversa.id, user.id, true), "Conversa marcada como revisada")}>
              <BadgeCheck className="h-4 w-4 mr-1" /> Marcar revisada
            </Button>
          </div>
          <Textarea
            placeholder={encerrada ? "Conversa encerrada. Reabra para responder." : "Escreva uma resposta..."}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={encerrada || busy === "responder"}
            rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar(); }}
          />
          <div className="flex items-center justify-end">
            <Button size="sm" onClick={enviar} disabled={encerrada || busy === "responder" || !texto.trim()}>
              <SendHorizontal className="h-4 w-4 mr-1" /> {busy === "responder" ? "Enviando..." : "Responder"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
