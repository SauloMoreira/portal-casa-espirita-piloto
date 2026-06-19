/**
 * Painel Institucional — camada de governança/visão consolidada.
 * Lógica pura (sem React/Supabase) que unifica Campanhas e Eventos em uma
 * lista de "publicações" institucionais, reaproveitando as regras já
 * existentes de vigência, destaque e ordenação. Não duplica CRUD.
 */
import type { Campanha } from "@/lib/campanhas";
import type { Evento } from "@/lib/eventos";
import { campanhaVigente } from "@/lib/campanhas";
import { eventoVigente } from "@/lib/eventos";

export type PublicacaoTipo = "campanha" | "evento";

export type PublicacaoStatus = "vigente" | "fora_periodo" | "inativo";

export interface PublicacaoItem {
  id: string;
  tipo: PublicacaoTipo;
  titulo: string;
  ativo: boolean;
  destaque: boolean;
  ordem: number;
  data_inicio: string | null;
  data_fim: string | null;
  /** Apenas eventos: data do evento em si. */
  data_evento: string | null;
  imagem_url: string | null;
  imagem_origem: string | null;
  imagem_otimizada: boolean;
  /** ativo e dentro do período de exibição na referência. */
  vigente: boolean;
  status: PublicacaoStatus;
}

export interface PublicacaoFiltro {
  tipo: "todos" | PublicacaoTipo;
  status: "todos" | "ativo" | "inativo";
  apenasDestaque: boolean;
  apenasVigentes: boolean;
}

export const FILTRO_PADRAO: PublicacaoFiltro = {
  tipo: "todos",
  status: "todos",
  apenasDestaque: false,
  apenasVigentes: false,
};

export interface PainelResumo {
  campanhasAtivas: number;
  eventosAtivos: number;
  destaquesAtivos: number;
  vigentesHoje: number;
}

function statusDe(ativo: boolean, vigente: boolean): PublicacaoStatus {
  if (!ativo) return "inativo";
  return vigente ? "vigente" : "fora_periodo";
}

/** Converte uma campanha em item de publicação do painel. */
export function mapCampanha(c: Campanha, ref: Date = new Date()): PublicacaoItem {
  const vigente = !!c.ativo && campanhaVigente(c, ref);
  return {
    id: c.id,
    tipo: "campanha",
    titulo: c.titulo,
    ativo: !!c.ativo,
    destaque: !!c.destaque,
    ordem: c.ordem ?? 0,
    data_inicio: c.data_inicio ?? null,
    data_fim: c.data_fim ?? null,
    data_evento: null,
    imagem_url: c.imagem_url ?? null,
    imagem_origem: c.imagem_origem ?? null,
    imagem_otimizada: !!c.imagem_otimizada,
    vigente,
    status: statusDe(!!c.ativo, vigente),
  };
}

/** Converte um evento em item de publicação do painel. */
export function mapEvento(e: Evento, ref: Date = new Date()): PublicacaoItem {
  const vigente = !!e.ativo && eventoVigente(e, ref);
  return {
    id: e.id,
    tipo: "evento",
    titulo: e.titulo,
    ativo: !!e.ativo,
    destaque: !!e.destaque,
    ordem: e.ordem ?? 0,
    data_inicio: e.data_inicio ?? null,
    data_fim: e.data_fim ?? null,
    data_evento: e.data_evento ?? null,
    imagem_url: e.imagem_url ?? null,
    imagem_origem: e.imagem_origem ?? null,
    imagem_otimizada: !!e.imagem_otimizada,
    vigente,
    status: statusDe(!!e.ativo, vigente),
  };
}

/** Combina campanhas e eventos em uma única lista ordenada. */
export function combinarPublicacoes(
  campanhas: Campanha[],
  eventos: Evento[],
  ref: Date = new Date(),
): PublicacaoItem[] {
  const itens = [
    ...campanhas.map((c) => mapCampanha(c, ref)),
    ...eventos.map((e) => mapEvento(e, ref)),
  ];
  return ordenarPublicacoes(itens);
}

/** Ordenação consolidada: destaque desc, vigente desc, ordem asc, título asc. */
export function ordenarPublicacoes(itens: PublicacaoItem[]): PublicacaoItem[] {
  return [...itens].sort((a, b) => {
    if (a.destaque !== b.destaque) return a.destaque ? -1 : 1;
    if (a.vigente !== b.vigente) return a.vigente ? -1 : 1;
    if (a.ordem !== b.ordem) return a.ordem - b.ordem;
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });
}

/** Aplica os filtros simples do painel. */
export function filtrarPublicacoes(
  itens: PublicacaoItem[],
  filtro: PublicacaoFiltro,
): PublicacaoItem[] {
  return itens.filter((it) => {
    if (filtro.tipo !== "todos" && it.tipo !== filtro.tipo) return false;
    if (filtro.status === "ativo" && !it.ativo) return false;
    if (filtro.status === "inativo" && it.ativo) return false;
    if (filtro.apenasDestaque && !it.destaque) return false;
    if (filtro.apenasVigentes && !it.vigente) return false;
    return true;
  });
}

/** Métricas do bloco-resumo do painel. */
export function resumoPublicacoes(itens: PublicacaoItem[]): PainelResumo {
  return {
    campanhasAtivas: itens.filter((i) => i.tipo === "campanha" && i.ativo).length,
    eventosAtivos: itens.filter((i) => i.tipo === "evento" && i.ativo).length,
    destaquesAtivos: itens.filter((i) => i.ativo && i.destaque).length,
    vigentesHoje: itens.filter((i) => i.vigente).length,
  };
}

/** Rótulo amigável do status de publicação. */
export function statusLabel(status: PublicacaoStatus): string {
  switch (status) {
    case "vigente":
      return "Vigente";
    case "fora_periodo":
      return "Ativo fora do período";
    case "inativo":
      return "Inativo";
  }
}

/** Texto do período de exibição (ex.: "10/06 – 30/06", "Sem prazo definido"). */
export function periodoLabel(item: Pick<PublicacaoItem, "data_inicio" | "data_fim">): string {
  const fmt = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso + "T12:00:00");
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };
  const ini = fmt(item.data_inicio);
  const fim = fmt(item.data_fim);
  if (!ini && !fim) return "Sem prazo definido";
  if (ini && !fim) return `A partir de ${ini}`;
  if (!ini && fim) return `Até ${fim}`;
  return `${ini} – ${fim}`;
}
