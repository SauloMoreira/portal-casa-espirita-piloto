import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Campo opcional e discreto para o entrevistador registrar o motivo de ter
 * ajustado ou não aplicado a sugestão da IA. Exibido apenas quando há uma
 * sugestão carregada e a decisão final diverge dela. A IA continua sendo
 * apenas apoio; a decisão permanece humana e nenhuma atribuição é automática.
 */
export function AjusteSugestaoIaField({ value, onChange }: Props) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
      <Label
        htmlFor="ia-motivo-ajuste"
        className="flex items-center gap-2 text-sm font-medium"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        Motivo do ajuste da sugestão da IA (opcional)
      </Label>
      <p className="text-xs text-muted-foreground">
        Sua decisão difere da sugestão da IA. Se desejar, registre o motivo para
        apoiar o aprendizado. Este campo é opcional.
      </p>
      <Textarea
        id="ia-motivo-ajuste"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex.: caso exigiu tratamento diferente do sugerido."
        rows={2}
        className="resize-none"
      />
    </div>
  );
}
