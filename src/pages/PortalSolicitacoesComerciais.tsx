/**
 * SAAS-06-B0.4 — Portal · Solicitações Comerciais (visão platform_admin).
 *
 * Lista solicitações abertas pelos administradores locais e permite alterar
 * status + observação interna. Aprovar NÃO habilita módulo automaticamente:
 * a habilitação continua sendo feita na Central de Assinaturas → Editar.
 */
import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
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
} from "@/components/ui/dialog";
import { Loader2, Send, ShieldCheck, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalHub } from "@/hooks/usePortalHub";
import { ROUTES } from "@/constants";

interface Row {
  id: string;
  instituicao_id: string;
  solicitante_user_id: string;
  tipo: string;
  modulo_codigo: string | null;
  mensagem: string;
  status: string;
  observacao_interna: string | null;
  created_at: string;
  concluida_em: string | null;
}

interface Inst {
  id: string;
  nome: string;
}

const STATUS_ORDER = [
  "pendente",
  "em_analise",
  "aguardando_pagamento",
  "aprovada",
  "recusada",
  "concluida",
  "cancelada",
] as const;

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_analise: "Em análise",
  aguardando_pagamento: "Aguardando pagamento",
  aprovada: "Aprovada",
  recusada: "Recusada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pendente: "secondary",
  em_analise: "secondary",
  aguardando_pagamento: "secondary",
  aprovada: "default",
  concluida: "default",
  recusada: "destructive",
  cancelada: "outline",
};

const TIPO_LABEL: Record<string, string> = {
  novo_modulo: "Novo módulo",
  desabilitar_modulo: "Desabilitar módulo",
  alterar_plano: "Alterar plano",
  segunda_via_cobranca: "Segunda via de cobrança",
  cancelamento: "Cancelamento",
  contato_comercial: "Contato comercial",
  outro: "Outro",
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

export default function PortalSolicitacoesComerciais() {
  const { isPlatformAdmin, isLoading } = usePortalHub();
  const qc = useQueryClient();
  const [filtroInst, setFiltroInst] = useState<string>("__all__");
  const [filtroStatus, setFiltroStatus] = useState<string>("__all__");
  const [editing, setEditing] = useState<Row | null>(null);

  const institQuery = useQuery({
    queryKey: ["portal-admin", "instituicoes-min"],
    enabled: isPlatformAdmin,
    queryFn: async (): Promise<Inst[]> => {
      const { data, error } = await supabase
        .from("instituicoes")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Inst[];
    },
  });

  const solicitQuery = useQuery({
    queryKey: ["portal-admin", "solicitacoes", filtroInst, filtroStatus],
    enabled: isPlatformAdmin,
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("solicitacoes_comerciais")
        .select(
          "id, instituicao_id, solicitante_user_id, tipo, modulo_codigo, mensagem, status, observacao_interna, created_at, concluida_em",
        )
        .order("created_at", { ascending: false });
      if (filtroInst !== "__all__") q = q.eq("instituicao_id", filtroInst);
      if (filtroStatus !== "__all__") q = q.eq("status", filtroStatus);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const updateMut = useMutation({
    mutationFn: async (params: {
      id: string;
      status: string;
      observacao_interna: string | null;
    }) => {
      const { error } = await supabase
        .from("solicitacoes_comerciais")
        .update({
          status: params.status,
          observacao_interna: params.observacao_interna,
        })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação atualizada.");
      qc.invalidateQueries({ queryKey: ["portal-admin", "solicitacoes"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message ?? "Falha ao atualizar."),
  });

  const nomes = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of institQuery.data ?? []) map.set(i.id, i.nome);
    return map;
  }, [institQuery.data]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isPlatformAdmin) return <Navigate to={ROUTES.portal} replace />;

  const rows = solicitQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Solicitações comerciais
            </h1>
            <p className="text-sm text-muted-foreground">
              Central de Assinaturas → solicitações abertas pelos administradores
              locais. Aprovar aqui NÃO habilita módulo — a habilitação continua
              na Central de Assinaturas.
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={ROUTES.portalAssinaturas}>
            <CreditCard className="mr-2 h-4 w-4" /> Central de Assinaturas
          </Link>
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-5 w-5 text-primary" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="w-64">
            <Label className="text-xs">Instituição</Label>
            <Select value={filtroInst} onValueChange={setFiltroInst}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {(institQuery.data ?? []).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-56">
            <Label className="text-xs">Status</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {rows.length} solicitação(ões)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {solicitQuery.isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma solicitação para os filtros selecionados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Data</th>
                    <th className="py-2 pr-4">Instituição</th>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Módulo</th>
                    <th className="py-2 pr-4">Mensagem</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="py-2 pr-4">{formatDate(r.created_at)}</td>
                      <td className="py-2 pr-4">
                        {nomes.get(r.instituicao_id) ?? r.instituicao_id}
                      </td>
                      <td className="py-2 pr-4">
                        {TIPO_LABEL[r.tipo] ?? r.tipo}
                      </td>
                      <td className="py-2 pr-4">{r.modulo_codigo ?? "—"}</td>
                      <td className="py-2 pr-4 max-w-sm whitespace-pre-line text-xs text-muted-foreground">
                        {r.mensagem}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={STATUS_VARIANT[r.status]}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(r)}
                        >
                          Gerenciar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <EditDialog
        row={editing}
        onClose={() => setEditing(null)}
        onSave={(status, obs) =>
          editing &&
          updateMut.mutate({
            id: editing.id,
            status,
            observacao_interna: obs,
          })
        }
        saving={updateMut.isPending}
      />
    </div>
  );
}

function EditDialog({
  row,
  onClose,
  onSave,
  saving,
}: {
  row: Row | null;
  onClose: () => void;
  onSave: (status: string, obs: string | null) => void;
  saving: boolean;
}) {
  const [status, setStatus] = useState<string>(row?.status ?? "pendente");
  const [obs, setObs] = useState<string>(row?.observacao_interna ?? "");

  useMemo(() => {
    setStatus(row?.status ?? "pendente");
    setObs(row?.observacao_interna ?? "");
  }, [row?.id]);

  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerenciar solicitação</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {TIPO_LABEL[row.tipo] ?? row.tipo}
              {row.modulo_codigo ? ` · ${row.modulo_codigo}` : ""} · aberta em{" "}
              {formatDate(row.created_at)}
            </p>
            <div className="rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-line">
              {row.mensagem}
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Observação interna</Label>
              <Textarea
                rows={4}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Anotações internas — não visíveis ao cliente."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Aprovar não habilita módulo automaticamente. Efetive a mudança
              real na Central de Assinaturas → Editar → Módulos habilitados.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={() => onSave(status, obs.trim() ? obs.trim() : null)}
            disabled={saving}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
