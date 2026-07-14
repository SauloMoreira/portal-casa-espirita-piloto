import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { traduzirErroAuth } from "@/lib/authErrors";
import brandIcon from "@/assets/portal-casa-espirita-icon.png";
import { SAAS_BRANDING } from "@/config/saasBranding";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Only allow same-origin relative paths as post-login redirect targets.
  const rawNext = searchParams.get("next");
  const nextPath = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // If the account has a verified second factor, the session is still aal1
      // and must complete the TOTP step before reaching protected content.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2") {
        navigate(nextPath ? `/mfa-verify?next=${encodeURIComponent(nextPath)}` : "/mfa-verify");
      } else {
        navigate(nextPath ?? "/dashboard");
      }
    } catch (error: any) {
      toast({
        title: "Erro ao entrar",
        description: traduzirErroAuth(error?.message),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Soft serene background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/60 via-background to-background" />
        <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-8">
        {/* Brand header */}
        <header className="text-center space-y-4">
          <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-3xl bg-card/70 shadow-lg ring-1 ring-border/60 backdrop-blur-sm">
            <img
              src={brandIcon}
              alt={SAAS_BRANDING.name}
              width={112}
              height={112}
              className="h-24 w-24 object-contain"
            />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              {SAAS_BRANDING.prefix} <span className="text-primary">{SAAS_BRANDING.highlight}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {SAAS_BRANDING.subtitle}
            </p>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent/90">
              {SAAS_BRANDING.tagline}
            </p>
          </div>
        </header>

        {/* Login card */}
        <Card className="rounded-2xl border-border/60 bg-card/85 shadow-xl backdrop-blur-md">
          <CardContent className="p-7 sm:p-8">
            <div className="mb-6 text-center">
              <h2 className="font-display text-xl font-semibold text-foreground">
                Bem-vindo de volta
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Acesse sua conta para continuar
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-11 pl-10 pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                >
                  Esqueceu a senha?
                </Link>
              </div>

              <Button
                type="submit"
                size="lg"
                className="h-12 w-full text-base font-semibold shadow-md transition-all hover:shadow-lg"
                disabled={loading}
              >
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Ainda não tem cadastro?{" "}
              <Link to="/cadastro" className="font-medium text-primary hover:underline">
                Cadastre-se
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Footer note */}
        <div className="flex flex-col items-center justify-center gap-1 text-center text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
            <span>
              Acesso restrito a usuários autorizados. Em caso de necessidade, contate a administração.
            </span>
          </div>
          <p className="pt-1 text-[11px] font-medium tracking-wide text-muted-foreground/80">
            {SAAS_BRANDING.signature}
          </p>
        </div>
      </div>
    </div>
  );
}
