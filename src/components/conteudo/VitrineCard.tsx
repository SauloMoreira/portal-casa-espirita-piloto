import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, ImageOff } from "lucide-react";
import type { ReactNode } from "react";
import { formatoAspectClass } from "@/lib/conteudoImagem";

interface VitrineCardProps {
  imagemUrl?: string | null;
  titulo: string;
  subtitulo?: string | null;
  descricao?: string | null;
  destaque?: boolean;
  meta?: ReactNode;
  /** Formato alvo salvo da imagem (card/banner_horizontal/banner_vertical/destaque). */
  formato?: string | null;
  /** Item de destaque: layout maior, ocupa a linha inteira no grid. */
  featured?: boolean;
}

/**
 * Cartão presentacional reutilizável da vitrine institucional do assistido.
 * Usado por Campanhas e Eventos para um visual consistente, leve e elegante.
 * O texto fica sempre fora da imagem (respeita tokens do design system).
 * A proporção da imagem acompanha o formato alvo salvo (imagem_formato).
 */
export function VitrineCard({
  imagemUrl, titulo, subtitulo, descricao, destaque, meta, formato, featured,
}: VitrineCardProps) {
  const aspect = formatoAspectClass(formato);
  return (
    <Card className="overflow-hidden border-border/60 shadow-sm transition-shadow hover:shadow-md">
      <div className={"relative overflow-hidden bg-secondary/30 " + aspect}>
        {imagemUrl ? (
          <img
            src={imagemUrl}
            alt={titulo}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-7 w-7 text-muted-foreground/30" />
          </div>
        )}
        {destaque && (
          <Badge
            variant="outline"
            className="absolute left-2.5 top-2.5 gap-1 border-primary/30 bg-card/85 text-[10px] text-primary backdrop-blur-sm"
          >
            <Star className="h-3 w-3" /> Destaque
          </Badge>
        )}
      </div>
      <CardContent className={featured ? "flex flex-col justify-center gap-2 p-5" : "space-y-1.5 p-4"}>
        <h3 className={"font-display font-bold text-foreground " + (featured ? "text-base sm:text-lg" : "text-sm")}>
          {titulo}
        </h3>
        {subtitulo && (
          <p className={"font-medium text-muted-foreground " + (featured ? "text-sm" : "text-xs")}>{subtitulo}</p>
        )}
        {meta && <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">{meta}</div>}
        {descricao && (
          <p className={"leading-relaxed text-muted-foreground " + (featured ? "text-sm" : "text-xs")}>{descricao}</p>
        )}
      </CardContent>
    </Card>
  );
}
