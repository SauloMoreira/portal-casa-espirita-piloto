import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Star } from "lucide-react";
import { campanhasVisiveis, type Campanha } from "@/lib/campanhas";
import { listCampanhasVigentes } from "@/services/campanhas";

/**
 * Bloco institucional de campanhas da casa exibido ao assistido.
 * Mostra apenas campanhas ativas e vigentes (destaques primeiro).
 * Não renderiza nada quando não há campanhas. Área própria, separada
 * de eventos e da ação social.
 */
export function CampanhasAssistidoBlock() {
  const [itens, setItens] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCampanhasVigentes()
      .then((d) => setItens(campanhasVisiveis(d)))
      .catch(() => setItens([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading || itens.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-wide uppercase text-primary">Campanhas da Casa</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {itens.map((c) => (
          <Card key={c.id} className="overflow-hidden border-border/60 shadow-sm hover:shadow-md transition-shadow">
            {c.imagem_url && (
              <div className="aspect-[16/9] w-full overflow-hidden bg-secondary/30">
                <img src={c.imagem_url} alt={c.titulo} className="h-full w-full object-cover" loading="lazy" />
              </div>
            )}
            <CardContent className="p-4 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-display font-bold text-foreground">{c.titulo}</h3>
                {c.destaque && (
                  <Badge variant="outline" className="shrink-0 text-[10px] gap-1 border-primary/30 text-primary">
                    <Star className="h-3 w-3" /> Destaque
                  </Badge>
                )}
              </div>
              {c.subtitulo && <p className="text-xs font-medium text-muted-foreground">{c.subtitulo}</p>}
              {c.descricao_curta && <p className="text-xs text-muted-foreground leading-relaxed">{c.descricao_curta}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
