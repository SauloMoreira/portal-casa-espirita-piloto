import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, RefreshCw, MessageSquare, ListChecks, Headphones, BarChart3 } from "lucide-react";
import { PainelWhatsapp } from "@/components/notificacoes/PainelWhatsapp";
import { AlertaCentralCard } from "@/components/notificacoes/AlertaCentralCard";
import { AtendimentoDrawer } from "@/components/notificacoes/AtendimentoDrawer";
import { ConversasTab } from "@/components/notificacoes/ConversasTab";
import {
  listFila, listConversas, listHandoffsEnriquecidos, assumirHandoff, fecharHandoff, processarFila,
  type FilaItem, type Conversa, type HandoffEnriquecido,
} from "@/services/notificacoes/notificacoesService";

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  agendado: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  enviado: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  falha: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  cancelado: "bg-muted text-muted-foreground",
};

const HANDOFF_COLORS: Record<string, string> = {
  aberto: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  em_atendimento: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  fechado: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

const ORIGEM_LABEL: Record<string, string> = {
  ia: "IA", regra: "Regra", manual: "Manual",
};

function dt(value?: string | null) {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yy HH:mm", { locale: ptBR });
}

export default function CentralNotificacoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fila, setFila] = useState<FilaItem[]>([]);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [handoffs, setHandoffs] = useState<HandoffEnriquecido[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selecionado, setSelecionado] = useState<HandoffEnriquecido | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, c, h] = await Promise.all([listFila(), listConversas(), listHandoffsEnriquecidos()]);
      setFila(f); setConversas(c); setHandoffs(h);
      setSelecionado((prev) => (prev ? h.find((x) => x.id === prev.id) ?? prev : prev));
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleProcessar = async () => {
    setProcessing(true);
    try {
      const r: any = await processarFila();
      toast({ title: "Fila processada", description: `Enviados: ${r?.enviados ?? 0} · Falhas: ${r?.falhas ?? 0} · Ignorados: ${r?.ignorados ?? 0}` });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao processar fila", description: e.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const abrirDetalhe = (h: HandoffEnriquecido) => {
    setSelecionado(h);
    setDrawerOpen(true);
  };

  const handleAssumir = async (h: HandoffEnriquecido) => {
    if (!user) return;
    try {
      await assumirHandoff(h.id, user.id, h.conversa_id);
      toast({ title: "Atendimento assumido" });
      await load();
      setSelecionado({ ...h, status: "em_atendimento", atendente_id: user.id });
      setDrawerOpen(true);
    } catch (e: any) {
      toast({ title: "Erro ao assumir", description: e.message, variant: "destructive" });
    }
  };

  const handleFechar = async (h: HandoffEnriquecido) => {
    try {
      await fecharHandoff(h.id, h.conversa_id);
      toast({ title: "Atendimento encerrado" });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao encerrar", description: e.message, variant: "destructive" });
    }
  };

  const handoffsAbertos = handoffs.filter((h) => h.status !== "fechado").length;

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Central de Notificações</h1>
          <p className="text-sm text-muted-foreground mt-1">Mensagens operacionais por WhatsApp, conversas e atendimentos.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={handleProcessar} disabled={processing}>
            <Send className="h-4 w-4 mr-1" /> {processing ? "Processando..." : "Processar fila"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="painel">
        <TabsList>
          <TabsTrigger value="painel"><BarChart3 className="h-4 w-4 mr-1" /> Painel</TabsTrigger>
          <TabsTrigger value="fila"><ListChecks className="h-4 w-4 mr-1" /> Fila</TabsTrigger>
          <TabsTrigger value="conversas"><MessageSquare className="h-4 w-4 mr-1" /> Conversas</TabsTrigger>
          <TabsTrigger value="handoffs">
            <Headphones className="h-4 w-4 mr-1" /> Atendimentos
            {handoffsAbertos > 0 && <Badge variant="secondary" className="ml-1">{handoffsAbertos}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="painel" className="mt-4">
          <PainelWhatsapp />
        </TabsContent>



        <TabsContent value="fila" className="mt-4">
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Fila de envio</CardTitle></CardHeader>
            <CardContent>
              {fila.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum item na fila.</p>
              ) : (
                <div className="space-y-2">
                  {fila.map((f) => (
                    <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[f.status] || ""}`}>{f.status}</span>
                      <span className="font-medium">{f.evento_origem}</span>
                      <span className="text-muted-foreground">{f.template_codigo}</span>
                      <span className="text-muted-foreground">· {f.telefone_normalizado || "sem telefone"}</span>
                      <span className="ml-auto text-xs text-muted-foreground">agendado: {dt(f.scheduled_at)}</span>
                      {f.sent_at && <span className="text-xs text-muted-foreground">enviado: {dt(f.sent_at)}</span>}
                      {f.erro && <span className="text-xs text-destructive">{f.erro}</span>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversas" className="mt-4">
          <ConversasTab />
        </TabsContent>

        <TabsContent value="handoffs" className="mt-4">
          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Atendimentos (handoff)</CardTitle></CardHeader>
            <CardContent>
              {handoffs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum atendimento.</p>
              ) : (
                <div className="space-y-2">
                  {handoffs.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => abrirDetalhe(h)}
                      className="w-full text-left rounded-xl border p-3 text-sm hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${HANDOFF_COLORS[h.status] || ""}`}>{h.status}</span>
                        <span className="font-medium">
                          {h.identificado ? (h.assistido_nome || "Assistido") : "Não identificado"}
                        </span>
                        {h.identificado
                          ? <Badge variant="secondary" className="text-[10px]">Identificado</Badge>
                          : <Badge variant="outline" className="text-[10px]">Não identificado</Badge>}
                        <Badge variant="outline" className="text-[10px]">{ORIGEM_LABEL[h.origem] || h.origem}</Badge>
                        <span className="ml-auto text-xs text-muted-foreground">aberto: {dt(h.opened_at)}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{h.telefone || "sem telefone"}</span>
                        {h.atendente_nome && <span>· Atend.: {h.atendente_nome}</span>}
                        <span>· Motivo: {h.motivo || "—"}</span>
                      </div>
                      {h.ultima_mensagem && (
                        <p className="mt-1.5 text-xs text-foreground/80 line-clamp-2">
                          <span className="text-muted-foreground">Última: </span>“{h.ultima_mensagem}”
                          <span className="text-muted-foreground"> · {dt(h.ultimo_contato_em)}</span>
                        </p>
                      )}
                      <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {h.status === "aberto" && (
                          <Button size="sm" variant="outline" onClick={() => handleAssumir(h)}>Assumir</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => abrirDetalhe(h)}>Abrir conversa</Button>
                        {h.status !== "fechado" && (
                          <Button size="sm" onClick={() => handleFechar(h)}>Encerrar</Button>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AtendimentoDrawer
        handoff={selecionado}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onChanged={load}
      />
    </div>
  );
}
