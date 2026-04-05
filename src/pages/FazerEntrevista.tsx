import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Plus, Trash2, UserPlus, BookOpen, Heart, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoUpload } from "@/components/PhotoUpload";
import { AddressFields } from "@/components/AddressFields";
import { isValidCPF, isValidEmail, isValidPhone, maskCPF, maskPhone } from "@/lib/validators";
import { addDays, addWeeks, addMonths, getDay, setDay, startOfDay, format } from "date-fns";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface Assistido {
  id: string;
  nome: string;
  cpf: string | null;
  celular: string | null;
  email: string | null;
  status: string;
  quantidade_palestras: number;
}

interface TipoTratamento {
  id: string;
  nome: string;
  tipo: string;
  dia_semana: number | null;
  horario: string | null;
  frequencia_valor: number | null;
  frequencia_unidade: string | null;
  status: string;
}

interface DesignacaoItem {
  tratamento_id: string;
  quantidade_total: number;
}

const STATUS_LABELS: Record<string, string> = {
  aguardando_palestras: "Aguardando Palestras",
  apto_para_entrevista: "Apto para Entrevista",
  entrevista_agendada: "Entrevista Agendada",
  entrevistado: "Entrevistado",
  em_tratamento: "Em Tratamento",
  concluido: "Concluído",
  inativo: "Inativo",
};

const emptyAssistidoForm = {
  nome: "", cpf: "", celular: "", email: "", data_nascimento: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  foto_url: null as string | null, observacoes: "",
};

function generateSessionDates(
  dataEntrevista: Date,
  diaSemana: number | null,
  horario: string | null,
  freqValor: number,
  freqUnidade: string,
  quantidade: number
): { data_sessao: string; horario: string | null }[] {
  const sessions: { data_sessao: string; horario: string | null }[] = [];
  let cursor: Date;

  if (diaSemana !== null) {
    // Find next occurrence of this weekday on or after interview date
    const entDay = getDay(dataEntrevista);
    if (entDay === diaSemana) {
      cursor = startOfDay(dataEntrevista);
      // If same day, check if interview time is before treatment time
      if (horario) {
        const [h, m] = horario.split(":").map(Number);
        const treatmentTime = new Date(dataEntrevista);
        treatmentTime.setHours(h, m, 0, 0);
        if (dataEntrevista > treatmentTime) {
          // Already past, go to next occurrence
          if (freqUnidade === "semanas") cursor = addWeeks(cursor, freqValor);
          else if (freqUnidade === "meses") cursor = addMonths(cursor, freqValor);
          else cursor = addDays(cursor, freqValor);
        }
      }
    } else {
      // Find next occurrence of diaSemana
      let diff = diaSemana - entDay;
      if (diff <= 0) diff += 7;
      cursor = addDays(startOfDay(dataEntrevista), diff);
    }
  } else {
    // No specific weekday, start from next day
    cursor = addDays(startOfDay(dataEntrevista), 1);
  }

  for (let i = 0; i < quantidade; i++) {
    sessions.push({
      data_sessao: format(cursor, "yyyy-MM-dd"),
      horario: horario || null,
    });

    // Advance by frequency
    if (freqUnidade === "semanas") {
      cursor = addWeeks(cursor, freqValor);
    } else if (freqUnidade === "meses") {
      cursor = addMonths(cursor, freqValor);
    } else {
      // dias
      cursor = addDays(cursor, freqValor);
    }
  }

  return sessions;
}

export default function FazerEntrevista() {
  const [searchTerm, setSearchTerm] = useState("");
  const [assistidos, setAssistidos] = useState<Assistido[]>([]);
  const [selectedAssistido, setSelectedAssistido] = useState<Assistido | null>(null);
  const [tratamentos, setTratamentos] = useState<TipoTratamento[]>([]);
  const [minPalestras, setMinPalestras] = useState(3);
  const [permitirLivre, setPermitirLivre] = useState(true);

  const [dataEntrevista, setDataEntrevista] = useState(new Date().toISOString().split("T")[0]);
  const [tipoEntrevista, setTipoEntrevista] = useState<"regular" | "livre">("regular");
  const [observacoes, setObservacoes] = useState("");
  const [designacoes, setDesignacoes] = useState<DesignacaoItem[]>([]);

  const [novoAssistidoOpen, setNovoAssistidoOpen] = useState(false);
  const [assistidoForm, setAssistidoForm] = useState(emptyAssistidoForm);
  const [assistidoErrors, setAssistidoErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savingAssistido, setSavingAssistido] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: assist }, { data: trat }, { data: config }] = await Promise.all([
        supabase.from("assistidos").select("id, nome, cpf, celular, email, status, quantidade_palestras").is("deleted_at", null).order("nome"),
        supabase.from("tipos_tratamento").select("id, nome, tipo, dia_semana, horario, frequencia_valor, frequencia_unidade, status").eq("status", "ativo"),
        supabase.from("configuracoes_gerais").select("chave, valor"),
      ]);
      if (assist) setAssistidos(assist as Assistido[]);
      if (trat) setTratamentos(trat as TipoTratamento[]);
      if (config) {
        const minP = config.find((c) => c.chave === "quantidade_minima_palestras");
        const livre = config.find((c) => c.chave === "permitir_entrevista_livre");
        if (minP) setMinPalestras(parseInt(minP.valor));
        if (livre) setPermitirLivre(livre.valor === "true");
      }
    };
    fetchData();
  }, []);

  const filteredAssistidos = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const s = searchTerm.toLowerCase();
    const cleanSearch = searchTerm.replace(/\D/g, "");
    return assistidos.filter((a) =>
      a.nome.toLowerCase().includes(s) ||
      (a.cpf && cleanSearch && a.cpf.includes(cleanSearch)) ||
      (a.celular && cleanSearch && a.celular.includes(cleanSearch))
    ).slice(0, 10);
  }, [searchTerm, assistidos]);

  const isApto = selectedAssistido
    ? tipoEntrevista === "livre" || selectedAssistido.quantidade_palestras >= minPalestras
    : false;

  const selectAssistido = (a: Assistido) => {
    setSelectedAssistido(a);
    setSearchTerm("");
  };

  const clearSelection = () => {
    setSelectedAssistido(null);
    setDesignacoes([]);
    setObservacoes("");
    setTipoEntrevista("regular");
    setDataEntrevista(new Date().toISOString().split("T")[0]);
  };

  const addDesignacao = () => {
    setDesignacoes([...designacoes, { tratamento_id: "", quantidade_total: 1 }]);
  };

  const removeDesignacao = (idx: number) => {
    setDesignacoes(designacoes.filter((_, i) => i !== idx));
  };

  const updateDesignacao = (idx: number, field: string, value: any) => {
    setDesignacoes(designacoes.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  const tratamentoMap = useMemo(() =>
    Object.fromEntries(tratamentos.map((t) => [t.id, t])),
    [tratamentos]
  );

  // Save novo assistido
  const validateAssistidoForm = () => {
    const e: Record<string, string> = {};
    if (!assistidoForm.nome.trim()) e.nome = "Nome obrigatório";
    if (!assistidoForm.cpf.trim()) e.cpf = "CPF obrigatório";
    else if (!isValidCPF(assistidoForm.cpf)) e.cpf = "CPF inválido";
    if (!assistidoForm.celular.trim()) e.celular = "Celular obrigatório";
    else if (!isValidPhone(assistidoForm.celular)) e.celular = "Celular inválido";
    if (assistidoForm.email && !isValidEmail(assistidoForm.email)) e.email = "E-mail inválido";
    return e;
  };

  const handleSaveNovoAssistido = async () => {
    const errs = validateAssistidoForm();
    setAssistidoErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSavingAssistido(true);

    const cpfClean = assistidoForm.cpf.replace(/\D/g, "");
    const { data: cpfExists } = await supabase.from("assistidos").select("id").eq("cpf", cpfClean).is("deleted_at", null);
    if (cpfExists && cpfExists.length > 0) {
      setAssistidoErrors({ cpf: "CPF já cadastrado" });
      setSavingAssistido(false);
      return;
    }

    const payload = {
      nome: assistidoForm.nome.trim(),
      cpf: cpfClean,
      celular: assistidoForm.celular.replace(/\D/g, ""),
      telefone: assistidoForm.celular.replace(/\D/g, ""),
      email: assistidoForm.email.trim() || null,
      data_nascimento: assistidoForm.data_nascimento || null,
      cep: assistidoForm.cep.replace(/\D/g, "") || null,
      logradouro: assistidoForm.logradouro.trim() || null,
      numero: assistidoForm.numero.trim() || null,
      complemento: assistidoForm.complemento.trim() || null,
      bairro: assistidoForm.bairro.trim() || null,
      cidade: assistidoForm.cidade.trim() || null,
      estado: assistidoForm.estado.trim().toUpperCase() || null,
      foto_url: assistidoForm.foto_url || null,
      observacoes: assistidoForm.observacoes || null,
      status: "aguardando_palestras",
      created_by: user!.id,
    };

    const { data: newAssist, error } = await supabase.from("assistidos").insert(payload as any).select("id, nome, cpf, celular, email, status, quantidade_palestras").single();
    if (error) {
      toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" });
    } else if (newAssist) {
      const newA = newAssist as Assistido;
      setAssistidos((prev) => [...prev, newA].sort((a, b) => a.nome.localeCompare(b.nome)));
      setSelectedAssistido(newA);
      setNovoAssistidoOpen(false);
      setAssistidoForm(emptyAssistidoForm);
      toast({ title: "Assistido cadastrado" });
    }
    setSavingAssistido(false);
  };

  // Save entrevista
  const handleSalvar = async () => {
    if (!selectedAssistido) {
      toast({ title: "Selecione um assistido", variant: "destructive" });
      return;
    }
    if (!isApto) {
      toast({ title: "Assistido não está apto para entrevista regular", variant: "destructive" });
      return;
    }
    if (!dataEntrevista) {
      toast({ title: "Informe a data da entrevista", variant: "destructive" });
      return;
    }
    const validDesignacoes = designacoes.filter((d) => d.tratamento_id && d.quantidade_total > 0);

    setSaving(true);

    // Create the interview
    const { data: entrevista, error: entErr } = await supabase.from("entrevistas_fraternas").insert({
      assistido_id: selectedAssistido.id,
      entrevistador_id: user!.id,
      data: dataEntrevista + "T00:00:00",
      tipo_entrevista: tipoEntrevista,
      observacoes: observacoes || null,
      status: "realizada",
    }).select("id").single();

    if (entErr || !entrevista) {
      toast({ title: "Erro ao salvar entrevista", description: entErr?.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const entrevistaDate = new Date(dataEntrevista + "T12:00:00");

    // Create treatment links and schedule
    for (const d of validDesignacoes) {
      const trat = tratamentoMap[d.tratamento_id];
      if (!trat) continue;

      const { data: vinculo, error: vErr } = await supabase.from("assistido_tratamentos").insert({
        assistido_id: selectedAssistido.id,
        tratamento_id: d.tratamento_id,
        quantidade_total: d.quantidade_total,
        quantidade_realizada: 0,
        status: "aguardando_inicio",
        entrevista_id: entrevista.id,
        created_by: user!.id,
      }).select("id").single();

      if (vErr || !vinculo) continue;

      // Generate schedule
      const sessions = generateSessionDates(
        entrevistaDate,
        trat.dia_semana,
        trat.horario,
        trat.frequencia_valor || 1,
        trat.frequencia_unidade || "semanas",
        d.quantidade_total
      );

      if (sessions.length > 0) {
        const agendaRows = sessions.map((s) => ({
          assistido_id: selectedAssistido.id,
          assistido_tratamento_id: vinculo.id,
          tratamento_id: d.tratamento_id,
          data_sessao: s.data_sessao,
          horario: s.horario,
          status: "agendado",
          registrado_por: user!.id,
        }));
        await supabase.from("agenda_tratamentos_assistido").insert(agendaRows as any);
      }
    }

    // Update assistido status
    if (validDesignacoes.length > 0) {
      await supabase.from("assistidos").update({ status: "em_tratamento" }).eq("id", selectedAssistido.id);
    } else {
      await supabase.from("assistidos").update({ status: "entrevistado" }).eq("id", selectedAssistido.id);
    }

    toast({ title: "Entrevista salva com sucesso!", description: `${validDesignacoes.length} tratamento(s) designado(s)` });
    clearSelection();
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          Fazer Entrevista
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Realize a entrevista fraterna e designe tratamentos</p>
      </div>

      {/* BLOCO 1: Busca de assistido */}
      {!selectedAssistido && (
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Buscar Assistido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, CPF ou celular..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" className="gap-1 shrink-0" onClick={() => { setNovoAssistidoOpen(true); setAssistidoForm(emptyAssistidoForm); setAssistidoErrors({}); }}>
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Novo</span>
              </Button>
            </div>

            {filteredAssistidos.length > 0 && (
              <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                {filteredAssistidos.map((a) => (
                  <button
                    key={a.id}
                    className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
                    onClick={() => selectAssistido(a)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{a.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.cpf ? maskCPF(a.cpf) : "Sem CPF"} · {a.celular ? maskPhone(a.celular) : "Sem celular"}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{STATUS_LABELS[a.status] || a.status}</Badge>
                  </button>
                ))}
              </div>
            )}

            {searchTerm.trim() && filteredAssistidos.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3">Nenhum assistido encontrado</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* BLOCO 2: Dados do assistido selecionado */}
      {selectedAssistido && (
        <>
          <Card className="glass-card border-primary/20">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-semibold truncate">{selectedAssistido.nome}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                    <span>{selectedAssistido.cpf ? maskCPF(selectedAssistido.cpf) : "Sem CPF"}</span>
                    <span>{selectedAssistido.celular ? maskPhone(selectedAssistido.celular) : "Sem celular"}</span>
                    <span>{selectedAssistido.quantidade_palestras} palestra(s)</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">{STATUS_LABELS[selectedAssistido.status] || selectedAssistido.status}</Badge>
                    {tipoEntrevista === "regular" && selectedAssistido.quantidade_palestras >= minPalestras && (
                      <Badge variant="default" className="text-xs gap-1"><CheckCircle className="h-3 w-3" /> Apto</Badge>
                    )}
                    {tipoEntrevista === "regular" && selectedAssistido.quantidade_palestras < minPalestras && (
                      <Badge variant="destructive" className="text-xs">Não apto (mín. {minPalestras} palestras)</Badge>
                    )}
                    {tipoEntrevista === "livre" && (
                      <Badge variant="outline" className="text-xs">Entrevista Livre</Badge>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={clearSelection} className="shrink-0 text-muted-foreground">
                  Trocar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* BLOCO 3: Dados da entrevista */}
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Dados da Entrevista</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data da Entrevista *</Label>
                  <Input type="date" value={dataEntrevista} onChange={(e) => setDataEntrevista(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={tipoEntrevista} onValueChange={(v) => setTipoEntrevista(v as "regular" | "livre")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular (mín. {minPalestras} palestras)</SelectItem>
                      {permitirLivre && <SelectItem value="livre">Livre</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  rows={3}
                  placeholder="Registre observações importantes da entrevista..."
                />
              </div>
            </CardContent>
          </Card>

          {/* BLOCO 4: Tratamentos */}
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" />
                  Tratamentos
                </CardTitle>
                <Button variant="outline" size="sm" onClick={addDesignacao} className="gap-1">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {designacoes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum tratamento designado. Clique em "Adicionar" para designar.
                </p>
              )}

              {designacoes.map((d, idx) => (
                <div key={idx} className="flex gap-2 items-end rounded-lg border p-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Tratamento</Label>
                    <Select value={d.tratamento_id} onValueChange={(v) => updateDesignacao(idx, "tratamento_id", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {tratamentos.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">Sessões</Label>
                    <Input
                      type="number"
                      min={1}
                      value={d.quantidade_total}
                      onChange={(e) => updateDesignacao(idx, "quantidade_total", Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeDesignacao(idx)} className="text-destructive shrink-0 mb-0.5">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* BLOCO 5: Ações */}
          <div className="flex gap-3 pb-6">
            <Button variant="outline" onClick={clearSelection} className="flex-1 sm:flex-none">
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={saving || !isApto} className="flex-1 sm:flex-none gap-2">
              {saving ? "Salvando..." : "Concluir Entrevista"}
            </Button>
          </div>
        </>
      )}

      {/* Modal Novo Assistido */}
      <Dialog open={novoAssistidoOpen} onOpenChange={setNovoAssistidoOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Assistido</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex justify-center">
              <PhotoUpload
                currentUrl={assistidoForm.foto_url}
                onUrlChange={(url) => setAssistidoForm({ ...assistidoForm, foto_url: url })}
                folder="assistidos"
              />
            </div>
            <div className="space-y-2">
              <Label>Nome Completo *</Label>
              <Input value={assistidoForm.nome} onChange={(e) => setAssistidoForm({ ...assistidoForm, nome: e.target.value })} />
              {assistidoErrors.nome && <p className="text-xs text-destructive">{assistidoErrors.nome}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CPF *</Label>
                <Input value={assistidoForm.cpf} onChange={(e) => setAssistidoForm({ ...assistidoForm, cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" />
                {assistidoErrors.cpf && <p className="text-xs text-destructive">{assistidoErrors.cpf}</p>}
              </div>
              <div className="space-y-2">
                <Label>Celular *</Label>
                <Input value={assistidoForm.celular} onChange={(e) => setAssistidoForm({ ...assistidoForm, celular: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" />
                {assistidoErrors.celular && <p className="text-xs text-destructive">{assistidoErrors.celular}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input value={assistidoForm.email} onChange={(e) => setAssistidoForm({ ...assistidoForm, email: e.target.value })} />
                {assistidoErrors.email && <p className="text-xs text-destructive">{assistidoErrors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label>Data de Nascimento</Label>
                <Input type="date" value={assistidoForm.data_nascimento} onChange={(e) => setAssistidoForm({ ...assistidoForm, data_nascimento: e.target.value })} />
              </div>
            </div>
            <AddressFields
              data={{ cep: assistidoForm.cep, logradouro: assistidoForm.logradouro, numero: assistidoForm.numero, complemento: assistidoForm.complemento, bairro: assistidoForm.bairro, cidade: assistidoForm.cidade, estado: assistidoForm.estado }}
              onChange={(fields) => setAssistidoForm({ ...assistidoForm, ...fields })}
              errors={assistidoErrors}
            />
            <Button onClick={handleSaveNovoAssistido} disabled={savingAssistido} className="w-full">
              {savingAssistido ? "Salvando..." : "Cadastrar Assistido"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
