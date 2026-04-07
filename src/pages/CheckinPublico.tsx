import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, Heart } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

export default function CheckinPublico() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<"loading" | "form" | "success" | "error" | "already">("loading");
  const [sessaoInfo, setSessaoInfo] = useState<{ nome: string; data: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState({ nome: "", celular: "", faixa_etaria: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      // Try a quick check by calling edge function with just the token
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/checkin-publico`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, action: "validate" }),
        }
      );

      if (res.status === 404) {
        setErrorMsg("Sessão não encontrada ou já encerrada.");
        setStep("error");
        return;
      }

      // Session is valid, show form
      setStep("form");
    } catch {
      setErrorMsg("Erro ao verificar sessão.");
      setStep("error");
    }
  };

  const handleSubmit = async () => {
    if (!form.nome.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/checkin-publico`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            nome: form.nome.trim(),
            celular: form.celular || null,
            faixa_etaria: form.faixa_etaria || null,
            modo_checkin: "qr",
          }),
        }
      );

      const data = await res.json();

      if (data.already_checked_in) {
        setStep("already");
      } else if (data.success) {
        setStep("success");
      } else {
        setErrorMsg(data.error || "Erro ao registrar presença");
        setStep("error");
      }
    } catch {
      setErrorMsg("Erro de conexão. Tente novamente.");
      setStep("error");
    }

    setSubmitting(false);
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">Verificando sessão...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="py-12 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-foreground">Presença Registrada!</h2>
            <p className="text-muted-foreground">Obrigado por participar. Sua presença foi registrada com sucesso.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "already") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="py-12 space-y-4">
            <Heart className="h-16 w-16 text-primary mx-auto" />
            <h2 className="text-xl font-bold text-foreground">Presença já registrada</h2>
            <p className="text-muted-foreground">Você já fez o check-in nesta sessão. Obrigado!</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="py-12 space-y-4">
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-xl font-bold text-foreground">Ops!</h2>
            <p className="text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" onClick={() => { setStep("form"); setErrorMsg(""); }}>Tentar novamente</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Check-in</CardTitle>
          <p className="text-sm text-muted-foreground">Registre sua presença</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome completo *</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Seu nome completo"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Celular</Label>
            <Input
              value={form.celular}
              onChange={(e) => setForm({ ...form, celular: e.target.value })}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className="space-y-2">
            <Label>Faixa etária</Label>
            <Select value={form.faixa_etaria} onValueChange={(v) => setForm({ ...form, faixa_etaria: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="menor_18">Menor de 18</SelectItem>
                <SelectItem value="18_29">18 a 29</SelectItem>
                <SelectItem value="30_44">30 a 44</SelectItem>
                <SelectItem value="45_59">45 a 59</SelectItem>
                <SelectItem value="60_mais">60 ou mais</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSubmit} disabled={submitting || !form.nome.trim()} className="w-full">
            {submitting ? "Registrando..." : "Confirmar Presença"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
