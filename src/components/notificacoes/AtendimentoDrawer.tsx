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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, User, UserCog, SendHorizontal, CheckCircle2, Link2, Phone, AlertTriangle } from "lucide-react";
import {
  getConversaMensagens, responderConversa, fecharHandoff, vincularAssistidoConversa,
  type HandoffEnriquecido, type MensagemConversa,
} from "@/services/notificacoes/notificacoesService";
import { DanielAvatar } from "./DanielAvatar";

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
  handoff: HandoffEnriquecido | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}

export function AtendimentoDrawer({ handoff, open, onOpenChange, onChanged }: Props) {
  const { toast } = useToast();
  const [mensagens, setMensagens] = useState<MensagemConversa[]>([]);
  const [loading, setLoading] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [fechando, setFechando] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    if (!handoff?.telefone) { setMensagens([]); return; }
    setLoading(true);
    try {
      setMensagens(await getConversaMensagens(handoff.telefone));
    } catch (e: any) {
      toast({ title: "Erro ao carregar conversa", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [handoff?.telefone, toast]);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensagens]);

  if (!handoff) return null;

  const fechado = handoff.status === "fechado";

  const enviar = async () => {
    const msg = texto.trim();
    if (!msg) return;
    setEnviando(true);
    try {
      const r = await responderConversa(handoff.conversa_id, msg);
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
      setEnviando(false);
    }
  };

  const encerrar = async () => {
    setFechando(true);
    try {
      await fecharHandoff(handoff.id, handoff.conversa_id);
      toast({ title: "Atendimento encerrado" });
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao encerrar", description: e.message, variant: "destructive" });
    } finally {
      setFechando(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="p-5 pb-3">
          <SheetTitle className="flex items-center gap-2">
            {handoff.identificado ? handoff.assistido_nome || "Assistido" : "Contato não identificado"}
            {handoff.identificado
              ? <Badge variant="secondary" className="text-[10px]">Identificado</Badge>
              : <Badge variant="outline" className="gap-1 text-[10px]"><AlertTriangle className="h-3 w-3" /> Não identificado</Badge>}
          </SheetTitle>
          <SheetDescription className="flex flex-col gap-1 text-left">
            <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {handoff.telefone || "—"}</span>
            <span className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant={fechado ? "secondary" : "destructive"} className="text-[10px]">{handoff.status}</Badge>
              <Badge variant="outline" className="text-[10px]">Origem: {ORIGEM_LABEL[handoff.origem] || handoff.origem}</Badge>
              {handoff.atendente_nome && <Badge variant="outline" className="text-[10px]">Atend.: {handoff.atendente_nome}</Badge>}
            </span>
            <span className="pt-1 text-xs"><strong>Motivo:</strong> {handoff.motivo || "—"}</span>
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
              mensagens.map((m) => {
                const ehDaniel = m.direcao !== "entrada" && m.autor === "ia";
                return (
                <div key={m.id} className={`flex gap-2 ${m.direcao === "entrada" ? "justify-start" : "justify-end"}`}>
                  {ehDaniel && <DanielAvatar size={28} className="mt-0.5" />}
                  <div className={`flex flex-col gap-1 ${m.direcao === "entrada" ? "items-start" : "items-end"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      m.direcao === "entrada"
                        ? "bg-muted text-foreground rounded-tl-sm"
                        : m.autor === "humano"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
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
                </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>
        </ScrollArea>

        <Separator />

        <div className="p-4 space-y-2">
          {!handoff.identificado && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" /> Contato sem assistido vinculado. Vincule pelo cadastro do assistido (telefone {handoff.telefone}).
            </p>
          )}
          <Textarea
            placeholder={fechado ? "Atendimento encerrado." : "Escreva uma resposta..."}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={fechado || enviando}
            rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar(); }}
          />
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={encerrar} disabled={fechado || fechando}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> {fechando ? "Encerrando..." : "Encerrar"}
            </Button>
            <Button size="sm" onClick={enviar} disabled={fechado || enviando || !texto.trim()}>
              <SendHorizontal className="h-4 w-4 mr-1" /> {enviando ? "Enviando..." : "Responder"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
