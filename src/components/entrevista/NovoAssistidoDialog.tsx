import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhotoUpload } from "@/components/PhotoUpload";
import { AddressFields } from "@/components/AddressFields";
import { maskCPF, maskPhone } from "@/lib/validators";
import type { EntrevistaAssistidoForm } from "@/types/fazerEntrevista";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: EntrevistaAssistidoForm;
  onFormChange: (form: EntrevistaAssistidoForm) => void;
  errors: Record<string, string>;
  saving: boolean;
  onSalvar: () => void;
}

export function NovoAssistidoDialog({
  open,
  onOpenChange,
  form,
  onFormChange,
  errors,
  saving,
  onSalvar,
}: Props) {
  const update = (patch: Partial<EntrevistaAssistidoForm>) => onFormChange({ ...form, ...patch });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Assistido</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex justify-center">
            <PhotoUpload
              currentUrl={form.foto_url}
              onUrlChange={(url) => update({ foto_url: url })}
              folder="assistidos"
            />
          </div>
          <div className="space-y-2">
            <Label>Nome Completo *</Label>
            <Input value={form.nome} onChange={(e) => update({ nome: e.target.value })} />
            {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input
                value={form.cpf}
                onChange={(e) => update({ cpf: maskCPF(e.target.value) })}
                placeholder="000.000.000-00"
              />
              {errors.cpf && <p className="text-xs text-destructive">{errors.cpf}</p>}
            </div>
            <div className="space-y-2">
              <Label>Celular *</Label>
              <Input
                value={form.celular}
                onChange={(e) => update({ celular: maskPhone(e.target.value) })}
                placeholder="(00) 00000-0000"
              />
              {errors.celular && <p className="text-xs text-destructive">{errors.celular}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={form.email} onChange={(e) => update({ email: e.target.value })} />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label>Data de Nascimento</Label>
              <Input
                type="date"
                value={form.data_nascimento}
                onChange={(e) => update({ data_nascimento: e.target.value })}
              />
            </div>
          </div>
          <AddressFields
            required={false}
            data={{
              cep: form.cep,
              logradouro: form.logradouro,
              numero: form.numero,
              complemento: form.complemento,
              bairro: form.bairro,
              cidade: form.cidade,
              estado: form.estado,
            }}
            onChange={(fields) => update(fields)}
            errors={errors}
          />
          <Button onClick={onSalvar} disabled={saving} className="w-full">
            {saving ? "Salvando..." : "Cadastrar Assistido"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
