import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, CreditCard, Pencil, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { usePortalHub } from "@/hooks/usePortalHub";
import { toast } from "@/hooks/use-toast";
import { ROUTES } from "@/constants";

/**
 * SAAS-06-B0 — Central de Assinaturas.
 *
 * Controle manual de assinaturas por instituição para produção assistida.
 * Somente `platform_admin` (RLS `assinaturas_platform_write`) escreve.
 * Não integra gateway de pagamento — todos os campos financeiros são
 * anotações comerciais manuais.
 */

const STATUS_ASSINATURA = [
  "trial",
  "ativa",
  "inadimplente",
  "suspensa",
  "cancelada",
  "encerrada",
] as const;

const STATUS_BLOQUEIA_MODULOS: ReadonlyArray<string> = [
  "suspensa",
  "cancelada",
  "encerrada",
];

const CLASSIFICACAO = [
  { key: "demo", label: "Demo" },
  { key: "piloto", label: "Piloto" },
  { key: "producao_assistida", label: "Produção assistida" },
  { key: "cliente_ativo", label: "Cliente ativo" },
] as const;

const FORMA_PAGAMENTO = [
  { key: "pix", label: "PIX" },
  { key: "boleto", label: "Boleto" },
  { key: "link_manual", label: "Link manual" },
  { key: "transferencia", label: "Transferência" },
  { key: "outro", label: "Outro" },
] as const;

type Row = {
  instituicao: {
    id: string;
    nome: string;
    slug: string;
    status: string;
    cidade: string | null;
    uf: string | null;
    classificacao_comercial: string;
  };
  assinatura: {
    id: string;
    plano_id: string;
    status: string;
    data_inicio: string;
    data_fim: string | null;
    trial_ate: string | null;
    valor_mensal_cents: number | null;
    forma_pagamento: string | null;
    proximo_vencimento: string | null;
    ultimo_pagamento_em: string | null;
    observacoes_comerciais: string | null;
    condicao_especial: string | null;
  } | null;
};

type Plano = { id: string; codigo: string; nome: string; valor_mensal: number };

interface EditState {
  open: boolean;
  row: Row | null;
  form: {
    plano_id: string;
    status: string;
    data_inicio: string;
    data_fim: string;
    trial_ate: string;
    valor_mensal_cents: string;
    forma_pagamento: string;
    proximo_vencimento: string;
    ultimo_pagamento_em: string;
    observacoes_comerciais: string;
    condicao_especial: string;
    classificacao_comercial: string;
  };
  saving: boolean;
}

const EMPTY_FORM: EditState["form"] = {
  plano_id: "",
  status: "trial",
  data_inicio: "",
  data_fim: "",
  trial_ate: "",
  valor_mensal_cents: "",
  forma_pagamento: "",
  proximo_vencimento: "",
  ultimo_pagamento_em: "",
  observacoes_comerciais: "",
  condicao_especial: "",
  classificacao_comercial: "demo",
};

function centsToBRL(cents: number | null): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ativa" || status === "trial") return "default";
  if (status === "inadimplente") return "secondary";
  if (STATUS_BLOQUEIA_MODULOS.includes(status)) return "destructive";
  return "outline";
}

export default function PortalAssinaturas() {
  const { isPlatformAdmin, isLoading: hubLoading } = usePortalHub();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [edit, setEdit] = useState<EditState>({
    open: false,
    row: null,
    form: EMPTY_FORM,
    saving: false,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    nome: "",
    nome_fantasia: "",
    slug: "",
    cidade: "",
    uf: "",
    email_contato: "",
    telefone_contato: "",
    responsavel: "",
    email_admin_inicial: "",
    classificacao_comercial: "piloto",
    plano_id: "",
    status: "trial",
    data_inicio: new Date().toISOString().slice(0, 10),
    trial_ate: "",
    proximo_vencimento: "",
    valor_mensal_cents: "",
    forma_pagamento: "",
    observacoes_comerciais: "",
  });

  const carregar = async () => {
    setLoading(true);
    const [instRes, asgRes, planosRes] = await Promise.all([
      supabase
        .from("instituicoes")
        .select(
          "id, nome, slug, status, cidade, uf, classificacao_comercial",
        )
        .order("nome"),
      supabase.from("assinaturas").select("*"),
      supabase
        .from("planos")
        .select("id, codigo, nome, valor_mensal")
        .order("valor_mensal"),
    ]);
    if (instRes.error || asgRes.error || planosRes.error) {
      toast({
        title: "Falha ao carregar assinaturas",
        description: (instRes.error ?? asgRes.error ?? planosRes.error)?.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    const asgByInst = new Map<string, Row["assinatura"]>();
    for (const a of asgRes.data ?? []) {
      asgByInst.set(a.instituicao_id, a as unknown as Row["assinatura"]);
    }
    const list: Row[] = (instRes.data ?? []).map((inst) => ({
      instituicao: inst as Row["instituicao"],
      assinatura: asgByInst.get(inst.id) ?? null,
    }));
    setRows(list);
    setPlanos(planosRes.data as Plano[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!isPlatformAdmin) return;
    void carregar();
  }, [isPlatformAdmin]);

  const openEdit = (row: Row) => {
    setEdit({
      open: true,
      row,
      saving: false,
      form: {
        plano_id: row.assinatura?.plano_id ?? planos[0]?.id ?? "",
        status: row.assinatura?.status ?? "trial",
        data_inicio:
          row.assinatura?.data_inicio ?? new Date().toISOString().slice(0, 10),
        data_fim: row.assinatura?.data_fim ?? "",
        trial_ate: row.assinatura?.trial_ate ?? "",
        valor_mensal_cents:
          row.assinatura?.valor_mensal_cents != null
            ? String(row.assinatura.valor_mensal_cents)
            : "",
        forma_pagamento: row.assinatura?.forma_pagamento ?? "",
        proximo_vencimento: row.assinatura?.proximo_vencimento ?? "",
        ultimo_pagamento_em: row.assinatura?.ultimo_pagamento_em ?? "",
        observacoes_comerciais: row.assinatura?.observacoes_comerciais ?? "",
        condicao_especial: row.assinatura?.condicao_especial ?? "",
        classificacao_comercial:
          row.instituicao.classificacao_comercial ?? "demo",
      },
    });
  };

  const salvar = async () => {
    if (!edit.row) return;
    setEdit((s) => ({ ...s, saving: true }));
    const inst = edit.row.instituicao;
    const f = edit.form;

    // 1) Atualiza classificação da instituição.
    const instUpd = await supabase
      .from("instituicoes")
      .update({
        classificacao_comercial: f.classificacao_comercial,
      } as never)
      .eq("id", inst.id);
    if (instUpd.error) {
      toast({
        title: "Erro ao atualizar instituição",
        description: instUpd.error.message,
        variant: "destructive",
      });
      setEdit((s) => ({ ...s, saving: false }));
      return;
    }

    const payload = {
      instituicao_id: inst.id,
      plano_id: f.plano_id,
      status: f.status,
      data_inicio: f.data_inicio || new Date().toISOString().slice(0, 10),
      data_fim: f.data_fim || null,
      trial_ate: f.trial_ate || null,
      valor_mensal_cents: f.valor_mensal_cents
        ? Number(f.valor_mensal_cents)
        : null,
      forma_pagamento: f.forma_pagamento || null,
      proximo_vencimento: f.proximo_vencimento || null,
      ultimo_pagamento_em: f.ultimo_pagamento_em || null,
      observacoes_comerciais: f.observacoes_comerciais || null,
      condicao_especial: f.condicao_especial || null,
    };

    const res = edit.row.assinatura
      ? await supabase
          .from("assinaturas")
          .update(payload as never)
          .eq("id", edit.row.assinatura.id)
      : await supabase.from("assinaturas").insert(payload as never);

    if (res.error) {
      toast({
        title: "Erro ao salvar assinatura",
        description: res.error.message,
        variant: "destructive",
      });
      setEdit((s) => ({ ...s, saving: false }));
      return;
    }

    toast({ title: "Assinatura atualizada" });
    setEdit({ open: false, row: null, form: EMPTY_FORM, saving: false });
    await carregar();
  };

  const criarInstituicao = async () => {
    const f = createForm;
    if (!f.nome.trim() || !f.slug.trim() || !f.plano_id) {
      toast({
        title: "Campos obrigatórios",
        description: "Informe nome, slug e plano.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);

    const instPayload = {
      nome: f.nome.trim(),
      nome_fantasia: f.nome_fantasia.trim() || null,
      slug: f.slug.trim().toLowerCase(),
      cidade: f.cidade.trim() || null,
      uf: f.uf.trim() ? f.uf.trim().toUpperCase().slice(0, 2) : null,
      email_contato: f.email_contato.trim() || null,
      telefone_contato: f.telefone_contato.trim() || null,
      classificacao_comercial: f.classificacao_comercial,
      status: "implantacao",
    };

    const instRes = await supabase
      .from("instituicoes")
      .insert(instPayload as never)
      .select("id")
      .single();

    if (instRes.error || !instRes.data) {
      toast({
        title: "Erro ao criar instituição",
        description: instRes.error?.message,
        variant: "destructive",
      });
      setCreating(false);
      return;
    }

    const instId = (instRes.data as { id: string }).id;

    const obsExtras: string[] = [];
    if (f.responsavel.trim()) obsExtras.push(`Responsável: ${f.responsavel.trim()}`);
    if (f.email_admin_inicial.trim())
      obsExtras.push(`E-mail do admin inicial: ${f.email_admin_inicial.trim()}`);
    const observacoes = [obsExtras.join(" · "), f.observacoes_comerciais.trim()]
      .filter(Boolean)
      .join("\n");

    const asgPayload = {
      instituicao_id: instId,
      plano_id: f.plano_id,
      status: f.status,
      data_inicio: f.data_inicio || new Date().toISOString().slice(0, 10),
      trial_ate: f.trial_ate || null,
      proximo_vencimento: f.proximo_vencimento || null,
      valor_mensal_cents: f.valor_mensal_cents
        ? Number(f.valor_mensal_cents)
        : null,
      forma_pagamento: f.forma_pagamento || null,
      observacoes_comerciais: observacoes || null,
    };

    const asgRes = await supabase
      .from("assinaturas")
      .insert(asgPayload as never);

    if (asgRes.error) {
      toast({
        title: "Instituição criada, mas falhou a assinatura",
        description: asgRes.error.message,
        variant: "destructive",
      });
      setCreating(false);
      return;
    }

    toast({
      title: "Instituição e assinatura criadas",
      description:
        "Convide o administrador inicial via fluxo de cadastro e vincule-o à instituição.",
    });
    setCreateOpen(false);
    setCreating(false);
    setCreateForm((s) => ({
      ...s,
      nome: "",
      nome_fantasia: "",
      slug: "",
      cidade: "",
      uf: "",
      email_contato: "",
      telefone_contato: "",
      responsavel: "",
      email_admin_inicial: "",
      observacoes_comerciais: "",
      valor_mensal_cents: "",
    }));
    await carregar();
  };

  const resumo = useMemo(() => {
    const total = rows.length;
    const ativas = rows.filter(
      (r) => r.assinatura && ["trial", "ativa"].includes(r.assinatura.status),
    ).length;
    const bloqueadas = rows.filter(
      (r) =>
        r.assinatura && STATUS_BLOQUEIA_MODULOS.includes(r.assinatura.status),
    ).length;
    const inadimplentes = rows.filter(
      (r) => r.assinatura?.status === "inadimplente",
    ).length;
    return { total, ativas, bloqueadas, inadimplentes };
  }, [rows]);

  if (hubLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return <Navigate to={ROUTES.portal} replace />;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <CreditCard className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Central de Assinaturas
          </h1>
          <p className="text-sm text-muted-foreground">
            Controle comercial manual das casas em produção assistida. Nenhuma
            cobrança automática é executada aqui.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Instituições</div>
            <div className="text-2xl font-semibold">{resumo.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Ativas / trial</div>
            <div className="text-2xl font-semibold">{resumo.ativas}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Inadimplentes</div>
            <div className="text-2xl font-semibold">{resumo.inadimplentes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">
              Bloqueadas (suspensa/cancelada/encerrada)
            </div>
            <div className="text-2xl font-semibold">{resumo.bloqueadas}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assinaturas por instituição</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma instituição cadastrada.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Instituição</th>
                    <th className="py-2 pr-4">Classificação</th>
                    <th className="py-2 pr-4">Plano</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Valor</th>
                    <th className="py-2 pr-4">Próx. venc.</th>
                    <th className="py-2 pr-4">Trial até</th>
                    <th className="py-2 pr-4">Cobrança</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const plano = planos.find(
                      (p) => p.id === r.assinatura?.plano_id,
                    );
                    return (
                      <tr key={r.instituicao.id} className="border-t">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{r.instituicao.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            {[r.instituicao.cidade, r.instituicao.uf]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline">
                            {CLASSIFICACAO.find(
                              (c) =>
                                c.key ===
                                r.instituicao.classificacao_comercial,
                            )?.label ?? r.instituicao.classificacao_comercial}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">{plano?.nome ?? "—"}</td>
                        <td className="py-2 pr-4">
                          {r.assinatura ? (
                            <Badge variant={statusVariant(r.assinatura.status)}>
                              {r.assinatura.status}
                            </Badge>
                          ) : (
                            <Badge variant="outline">sem assinatura</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {centsToBRL(r.assinatura?.valor_mensal_cents ?? null)}
                        </td>
                        <td className="py-2 pr-4">
                          {r.assinatura?.proximo_vencimento
                            ? new Date(
                                r.assinatura.proximo_vencimento,
                              ).toLocaleDateString("pt-BR")
                            : "—"}
                        </td>
                        <td className="py-2 pr-4">
                          {r.assinatura?.trial_ate
                            ? new Date(
                                r.assinatura.trial_ate,
                              ).toLocaleDateString("pt-BR")
                            : "—"}
                        </td>
                        <td className="py-2 pr-4">
                          {r.assinatura?.forma_pagamento
                            ? (FORMA_PAGAMENTO.find(
                                (f) => f.key === r.assinatura!.forma_pagamento,
                              )?.label ?? r.assinatura.forma_pagamento)
                            : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Cobrança automática por gateway intencionalmente não
        integrada nesta fase. Ver{" "}
        <code>docs/SAAS-06-B0-CENTRAL-ASSINATURAS.md</code>.
      </p>

      <Dialog
        open={edit.open}
        onOpenChange={(o) =>
          setEdit((s) => ({ ...s, open: o, row: o ? s.row : null }))
        }
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Editar assinatura — {edit.row?.instituicao.nome}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Classificação comercial</Label>
              <Select
                value={edit.form.classificacao_comercial}
                onValueChange={(v) =>
                  setEdit((s) => ({
                    ...s,
                    form: { ...s.form, classificacao_comercial: v },
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLASSIFICACAO.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Plano</Label>
              <Select
                value={edit.form.plano_id}
                onValueChange={(v) =>
                  setEdit((s) => ({ ...s, form: { ...s.form, plano_id: v } }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um plano" />
                </SelectTrigger>
                <SelectContent>
                  {planos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status</Label>
              <Select
                value={edit.form.status}
                onValueChange={(v) =>
                  setEdit((s) => ({ ...s, form: { ...s.form, status: v } }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ASSINATURA.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Forma de pagamento</Label>
              <Select
                value={edit.form.forma_pagamento || "__none__"}
                onValueChange={(v) =>
                  setEdit((s) => ({
                    ...s,
                    form: {
                      ...s.form,
                      forma_pagamento: v === "__none__" ? "" : v,
                    },
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {FORMA_PAGAMENTO.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Data de início</Label>
              <Input
                type="date"
                value={edit.form.data_inicio}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    form: { ...s.form, data_inicio: e.target.value },
                  }))
                }
              />
            </div>

            <div>
              <Label>Data de término</Label>
              <Input
                type="date"
                value={edit.form.data_fim}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    form: { ...s.form, data_fim: e.target.value },
                  }))
                }
              />
            </div>

            <div>
              <Label>Trial até</Label>
              <Input
                type="date"
                value={edit.form.trial_ate}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    form: { ...s.form, trial_ate: e.target.value },
                  }))
                }
              />
            </div>

            <div>
              <Label>Próximo vencimento</Label>
              <Input
                type="date"
                value={edit.form.proximo_vencimento}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    form: { ...s.form, proximo_vencimento: e.target.value },
                  }))
                }
              />
            </div>

            <div>
              <Label>Último pagamento</Label>
              <Input
                type="date"
                value={edit.form.ultimo_pagamento_em}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    form: { ...s.form, ultimo_pagamento_em: e.target.value },
                  }))
                }
              />
            </div>

            <div>
              <Label>Valor mensal (em centavos)</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={edit.form.valor_mensal_cents}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    form: { ...s.form, valor_mensal_cents: e.target.value },
                  }))
                }
                placeholder="Ex.: 19900 = R$ 199,00"
              />
            </div>

            <div className="md:col-span-2">
              <Label>Condição especial</Label>
              <Input
                value={edit.form.condicao_especial}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    form: { ...s.form, condicao_especial: e.target.value },
                  }))
                }
                placeholder="Ex.: desconto de implantação, parceria etc."
              />
            </div>

            <div className="md:col-span-2">
              <Label>Observações comerciais</Label>
              <Textarea
                rows={3}
                value={edit.form.observacoes_comerciais}
                onChange={(e) =>
                  setEdit((s) => ({
                    ...s,
                    form: {
                      ...s.form,
                      observacoes_comerciais: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setEdit((s) => ({ ...s, open: false, row: null }))
              }
              disabled={edit.saving}
            >
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={edit.saving}>
              {edit.saving && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
