import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { maskCEP, fetchCep, isValidCEP } from "@/lib/validators";

interface AddressData {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}

interface AddressFieldsProps {
  data: AddressData;
  onChange: (data: AddressData) => void;
  errors?: Partial<Record<keyof AddressData, string>>;
}

export function AddressFields({ data, onChange, errors }: AddressFieldsProps) {
  const [loading, setLoading] = useState(false);

  const set = (field: keyof AddressData, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const handleCepBlur = async () => {
    if (!isValidCEP(data.cep)) return;
    setLoading(true);
    const result = await fetchCep(data.cep);
    if (result) {
      onChange({
        ...data,
        logradouro: result.logradouro || data.logradouro,
        bairro: result.bairro || data.bairro,
        cidade: result.cidade || data.cidade,
        estado: result.estado || data.estado,
      });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>CEP *</Label>
          <div className="relative">
            <Input
              value={data.cep}
              onChange={(e) => set("cep", maskCEP(e.target.value))}
              onBlur={handleCepBlur}
              placeholder="00000-000"
              maxLength={9}
              className={errors?.cep ? "border-destructive" : ""}
            />
            {loading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {errors?.cep && <p className="text-xs text-destructive">{errors.cep}</p>}
        </div>
        <div className="col-span-1 sm:col-span-2 space-y-1">
          <Label>Logradouro *</Label>
          <Input value={data.logradouro} onChange={(e) => set("logradouro", e.target.value)} className={errors?.logradouro ? "border-destructive" : ""} />
          {errors?.logradouro && <p className="text-xs text-destructive">{errors.logradouro}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label>Número *</Label>
          <Input value={data.numero} onChange={(e) => set("numero", e.target.value)} className={errors?.numero ? "border-destructive" : ""} />
          {errors?.numero && <p className="text-xs text-destructive">{errors.numero}</p>}
        </div>
        <div className="space-y-1">
          <Label>Complemento</Label>
          <Input value={data.complemento} onChange={(e) => set("complemento", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Bairro *</Label>
          <Input value={data.bairro} onChange={(e) => set("bairro", e.target.value)} className={errors?.bairro ? "border-destructive" : ""} />
          {errors?.bairro && <p className="text-xs text-destructive">{errors.bairro}</p>}
        </div>
        <div className="space-y-1 hidden sm:block" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Cidade *</Label>
          <Input value={data.cidade} onChange={(e) => set("cidade", e.target.value)} className={errors?.cidade ? "border-destructive" : ""} />
          {errors?.cidade && <p className="text-xs text-destructive">{errors.cidade}</p>}
        </div>
        <div className="space-y-1">
          <Label>Estado *</Label>
          <Input value={data.estado} onChange={(e) => set("estado", e.target.value)} maxLength={2} placeholder="UF" className={errors?.estado ? "border-destructive" : ""} />
          {errors?.estado && <p className="text-xs text-destructive">{errors.estado}</p>}
        </div>
      </div>
    </div>
  );
}
