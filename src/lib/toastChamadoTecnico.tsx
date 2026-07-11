/**
 * Helper para exibir toast de erro amigável com ação "Abrir chamado técnico".
 * Extraído para .tsx porque hooks/lógica pura ficam em .ts e não emitem JSX.
 */
import { ToastAction } from "@/components/ui/toast";
import type { FriendlyError } from "@/lib/supabaseFriendlyErrors";
import { formatSupportDetails } from "@/lib/supabaseFriendlyErrors";
import { abrirChamadoTecnico } from "@/lib/abrirChamadoTecnico";

type ToastFn = (opts: {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  action?: React.ReactNode;
}) => void;

export interface ShowFriendlyErrorInput {
  toast: ToastFn;
  origem: string;
  friendly: FriendlyError;
  instituicaoId?: string | null;
  userId?: string | null;
}

export function showFriendlyErrorToast(input: ShowFriendlyErrorInput): void {
  const { toast, origem, friendly, instituicaoId, userId } = input;
  toast({
    title: friendly.message,
    description: `Detalhes técnicos para suporte:\n${formatSupportDetails(friendly)}`,
    variant: "destructive",
    action: (
      <ToastAction
        altText="Abrir chamado técnico"
        onClick={async () => {
          const { copiado } = await abrirChamadoTecnico({
            origem,
            friendly,
            instituicaoId: instituicaoId ?? null,
            userId: userId ?? null,
          });
          toast({
            title: copiado ? "Detalhes do chamado copiados" : "Detalhes do chamado prontos",
            description: copiado
              ? "Cole em um chamado ou envie ao administrador geral da plataforma."
              : "Copie os detalhes técnicos exibidos e envie ao administrador geral da plataforma.",
          });
        }}
      >
        Abrir chamado técnico
      </ToastAction>
    ),
  });
}
