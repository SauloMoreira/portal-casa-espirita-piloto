import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { souComunicadorElegivel } from "@/services/notificacoes/comunicadorService";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { BellRing } from "lucide-react";

/**
 * Card de opt-in para o Comunicador receber alertas externos da fila da Central
 * no WhatsApp pessoal. Só é exibido quando o usuário logado é elegível
 * (vinculado de forma única, por telefone, a um voluntário ativo com a função
 * "Comunicador"). O número usado é sempre o do perfil — esta tela apenas liga
 * ou desliga o recebimento.
 */
export function AlertaCentralCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [elegivel, setElegivel] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [recebe, setRecebe] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const carregar = async () => {
      if (!user) return;
      setCarregando(true);
      const elig = await souComunicadorElegivel();
      setElegivel(elig);

      if (elig) {
        const { data: cfg } = await supabase
          .from("comunicador_alerta_config" as any)
          .select("recebe_alertas_central")
          .eq("user_id", user.id)
          .maybeSingle();
        setRecebe(Boolean((cfg as any)?.recebe_alertas_central));
      }
      setCarregando(false);
    };
    carregar();
  }, [user]);

  const alternar = async (valor: boolean) => {
    if (!user) return;
    setSalvando(true);
    const { error } = await supabase
      .from("comunicador_alerta_config" as any)
      .upsert(
        { user_id: user.id, recebe_alertas_central: valor },
        { onConflict: "user_id" },
      );
    if (error) {
      toast({ title: "Erro ao salvar preferência", description: error.message, variant: "destructive" });
    } else {
      setRecebe(valor);
      toast({ title: valor ? "Alertas da Central ativados" : "Alertas da Central desativados" });
    }
    setSalvando(false);
  };

  if (carregando || !elegivel) return null;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" /> Alertas da Central no WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="pr-4">
            <Label>Receber alerta de fila pendente</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Avisamos no seu WhatsApp pessoal quando houver conversas aguardando
              atendimento humano. O aviso é consolidado e respeita um intervalo
              mínimo entre mensagens.
            </p>
          </div>
          <Switch checked={recebe} disabled={salvando} onCheckedChange={alternar} />
        </div>
      </CardContent>
    </Card>
  );
}
