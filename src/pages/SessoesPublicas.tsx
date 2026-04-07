import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrCode, Plus, Users, Search, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

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
  tipos_tratamento?: { nome: string } | null;
}

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
  const [showManual, setShowManual] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState<any[]>([]);
  const [quickForm, setQuickForm] = useState({ nome: "", celular: "", faixa_etaria: "" });
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchTratamentos();
    fetchSessoes();
  }, []);

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

  const criarSessaoHoje = async (tratamentoId: string) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const { data: existing } = await supabase
      .from("sessoes_publicas")
      .select("id")
      .eq("tratamento_id", tratamentoId)
      .eq("data_sessao", today)
      .maybeSingle();

    if (existing) {
      toast({ title: "Sessão já existe para hoje", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("sessoes_publicas").insert({
      tratamento_id: tratamentoId,
      data_sessao: today,
      criado_por: user?.id,
    });

    if (error) {
      toast({ title: "Erro ao criar sessão", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sessão criada com sucesso" });
      fetchSessoes();
    }
  };

  const openSessao = async (sessao: Sessao) => {
    setSelectedSessao(sessao);
    const { data } = await supabase
      .from("checkins_publicos")
      .select("*, assistidos:assistido_id(nome)")
      .eq("sessao_id", sessao.id)
      .order("checkin_at", { ascending: false }) as any;
    if (data) setCheckins(data);
  };

  const searchAssistido = async () => {
    if (!manualSearch.trim()) return;
    const { data } = await supabase
      .from("assistidos")
      .select("id, nome, celular")
      .or(`nome.ilike.%${manualSearch}%,celular.ilike.%${manualSearch}%`)
      .limit(10);
    setManualResults(data || []);
  };

  const registrarManual = async (assistidoId: string) => {
    if (!selectedSessao) return;
    setLoading(true);
    const { error } = await supabase.from("checkins_publicos").insert({
      sessao_id: selectedSessao.id,
      assistido_id: assistidoId,
      modo_checkin: "manual",
      registrado_por: user?.id,
    });

    if (error) {
      toast({ title: error.message.includes("duplicate") ? "Presença já registrada" : "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Presença registrada" });
      openSessao(selectedSessao);
      setManualSearch("");
      setManualResults([]);
    }
    setLoading(false);
  };

  const registrarCadastroRapido = async () => {
    if (!selectedSessao || !quickForm.nome.trim()) return;
    setLoading(true);
    const { error } = await supabase.from("checkins_publicos").insert({
      sessao_id: selectedSessao.id,
      nome_participante: quickForm.nome.trim(),
      celular: quickForm.celular || null,
      faixa_etaria: quickForm.faixa_etaria || null,
      modo_checkin: "manual",
      cadastro_rapido: true,
      registrado_por: user?.id,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Presença registrada (cadastro rápido)" });
      openSessao(selectedSessao);
      setQuickForm({ nome: "", celular: "", faixa_etaria: "" });
    }
    setLoading(false);
  };

  const qrUrl = selectedSessao
    ? `${window.location.origin}/checkin-publico/${selectedSessao.token}`
    : "";

  return (
    <div className="space-y-6">
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
                <Button key={t.id} variant="outline" className="gap-2" onClick={() => criarSessaoHoje(t.id)}>
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
                    <TableCell className="font-medium">{(s as any).tipos_tratamento?.nome || "—"}</TableCell>
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
          )}
        </CardContent>
      </Card>

      {/* Session detail with checkins */}
      {selectedSessao && !showQr && !showManual && (
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {(selectedSessao as any).tipos_tratamento?.nome} — {format(new Date(selectedSessao.data_sessao + "T12:00:00"), "dd/MM/yyyy")}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowQr(true)}>
                  <QrCode className="h-4 w-4" /> QR Code
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowManual(true)}>
                  <UserPlus className="h-4 w-4" /> Registro Manual
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{checkins.length} presente(s)</p>
          </CardHeader>
          <CardContent>
            {checkins.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum check-in registrado</p>
            ) : (
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
                        <Badge variant="secondary">{c.modo_checkin === "qr" ? "QR" : "Manual"}</Badge>
                      </TableCell>
                      <TableCell>{format(new Date(c.checkin_at), "HH:mm")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* QR Code Dialog */}
      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>QR Code da Sessão</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="bg-white p-4 rounded-xl">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrUrl)}`}
                alt="QR Code"
                className="w-[250px] h-[250px]"
              />
            </div>
            <p className="text-xs text-muted-foreground break-all">{qrUrl}</p>
            <p className="text-sm font-medium">
              {(selectedSessao as any)?.tipos_tratamento?.nome} — {selectedSessao && format(new Date(selectedSessao.data_sessao + "T12:00:00"), "dd/MM/yyyy")}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Registration Dialog */}
      <Dialog open={showManual} onOpenChange={(v) => { setShowManual(v); if (!v) { setManualSearch(""); setManualResults([]); setQuickForm({ nome: "", celular: "", faixa_etaria: "" }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registro Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search existing */}
            <div className="space-y-2">
              <Label>Buscar participante existente</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Nome ou celular..."
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchAssistido()}
                />
                <Button variant="outline" size="icon" onClick={searchAssistido}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {manualResults.length > 0 && (
                <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                  {manualResults.map((r) => (
                    <button
                      key={r.id}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex justify-between items-center"
                      onClick={() => registrarManual(r.id)}
                      disabled={loading}
                    >
                      <span>{r.nome}</span>
                      <span className="text-muted-foreground text-xs">{r.celular || ""}</span>
                    </button>
                  ))}
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
                <Input value={quickForm.nome} onChange={(e) => setQuickForm({ ...quickForm, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">Celular</Label>
                  <Input value={quickForm.celular} onChange={(e) => setQuickForm({ ...quickForm, celular: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Faixa etária</Label>
                  <Select value={quickForm.faixa_etaria} onValueChange={(v) => setQuickForm({ ...quickForm, faixa_etaria: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
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
              <Button onClick={registrarCadastroRapido} disabled={loading || !quickForm.nome.trim()} className="w-full">
                {loading ? "Registrando..." : "Registrar Presença"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
