import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { fetchInitialData } from "@/services/entrevistas/fazerEntrevista";
import { migrarAssistidoLegado } from "@/services/assistidos/migracaoLegado";
import {
  STATUS_TRATAMENTO,
  STATUS_TRATAMENTO_LABELS,
  statusPermiteProximaSessao,
  type StatusTratamento,
  type TratamentoLegadoInput,
} from "@/lib/migracaoLegado";
import type { EntrevistaAssistido, EntrevistaTipoTratamento } from "@/types/fazerEntrevista";
import { maskCPF, maskPhone } from "@/lib/validators";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddressFields } from "@/components/AddressFields";
import { PhotoUpload } from "@/components/PhotoUpload";
import { AlertTriangle, Plus, Trash2, History, UserPlus, Save } from "lucide-react";

interface TratamentoRow extends TratamentoLegadoInput {
  status: StatusTratamento;
  confirmarStatusIncompativel: boolean;
  confirmarDuplicidade: boolean;
  confirmarColisaoSessaoFutura: boolean;
}

const emptyTratamento = (): TratamentoRow => ({
  tratamento_id: "",
  status: "em_andamento",
  quantidade_total: 1,
  quantidade_realizada: 0,
  observacao: "",
  proxima_sessao_data: "",
  proxima_sessao_horario: "",
  confirmarStatusIncompativel: false,
  confirmarDuplicidade: false,
  confirmarColisaoSessaoFutura: false,
});

const emptyBase = {
  nome: "",
  cpf: "",
  celular: "",
  email: "",
  data_nascimento: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  foto_url: null as string | null,
};

export default function MigrarAssistido() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [tratamentos, setTratamentos] = useState<EntrevistaTipoTratamento[]>([]);
  const [assistidos, setAssistidos] = useState<EntrevistaAssistido[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Etapa 1
  const [modo, setModo] = useState<"novo" | "existente">("novo");
  const [assistidoExistenteId, setAssistidoExistenteId] = useState<string>("");
  const [confirmarSobrescrita, setConfirmarSobrescrita] = useState(false);
  const [base, setBase] = useState({ ...emptyBase });

  // Etapa 2
  const [dataMigracao, setDataMigracao] = useState(() => new Date().toISOString().slice(0, 10));
  const [entrevistaForaSistema, setEntrevistaForaSistema] = useState(true);
  const [observacaoMigracao, setObservacaoMigracao] = useState("");

  // Etapa 3/4
  const [linhas, setLinhas] = useState<TratamentoRow[]>([emptyTratamento()]);

  // Etapa 5
  const [observacaoAdmin, setObservacaoAdmin] = useState("");

  useEffect(() => {
    fetchInitialData()
      .then((d) => {
        setTratamentos(d.tratamentos);
        setAssistidos(d.assistidos);
      })
      .catch((e) => toast({ title: "Erro ao carregar dados", description: e?.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const tratamentoMap = useMemo(
    () => Object.fromEntries(tratamentos.map((t) => [t.id, t])),
    [tratamentos],
  );

  const updateLinha = (i: number, patch: Partial<TratamentoRow>) =>
    setLinhas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const removeLinha = (i: number) => setLinhas((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!user) return;
    if (modo === "novo" && !base.nome.trim()) {
      toast({ title: "Informe o nome do assistido", variant: "destructive" });
      return;
    }
    if (modo === "existente" && !assistidoExistenteId) {
      toast({ title: "Selecione o assistido existente", variant: "destructive" });
      return;
    }
    if (linhas.length === 0 || linhas.some((l) => !l.tratamento_id)) {
      toast({ title: "Selecione o tipo em todos os tratamentos", variant: "destructive" });
      return;
    }

    const obsFinal = [
      entrevistaForaSistema ? "Entrevista/triagem realizada fora do sistema." : "",
      observacaoMigracao.trim(),
      observacaoAdmin.trim(),
    ]
      .filter(Boolean)
      .join("\n");

    setSaving(true);
    try {
      const res = await migrarAssistidoLegado({
        userId: user.id,
        assistidoExistenteId: modo === "existente" ? assistidoExistenteId : null,
        confirmarSobrescritaSensiveis: modo === "existente" && confirmarSobrescrita,
        base: {
          nome: modo === "existente"
            ? assistidos.find((a) => a.id === assistidoExistenteId)?.nome || base.nome
            : base.nome,
          cpf: base.cpf,
          celular: base.celular,
          email: base.email,
          data_nascimento: base.data_nascimento,
          cep: base.cep,
          logradouro: base.logradouro,
          numero: base.numero,
          complemento: base.complemento,
          bairro: base.bairro,
          cidade: base.cidade,
          estado: base.estado,
          foto_url: base.foto_url,
        },
        dataMigracao: new Date(dataMigracao + "T00:00:00").toISOString(),
        observacaoMigracao: obsFinal,
        tratamentos: linhas.map((l) => ({
          tratamento_id: l.tratamento_id,
          status: l.status,
          quantidade_total: Number(l.quantidade_total),
          quantidade_realizada: Number(l.quantidade_realizada),
          observacao: l.observacao,
          proxima_sessao_data: l.proxima_sessao_data,
          proxima_sessao_horario: l.proxima_sessao_horario,
        })),
        diaSemanaPorTratamento: Object.fromEntries(
          tratamentos.map((t) => [t.id, t.dia_semana]),
        ),
        confirmacoes: Object.fromEntries(
          linhas.map((l, i) => [
            i,
            {
              statusIncompativel: l.confirmarStatusIncompativel,
              duplicidade: l.confirmarDuplicidade,
              colisaoSessaoFutura: l.confirmarColisaoSessaoFutura,
            },
          ]),
        ),
      });
      toast({
        title: "Assistido migrado com sucesso!",
        description: `${res.vinculosCriados} tratamento(s) e ${res.sessoesCriadas} próxima(s) sessão(ões).`,
      });
      navigate("/assistidos");
    } catch (e: any) {
      toast({ title: "Não foi possível concluir a migração", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <History className="h-6 w-6 text-primary" /> Migrar Assistido (Legado)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cadastro administrativo de assistidos que já estão em tratamento, preservando o estágio
          atual. Não cria entrevista nem histórico passado.
        </p>
      </div>

      {/* Etapa 1 — Dados do assistido */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> 1. Dados do assistido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button type="button" variant={modo === "novo" ? "default" : "outline"} size="sm" onClick={() => setModo("novo")}>
              Novo assistido
            </Button>
            <Button type="button" variant={modo === "existente" ? "default" : "outline"} size="sm" onClick={() => setModo("existente")}>
              Assistido existente
            </Button>
          </div>

          {modo === "existente" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Selecione o assistido</Label>
                <Select value={assistidoExistenteId} onValueChange={setAssistidoExistenteId}>
                  <SelectTrigger><SelectValue placeholder="Buscar assistido..." /></SelectTrigger>
                  <SelectContent>
                    {assistidos.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Nome, CPF, e-mail e nascimento existentes são preservados. Celular, endereço e foto
                  podem ser atualizados abaixo. Dados sensíveis só são sobrescritos com confirmação.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Celular</Label>
                  <Input value={base.celular} onChange={(e) => setBase({ ...base, celular: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} />
                </div>
              </div>
              <AddressFields
                data={{ cep: base.cep, logradouro: base.logradouro, numero: base.numero, complemento: base.complemento, bairro: base.bairro, cidade: base.cidade, estado: base.estado }}
                onChange={(addr) => setBase({ ...base, ...addr })}
                errors={{}}
              />
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={confirmarSobrescrita} onCheckedChange={(v) => setConfirmarSobrescrita(!!v)} />
                <span className="text-muted-foreground">
                  Confirmar sobrescrita de dados cadastrais sensíveis (nome, CPF, e-mail, nascimento) com os valores informados.
                </span>
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-center">
                <PhotoUpload currentUrl={base.foto_url} onUrlChange={(url) => setBase({ ...base, foto_url: url })} folder="assistidos" />
              </div>
              <div className="space-y-2">
                <Label>Nome Completo *</Label>
                <Input value={base.nome} onChange={(e) => setBase({ ...base, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input value={base.cpf} onChange={(e) => setBase({ ...base, cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" />
                </div>
                <div className="space-y-2">
                  <Label>Celular</Label>
                  <Input value={base.celular} onChange={(e) => setBase({ ...base, celular: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input value={base.email} onChange={(e) => setBase({ ...base, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Data de Nascimento</Label>
                  <Input type="date" value={base.data_nascimento} onChange={(e) => setBase({ ...base, data_nascimento: e.target.value })} />
                </div>
              </div>
              <AddressFields
                data={{ cep: base.cep, logradouro: base.logradouro, numero: base.numero, complemento: base.complemento, bairro: base.bairro, cidade: base.cidade, estado: base.estado }}
                onChange={(addr) => setBase({ ...base, ...addr })}
                errors={{}}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Etapa 2 — Legado */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">2. Migração / Legado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data da migração</Label>
              <Input type="date" value={dataMigracao} onChange={(e) => setDataMigracao(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={entrevistaForaSistema} onCheckedChange={(v) => setEntrevistaForaSistema(!!v)} />
            <span>Entrevista/triagem realizada fora do sistema</span>
          </label>
          <div className="space-y-2">
            <Label>Observação da migração</Label>
            <Textarea value={observacaoMigracao} onChange={(e) => setObservacaoMigracao(e.target.value)} placeholder="Ex.: assistido já vinha da rotina manual; mantido no estágio atual por decisão da coordenação." rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* Etapa 3/4 — Tratamentos e próxima sessão */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">3. Tratamentos atuais &amp; próxima sessão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {linhas.map((l, i) => {
            const temData = !!l.proxima_sessao_data?.trim();
            const statusIncompat = temData && !statusPermiteProximaSessao(l.status);
            return (
              <div key={i} className="rounded-xl border border-border/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Tratamento {i + 1}</span>
                  {linhas.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeLinha(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de tratamento *</Label>
                    <Select value={l.tratamento_id} onValueChange={(v) => updateLinha(i, { tratamento_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {tratamentos.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status atual *</Label>
                    <Select value={l.status} onValueChange={(v) => updateLinha(i, { status: v as StatusTratamento })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_TRATAMENTO.map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_TRATAMENTO_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Total</Label>
                    <Input type="number" min={1} value={l.quantidade_total} onChange={(e) => updateLinha(i, { quantidade_total: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Realizadas</Label>
                    <Input type="number" min={0} value={l.quantidade_realizada} onChange={(e) => updateLinha(i, { quantidade_realizada: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Próxima sessão</Label>
                    <Input type="date" value={l.proxima_sessao_data ?? ""} onChange={(e) => updateLinha(i, { proxima_sessao_data: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Horário</Label>
                    <Input type="time" value={l.proxima_sessao_horario ?? ""} onChange={(e) => updateLinha(i, { proxima_sessao_horario: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Observação operacional</Label>
                  <Input value={l.observacao ?? ""} onChange={(e) => updateLinha(i, { observacao: e.target.value })} placeholder="Ex.: já havia concluído magnetismo." />
                </div>

                {/* Confirmações administrativas explícitas */}
                <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" /> Confirmações administrativas (se aplicável)
                  </div>
                  {statusIncompat && (
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <Checkbox checked={l.confirmarStatusIncompativel} onCheckedChange={(v) => updateLinha(i, { confirmarStatusIncompativel: !!v })} />
                      <span>Agendar próxima sessão mesmo com status incompatível ({STATUS_TRATAMENTO_LABELS[l.status]}).</span>
                    </label>
                  )}
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <Checkbox checked={l.confirmarDuplicidade} onCheckedChange={(v) => updateLinha(i, { confirmarDuplicidade: !!v })} />
                    <span>Confirmar mesmo já existindo vínculo ativo deste tratamento.</span>
                  </label>
                  {temData && (
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <Checkbox checked={l.confirmarColisaoSessaoFutura} onCheckedChange={(v) => updateLinha(i, { confirmarColisaoSessaoFutura: !!v })} />
                      <span>Confirmar mesmo havendo sessão futura no mesmo dia.</span>
                    </label>
                  )}
                </div>
              </div>
            );
          })}

          <Button type="button" variant="outline" size="sm" onClick={() => setLinhas((p) => [...p, emptyTratamento()])} className="gap-2">
            <Plus className="h-4 w-4" /> Adicionar tratamento
          </Button>
        </CardContent>
      </Card>

      {/* Etapa 5 — Observações administrativas */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">4. Observações administrativas</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={observacaoAdmin} onChange={(e) => setObservacaoAdmin(e.target.value)} placeholder="Contexto adicional da migração, decisões da coordenação, etc." rows={3} />
        </CardContent>
      </Card>

      <Button onClick={handleSubmit} disabled={saving} className="w-full gap-2">
        <Save className="h-4 w-4" />
        {saving ? "Migrando..." : "Concluir migração"}
      </Button>
    </div>
  );
}
