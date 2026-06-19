import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  FALE_CONOSCO_LABEL,
  FALE_CONOSCO_APOIO,
  montarLinkWhatsapp,
} from "@/lib/faleConosco";

/**
 * Floating "Fale Conosco" WhatsApp button.
 *
 * Additional in-app entry point to the EXISTING WhatsApp central: it simply
 * opens the house's WhatsApp number with an origin-aware pre-filled message, so
 * the conversation flows through the same inbound webhook → IA → handoff → audit
 * pipeline already in place. It does not create a parallel channel and does not
 * replace people messaging the house directly.
 */
export function FaleConoscoButton() {
  const [telefone, setTelefone] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const fetchTel = () => {
      supabase
        .from("instituicao_config")
        .select("whatsapp, telefone")
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const row = data[0] as { whatsapp: string | null; telefone: string | null };
            // WhatsApp institucional is the official source; fall back to telefone only if unset.
            setTelefone(row.whatsapp || row.telefone);
          }
        });
    };
    fetchTel();
    window.addEventListener("instituicao-updated", fetchTel);
    return () => window.removeEventListener("instituicao-updated", fetchTel);
  }, []);

  const link = montarLinkWhatsapp({ telefone });
  if (!link) return null;

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col items-end gap-2",
        // Lift above the assistido mobile bottom nav on small screens.
        "right-4 bottom-20 sm:bottom-6",
      )}
    >
      {aberto && (
        <div className="relative max-w-[15rem] rounded-xl border border-border/60 bg-card p-3 pr-7 text-xs text-muted-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setAberto(false)}
            className="absolute right-2 top-2 text-muted-foreground/70 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="font-medium text-foreground">{FALE_CONOSCO_LABEL}</p>
          <p className="mt-1 leading-relaxed">{FALE_CONOSCO_APOIO}</p>
          <p className="mt-1 text-[11px] leading-relaxed">
            Atendimento inicial com apoio da nossa central. Não é um canal de emergência.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        {!aberto && (
          <span className="hidden rounded-full bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-md sm:inline">
            {FALE_CONOSCO_LABEL}
          </span>
        )}
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${FALE_CONOSCO_LABEL} pelo WhatsApp`}
          onMouseEnter={() => setAberto(true)}
          onClick={() => setAberto(false)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-background transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageCircle className="h-7 w-7" />
        </a>
      </div>
    </div>
  );
}
