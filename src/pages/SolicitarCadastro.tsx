import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowLeft, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import brandIcon from "@/assets/portal-casa-espirita-icon.png";
import { SAAS_BRANDING } from "@/config/saasBranding";

interface InstituicaoPublica {
  nome: string;
  slug: string;
}

export default function SolicitarCadastro() {
  const [instituicoes, setInstituicoes] = useState<InstituicaoPublica[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.rpc("fn_instituicoes_autocadastro_publico");
      if (mounted) {
        setInstituicoes((data ?? []) as InstituicaoPublica[]);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={brandIcon} alt={SAAS_BRANDING.nome} className="h-16 w-16 mb-3" />
          <h1 className="text-2xl font-semibold text-foreground">{SAAS_BRANDING.nome}</h1>
        </div>

        <Card className="border-border/60 shadow-lg">
          <CardContent className="p-7 sm:p-8">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                Qual é a sua casa espírita?
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Escolha a instituição que você frequenta para continuar seu cadastro.
              </p>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : instituicoes.length === 0 ? (
                <div className="rounded-xl border border-border/60 bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                  Nenhuma instituição está aceitando cadastro público no momento.
                  <br />
                  Procure a recepção da sua casa espírita para orientação.
                </div>
              ) : (
                instituicoes.map((inst) => (
                  <button
                    key={inst.slug}
                    type="button"
                    onClick={() => navigate(`/cadastro-assistido/${inst.slug}`)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/50 p-4 text-left transition-colors hover:bg-primary/5 hover:border-primary/40"
                  >
                    <Building2 className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-sm font-medium text-foreground">{inst.nome}</span>
                  </button>
                ))
              )}
            </div>

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar para o login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
