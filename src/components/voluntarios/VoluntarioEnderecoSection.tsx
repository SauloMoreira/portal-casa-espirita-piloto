import { AddressFields } from "@/components/AddressFields";
import type { VoluntarioFormErrors, VoluntarioFormState } from "@/types/voluntarios";

interface Props {
  form: VoluntarioFormState;
  errors: VoluntarioFormErrors;
  onChange: (patch: Partial<VoluntarioFormState>) => void;
}

export function VoluntarioEnderecoSection({ form, errors, onChange }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Endereço</h3>
      <AddressFields
        data={{
          cep: form.cep,
          logradouro: form.logradouro,
          numero: form.numero,
          complemento: form.complemento,
          bairro: form.bairro,
          cidade: form.cidade,
          estado: form.estado,
        }}
        onChange={(addr) => onChange(addr)}
        errors={errors}
      />
    </div>
  );
}
