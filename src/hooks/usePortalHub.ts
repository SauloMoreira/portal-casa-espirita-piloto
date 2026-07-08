/**
 * SAAS-03 — Hook de dados do Portal/Hub.
 *
 * Consome exclusivamente a fundação SaaS (SAAS-02): `instituicoes`,
 * `instituicao_usuarios`, `assinaturas`, `planos`, `plano_modulos`, `modulos`,
 * `platform_admins`.
 *
 * Segurança:
 * - Todas as leituras passam pela RLS já existente. Nenhum filtro sensível é
 *   feito no cliente — o backend é fonte de verdade.
 * - Se o usuário não tiver vínculo, as queries retornam vazio (fail-closed).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type SaasInstituicaoStatus =
  | "implantacao"
  | "ativa"
  | "inativa"
  | "suspensa";

export type SaasVinculoStatus = "pendente" | "ativo" | "inativo";

export type SaasAssinaturaStatus =
  | "trial"
  | "ativa"
  | "suspensa"
  | "cancelada"
  | "inadimplente"
  | "encerrada";

export type SaasPapelLocal =
  | "admin_instituicao"
  | "coordenador"
  | "entrevistador"
  | "tarefeiro"
  | "assistido"
  | "leitor"
  | "caixa"
  | "bibliotecario";

export interface PortalModulo {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  ativo_no_plano: boolean;
  ativo_no_catalogo: boolean;
}

export interface PortalInstituicaoView {
  id: string;
  nome: string;
  slug: string;
  status: SaasInstituicaoStatus;
  cidade: string | null;
  uf: string | null;
  vinculo_status: SaasVinculoStatus;
  papel_local: SaasPapelLocal;
  assinatura: {
    id: string;
    status: SaasAssinaturaStatus;
    trial_ate: string | null;
    data_inicio: string;
    data_fim: string | null;
  } | null;
  plano: {
    id: string;
    codigo: string;
    nome: string;
    descricao: string | null;
  } | null;
  modulos: PortalModulo[];
  acessivel: boolean; // instituição + vínculo + assinatura permitem uso
}

interface UsePortalHubResult {
  isLoading: boolean;
  isError: boolean;
  isPlatformAdmin: boolean;
  instituicoes: PortalInstituicaoView[];
}

export function usePortalHub(): UsePortalHubResult {
  const { user, rolesResolved } = useAuth();
  const userId = user?.id ?? null;

  const enabled = Boolean(userId && rolesResolved);

  const query = useQuery({
    queryKey: ["saas", "portal-hub", userId],
    enabled,
    queryFn: async (): Promise<Omit<UsePortalHubResult, "isLoading" | "isError">> => {
      if (!userId) {
        return { isPlatformAdmin: false, instituicoes: [] };
      }

      // 1) Vínculos do usuário (RLS: apenas os próprios).
      const vinculosRes = await supabase
        .from("instituicao_usuarios")
        .select("id, instituicao_id, papel_local, status")
        .eq("user_id", userId);

      if (vinculosRes.error) throw vinculosRes.error;
      const vinculos = vinculosRes.data ?? [];

      // 2) Platform admin (RLS: próprio user_id).
      const paRes = await supabase
        .from("platform_admins")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      const isPlatformAdmin = !paRes.error && Boolean(paRes.data);

      if (vinculos.length === 0) {
        return { isPlatformAdmin, instituicoes: [] };
      }

      const institIds = Array.from(new Set(vinculos.map((v) => v.instituicao_id)));

      // 3) Instituições (RLS já filtra).
      const instRes = await supabase
        .from("instituicoes")
        .select("id, nome, slug, status, cidade, uf")
        .in("id", institIds);
      if (instRes.error) throw instRes.error;
      const instituicoes = instRes.data ?? [];

      // 4) Assinaturas por instituição.
      const asgRes = await supabase
        .from("assinaturas")
        .select("id, instituicao_id, plano_id, status, trial_ate, data_inicio, data_fim")
        .in("instituicao_id", institIds);
      if (asgRes.error) throw asgRes.error;
      const assinaturas = asgRes.data ?? [];

      // 5) Catálogo global de módulos + planos + composição + overrides por assinatura.
      const asgIds = assinaturas.map((a) => a.id);
      const [modRes, planosRes, pmRes, amRes] = await Promise.all([
        supabase.from("modulos").select("id, codigo, nome, descricao, ativo"),
        supabase.from("planos").select("id, codigo, nome, descricao"),
        supabase.from("plano_modulos").select("plano_id, modulo_id, ativo"),
        asgIds.length > 0
          ? supabase
              .from("assinatura_modulos")
              .select("assinatura_id, modulo_id, ativo")
              .in("assinatura_id", asgIds)
          : Promise.resolve({ data: [], error: null } as { data: Array<{ assinatura_id: string; modulo_id: string; ativo: boolean }>; error: null }),
      ]);
      if (modRes.error) throw modRes.error;
      if (planosRes.error) throw planosRes.error;
      if (pmRes.error) throw pmRes.error;
      if (amRes.error) throw amRes.error;

      const modulos = modRes.data ?? [];
      const planos = planosRes.data ?? [];
      const planoModulos = pmRes.data ?? [];
      const assinaturaModulos = (amRes.data ?? []) as Array<{
        assinatura_id: string;
        modulo_id: string;
        ativo: boolean;
      }>;

      // Monta a visão consolidada.
      const view: PortalInstituicaoView[] = instituicoes.map((inst) => {
        const vinculo = vinculos.find((v) => v.instituicao_id === inst.id)!;
        const assinatura = assinaturas.find((a) => a.instituicao_id === inst.id) ?? null;
        const plano = assinatura
          ? planos.find((p) => p.id === assinatura.plano_id) ?? null
          : null;

        const modulosPlano = plano
          ? new Set(
              planoModulos
                .filter((pm) => pm.plano_id === plano.id && pm.ativo)
                .map((pm) => pm.modulo_id),
            )
          : new Set<string>();

        // Override por assinatura: se existir linha em assinatura_modulos
        // para (assinatura, módulo), o valor `ativo` prevalece sobre o plano.
        const overridesPorModulo = new Map<string, boolean>();
        if (assinatura) {
          for (const am of assinaturaModulos) {
            if (am.assinatura_id === assinatura.id) {
              overridesPorModulo.set(am.modulo_id, am.ativo);
            }
          }
        }

        const modulosView: PortalModulo[] = modulos.map((m) => {
          const override = overridesPorModulo.get(m.id);
          const ativo_no_plano =
            override !== undefined ? override : modulosPlano.has(m.id);
          return {
            id: m.id,
            codigo: m.codigo,
            nome: m.nome,
            descricao: m.descricao,
            ativo_no_catalogo: m.ativo,
            ativo_no_plano,
          };
        });

        const acessivel =
          vinculo.status === "ativo" &&
          (inst.status === "ativa" || inst.status === "implantacao") &&
          assinatura !== null &&
          assinatura.status !== "cancelada" &&
          assinatura.status !== "suspensa" &&
          assinatura.status !== "encerrada";

        return {
          id: inst.id,
          nome: inst.nome,
          slug: inst.slug,
          status: inst.status as SaasInstituicaoStatus,
          cidade: inst.cidade,
          uf: inst.uf,
          vinculo_status: vinculo.status as SaasVinculoStatus,
          papel_local: vinculo.papel_local as SaasPapelLocal,
          assinatura: assinatura
            ? {
                id: assinatura.id,
                status: assinatura.status as SaasAssinaturaStatus,
                trial_ate: assinatura.trial_ate,
                data_inicio: assinatura.data_inicio,
                data_fim: assinatura.data_fim,
              }
            : null,
          plano: plano
            ? {
                id: plano.id,
                codigo: plano.codigo,
                nome: plano.nome,
                descricao: plano.descricao,
              }
            : null,
          modulos: modulosView,
          acessivel,
        };
      });

      // Ordena: acessíveis primeiro, depois por nome.
      view.sort((a, b) => {
        if (a.acessivel !== b.acessivel) return a.acessivel ? -1 : 1;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });

      return { isPlatformAdmin, instituicoes: view };
    },
  });

  return {
    isLoading: enabled ? query.isLoading : true,
    isError: query.isError,
    isPlatformAdmin: query.data?.isPlatformAdmin ?? false,
    instituicoes: query.data?.instituicoes ?? [],
  };
}

/**
 * Rotas alvo do CTA "acessar módulo" (SAAS-03: sem tenantização real ainda).
 */
/**
 * Rotas alvo do CTA "acessar módulo" da Central de Assinaturas / Portal.
 *
 * SAAS-06-B0.2: Tratamentos é o único módulo comercial atualmente construído.
 * Os demais (Caixa/Cantina, Biblioteca, Portal Institucional, Financeiro) são
 * módulos comerciais futuros — não têm rota e devem aparecer como "em breve".
 * O autoatendimento do assistido é uma funcionalidade INTERNA de Tratamentos
 * e não um módulo comercial.
 */
export const MODULO_ROTA: Record<string, string | null> = {
  tratamentos: "/tratamentos",
  biblioteca: null, // futuro módulo
  caixa: null, // futuro módulo (Caixa / Cantina)
  portal: null, // futuro módulo (Portal Institucional — site da casa)
  financeiro: null, // futuro módulo
};
