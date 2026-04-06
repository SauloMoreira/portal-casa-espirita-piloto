import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cog, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Regra {
  id: string;
  chave: string;
  valor: string;
  descricao: string | null;
  ativo: boolean;
}

const CHAVE_LABELS: Record<string, string> = {
  limite_faltas_alerta: "Limite de faltas para alerta",
  prazo_maximo_espera_dias: "Prazo máximo na lista de espera (dias)",
  prazo_reavaliacao_faltas_dias: "Prazo de reavaliação após faltas (dias)",
  limite_carga_tarefeiro: "Limite de assistidos por tarefeiro",
  alerta_sessao_proxima_horas: "Antecedência para alerta de sessão (horas)",
  retorno_fraterno_pos_conclusao: "Retorno fraterno após conclusão",
};

export default function RegrasOperacionais() {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [editValues, setEditValues] = useState<Record<string, { valor: string; ativo: boolean }>>({});
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("regras_operacionais")
        .select("*")
        .order("chave");
      if (data) {
        setRegras(data as Regra[]);
        const vals: Record<string, { valor: string; ativo: boolean }> = {};
        (data as Regra[]).forEach((r) => { vals[r.id] = { valor: r.valor, ativo: r.ativo }; });
        setEditValues(vals);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    for (const regra of regras) {
      const ev = editValues[regra.id];
      if (!ev) continue;
      if (ev.valor !== regra.valor || ev.ativo !== regra.ativo) {
        await supabase
          .from("regras_operacionais")
          .update({ valor: ev.valor, ativo: ev.ativo, updated_by: user?.id } as any)
          .eq("id", regra.id);
      }
    }
    toast({ title: "Regras salvas com sucesso" });
    setLoading(false);
  };

  const isBooleanRule = (chave: string) => chave === "retorno_fraterno_pos_conclusao";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Regras Operacionais</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure os parâmetros de automação e alertas do sistema</p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Cog className="h-4 w-4 text-primary" />
            Motor de Regras
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {regras.map((regra) => {
            const ev = editValues[regra.id];
            if (!ev) return null;
            const isBool = isBooleanRule(regra.chave);

            return (
              <div key={regra.id} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium">{CHAVE_LABELS[regra.chave] || regra.chave}</Label>
                    <Badge variant={ev.ativo ? "default" : "secondary"} className="text-[10px]">
                      {ev.ativo ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                  {regra.descricao && (
                    <p className="text-xs text-muted-foreground">{regra.descricao}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {isBool ? (
                    <Switch
                      checked={ev.valor === "true"}
                      onCheckedChange={(v) =>
                        setEditValues((prev) => ({ ...prev, [regra.id]: { ...ev, valor: v.toString() } }))
                      }
                    />
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      value={ev.valor}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, [regra.id]: { ...ev, valor: e.target.value } }))
                      }
                      className="w-20 text-center"
                    />
                  )}
                  <Switch
                    checked={ev.ativo}
                    onCheckedChange={(v) =>
                      setEditValues((prev) => ({ ...prev, [regra.id]: { ...ev, ativo: v } }))
                    }
                  />
                </div>
              </div>
            );
          })}

          <Button onClick={handleSave} disabled={loading} className="gap-2">
            <Save className="h-4 w-4" />
            {loading ? "Salvando..." : "Salvar Regras"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
