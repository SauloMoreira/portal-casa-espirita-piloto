/**
 * SAAS-06-C1-STAB10-C.0 — Cadastro público temporariamente indisponível.
 *
 * A rota permanece registrada para não quebrar links/QRs existentes e bundles
 * antigos em cache. O formulário e a chamada a `request-signup` foram
 * removidos; qualquer criação de conta pública é bloqueada fail-closed no
 * backend (ver supabase/functions/request-signup/index.ts).
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import brandIcon from "@/assets/portal-casa-espirita-icon.png";
import { SAAS_BRANDING } from "@/config/saasBranding";

export default function SolicitarCadastro() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/60 via-background to-background" />
        <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-8">
        <header className="text-center space-y-4">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-card/70 shadow-lg ring-1 ring-border/60 backdrop-blur-sm">
            <img
              src={brandIcon}
              alt={SAAS_BRANDING.name}
              width={96}
              height={96}
              className="h-20 w-20 object-contain"
            />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Cadastro público <span className="text-primary">indisponível</span>
            </h1>
          </div>
        </header>

        <Card className="rounded-2xl border-border/60 bg-card/85 shadow-xl backdrop-blur-md">
          <CardContent className="space-y-5 p-7 sm:p-8">
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle className="text-sm">
                Cadastro público temporariamente indisponível
              </AlertTitle>
              <AlertDescription className="text-xs leading-relaxed">
                A criação de conta pela internet está temporariamente
                desativada. Entre em contato com a casa espírita para solicitar
                seu acesso — um voluntário responsável irá gerar suas
                credenciais e vinculá-lo à instituição correta.
              </AlertDescription>
            </Alert>

            <Button asChild variant="outline" className="w-full">
              <Link to="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar ao login
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
