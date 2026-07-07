import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveInvokeErrorMessage, edgeBodyError } from "@/lib/edgeFunctionResponse";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldCheck, KeyRound, Smartphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isValidTotpCode, isValidRecoveryCodeFormat } from "@/lib/mfa";
import ferIcon from "@/assets/fer-icon.png";

export default function MfaVerify() {
  const { refreshMfa, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const rawNext = searchParams.get("next");
  const nextPath = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  const [code, setCode] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recovery, setRecovery] = useState("");
  const [loading, setLoading] = useState(false);

  // Self-sufficient gate: query the assurance level directly so we never bounce
  // to a protected page during the context's async refresh window.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) { if (active) navigate("/login", { replace: true }); return; }
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const pending = data?.currentLevel === "aal1" && data?.nextLevel === "aal2";
      if (active && !pending) navigate(nextPath, { replace: true });
    })();
    return () => { active = false; };
  }, [navigate]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidTotpCode(code)) {
      toast({ title: "Código inválido", description: "Informe os 6 dígitos do app autenticador.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data: factorsData, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) throw listErr;
      const factor = factorsData?.totp?.find((f) => f.status === "verified") || factorsData?.totp?.[0];
      if (!factor) throw new Error("Nenhum fator de autenticação encontrado.");

      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (chErr) throw chErr;

      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (verErr) {
        await supabase.functions.invoke("mfa-manager", { body: { action: "audit", evento: "MFA_FALHA", detalhe: "login" } }).catch(() => {});
        throw verErr;
      }
      await refreshMfa();
      navigate(nextPath, { replace: true });
    } catch (err: any) {
      toast({ title: "Falha na verificação", description: err?.message || "Código incorreto.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidRecoveryCodeFormat(recovery)) {
      toast({ title: "Código inválido", description: "Verifique o código de recuperação.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mfa-manager", {
        body: { action: "consume_recovery", code: recovery.trim() },
      });
      if (error) {
        const ctx = (error as any)?.context;
        let msg = error.message;
        try { const p = ctx && typeof ctx.json === "function" ? await ctx.json() : null; if (p?.error) msg = p.error; } catch { /* ignore */ }
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: "Acesso recuperado",
        description: "MFA desativado. Reative o autenticador assim que possível.",
      });
      await refreshMfa();
      navigate(nextPath, { replace: true });
    } catch (err: any) {
      toast({ title: "Não foi possível recuperar", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/60 via-background to-background" />
        <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-8">
        <header className="text-center space-y-4">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-card/70 shadow-lg ring-1 ring-border/60 backdrop-blur-sm">
            <img src={ferIcon} alt="Tratamentos FER" width={96} height={96} className="h-20 w-20 object-contain" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Verificação em <span className="text-primary">duas etapas</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Sua conta tem proteção extra. Confirme o segundo fator para continuar.
            </p>
          </div>
        </header>

        <Card className="rounded-2xl border-border/60 bg-card/85 shadow-xl backdrop-blur-md">
          <CardContent className="p-7 sm:p-8">
            {!recoveryMode ? (
              <form onSubmit={handleVerify} className="space-y-5">
                <Alert>
                  <Smartphone className="h-4 w-4" />
                  <AlertTitle className="text-sm">Código do autenticador</AlertTitle>
                  <AlertDescription className="text-xs">
                    Abra o app autenticador (Google/Microsoft Authenticator, Authy) e informe o código de 6 dígitos.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="totp">Código de 6 dígitos</Label>
                  <Input
                    id="totp"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    autoFocus
                    className="h-12 text-center text-2xl tracking-[0.5em]"
                  />
                </div>
                <Button type="submit" size="lg" className="h-12 w-full text-base font-semibold" disabled={loading}>
                  {loading ? "Verificando..." : "Verificar e entrar"}
                </Button>
                <button type="button" onClick={() => setRecoveryMode(true)}
                  className="flex w-full items-center justify-center gap-2 text-sm font-medium text-primary hover:underline">
                  <KeyRound className="h-4 w-4" /> Perdi o acesso ao autenticador
                </button>
              </form>
            ) : (
              <form onSubmit={handleRecovery} className="space-y-5">
                <Alert>
                  <KeyRound className="h-4 w-4" />
                  <AlertTitle className="text-sm">Código de recuperação</AlertTitle>
                  <AlertDescription className="text-xs">
                    Use um dos códigos de recuperação salvos na ativação. Cada código funciona uma única vez e
                    desativará o MFA — reative-o depois nas configurações de segurança.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="rec">Código de recuperação</Label>
                  <Input
                    id="rec"
                    value={recovery}
                    onChange={(e) => setRecovery(e.target.value.toUpperCase().slice(0, 11))}
                    placeholder="XXXXX-XXXXX"
                    autoFocus
                    className="h-12 text-center text-lg tracking-widest"
                  />
                </div>
                <Button type="submit" size="lg" className="h-12 w-full text-base font-semibold" disabled={loading}>
                  {loading ? "Validando..." : "Recuperar acesso"}
                </Button>
                <button type="button" onClick={() => setRecoveryMode(false)}
                  className="flex w-full items-center justify-center gap-2 text-sm font-medium text-primary hover:underline">
                  <Smartphone className="h-4 w-4" /> Usar o app autenticador
                </button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-3 text-center text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
          <button onClick={() => { signOut(); navigate("/login", { replace: true }); }} className="hover:underline">
            Sair e voltar ao login
          </button>
        </div>
      </div>
    </div>
  );
}
