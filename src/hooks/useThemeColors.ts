/**
 * SAAS-05-D — Carrega cores tenant-scoped a partir de `configuracoes_gerais`.
 *
 * Roda no root do App (fora do `InstituicaoProvider`). Usa o espelho
 * módulo-nível para escapar a busca quando ainda não há tenant selecionado.
 * A propagação reativa quando o tenant muda fica documentada como pendência
 * (SAAS-05-E: mover o theme loader para dentro do AppLayout).
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentInstituicaoId } from "@/lib/tenant/currentTenant";

export function useThemeColors() {
  useEffect(() => {
    const load = async () => {
      const instituicaoId = getCurrentInstituicaoId();
      // Sem tenant ativo: mantém tema default (fail-closed silencioso).
      if (!instituicaoId) return;
      const { data } = await supabase
        .from("configuracoes_gerais")
        .select("chave, valor")
        .eq("instituicao_id", instituicaoId)
        .like("chave", "cor_%");
      if (data && data.length > 0) {
        const root = document.documentElement;
        data.forEach((row) => {
          const cssVar = `--${row.chave.replace("cor_", "")}`;
          root.style.setProperty(cssVar, row.valor);
        });
      }
    };
    load();
  }, []);
}
