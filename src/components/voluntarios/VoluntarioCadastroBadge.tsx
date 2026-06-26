import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { rotuloStatusCadastroVoluntario } from "@/lib/voluntarioCadastro";

interface Props {
  completo: boolean;
  className?: string;
}

/** Selo visual de completude do cadastro do voluntário. */
export function VoluntarioCadastroBadge({ completo, className }: Props) {
  const { label } = rotuloStatusCadastroVoluntario(completo);
  return (
    <Badge
      variant="outline"
      className={`gap-1 ${completo ? "border-green-300 text-green-700" : "border-amber-300 text-amber-700"} ${className ?? ""}`}
    >
      {completo ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {label}
    </Badge>
  );
}
