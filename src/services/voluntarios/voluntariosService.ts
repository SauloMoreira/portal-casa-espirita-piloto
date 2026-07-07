/**
 * Data access + orchestration for the Voluntários module.
 * Centralizes all Supabase queries previously inlined in the page.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type {
  VoluntarioListItem,
  FuncaoVoluntariado,
  VoluntarioFuncoesMap,
} from "@/types/voluntarios";

export async function fetchVoluntarios(): Promise<VoluntarioListItem[]> {
  const { data } = await supabase
    .from("voluntarios")
    .select("*")
    .order("nome_completo");
  return (data ?? []) as VoluntarioListItem[];
}

export async function fetchFuncoesAtivas(): Promise<FuncaoVoluntariado[]> {
  const { data } = await supabase
    .from("funcoes_voluntariado")
    .select("*")
    .eq("status", "ativo")
    .order("tipo_voluntario")
    .order("nome_funcao");
  return (data ?? []) as FuncaoVoluntariado[];
}

export async function fetchVoluntarioFuncoesMap(): Promise<VoluntarioFuncoesMap> {
  const { data } = await supabase
    .from("voluntario_funcoes")
    .select("voluntario_id, funcao_id");
  const map: VoluntarioFuncoesMap = {};
  (data ?? []).forEach((r) => {
    if (!map[r.voluntario_id]) map[r.voluntario_id] = [];
    map[r.voluntario_id].push(r.funcao_id);
  });
  return map;
}

export async function fetchFuncoesIdsByVoluntario(
  voluntarioId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("voluntario_funcoes")
    .select("funcao_id")
    .eq("voluntario_id", voluntarioId);
  return (data ?? []).map((r) => r.funcao_id);
}

export async function fetchInstituicaoConfig() {
  const { data } = await supabase.from("instituicao_config").select("*").limit(1);
  return data && data.length > 0 ? data[0] : null;
}

export async function isCpfDuplicado(
  cpf: string,
  excludeId?: string | null,
): Promise<boolean> {
  let query = supabase.from("voluntarios").select("id").eq("cpf", cpf);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return !!data && data.length > 0;
}

type VoluntarioPayload = Record<string, unknown>;

export async function saveVoluntario(
  payload: VoluntarioPayload,
  editId: string | null,
  createdBy: string,
): Promise<string> {
  if (editId) {
    const { error } = await supabase
      .from("voluntarios")
      .update(payload as TablesUpdate<"voluntarios">)
      .eq("id", editId);
    if (error) throw error;
    return editId;
  }
  const { data, error } = await supabase
    .from("voluntarios")
    .insert({ ...payload, created_by: createdBy } as TablesInsert<"voluntarios">)
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

export async function replaceVoluntarioFuncoes(
  voluntarioId: string,
  funcoesIds: string[],
): Promise<void> {
  await supabase.from("voluntario_funcoes").delete().eq("voluntario_id", voluntarioId);
  if (funcoesIds.length > 0) {
    await supabase
      .from("voluntario_funcoes")
      .insert(funcoesIds.map((fid) => ({ voluntario_id: voluntarioId, funcao_id: fid })));
  }
}

// ---- Lifecycle management (inactivate / reactivate / check / delete) ----

export interface VoluntarioActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  can_delete?: boolean;
  blockers?: string[];
  suggestion?: string;
}

type VoluntarioAction = "inactivate" | "reactivate" | "check" | "delete";

async function manageVoluntario(
  action: VoluntarioAction,
  voluntarioId: string,
  motivo?: string | null,
): Promise<VoluntarioActionResult> {
  const { data, error } = await supabase.rpc("gerenciar_voluntario", {
    p_action: action,
    p_voluntario_id: voluntarioId,
    p_motivo: motivo ?? null,
  });
  if (error) throw error;
  return (data ?? {}) as VoluntarioActionResult;
}

export const inactivateVoluntario = (id: string, motivo?: string | null) =>
  manageVoluntario("inactivate", id, motivo);

export const reactivateVoluntario = (id: string, motivo?: string | null) =>
  manageVoluntario("reactivate", id, motivo);

export const checkVoluntarioDeletion = (id: string) =>
  manageVoluntario("check", id);

export const deleteVoluntario = (id: string, motivo?: string | null) =>
  manageVoluntario("delete", id, motivo);

// ---- Termo de Adesão flow ----

const TERMO_BUCKET = "termos-voluntarios";

export interface TermoActionResult {
  success?: boolean;
  message?: string;
  error?: string;
}

type TermoAction = "gerar" | "assinar" | "validar" | "rejeitar";

async function manageTermo(
  action: TermoAction,
  voluntarioId: string,
  opts: { path?: string | null; nome?: string | null; motivo?: string | null } = {},
): Promise<TermoActionResult> {
  const { data, error } = await supabase.rpc("gerenciar_termo_voluntario", {
    p_action: action,
    p_voluntario_id: voluntarioId,
    p_path: opts.path ?? null,
    p_nome: opts.nome ?? null,
    p_motivo: opts.motivo ?? null,
  });
  if (error) throw error;
  return (data ?? {}) as TermoActionResult;
}

export const marcarTermoGerado = (id: string) => manageTermo("gerar", id);

export const validarTermo = (id: string) => manageTermo("validar", id);

export const rejeitarTermo = (id: string, motivo: string) =>
  manageTermo("rejeitar", id, { motivo });

export async function uploadTermoAssinado(
  voluntarioId: string,
  path: string,
  file: File,
): Promise<TermoActionResult> {
  const { error: upErr } = await supabase.storage
    .from(TERMO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  return manageTermo("assinar", voluntarioId, { path, nome: file.name });
}

export async function getTermoSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(TERMO_BUCKET)
    .createSignedUrl(path, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

// ---- Busca de pessoa existente para reaproveitamento ----

import { parsePessoaCandidatas, type PessoaCandidata } from "./voluntariosContracts";

/**
 * Busca pessoas já cadastradas (assistidos + usuários) para reaproveitar dados.
 * A consolidação/dedupe e precedência (assistido > usuário) é feita no backend
 * por fn_buscar_pessoa_para_voluntario.
 */
export async function buscarPessoaParaVoluntario(termo: string): Promise<PessoaCandidata[]> {
  const { data, error } = await supabase.rpc("fn_buscar_pessoa_para_voluntario", { p_termo: termo });
  if (error) throw error;
  return parsePessoaCandidatas(data);
}
