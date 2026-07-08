/**
 * SAAS-06-A0 — Branding global neutro do SaaS (pré-login).
 *
 * Toda tela pública (login, cadastro, MFA, recuperação) deve consumir daqui.
 * Branding por instituição (pós-login) fica em InstituicaoContext / instituicao_config.
 * Não referenciar "Tratamentos FER" nessas superfícies globais.
 */
export const SAAS_BRANDING = {
  name: "Portal Casa Espírita",
  shortName: "Portal",
  highlight: "Casa Espírita",
  prefix: "Portal",
  subtitle: "Gestão espiritual, assistencial e administrativa para casas espíritas",
  tagline: "Acolhimento · Organização · Renovação",
  signature: "Uma plataforma SC Moreira Tech",
} as const;

export type SaasBranding = typeof SAAS_BRANDING;
