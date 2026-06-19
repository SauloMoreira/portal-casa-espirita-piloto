import { useEffect, useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";
import { eventosVisiveis, type Evento } from "@/lib/eventos";
import { listEventosVigentes } from "@/services/eventos";
import { VitrineCard } from "@/components/conteudo/VitrineCard";

function formatEventoData(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
}

function EventoMeta({ e }: { e: Evento }) {
  if (!e.data_evento && !e.local) return null;
  return (
    <>
      {e.data_evento && (
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3 w-3" /> {formatEventoData(e.data_evento)}
        </span>
      )}
      {e.local && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {e.local}
        </span>
      )}
    </>
  );
}

/**
 * Bloco institucional de eventos da casa exibido ao assistido.
 * Mostra apenas eventos ativos e vigentes (destaques e próximos primeiro), em vitrine.
 * Não renderiza nada quando não há eventos. Área própria, separada
 * de campanhas e da ação social.
 */
export function EventosAssistidoBlock() {
  const [itens, setItens] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listEventosVigentes()
      .then((d) => setItens(eventosVisiveis(d)))
      .catch(() => setItens([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading || itens.length === 0) return null;

  const [primeiro, ...restantes] = itens;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold tracking-wide uppercase text-primary">Eventos da Casa</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <VitrineCard
          featured={itens.length > 1}
          imagemUrl={primeiro.imagem_url}
          titulo={primeiro.titulo}
          subtitulo={primeiro.subtitulo}
          descricao={primeiro.descricao_curta}
          destaque={primeiro.destaque}
          meta={<EventoMeta e={primeiro} />}
        />
        {restantes.map((e) => (
          <VitrineCard
            key={e.id}
            imagemUrl={e.imagem_url}
            titulo={e.titulo}
            subtitulo={e.subtitulo}
            descricao={e.descricao_curta}
            destaque={e.destaque}
            meta={<EventoMeta e={e} />}
          />
        ))}
      </div>
    </section>
  );
}
