import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HeartHandshake } from "lucide-react";
import { alimentosVisiveis, formatFaltante, type AlimentoAcaoSocial } from "@/lib/acaoSocial";
import { listAlimentosAtivos } from "@/services/acaoSocial";

/**
 * Bloco acolhedor exibido ao assistido com os alimentos mais necessários
 * no momento. Mostra apenas itens ativos, respeitando a ordem definida pela
 * administração. Não renderiza nada quando não há itens.
 */
export function AlimentosAssistidoCard() {
  const [itens, setItens] = useState<AlimentoAcaoSocial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAlimentosAtivos()
      .then((d) => setItens(alimentosVisiveis(d)))
      .catch(() => setItens([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading || itens.length === 0) return null;

  return (
    <Card className="overflow-hidden border-border/50 shadow-sm">
      {/* Faixa introdutória institucional — verde escuro sóbrio e acolhedor */}
      <div className="gradient-acao-social px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-acao-social-foreground/10 ring-1 ring-acao-social-foreground/15">
            <HeartHandshake className="h-4.5 w-4.5 text-acao-social-foreground" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h3 className="font-display text-base font-semibold tracking-wide text-acao-social-foreground sm:text-lg">
              Ação Social
            </h3>
            <p className="text-xs leading-relaxed text-acao-social-muted sm:text-sm">
              Se desejar contribuir com nossa ação social, veja abaixo os alimentos que mais
              precisamos no momento. Cada gesto faz diferença.
            </p>
          </div>
        </div>
      </div>

      <CardContent className="pt-4">
        <ul className="divide-y divide-border/50">
          {itens.map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{it.nome}</p>
                {it.observacao && (
                  <p className="text-xs text-muted-foreground mt-0.5">{it.observacao}</p>
                )}
              </div>
              {it.quantidade_faltante != null && (
                <span className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {formatFaltante(it)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
