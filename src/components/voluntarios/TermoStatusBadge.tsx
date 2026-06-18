import { Badge } from "@/components/ui/badge";
import { TERMO_STATUS_COLORS, TERMO_STATUS_LABELS } from "@/constants/voluntarios";

interface Props {
  status?: string | null;
  className?: string;
}

export function TermoStatusBadge({ status, className }: Props) {
  const s = status || "nao_gerado";
  return (
    <Badge className={`${TERMO_STATUS_COLORS[s] || ""} ${className || ""}`.trim()}>
      {TERMO_STATUS_LABELS[s] || s}
    </Badge>
  );
}
