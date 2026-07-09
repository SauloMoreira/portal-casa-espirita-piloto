import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePortalHub } from "@/hooks/usePortalHub";
import { ROUTES } from "@/constants";

interface InstituicaoAdminRow {
  id: string;
  nome: string;
  slug: string;
  status: string;
  cidade: string | null;
  uf: string | null;
  created_at: string;
}

interface AssinaturaAdminRow {
  id: string;
  instituicao_id: string;
  plano_id: string;
  status: string;
  trial_ate: string | null;
  data_inicio: string;
  data_fim: string | null;
}

interface PlanoRow {
  id: string;
  codigo: string;
  nome: string;
}

/**
 * SAAS-03 — Visão administrativa da plataforma.
 *
 * Só é renderizada quando o usuário está em `platform_admins` (validação por
 * RLS: as próprias queries retornam vazio quando o requisitante não é admin
 * de plataforma). O redirect é apenas defesa em profundidade.
 */
export default function PortalAdmin() {
  const { isPlatformAdmin, isLoading: hubLoading } = usePortalHub();
  const [loading, setLoading] = useState(true);
  const [instituicoes, setInstituicoes] = useState<InstituicaoAdminRow[]>([]);
  const [assinaturas, setAssinaturas] = useState<AssinaturaAdminRow[]>([]);
  const [planos, setPlanos] = useState<PlanoRow[]>([]);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      const [instRes, asgRes, planosRes] = await Promise.all([
        supabase
          .from("instituicoes")
          .select("id, nome, slug, status, cidade, uf, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("assinaturas")
          .select("id, instituicao_id, plano_id, status, trial_ate, data_inicio, data_fim"),
        supabase.from("planos").select("id, codigo, nome"),
      ]);
      if (!mounted) return;
      setInstituicoes((instRes.data ?? []) as InstituicaoAdminRow[]);
      setAssinaturas((asgRes.data ?? []) as AssinaturaAdminRow[]);
      setPlanos((planosRes.data ?? []) as PlanoRow[]);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [isPlatformAdmin]);

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Administração da plataforma</h1>
            <p className="text-sm text-muted-foreground">
              Visão global de instituições, planos e assinaturas.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to={ROUTES.portalAssinaturas}>
              <CreditCard className="h-4 w-4 mr-2" /> Central de Assinaturas
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={ROUTES.portalSolicitacoes}>
              <Send className="h-4 w-4 mr-2" /> Solicitações comerciais
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instituições</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : instituicoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma instituição cadastrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Instituição</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Plano</th>
                    <th className="py-2 pr-4">Assinatura</th>
                    <th className="py-2 pr-4">Trial até</th>
                  </tr>
                </thead>
                <tbody>
                  {instituicoes.map((inst) => {
                    const asg = assinaturas.find((a) => a.instituicao_id === inst.id);
                    const plano = asg ? planos.find((p) => p.id === asg.plano_id) : null;
                    return (
                      <tr key={inst.id} className="border-t">
                        <td className="py-2 pr-4">
                          <div className="font-medium">{inst.nome}</div>
                          <div className="text-xs text-muted-foreground">
                            {[inst.cidade, inst.uf].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline">{inst.status}</Badge>
                        </td>
                        <td className="py-2 pr-4">{plano?.nome ?? "—"}</td>
                        <td className="py-2 pr-4">
                          {asg ? <Badge>{asg.status}</Badge> : "—"}
                        </td>
                        <td className="py-2 pr-4">
                          {asg?.trial_ate
                            ? new Date(asg.trial_ate).toLocaleDateString("pt-BR")
                            : "—"}
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
    </div>
  );
}
