import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useThemeColors() {
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("configuracoes_gerais")
        .select("chave, valor")
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
