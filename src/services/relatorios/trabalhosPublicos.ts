/**
 * Data access for public works analytics. Reads ONLY real data:
 * checkins_publicos joined to sessoes_publicas (real session date) and
 * tipos_tratamento flagged as trabalho_publico. Returns the full history so
 * the new-vs-recurrent classification is accurate.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PublicCheckinRecord } from "@/types/trabalhosPublicos";

interface TratamentoPublico {
  id: string;
  nome: string;
}

/** List of treatments configured as public works (generic, name-independent). */
export async function fetchTrabalhosPublicos(): Promise<TratamentoPublico[]> {
  const { data } = await supabase
    .from("tipos_tratamento")
    .select("id, nome, trabalho_publico")
    .eq("trabalho_publico", true)
    .order("nome");
  return (data || []).map((t) => ({ id: t.id, nome: t.nome }));
}

/** Full history of public check-ins, enriched for analytics. */
export async function fetchPublicCheckins(): Promise<PublicCheckinRecord[]> {
  const { data } = await supabase
    .from("checkins_publicos")
    .select(
      `id, sessao_id, assistido_id, nome_participante, celular, faixa_etaria, modo_checkin, cadastro_rapido,
       sessao:sessoes_publicas!inner(data_sessao, tratamento_id, tratamento:tipos_tratamento!inner(nome, trabalho_publico)),
       assistido:assistidos(data_nascimento)`,
    )
    .limit(10000);

  const rows = (data || []) as any[];
  return rows
    .filter((r) => r.sessao?.tratamento?.trabalho_publico === true && r.sessao?.data_sessao)
    .map((r) => ({
      id: r.id,
      sessaoId: r.sessao_id,
      dataSessao: r.sessao.data_sessao,
      tratamentoId: r.sessao.tratamento_id,
      tratamentoNome: r.sessao.tratamento?.nome ?? "Trabalho público",
      modoCheckin: r.modo_checkin ?? "qr",
      cadastroRapido: !!r.cadastro_rapido,
      faixaRaw: r.faixa_etaria ?? null,
      assistidoId: r.assistido_id ?? null,
      dataNascimento: r.assistido?.data_nascimento ?? null,
      nome: r.nome_participante ?? null,
      celular: r.celular ?? null,
    }));
}
