/**
 * SAAS-06-B0.4 — Portal do Cliente: Plano e Assinatura (visão do admin local).
 *
 * Página acessível ao administrador local da instituição e ao platform_admin.
 * Mostra plano, status da assinatura, módulos habilitados, vencimentos,
 * documentos comerciais e permite abrir solicitações comerciais.
 *
 * Regras (defense-in-depth; RLS é fonte de verdade no backend):
 *  - admin local só vê a instituição ativa selecionada.
 *  - admin local NÃO altera plano/status/módulos — apenas SOLICITA.
 *  - assistidos, voluntários comuns, tarefeiros e vínculos inativos ficam bloqueados.
 */
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2,
  CreditCard,
  CalendarClock,
  Building2,
  Boxes,
  Send,
  FileText,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInstituicaoAtiva } from "@/contexts/InstituicaoContext";
import type {
  SaasAssinaturaStatus,
  PortalInstituicaoView,
} from "@/hooks/usePortalHub";
import { ROUTES } from "@/constants";

// --- Constantes ---
const MODULOS_COMERCIAIS: Array<{
  codigo: string;
  nome: string;
  descricao: string;
  disponivel: boolean;
}> = [
  {
    codigo: "tratamentos",
    nome: "Tratamentos",
    descricao:
      "Agenda, entrevistas, presença, relatórios, comunicação e IA de apoio (funcionalidades internas do módulo).",
    disponivel: true,
  },
  {
    codigo: "caixa",
    nome: "Caixa / Cantina",
    descricao: "Controle financeiro de caixa e cantina da casa.",
    disponivel: false,
  },
  {
    codigo: "biblioteca",
    nome: "Biblioteca",
    descricao: "Empréstimo, devolução e catálogo da biblioteca da casa.",
    disponivel: false,
  },
  {
    codigo: "portal",
    nome: "Portal Institucional",
    descricao: "Site institucional público da casa espírita.",
    disponivel: false,
  },
  {
    codigo: "financeiro",
    nome: "Financeiro",
    descricao: "Fluxo de caixa, contas a pagar/receber e prestação de contas.",
    disponivel: false,
  },
];

const STATUS_LABEL: Record<SaasAssinaturaStatus, string> = {
  trial: "Em avaliação",
  ativa: "Ativa",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
  inadimplente: "Inadimplente",
  encerrada: "Encerrada",
};

const CLASSIFICACAO_LABEL: Record<string, string> = {
  demo: "Demonstração",
  piloto: "Piloto",
  producao_assistida: "Produção Assistida",
  cliente: "Cliente",
};

// Tipos, status e labels centralizados em `constants/solicitacoesComerciais`.
import {
  TIPO_SOLICITACAO_LABEL,
  TIPOS_ATIVOS_UI,
  STATUS_LABEL as STATUS_SOLICITACAO_LABEL,
  STATUS_VARIANT as STATUS_SOLICITACAO_VARIANT,
} from "@/constants/solicitacoesComerciais";

const DOCUMENTOS_PADRAO: Array<{ titulo: string; caminho: string }> = [
  { titulo: "Proposta comercial", caminho: "docs/saas-06-a/01-proposta-comercial.md" },
  { titulo: "Termo de adesão SaaS", caminho: "docs/saas-06-a/02-termo-adesao-saas.md" },
  { titulo: "Anexo LGPD", caminho: "docs/saas-06-a/03-anexo-lgpd.md" },
  { titulo: "Política de suporte", caminho: "docs/saas-06-a/04-politica-suporte.md" },
];

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function formatMoneyCents(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const LABEL_MODULO_COMERCIAL: Record<string, string> = Object.fromEntries(
  MODULOS_COMERCIAIS.map((m) => [m.codigo, m.nome]),
);

function labelModuloComercial(codigo: string | null | undefined) {
  if (!codigo) return "—";
  return LABEL_MODULO_COMERCIAL[codigo] ?? codigo;
}


// --- Componente auxiliar ---
interface AssinaturaComercial {
  id: string;
  status: SaasAssinaturaStatus;
  trial_ate: string | null;
  data_inicio: string;
  data_fim: string | null;
  valor_mensal_cents: number | null;
  forma_pagamento: string | null;
  proximo_vencimento: string | null;
  ultimo_pagamento_em: string | null;
  observacoes_cliente: string | null;
  classificacao: string | null;
  condicao_especial: string | null;
}

interface SolicitacaoRow {
  id: string;
  tipo: string;
  modulo_codigo: string | null;
  mensagem: string;
  status: string;
  created_at: string;
  concluida_em: string | null;
}

export default function PortalPlanoAssinatura() {
  const { user } = useAuth();
  const {
    isLoading: hubLoading,
    isPlatformAdmin,
    selecionada,
  } = useInstituicaoAtiva();

  // Guarda: admin local (via papel_local) OU platform_admin.
  const podeAcessar =
    isPlatformAdmin ||
    (selecionada?.vinculo_status === "ativo" &&
      selecionada?.papel_local === "admin_instituicao");

  const instId = selecionada?.id ?? null;

  // Dados comerciais da assinatura (campos não expostos por usePortalHub).
  const comercialQuery = useQuery({
    queryKey: ["portal-cliente", "assinatura-comercial", instId],
    enabled: Boolean(instId && podeAcessar),
    queryFn: async (): Promise<AssinaturaComercial | null> => {
      if (!instId) return null;
      const { data, error } = await supabase
        .from("assinaturas")
        .select(
          "id, status, trial_ate, data_inicio, data_fim, valor_mensal_cents, forma_pagamento, proximo_vencimento, ultimo_pagamento_em, observacoes_cliente, classificacao, condicao_especial",
        )
        .eq("instituicao_id", instId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown) as AssinaturaComercial | null;
    },
  });

  const solicitacoesQuery = useQuery({
    queryKey: ["portal-cliente", "solicitacoes", instId],
    enabled: Boolean(instId && podeAcessar),
    queryFn: async (): Promise<SolicitacaoRow[]> => {
      if (!instId) return [];
      const { data, error } = await supabase
        .from("solicitacoes_comerciais")
        .select("id, tipo, modulo_codigo, mensagem, status, created_at, concluida_em")
        .eq("instituicao_id", instId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SolicitacaoRow[];
    },
  });

  if (hubLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!podeAcessar) {
    return <Navigate to={ROUTES.portal} replace />;
  }

  if (!selecionada) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          Selecione uma instituição no Portal para consultar o plano.
        </CardContent>
      </Card>
    );
  }

  const assinatura = comercialQuery.data ?? null;
  const modulosHabilitados = selecionada.modulos.filter((m) => m.ativo_no_plano);
  const codigosHabilitados = new Set(modulosHabilitados.map((m) => m.codigo));

  return (
    <div className="space-y-6 pb-24 sm:pb-16">

      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Plano e Assinatura
            </h1>
            <p className="text-sm text-muted-foreground">
              Visão comercial da instituição — consulte plano, módulos e abra
              solicitações.
            </p>
          </div>
        </div>
      </header>

      {/* Bloco 1 — Instituição + plano/status */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-primary" /> Dados comerciais
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <Info label="Instituição" value={selecionada.nome} />
            <Info
              label="Plano"
              value={selecionada.plano?.nome ?? "Sem plano vinculado"}
            />
            <Info
              label="Status da assinatura"
              value={
                assinatura ? (
                  <Badge>{STATUS_LABEL[assinatura.status]}</Badge>
                ) : (
                  <Badge variant="outline">Sem assinatura</Badge>
                )
              }
            />
            <Info
              label="Classificação"
              value={
                assinatura?.classificacao
                  ? CLASSIFICACAO_LABEL[assinatura.classificacao] ??
                    assinatura.classificacao
                  : "—"
              }
            />
            <Info
              label="Valor mensal"
              value={formatMoneyCents(assinatura?.valor_mensal_cents)}
            />
            <Info
              label="Forma de cobrança"
              value={assinatura?.forma_pagamento ?? "—"}
            />
            <Info
              label="Próximo vencimento"
              value={
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  {formatDate(assinatura?.proximo_vencimento)}
                </span>
              }
            />
            <Info
              label="Último pagamento"
              value={formatDate(assinatura?.ultimo_pagamento_em)}
            />
            <Info label="Trial até" value={formatDate(assinatura?.trial_ate)} />
            <Info label="Início" value={formatDate(assinatura?.data_inicio)} />
            {assinatura?.observacoes_cliente && (
              <div className="sm:col-span-2 rounded-md border bg-muted/40 p-3 text-xs">
                <p className="font-medium text-foreground">
                  Observações comerciais
                </p>
                <p className="mt-1 whitespace-pre-line text-muted-foreground">
                  {assinatura.observacoes_cliente}
                </p>
              </div>
            )}
            <div className="sm:col-span-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Cobrança manual nesta fase.</strong>{" "}
              Ainda não há gateway de pagamento integrado. Boletos, PIX e
              comprovantes são tratados pela equipe do Portal.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-primary" /> Documentos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground">
              Documentos comerciais padrão do kit de Produção Assistida.
              Solicite ao Portal uma via personalizada, se necessário.
            </p>
            <ul className="space-y-1 text-xs">
              {DOCUMENTOS_PADRAO.map((d) => (
                <li key={d.caminho} className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">{d.titulo}</p>
                    <p className="text-muted-foreground">{d.caminho}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Bloco 2 — Módulos comerciais */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-5 w-5 text-primary" /> Módulos comerciais
          </CardTitle>
        </CardHeader>
        <CardContent>
          {modulosHabilitados.length === 0 && (
            <p className="mb-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Nenhum módulo comercial habilitado nesta instituição. Solicite
              habilitação abaixo — a aprovação e efetivação continuam com o
              Portal.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {MODULOS_COMERCIAIS.map((m) => {
              const ativo = codigosHabilitados.has(m.codigo);
              return (
                <div
                  key={m.codigo}
                  className="rounded-lg border p-3 text-sm data-[ativo=true]:border-primary/50 data-[ativo=true]:bg-primary/5"
                  data-ativo={ativo}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{m.nome}</p>
                    {ativo ? (
                      <Badge>Habilitado</Badge>
                    ) : m.disponivel ? (
                      <Badge variant="outline">Disponível</Badge>
                    ) : (
                      <Badge variant="secondary">Em breve</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.descricao}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Bloco 3 — Solicitações comerciais */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-5 w-5 text-primary" /> Solicitações comerciais
          </CardTitle>
          <NovaSolicitacaoDialog
            instituicaoId={selecionada.id}
            userId={user?.id ?? ""}
            onCriada={() => solicitacoesQuery.refetch()}
          />
        </CardHeader>
        <CardContent>
          {solicitacoesQuery.isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (solicitacoesQuery.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma solicitação registrada até o momento.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Data</th>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Módulo</th>
                    <th className="py-2 pr-4">Mensagem</th>
                    <th className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(solicitacoesQuery.data ?? []).map((s) => (
                    <tr key={s.id} className="border-t align-top">
                      <td className="py-2 pr-4">{formatDate(s.created_at)}</td>
                      <td className="py-2 pr-4">
                        {TIPO_SOLICITACAO_LABEL[s.tipo] ?? s.tipo}
                      </td>
                      <td className="py-2 pr-4">
                        {labelModuloComercial(s.modulo_codigo)}
                      </td>

                      <td className="py-2 pr-4 max-w-md whitespace-pre-line text-xs text-muted-foreground">
                        {s.mensagem}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={STATUS_SOLICITACAO_VARIANT[s.status]}>
                          {STATUS_SOLICITACAO_LABEL[s.status] ?? s.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Auxiliares ---
function Info({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function NovaSolicitacaoDialog({
  instituicaoId,
  userId,
  onCriada,
}: {
  instituicaoId: string;
  userId: string;
  onCriada: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<string>("falar_com_comercial");
  const [moduloCodigo, setModuloCodigo] = useState<string>("");
  const [mensagem, setMensagem] = useState("");
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Usuário não autenticado.");
      if (mensagem.trim().length < 5) {
        throw new Error("Descreva a solicitação com pelo menos 5 caracteres.");
      }
      const { error } = await supabase.from("solicitacoes_comerciais").insert({
        instituicao_id: instituicaoId,
        solicitante_user_id: userId,
        tipo,
        modulo_codigo: moduloCodigo || null,
        mensagem: mensagem.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação enviada. A equipe do Portal analisará em breve.");
      setOpen(false);
      setTipo("falar_com_comercial");
      setModuloCodigo("");
      setMensagem("");
      qc.invalidateQueries({ queryKey: ["portal-cliente", "solicitacoes"] });
      onCriada();
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao enviar solicitação."),
  });

  const precisaModulo =
    tipo === "solicitar_novo_modulo" || tipo === "solicitar_desabilitar_modulo";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Send className="mr-2 h-4 w-4" /> Nova solicitação
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova solicitação comercial</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_ATIVOS_UI.map((k) => (
                  <SelectItem key={k} value={k}>
                    {TIPO_SOLICITACAO_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {precisaModulo && (
            <div className="space-y-1">
              <Label>Módulo</Label>
              <Select value={moduloCodigo} onValueChange={setModuloCodigo}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um módulo" />
                </SelectTrigger>
                <SelectContent>
                  {MODULOS_COMERCIAIS.map((m) => (
                    <SelectItem key={m.codigo} value={m.codigo}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Mensagem</Label>
            <Textarea
              rows={5}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Descreva o que você precisa. Alterações comerciais são efetivadas manualmente pelo Portal."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Você não altera plano ou módulos diretamente. Esta solicitação será
            analisada pela equipe do Portal.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Enviar solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Suppress unused var warning if PortalInstituicaoView type is imported for future extension.
void ({} as PortalInstituicaoView | undefined);
