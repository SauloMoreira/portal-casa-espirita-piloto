/**
 * SAAS-06-A1 — Branding tenant-aware.
 *
 * Compõe o branding a ser exibido em áreas internas (pós-login):
 *  - Se houver instituição ativa selecionada e uma linha correspondente em
 *    `instituicao_config` (RLS-scoped), usa nome, logo, slogan, cores e
 *    textos institucionais desse tenant.
 *  - Se não houver instituição ativa OU a leitura falhar, cai para o
 *    branding global neutro em `SAAS_BRANDING` — nunca para a marca
 *    "Tratamentos FER" e nunca para o branding de outro tenant.
 *
 * Regras:
 *  - Nunca lê armazenamento persistente por fora do `InstituicaoContext`.
 *  - Fail-closed: sem tenant ativo → fallback global.
 *  - Não altera RLS/RPCs; apenas lê `instituicao_config` via cliente supabase
 *    já autenticado, que já é filtrado pela RLS existente.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useInstituicaoAtiva } from "@/contexts/InstituicaoContext";
import { SAAS_BRANDING } from "@/config/saasBranding";

export interface TenantBranding {
  scope: "tenant" | "global";
  nome: string;
  slogan: string;
  logoUrl: string | null;
  corPrimaria: string | null;
  corSecundaria: string | null;
  textoInstitucional: string | null;
  assinaturaRodape: string;
}

interface InstituicaoConfigBranding {
  nome_fantasia: string | null;
  logo_url: string | null;
  slogan: string | null;
  cor_primaria: string | null;
  cor_secundaria: string | null;
  texto_institucional: string | null;
  assinatura_rodape: string | null;
}

const GLOBAL_BRANDING: TenantBranding = {
  scope: "global",
  nome: SAAS_BRANDING.name,
  slogan: SAAS_BRANDING.tagline,
  logoUrl: null,
  corPrimaria: null,
  corSecundaria: null,
  textoInstitucional: SAAS_BRANDING.subtitle,
  assinaturaRodape: SAAS_BRANDING.signature,
};

export function useTenantBranding(): TenantBranding {
  const { selecionada } = useInstituicaoAtiva();
  const [config, setConfig] = useState<InstituicaoConfigBranding | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!selecionada?.id) {
      setConfig(null);
      return () => {
        cancelled = true;
      };
    }
    supabase
      .from("instituicao_config")
      .select(
        "nome_fantasia, logo_url, slogan, cor_primaria, cor_secundaria, texto_institucional, assinatura_rodape",
      )
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || data.length === 0) {
          setConfig(null);
          return;
        }
        setConfig(data[0] as unknown as InstituicaoConfigBranding);
      });
    return () => {
      cancelled = true;
    };
  }, [selecionada?.id]);

  // Fail-closed: sem tenant ativo → branding global.
  if (!selecionada) return GLOBAL_BRANDING;

  const nome = config?.nome_fantasia?.trim() || selecionada.nome;
  return {
    scope: "tenant",
    nome,
    slogan: config?.slogan?.trim() || GLOBAL_BRANDING.slogan,
    logoUrl: config?.logo_url ?? null,
    corPrimaria: config?.cor_primaria ?? null,
    corSecundaria: config?.cor_secundaria ?? null,
    textoInstitucional:
      config?.texto_institucional?.trim() || GLOBAL_BRANDING.textoInstitucional,
    assinaturaRodape:
      config?.assinatura_rodape?.trim() ||
      `${SAAS_BRANDING.name} · ${nome}`,
  };
}
