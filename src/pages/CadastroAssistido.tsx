import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, User, Phone, ShieldCheck, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import brandIcon from "@/assets/portal-casa-espirita-icon.png";
import { SAAS_BRANDING } from "@/config/saasBranding";

const TERMOS_VERSAO = "v1";
const PRIVACIDADE_VERSAO = "v1";

type Etapa = "form" | "confirme_email";

export default function CadastroAssistido() {
  const { instituicaoSlug } = useParams<{ instituicaoSlug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [celular, setCelular] = useState("");
  const [aceite, setAceite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("form");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  function gerarSenhaSegura(): string {
    return crypto.randomUUID().replace(/-/g, "");
  }


  useEffect(() => {
    setIdempotencyKey(crypto.randomUUID());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instituicaoSlug) return;
    if (!nome.trim() || !email.trim() || !celular.trim() || !aceite) {
      toast({ title: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const senhaGerada = gerarSenhaSegura();
    try {
      const { data, error } = await supabase.functions.invoke("signup-assistido-tenant", {
        body: {
          instituicao_slug: instituicaoSlug,
          nome_completo: nome.trim(),
          email: email.trim(),
          senha: senhaGerada,
          celular: celular.replace(/\D/g, ""),
          aceite_termos: true,
          termos_versao: TERMOS_VERSAO,
          privacidade_versao: PRIVACIDADE_VERSAO,
          idempotency_key: idempotencyKey,
        },
      });

      const mensagens: Record<string, string> = {
        PAYLOAD_INVALIDO: "Confira os dados informados — algum campo está incorreto.",
        INSTITUICAO_INDISPONIVEL: "O cadastro público não está disponível para esta instituição no momento.",
        RATE_LIMIT_EXCEDIDO: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
        IDEMPOTENCY_KEY_INVALIDA: "Ocorreu um problema técnico. Atualize a página e tente novamente.",
        AUTOCADASTRO_INDISPONIVEL_RETENTAR: "O cadastro está temporariamente indisponível. Tente novamente em instantes.",
      };

      if (error) {
        let codigoErro: string | undefined;
        try {
          const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
          const parsed = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
          if (parsed && typeof parsed === "object" && "code" in parsed) {
            codigoErro = String((parsed as { code?: unknown }).code);
          }
        } catch {
          /* ignore — cai no fallback genérico abaixo */
        }
        toast({
          title: "Não foi possível concluir o cadastro",
          description: mensagens[codigoErro ?? ""] ?? "Tente novamente ou procure a recepção da casa.",
          variant: "destructive",
        });
        return;
      }

      const code = data?.code as string | undefined;
      const nextAction = data?.next_action as string | undefined;


      if (code === "AUTOCADASTRO_CONCLUIDO" && nextAction === "LOGIN") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: senhaGerada,
        });
        if (!signInError) {
          navigate("/dashboard", { replace: true });
          return;
        }
        navigate(`/login?next=${encodeURIComponent("/dashboard")}`, { replace: true });
        return;
      }

      if (code === "AUTOCADASTRO_CONCLUIDO" && nextAction === "CONFIRM_EMAIL") {
        setEtapa("confirme_email");
        return;
      }

      const mensagens: Record<string, string> = {
        PAYLOAD_INVALIDO: "Confira os dados informados — algum campo está incorreto.",
        INSTITUICAO_INDISPONIVEL: "O cadastro público não está disponível para esta instituição no momento.",
        RATE_LIMIT_EXCEDIDO: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
        IDEMPOTENCY_KEY_INVALIDA: "Ocorreu um problema técnico. Atualize a página e tente novamente.",
        AUTOCADASTRO_INDISPONIVEL_RETENTAR: "O cadastro está temporariamente indisponível. Tente novamente em instantes.",
      };
      toast({
        title: "Não foi possível concluir o cadastro",
        description: mensagens[code ?? ""] ?? "Tente novamente ou procure a recepção da casa.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (etapa === "confirme_email") {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-br from-secondary/60 via-background to-background" />
          <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
        </div>
        <div className="relative z-10 w-full max-w-md space-y-8">
          <header className="text-center space-y-4">
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-3xl bg-card/70 shadow-lg ring-1 ring-border/60 backdrop-blur-sm">
              <CheckCircle2 className="h-16 w-16 text-primary" />
            </div>
          </header>
          <Card className="border-border/60 shadow-xl">
            <CardContent className="pt-8 pb-8 space-y-4 text-center">
              <h1 className="font-display text-2xl font-bold text-foreground">Falta só mais um passo!</h1>
              <p className="text-base text-muted-foreground leading-relaxed">
                Enviamos um e-mail para <strong className="text-foreground">{email}</strong>.
                Abra sua caixa de entrada e toque no botão de confirmação — assim que confirmar,
                você já entra direto no sistema.
              </p>
              <p className="text-sm text-muted-foreground">
                Não achou o e-mail? Confira também a pasta de spam/lixo eletrônico.
              </p>
              <div className="pt-4">
                <Link to="/login" className="text-sm font-medium text-primary hover:underline">
                  Voltar para o login
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/60 via-background to-background" />
        <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-8">
        <header className="text-center space-y-4">
          <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-3xl bg-card/70 shadow-lg ring-1 ring-border/60 backdrop-blur-sm">
            <img src={brandIcon} alt={SAAS_BRANDING.name} width={112} height={112} className="h-24 w-24 object-contain" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              {SAAS_BRANDING.prefix} <span className="text-primary">{SAAS_BRANDING.highlight}</span>
            </h1>
            <p className="text-sm text-muted-foreground">{SAAS_BRANDING.subtitle}</p>
          </div>
        </header>

        <Card className="border-border/60 shadow-xl">
          <CardContent className="pt-8 pb-8">
            <div className="mb-6 text-center space-y-1">
              <h2 className="font-display text-xl font-semibold text-foreground">Criar meu cadastro</h2>
              <p className="text-sm text-muted-foreground">Preencha seus dados para começar</p>
            </div>

            <p className="mb-4 text-center text-sm text-muted-foreground">
              Não precisa criar senha — é só confirmar pelo seu e-mail.
            </p>


            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required className="h-12 pl-10 text-base" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" type="email" placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="h-12 pl-10 text-base" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="celular">Celular (com DDD)</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="celular" value={celular} onChange={(e) => setCelular(e.target.value)} required autoComplete="tel" className="h-12 pl-10 text-base" />
                </div>
              </div>



              <div className="flex items-start gap-2 pt-2">
                <Checkbox id="aceite" checked={aceite} onCheckedChange={(v) => setAceite(v === true)} className="mt-0.5" />
                <Label htmlFor="aceite" className="text-sm font-normal leading-snug cursor-pointer">
                  Li e aceito os termos de uso e a política de privacidade da instituição.
                </Label>
              </div>

              <Button type="submit" disabled={loading} className="h-12 w-full text-base font-medium">
                {loading ? "Enviando..." : "Criar meu cadastro"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link to="/login" className="text-sm font-medium text-primary hover:underline">
                Já tenho cadastro — entrar
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Seus dados são protegidos e usados apenas pela instituição.
        </div>
      </div>
    </div>
  );
}
