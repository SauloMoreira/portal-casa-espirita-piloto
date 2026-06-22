import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, ShieldCheck, History, BellOff } from "lucide-react";
import {
  getConsentimento,
  getHistoricoConsentimento,
  setComunicacaoCasa,
  type ConsentimentoPreferencia,
  type ConsentimentoHistorico,
} from "@/services/notificacoes/consentimentoService";

const ORIGEM_LABEL: Record<string, string> = {
  app: "pelo app",
  whatsapp: "pelo WhatsApp",
  equipe: "pela equipe",
  importacao: "por importação",
};

function fmt(dt: string | null): string {
  if (!dt) return "";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Card das COMUNICAÇÕES DA CASA por WhatsApp (institucional / campanhas / eventos).
 * Modelo OPT-OUT: a permissão nasce ATIVA por padrão. O usuário pode cancelar
 * aqui ou respondendo SAIR/PARAR/CANCELAR no WhatsApp, e reativar quando quiser.
 */
export function ConsentimentoWhatsappCard({ assistidoId }: { assistidoId: string }) {
  const { toast } = useToast();
  const [pref, setPref] = useState<ConsentimentoPreferencia | null>(null);
  const [historico, setHistorico] = useState<ConsentimentoHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  const load = async () => {
    try {
      const [p, h] = await Promise.all([
        getConsentimento(assistidoId),
        getHistoricoConsentimento(assistidoId),
      ]);
      setPref(p);
      setHistorico(h);
    } catch {
      /* silencioso: card opcional */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [assistidoId]);

  // Default ATIVO quando não há registro (opt-out): só fica cancelado com flag false.
  const ativo = pref ? pref.comunicacao_geral_ativa !== false : true;

  const handle = async (ativa: boolean) => {
    setSaving(true);
    try {
      await setComunicacaoCasa(assistidoId, ativa, "app");
      await load();
      toast({
        title: ativa ? "Comunicações reativadas" : "Comunicações canceladas",
        description: ativa
          ? "Você voltará a receber as comunicações da casa por WhatsApp."
          : "Você não receberá mais comunicações da casa por WhatsApp.",
      });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" /> Comunicações da casa por WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          {ativo ? (
            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 gap-1">
              <ShieldCheck className="h-3 w-3" /> Ativo
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <BellOff className="h-3 w-3" /> Cancelado
            </Badge>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Avisos institucionais, campanhas e eventos da casa. As mensagens são em
            volume controlado e nunca configuram spam. Esta permissão fica ativa por
            padrão e você pode cancelar a qualquer momento.
          </p>
        </div>

        {pref?.consentimento_at && (
          <p className="text-[11px] text-muted-foreground">
            Última atualização em {fmt(pref.consentimento_at)}
            {pref.consentimento_origem ? ` ${ORIGEM_LABEL[pref.consentimento_origem] ?? ""}` : ""}.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {ativo ? (
            <Button size="sm" variant="outline" disabled={loading || saving} onClick={() => handle(false)}>
              {saving ? "Salvando..." : "Cancelar comunicações"}
            </Button>
          ) : (
            <Button size="sm" disabled={loading || saving} onClick={() => handle(true)}>
              {saving ? "Salvando..." : "Reativar comunicações"}
            </Button>
          )}
          {historico.length > 0 && (
            <Button size="sm" variant="ghost" className="gap-1" onClick={() => setMostrarHistorico((v) => !v)}>
              <History className="h-3.5 w-3.5" /> {mostrarHistorico ? "Ocultar histórico" : "Ver histórico"}
            </Button>
          )}
        </div>

        {mostrarHistorico && historico.length > 0 && (
          <ul className="space-y-1.5 border-t border-border/50 pt-3">
            {historico.map((h) => (
              <li key={h.id} className="text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                <span>
                  <span className={h.acao === "concedido" ? "text-green-600 dark:text-green-400 font-medium" : "text-muted-foreground font-medium"}>
                    {h.acao === "concedido" ? "Reativado" : "Cancelado"}
                  </span>{" "}
                  {ORIGEM_LABEL[h.origem] ?? h.origem}
                </span>
                <span>{fmt(h.created_at)}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-muted-foreground">
          Você também pode cancelar a qualquer momento respondendo "SAIR", "PARAR" ou
          "CANCELAR" no WhatsApp — e voltar a receber respondendo "VOLTAR".
        </p>
      </CardContent>
    </Card>
  );
}
