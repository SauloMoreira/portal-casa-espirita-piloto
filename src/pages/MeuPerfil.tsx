import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PhotoUpload } from "@/components/PhotoUpload";
import { AddressFields } from "@/components/AddressFields";
import { ConsentimentoWhatsappCard } from "@/components/notificacoes/ConsentimentoWhatsappCard";
import { Switch } from "@/components/ui/switch";
import {
  getComunicacaoGeralAtiva,
  setComunicacaoGeralAtiva,
} from "@/services/notificacoes/notificacoesService";
import { maskPhone, maskCPF, isValidPhone, isValidEmail } from "@/lib/validators";
import { User, Save, Megaphone } from "lucide-react";

export default function MeuPerfil() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assistidoId, setAssistidoId] = useState<string | null>(null);
  const [comunicacaoGeral, setComunicacaoGeral] = useState(true);
  const [savingPref, setSavingPref] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    email: "",
    celular: "",
    cpf: "",
    data_nascimento: "",
    foto_url: null as string | null,
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    estado: "",
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data: assistido } = await supabase
        .from("assistidos")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (assistido) {
        setAssistidoId(assistido.id);
        setForm({
          nome: assistido.nome || "",
          email: assistido.email || user.email || "",
          celular: assistido.celular ? maskPhone(assistido.celular) : "",
          cpf: assistido.cpf ? maskCPF(assistido.cpf) : "",
          data_nascimento: assistido.data_nascimento || "",
          foto_url: assistido.foto_url || null,
          cep: assistido.cep || "",
          logradouro: assistido.logradouro || "",
          numero: assistido.numero || "",
          complemento: assistido.complemento || "",
          bairro: assistido.bairro || "",
          cidade: assistido.cidade || "",
          estado: assistido.estado || "",
        });
        try {
          setComunicacaoGeral(await getComunicacaoGeralAtiva(assistido.id));
        } catch {
          setComunicacaoGeral(true);
        }
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    if (!assistidoId) return;

    // Minimal validation
    if (form.celular && !isValidPhone(form.celular)) {
      toast({ title: "Celular inválido", variant: "destructive" });
      return;
    }
    if (form.email && !isValidEmail(form.email)) {
      toast({ title: "E-mail inválido", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("assistidos").update({
      celular: form.celular.replace(/\D/g, "") || null,
      foto_url: form.foto_url || null,
      cep: form.cep.replace(/\D/g, "") || null,
      logradouro: form.logradouro.trim() || null,
      numero: form.numero.trim() || null,
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim() || null,
      estado: form.estado.trim().toUpperCase() || null,
    } as any).eq("id", assistidoId);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Perfil atualizado com sucesso!" });
    }
    setSaving(false);
  };

  const handleToggleComunicacaoGeral = async (ativa: boolean) => {
    if (!assistidoId) return;
    setComunicacaoGeral(ativa);
    setSavingPref(true);
    try {
      await setComunicacaoGeralAtiva(assistidoId, ativa);
      toast({ title: "Preferência de comunicação atualizada!" });
    } catch (e: any) {
      setComunicacaoGeral(!ativa);
      toast({ title: "Erro ao salvar preferência", description: e?.message, variant: "destructive" });
    }
    setSavingPref(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;
  }

  if (!assistidoId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <User className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">Perfil não encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">Visualize e atualize seus dados</p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <User className="h-4 w-4 text-primary" /> Dados Pessoais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PhotoUpload
            currentUrl={form.foto_url}
            onUrlChange={(url) => setForm({ ...form, foto_url: url })}
            folder="assistidos"
          />

          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input value={form.nome} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">Para alterar o nome, entre em contato com a administração.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={form.email} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Celular</Label>
              <Input value={form.celular}
                onChange={(e) => setForm({ ...form, celular: maskPhone(e.target.value) })}
                placeholder="(00) 00000-0000" maxLength={15} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input value={form.cpf} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Data de Nascimento</Label>
              <Input value={form.data_nascimento} disabled className="bg-muted" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Endereço (opcional)</CardTitle>
        </CardHeader>
        <CardContent>
          <AddressFields
            data={{
              cep: form.cep, logradouro: form.logradouro, numero: form.numero,
              complemento: form.complemento, bairro: form.bairro, cidade: form.cidade, estado: form.estado,
            }}
            onChange={(addr) => setForm({ ...form, ...addr })}
            errors={{}}
          />
        </CardContent>
      </Card>

      {assistidoId && <ConsentimentoWhatsappCard assistidoId={assistidoId} />}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" /> Preferências de Comunicação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="comunicacao-geral" className="text-sm font-medium">
                Receber comunicações gerais da FER
              </Label>
              <p className="text-xs text-muted-foreground">
                Campanhas, eventos e comunicados institucionais. Avisos do seu tratamento
                (entrevistas, sessões, presença e faltas) continuam sendo enviados
                independentemente desta opção.
              </p>
            </div>
            <Switch
              id="comunicacao-geral"
              checked={comunicacaoGeral}
              disabled={savingPref}
              onCheckedChange={handleToggleComunicacaoGeral}
            />
          </div>
        </CardContent>
      </Card>


      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        <Save className="h-4 w-4" />
        {saving ? "Salvando..." : "Salvar Perfil"}
      </Button>
    </div>
  );
}
