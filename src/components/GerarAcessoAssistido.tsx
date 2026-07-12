import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { isValidEmail, isValidPhone, maskPhone } from "@/lib/validators";
import { KeyRound, Eye, EyeOff, Copy, Check } from "lucide-react";
import {
  provisionarAcessoAssistido,
  mensagemAmigavel,
} from "@/services/acesso/provisionarAcessoAssistido";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistidoId: string;
  assistidoNome: string;
  assistidoEmail?: string | null;
  assistidoCelular?: string | null;
  assistidoDataNascimento?: string | null;
  onSuccess?: () => void;
}

export function GerarAcessoAssistido({
  open, onOpenChange, assistidoId, assistidoNome,
  assistidoEmail, assistidoCelular, assistidoDataNascimento, onSuccess,
}: Props) {
  const [form, setForm] = useState({
    nome: assistidoNome || "",
    email: assistidoEmail || "",
    celular: assistidoCelular ? maskPhone(assistidoCelular) : "",
    data_nascimento: assistidoDataNascimento || "",
    senha: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const { session } = useAuth();
  const { toast } = useToast();

  const resetForm = () => {
    setForm({
      nome: assistidoNome || "",
      email: assistidoEmail || "",
      celular: assistidoCelular ? maskPhone(assistidoCelular) : "",
      data_nascimento: assistidoDataNascimento || "",
      senha: "",
    });
    setErrors({});
    setCreated(false);
    setCopied(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) resetForm();
    onOpenChange(v);
  };

  const generatePassword = () => {
    const chars = "abcdefghijkmnpqrstuvwxyz23456789";
    let pwd = "";
    for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    setForm((f) => ({ ...f, senha: pwd }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.nome.trim()) e.nome = "Nome obrigatório";
    if (!form.email.trim()) e.email = "E-mail obrigatório";
    else if (!isValidEmail(form.email)) e.email = "E-mail inválido";
    if (!form.celular.trim()) e.celular = "Celular obrigatório";
    else if (!isValidPhone(form.celular)) e.celular = "Celular inválido";
    if (!form.data_nascimento) e.data_nascimento = "Data de nascimento obrigatória";
    if (!form.senha.trim()) e.senha = "Senha obrigatória";
    else if (form.senha.length < 6) e.senha = "Mínimo 6 caracteres";
    return e;
  };

  const handleSubmit = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (loading) return;

    setLoading(true);
    try {
      const result = await provisionarAcessoAssistido({
        assistido_id: assistidoId,
        email: form.email.trim(),
        password: form.senha,
        celular: form.celular.replace(/\D/g, ""),
        data_nascimento: form.data_nascimento,
      });

      if (result.ok === false) {
        if (result.code === "EMAIL_EM_USO") {
          setErrors({ email: "Este e-mail já possui uma conta no sistema" });
        }
        toast({
          title: "Não foi possível criar o acesso",
          description: mensagemAmigavel(result.code),
          variant: "destructive",
        });
        return;
      }


      if (result.already_provisioned) {
        toast({
          title: "Acesso já existente",
          description: "Este assistido já possui acesso ativo. Use a redefinição de senha se necessário.",
        });
        onSuccess?.();
        onOpenChange(false);
        return;
      }

      setCreated(true);
      toast({ title: "Acesso criado com sucesso!" });
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  };


  const copyCredentials = () => {
    const text = `Login: ${form.email}\nSenha: ${form.senha}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Gerar Acesso do Assistido
          </DialogTitle>
        </DialogHeader>

        {created ? (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Acesso criado com sucesso!</p>
              <p className="text-xs text-muted-foreground">
                Anote as credenciais abaixo para entregar ao assistido:
              </p>
              <div className="space-y-2 rounded-md bg-background p-3 font-mono text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Login:</span>
                  <span className="font-medium">{form.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Senha:</span>
                  <span className="font-medium">{form.senha}</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={copyCredentials}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado!" : "Copiar credenciais"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              O assistido poderá alterar a senha após o primeiro acesso.
            </p>
            <Button className="w-full" onClick={() => handleOpenChange(false)}>Fechar</Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Preencha os dados mínimos para gerar o acesso de <strong>{assistidoNome}</strong> ao sistema.
            </p>

            <div className="space-y-2">
              <Label>Nome Completo *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className={errors.nome ? "border-destructive" : ""} />
              {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
            </div>

            <div className="space-y-2">
              <Label>E-mail *</Label>
              <Input type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@exemplo.com"
                className={errors.email ? "border-destructive" : ""} />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Celular *</Label>
                <Input value={form.celular}
                  onChange={(e) => setForm({ ...form, celular: maskPhone(e.target.value) })}
                  placeholder="(00) 00000-0000" maxLength={15}
                  className={errors.celular ? "border-destructive" : ""} />
                {errors.celular && <p className="text-xs text-destructive">{errors.celular}</p>}
              </div>
              <div className="space-y-2">
                <Label>Data de Nascimento *</Label>
                <Input type="date" value={form.data_nascimento}
                  onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
                  className={errors.data_nascimento ? "border-destructive" : ""} />
                {errors.data_nascimento && <p className="text-xs text-destructive">{errors.data_nascimento}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Senha Inicial *</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input type={showPassword ? "text" : "password"} value={form.senha}
                    onChange={(e) => setForm({ ...form, senha: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                    className={errors.senha ? "border-destructive pr-10" : "pr-10"} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={generatePassword} type="button">
                  Gerar
                </Button>
              </div>
              {errors.senha && <p className="text-xs text-destructive">{errors.senha}</p>}
            </div>

            <Button onClick={handleSubmit} disabled={loading} className="w-full">
              {loading ? "Criando acesso..." : "Criar Acesso"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
