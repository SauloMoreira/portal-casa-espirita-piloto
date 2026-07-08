import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { resolveInvokeErrorMessage, edgeBodyError } from "@/lib/edgeFunctionResponse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mail, Lock, Eye, EyeOff, User, IdCard, Phone, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { validateSignup } from "@/lib/signupRequest";
import { maskCPF, maskPhone } from "@/lib/validators";
import brandIcon from "@/assets/portal-casa-espirita-icon.png";
import { SAAS_BRANDING } from "@/config/saasBranding";

export default function SolicitarCadastro() {
  const [form, setForm] = useState({
    nome_completo: "",
    email: "",
    cpf: "",
    celular: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateSignup(form);
    setErrors(result.errors);
    if (!result.valid) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-signup", {
        body: {
          nome_completo: form.nome_completo.trim(),
          email: form.email.trim(),
          cpf: form.cpf || null,
          celular: form.celular || null,
          password: form.password,
        },
      });
      if (error) {
        // Edge function returns JSON error bodies on non-2xx.
        throw new Error(await resolveInvokeErrorMessage(error));
      }
      const bodyErr = edgeBodyError(data);
      if (bodyErr) throw new Error(bodyErr);
      // Immediate base access: sign the user in right after creation so the
      // AuthContext hydrates the session + assistido role, then go to the app.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      if (signInErr) {
        // Account exists with access; fall back to the login screen.
        setDone(true);
        return;
      }
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast({
        title: "Não foi possível enviar o cadastro",
        description: err?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
            <img src={brandIcon} alt={SAAS_BRANDING.name} width={96} height={96} className="h-20 w-20 object-contain" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Criar <span className="text-primary">conta</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Preencha seus dados. Seu acesso de assistido é liberado na hora.
            </p>
          </div>
        </header>

        <Card className="rounded-2xl border-border/60 bg-card/85 shadow-xl backdrop-blur-md">
          <CardContent className="p-7 sm:p-8">
            {done ? (
              <div className="space-y-5 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
                <div className="space-y-1.5">
                  <h2 className="font-display text-xl font-semibold text-foreground">Conta criada!</h2>
                  <p className="text-sm text-muted-foreground">
                    Seu acesso de <strong>assistido</strong> já está liberado.
                    Entre com seu e-mail e senha para acessar.
                  </p>
                </div>
                <Button className="w-full" onClick={() => navigate("/login")}>Ir para o login</Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle className="text-sm">Acesso imediato</AlertTitle>
                  <AlertDescription className="text-xs">
                    Ao concluir o cadastro você entra automaticamente como assistido, sem aprovação.
                  </AlertDescription>
                </Alert>

                <Field id="nome" label="Nome completo *" icon={User} error={errors.nome_completo}>
                  <Input id="nome" value={form.nome_completo} onChange={(e) => set("nome_completo", e.target.value)}
                    placeholder="Seu nome" className="h-11 pl-10" autoComplete="name" />
                </Field>

                <Field id="email" label="E-mail *" icon={Mail} error={errors.email}>
                  <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                    placeholder="seu@email.com" className="h-11 pl-10" autoComplete="email" />
                </Field>

                <Field id="cpf" label="CPF (opcional)" icon={IdCard} error={errors.cpf}>
                  <Input id="cpf" value={form.cpf} onChange={(e) => set("cpf", maskCPF(e.target.value))}
                    placeholder="000.000.000-00" className="h-11 pl-10" inputMode="numeric" />
                </Field>

                <Field id="celular" label="Celular (opcional)" icon={Phone} error={errors.celular}>
                  <Input id="celular" value={form.celular} onChange={(e) => set("celular", maskPhone(e.target.value))}
                    placeholder="(00) 00000-0000" className="h-11 pl-10" inputMode="numeric" />
                </Field>

                <Field id="password" label="Senha *" icon={Lock} error={errors.password}>
                  <Input id="password" type={showPassword ? "text" : "password"} value={form.password}
                    onChange={(e) => set("password", e.target.value)} placeholder="Mínimo 8 caracteres"
                    className="h-11 pl-10 pr-10" autoComplete="new-password" />
                  <button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </Field>

                <Field id="confirm" label="Confirmar senha *" icon={Lock} error={errors.confirmPassword}>
                  <Input id="confirm" type={showPassword ? "text" : "password"} value={form.confirmPassword}
                    onChange={(e) => set("confirmPassword", e.target.value)} placeholder="Repita a senha"
                    className="h-11 pl-10" autoComplete="new-password" />
                </Field>

                <Button type="submit" size="lg" className="h-12 w-full text-base font-semibold" disabled={loading}>
                  {loading ? "Criando conta..." : "Criar conta"}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Já tem conta?{" "}
                  <Link to="/login" className="font-medium text-primary hover:underline">Entrar</Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  id, label, icon: Icon, error, children,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {children}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
