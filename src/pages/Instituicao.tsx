import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoUpload } from "@/components/PhotoUpload";
import { AddressFields } from "@/components/AddressFields";
import { isValidCNPJ, maskCNPJ, maskPhone } from "@/lib/validators";

interface InstituicaoData {
  id?: string;
  logo_url: string | null;
  nome_fantasia: string;
  razao_social: string;
  cnpj: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  telefone: string;
  whatsapp: string;
  email_institucional: string;
  observacoes: string;
}

const emptyData: InstituicaoData = {
  logo_url: null, nome_fantasia: "", razao_social: "", cnpj: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  telefone: "", whatsapp: "", email_institucional: "", observacoes: "",
};

type FormErrors = Partial<Record<string, string>>;

export default function Instituicao() {
  const [form, setForm] = useState<InstituicaoData>(emptyData);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("instituicao_config").select("*").limit(1);
      if (data && data.length > 0) {
        const row = data[0] as any;
        setExistingId(row.id);
        setForm({
          logo_url: row.logo_url || null,
          nome_fantasia: row.nome_fantasia || "",
          razao_social: row.razao_social || "",
          cnpj: maskCNPJ(row.cnpj || ""),
          cep: row.cep || "",
          logradouro: row.logradouro || "",
          numero: row.numero || "",
          complemento: row.complemento || "",
          bairro: row.bairro || "",
          cidade: row.cidade || "",
          estado: row.estado || "",
          telefone: maskPhone(row.telefone || ""),
          whatsapp: maskPhone(row.whatsapp || ""),
          email_institucional: row.email_institucional || "",
          observacoes: row.observacoes || "",
        });
      }
      setFetching(false);
    })();
  }, []);

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!form.nome_fantasia.trim()) e.nome_fantasia = "Nome fantasia obrigatório";
    if (!form.razao_social.trim()) e.razao_social = "Razão social obrigatória";
    if (!form.cnpj.trim()) e.cnpj = "CNPJ obrigatório";
    else if (!isValidCNPJ(form.cnpj)) e.cnpj = "CNPJ inválido";
    if (!form.cep.trim()) e.cep = "CEP obrigatório";
    if (!form.logradouro.trim()) e.logradouro = "Logradouro obrigatório";
    if (!form.numero.trim()) e.numero = "Número obrigatório";
    if (!form.bairro.trim()) e.bairro = "Bairro obrigatório";
    if (!form.cidade.trim()) e.cidade = "Cidade obrigatória";
    if (!form.estado.trim()) e.estado = "Estado obrigatório";
    return e;
  };

  const handleSave = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast({ title: "Corrija os campos destacados", variant: "destructive" });
      return;
    }

    setLoading(true);
    const payload = {
      logo_url: form.logo_url || null,
      nome_fantasia: form.nome_fantasia.trim(),
      razao_social: form.razao_social.trim(),
      cnpj: form.cnpj.replace(/\D/g, ""),
      cep: form.cep.replace(/\D/g, ""),
      logradouro: form.logradouro.trim(),
      numero: form.numero.trim(),
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim(),
      cidade: form.cidade.trim(),
      estado: form.estado.trim().toUpperCase(),
      telefone: form.telefone.replace(/\D/g, "") || null,
      email_institucional: form.email_institucional.trim() || null,
      observacoes: form.observacoes.trim() || null,
      updated_by: user!.id,
    };

    let error;
    if (existingId) {
      ({ error } = await supabase.from("instituicao_config").update(payload as any).eq("id", existingId));
    } else {
      const { data, error: err } = await supabase.from("instituicao_config").insert(payload as any).select("id");
      error = err;
      if (data && data.length > 0) setExistingId((data[0] as any).id);
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Dados da instituição salvos com sucesso" });
      window.dispatchEvent(new Event("instituicao-updated"));
    }
    setLoading(false);
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Dados da Instituição</h1>
        <p className="text-sm text-muted-foreground mt-1">Cadastro institucional da casa espírita</p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" /> Informações Institucionais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Logo da Instituição</Label>
            <PhotoUpload
              currentUrl={form.logo_url}
              onUrlChange={(url) => setForm({ ...form, logo_url: url })}
              folder="instituicao"
            />
          </div>

          {/* Nome fantasia / Razão social */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome Fantasia *</Label>
              <Input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} className={errors.nome_fantasia ? "border-destructive" : ""} />
              {errors.nome_fantasia && <p className="text-xs text-destructive">{errors.nome_fantasia}</p>}
            </div>
            <div className="space-y-2">
              <Label>Razão Social *</Label>
              <Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} className={errors.razao_social ? "border-destructive" : ""} />
              {errors.razao_social && <p className="text-xs text-destructive">{errors.razao_social}</p>}
            </div>
          </div>

          {/* CNPJ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CNPJ *</Label>
              <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: maskCNPJ(e.target.value) })} placeholder="00.000.000/0000-00" maxLength={18} className={errors.cnpj ? "border-destructive" : ""} />
              {errors.cnpj && <p className="text-xs text-destructive">{errors.cnpj}</p>}
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Endereço</Label>
            <AddressFields
              data={{ cep: form.cep, logradouro: form.logradouro, numero: form.numero, complemento: form.complemento, bairro: form.bairro, cidade: form.cidade, estado: form.estado }}
              onChange={(addr) => setForm({ ...form, ...addr })}
              errors={errors as any}
            />
          </div>

          {/* Contato */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} />
            </div>
            <div className="space-y-2">
              <Label>E-mail Institucional</Label>
              <Input type="email" value={form.email_institucional} onChange={(e) => setForm({ ...form, email_institucional: e.target.value })} />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} />
          </div>

          <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto gap-2">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : <><Save className="h-4 w-4" /> Salvar Dados</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
