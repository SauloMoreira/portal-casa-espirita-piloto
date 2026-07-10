import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";


import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrCode, Plus, Users, Search, UserPlus, Maximize2, Sparkles, Clock, ChevronRight, CheckCircle2, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { withRetry, isTransientError } from "@/lib/resilience";
import { contarNovos, modoLabel, checkinUrl } from "@/lib/sessoesPublicas";
import { useInstituicaoAtiva } from "@/contexts/InstituicaoContext";
import { toFriendlyError, formatSupportDetails, TENANT_AUSENTE_ERROR } from "@/lib/supabaseFriendlyErrors";
import { abrirChamadoTecnico } from "@/lib/abrirChamadoTecnico";
import { ToastAction } from "@/components/ui/toast";


interface TratamentoPublico {
  id: string;
  nome: string;
}

interface Sessao {
  id: string;
  tratamento_id: string;
  data_sessao: string;
  token: string;
  status: string;
  total_presentes: number;
  horario_inicio: string | null;
  horario_fim: string | null;
  local: string | null;
  capacidade: number | null;
  observacoes: string | null;
  tipos_tratamento?: { nome: string } | null;
}

type NovaSessaoForm = {
  tratamento_id: string;
  data_sessao: string;
  horario_inicio: string;
  horario_fim: string;
  local: string;
  capacidade: string;
  observacoes: string;
  status: "agendada" | "aberta" | "encerrada" | "cancelada";
};

const hojeISO = () => format(new Date(), "yyyy-MM-dd");
const statusPadraoParaData = (data: string): NovaSessaoForm["status"] =>
  data === hojeISO() ? "aberta" : data > hojeISO() ? "agendada" : "encerrada";

const novaSessaoInicial = (): NovaSessaoForm => {
  const data = hojeISO();
  return {
    tratamento_id: "",
    data_sessao: data,
    horario_inicio: "",
    horario_fim: "",
    local: "",
    capacidade: "",
    observacoes: "",
    status: statusPadraoParaData(data),
  };
};

interface Checkin {
  id: string;
  assistido_id: string | null;
  nome_participante: string | null;
  celular: string | null;
  faixa_etaria: string | null;
  modo_checkin: string;
  cadastro_rapido: boolean;
  checkin_at: string;
  assistidos?: { nome: string } | null;
}

export default function SessoesPublicas() {
  const [tratamentos, setTratamentos] = useState<TratamentoPublico[]>([]);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [selectedSessao, setSelectedSessao] = useState<Sessao | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [showQr, setShowQr] = useState(false);
  const [qrFull, setQrFull] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showNovaSessao, setShowNovaSessao] = useState(false);
  const [novaSessao, setNovaSessao] = useState<NovaSessaoForm>(novaSessaoInicial());
  const [salvandoSessao, setSalvandoSessao] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState<any[]>([]);
  const [quickForm, setQuickForm] = useState({ nome: "", celular: "", faixa_etaria: "" });
  const [assistidoSelecionado, setAssistidoSelecionado] = useState<{ id: string; nome: string; celular: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [pulse, setPulse] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    fetchTratamentos();
    fetchSessoes();
  }, []);

  // Realtime: contador e lista de presentes atualizam ao vivo na sessão aberta.
  useEffect(() => {
    selectedIdRef.current = selectedSessao?.id ?? null;
    if (!selectedSessao) return;
    const sessaoId = selectedSessao.id;

    const channel = supabase
      .channel(`sessao-${sessaoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "checkins_publicos", filter: `sessao_id=eq.${sessaoId}` },
        () => {
          if (selectedIdRef.current === sessaoId) {
            refreshCheckins(sessaoId);
            setPulse(true);
            setTimeout(() => setPulse(false), 700);
          }
        },
      )
      // Note: sessoes_publicas is intentionally NOT subscribed via realtime — its
      // rows contain the secret QR check-in token, so the table is no longer
      // broadcast. Live counts are derived from the checkins_publicos channel above.
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedSessao?.id]);

  const fetchTratamentos = async () => {
    const { data } = await supabase
      .from("tipos_tratamento")
      .select("id, nome")
      .eq("trabalho_publico", true)
      .eq("status", "ativo")
      .order("nome");
    if (data) setTratamentos(data);
  };

  const fetchSessoes = async () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const { data } = await supabase
      .from("sessoes_publicas")
      .select("*, tipos_tratamento:tratamento_id(nome)")
      .gte("data_sessao", today)
      .order("data_sessao", { ascending: true }) as any;
    if (data) setSessoes(data);
  };

  const { selectedInstituicaoId } = useInstituicaoAtiva();

  const criarSessaoHoje = async (tratamentoId: string) => {
    // SAAS-06-C1-FIX09 — fail-closed: sem instituição ativa, não persiste.
    // Também valida contra o espelho `currentTenant` (defesa em profundidade).
    try {
      requireInstituicaoId();
    } catch {
      toast({ title: TENANT_AUSENTE_ERROR.message, variant: "destructive" });
      return;
    }
    if (!selectedInstituicaoId) {
      toast({ title: TENANT_AUSENTE_ERROR.message, variant: "destructive" });
      return;
    }


    const today = format(new Date(), "yyyy-MM-dd");
    const { data: existing } = await supabase
      .from("sessoes_publicas")
      .select("id")
      .eq("tratamento_id", tratamentoId)
      .eq("data_sessao", today)
      .eq("instituicao_id", selectedInstituicaoId)
      .maybeSingle();

    if (existing) {
      toast({ title: "Sessão já existe para hoje", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("sessoes_publicas").insert({
      tratamento_id: tratamentoId,
      data_sessao: today,
      criado_por: user?.id,
      instituicao_id: selectedInstituicaoId,
    });

    if (error) {
      const friendly = toFriendlyError(error, {
        operacao: "criar_sessao_publica",
        entidade: "sessoes_publicas",
        acao: "INSERT",
        instituicaoId: selectedInstituicaoId,
      });
      console.error("[sessoes_publicas:create]", friendly.code, friendly.raw);
      toast({
        title: friendly.message,
        description: `Detalhes técnicos para suporte:\n${formatSupportDetails(friendly)}`,
        variant: "destructive",
        action: (
          <ToastAction
            altText="Abrir chamado técnico"
            onClick={async () => {
              const { copiado } = await abrirChamadoTecnico({
                origem: "Sessões Públicas",
                friendly,
                instituicaoId: selectedInstituicaoId,
                userId: user?.id ?? null,
              });
              toast({
                title: copiado
                  ? "Detalhes do chamado copiados"
                  : "Detalhes do chamado prontos",
                description: copiado
                  ? "Cole em um chamado ou envie ao administrador geral da plataforma."
                  : "Copie os detalhes técnicos exibidos e envie ao administrador geral da plataforma.",
              });
            }}
          >
            Abrir chamado técnico
          </ToastAction>
        ),
      });
    } else {
      toast({ title: "Sessão criada com sucesso" });
      fetchSessoes();
    }
  };


  const refreshCheckins = async (sessaoId: string) => {
    const { data } = await supabase
      .from("checkins_publicos")
      .select("*, assistidos:assistido_id(nome)")
      .eq("sessao_id", sessaoId)
      .order("checkin_at", { ascending: false }) as any;
    if (data) setCheckins(data);
  };

  const openSessao = async (sessao: Sessao) => {
    setSelectedSessao(sessao);
    await refreshCheckins(sessao.id);
  };

  const searchAssistido = async (term?: string) => {
    const q = (term ?? manualSearch).trim();
    if (!q) {
      setManualResults([]);
      return;
    }
    const { data } = await supabase
      .from("assistidos")
      .select("id, nome, celular")
      .or(`nome.ilike.%${q}%,celular.ilike.%${q}%`)
      .limit(10);
    setManualResults(data || []);
  };

  // Busca rápida com debounce para uso em campo (poucos toques).
  useEffect(() => {
    if (!showManual) return;
    const t = setTimeout(() => searchAssistido(manualSearch), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualSearch, showManual]);

  const registrarManual = async (assistidoId: string) => {
    if (!selectedSessao) return;
    setLoading(true);
    try {
      await withRetry(
        async () => {
          const { error } = await supabase.from("checkins_publicos").insert({
            sessao_id: selectedSessao.id,
            assistido_id: assistidoId,
            modo_checkin: "manual",
            registrado_por: user?.id,
          });
          if (error) throw error;
        },
        { shouldRetry: (e) => isTransientError(e) },
      );
      toast({ title: "Presença registrada" });
      refreshCheckins(selectedSessao.id);
      setManualSearch("");
      setManualResults([]);
      setAssistidoSelecionado(null);
    } catch (error: any) {
      const dup = (error?.message || "").includes("duplicate");
      toast({ title: dup ? "Presença já registrada" : "Erro", description: error?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const registrarCadastroRapido = async () => {
    if (!selectedSessao || !quickForm.nome.trim()) return;
    setLoading(true);
    try {
      await withRetry(
        async () => {
          const { error } = await supabase.from("checkins_publicos").insert({
            sessao_id: selectedSessao.id,
            nome_participante: quickForm.nome.trim(),
            celular: quickForm.celular || null,
            faixa_etaria: quickForm.faixa_etaria || null,
            modo_checkin: "manual",
            cadastro_rapido: true,
            registrado_por: user?.id,
          });
          if (error) throw error;
        },
        { shouldRetry: (e) => isTransientError(e) },
      );
      toast({ title: "Presença registrada (cadastro rápido)" });
      refreshCheckins(selectedSessao.id);
      setQuickForm({ nome: "", celular: "", faixa_etaria: "" });
    } catch (error: any) {
      toast({ title: "Erro", description: error?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const qrUrl = checkinUrl(window.location.origin, selectedSessao?.token);

  const novos = useMemo(() => contarNovos(checkins), [checkins]);
  const sessaoNome = (s?: Sessao | null) => (s as any)?.tipos_tratamento?.nome || "—";

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Sessões Públicas</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie sessões de trabalhos públicos e controle de presença</p>
      </div>

      {/* Quick create sessions for today */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Criar Sessão para Hoje</CardTitle>
        </CardHeader>
        <CardContent>
          {tratamentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum trabalho configurado como público. Configure em Gestão de Tratamentos.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tratamentos.map((t) => (
                <Button key={t.id} variant="outline" className="gap-2 h-11" onClick={() => criarSessaoHoje(t.id)}>
                  <Plus className="h-4 w-4" /> {t.nome}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sessions list */}
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sessões</CardTitle>
        </CardHeader>
        <CardContent>
          {sessoes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma sessão encontrada</p>
          ) : (
            <>
              {/* Mobile: cartões grandes */}
              <div className="space-y-3 md:hidden">
                {sessoes.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => openSessao(s)}
                    className="w-full text-left rounded-xl border bg-card p-4 active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{sessaoNome(s)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(s.data_sessao + "T12:00:00"), "dd/MM/yyyy")}
                        </p>
                      </div>
                      <Badge variant={s.status === "aberta" ? "default" : "outline"}>
                        {s.status === "aberta" ? "Aberta" : "Encerrada"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <Badge variant="secondary" className="gap-1 text-sm">
                        <Users className="h-3.5 w-3.5" />{s.total_presentes} presentes
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 gap-1"
                          onClick={(e) => { e.stopPropagation(); setSelectedSessao(s); setShowQr(true); }}
                        >
                          <QrCode className="h-4 w-4" /> QR
                        </Button>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Desktop: tabela */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trabalho</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Presentes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessoes.map((s) => (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => openSessao(s)}>
                        <TableCell className="font-medium">{sessaoNome(s)}</TableCell>
                        <TableCell>{format(new Date(s.data_sessao + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" />{s.total_presentes}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.status === "aberta" ? "default" : "outline"}>
                            {s.status === "aberta" ? "Aberta" : "Encerrada"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setSelectedSessao(s); setShowQr(true); }}>
                            <QrCode className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Session detail with checkins */}
      {selectedSessao && !showQr && !showManual && (
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">
                {sessaoNome(selectedSessao)} — {format(new Date(selectedSessao.data_sessao + "T12:00:00"), "dd/MM/yyyy")}
              </CardTitle>
            </div>

            {/* Contador em tempo real */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className={`rounded-xl border bg-primary/5 p-3 transition-colors ${pulse ? "ring-2 ring-primary/50" : ""}`}>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Presentes</p>
                <p className="text-3xl font-bold tabular-nums">{checkins.length}</p>
              </div>
              <div className="rounded-xl border bg-accent/40 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Novos hoje</p>
                <p className="text-3xl font-bold tabular-nums">{novos}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {checkins.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum check-in registrado</p>
            ) : (
              <>
                {/* Mobile: cartões */}
                <div className="space-y-2 md:hidden">
                  {checkins.map((c) => (
                    <div key={c.id} className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate flex items-center gap-2">
                          {c.assistidos?.nome || c.nome_participante || "—"}
                          {c.cadastro_rapido && <Badge variant="outline" className="text-[10px]">Novo</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{c.celular || "Sem celular"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />{format(new Date(c.checkin_at), "HH:mm")}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">{modoLabel(c.modo_checkin)}</Badge>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Participante</TableHead>
                        <TableHead>Celular</TableHead>
                        <TableHead>Modo</TableHead>
                        <TableHead>Hora</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {checkins.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.assistidos?.nome || c.nome_participante || "—"}
                            {c.cadastro_rapido && <Badge variant="outline" className="ml-2 text-xs">Novo</Badge>}
                          </TableCell>
                          <TableCell>{c.celular || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{modoLabel(c.modo_checkin)}</Badge>
                          </TableCell>
                          <TableCell>{format(new Date(c.checkin_at), "HH:mm")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ações operacionais fixas (mobile) */}
      {selectedSessao && !showQr && !showManual && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur p-3 flex gap-2 md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Button variant="outline" className="flex-1 h-12 gap-2" onClick={() => setShowQr(true)}>
            <QrCode className="h-5 w-5" /> QR do dia
          </Button>
          <Button className="flex-1 h-12 gap-2" onClick={() => setShowManual(true)}>
            <UserPlus className="h-5 w-5" /> Registrar
          </Button>
        </div>
      )}

      {/* QR Code Dialog */}
      <Dialog open={showQr} onOpenChange={(v) => { setShowQr(v); if (!v) setQrFull(false); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>QR do dia</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <p className="text-sm font-semibold">
              {sessaoNome(selectedSessao)}
            </p>
            <p className="text-xs text-muted-foreground -mt-2">
              {selectedSessao && format(new Date(selectedSessao.data_sessao + "T12:00:00"), "dd/MM/yyyy")}
            </p>
            <button
              onClick={() => setQrFull(true)}
              className="bg-white p-4 rounded-2xl shadow-md active:scale-[0.98] transition-transform"
              aria-label="Ampliar QR Code"
            >
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=0&data=${encodeURIComponent(qrUrl)}`}
                alt="QR Code da sessão"
                className="w-[260px] h-[260px]"
              />
            </button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setQrFull(true)}>
              <Maximize2 className="h-4 w-4" /> Ampliar
            </Button>
            <p className="text-xs text-muted-foreground break-all">{qrUrl}</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR ampliado em tela cheia */}
      <Dialog open={qrFull} onOpenChange={setQrFull}>
        <DialogContent className="max-w-full h-[100dvh] sm:h-auto sm:max-w-lg flex flex-col items-center justify-center bg-white gap-4">
          <DialogHeader className="sr-only">
            <DialogTitle>QR do dia ampliado</DialogTitle>
          </DialogHeader>
          <p className="text-base font-bold text-black text-center">{sessaoNome(selectedSessao)}</p>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=0&data=${encodeURIComponent(qrUrl)}`}
            alt="QR Code da sessão ampliado"
            className="w-[80vw] max-w-[420px] h-auto aspect-square"
          />
          <p className="text-sm text-black/70 text-center px-4">Aponte a câmera para fazer o check-in</p>
        </DialogContent>
      </Dialog>

      {/* Manual Registration Dialog */}
      <Dialog open={showManual} onOpenChange={(v) => { setShowManual(v); if (!v) { setManualSearch(""); setManualResults([]); setQuickForm({ nome: "", celular: "", faixa_etaria: "" }); setAssistidoSelecionado(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registro Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search existing */}
            <div className="space-y-2">
              <Label>Buscar participante existente</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="h-12 pl-9 text-base"
                    placeholder="Nome ou celular..."
                    value={manualSearch}
                    autoFocus
                    onChange={(e) => { setManualSearch(e.target.value); setAssistidoSelecionado(null); }}
                    onKeyDown={(e) => e.key === "Enter" && searchAssistido()}
                  />
                </div>
              </div>
              {manualResults.length > 0 && !assistidoSelecionado && (
                <div className="border rounded-md divide-y max-h-52 overflow-y-auto">
                  {manualResults.map((r) => (
                    <button
                      key={r.id}
                      className="w-full text-left px-3 py-3 hover:bg-accent active:bg-accent text-sm flex justify-between items-center gap-2"
                      onClick={() => setAssistidoSelecionado({ id: r.id, nome: r.nome, celular: r.celular ?? null })}
                      disabled={loading}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="truncate">{r.nome}</span>
                      </span>
                      <span className="text-muted-foreground text-xs shrink-0">{r.celular || ""}</span>
                    </button>
                  ))}
                </div>
              )}
              {manualSearch.trim() && manualResults.length === 0 && !assistidoSelecionado && (
                <p className="text-xs text-muted-foreground px-1">Nenhum cadastro encontrado — use o cadastro rápido abaixo.</p>
              )}

              {/* Seleção preparatória: presença só é gravada após confirmação explícita */}
              {assistidoSelecionado && (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{assistidoSelecionado.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {assistidoSelecionado.celular || "Sem celular"} · Aguardando confirmação
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-11"
                      onClick={() => setAssistidoSelecionado(null)}
                      disabled={loading}
                    >
                      Cancelar seleção
                    </Button>
                    <Button
                      className="flex-1 h-11 gap-2"
                      onClick={() => registrarManual(assistidoSelecionado.id)}
                      disabled={loading}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {loading ? "Confirmando..." : "Confirmar Presença"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">ou cadastro rápido</span></div>
            </div>

            {/* Quick registration */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm">Nome completo *</Label>
                <Input className="h-12 text-base" value={quickForm.nome} onChange={(e) => setQuickForm({ ...quickForm, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">Celular</Label>
                  <Input className="h-12 text-base" inputMode="tel" value={quickForm.celular} onChange={(e) => setQuickForm({ ...quickForm, celular: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Faixa etária</Label>
                  <Select value={quickForm.faixa_etaria} onValueChange={(v) => setQuickForm({ ...quickForm, faixa_etaria: v })}>
                    <SelectTrigger className="h-12"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="menor_18">Menor de 18</SelectItem>
                      <SelectItem value="18_29">18 a 29</SelectItem>
                      <SelectItem value="30_44">30 a 44</SelectItem>
                      <SelectItem value="45_59">45 a 59</SelectItem>
                      <SelectItem value="60_mais">60 ou mais</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={registrarCadastroRapido} disabled={loading || !quickForm.nome.trim()} className="w-full h-12 text-base">
                {loading ? "Registrando..." : "Registrar Presença"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
