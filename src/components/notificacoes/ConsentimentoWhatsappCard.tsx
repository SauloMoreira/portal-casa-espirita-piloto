import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, ShieldCheck, History } from "lucide-react";
import {
  TEXTO_TERMO_CONSENTIMENTO,
  consentimentoAtivo,
  normalizarStatus,
  rotuloStatus,
  type ConsentimentoStatus,
} from "@/lib/consentimento";
import {
  getConsentimento,
  getHistoricoConsentimento,
  registrarConsentimento,
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

/** Card de consentimento explícito (LGPD) para comunicação por WhatsApp. */
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

  const ativo = consentimentoAtivo(pref);
  const status: ConsentimentoStatus = normalizarStatus(pref?.consentimento_status);

  const handle = async (acao: "concedido" | "revogado") => {
    setSaving(true);
    try {
      await registrarConsentimento(assistidoId, acao, "app");
      await load();
      toast({
        title: acao === "concedido" ? "Consentimento registrado" : "Consentimento revogado",
        description: acao === "concedido"
          ? "Você passará a receber comunicações por WhatsApp."
          : "Você não receberá mais comunicações por WhatsApp.",
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
          <MessageCircle className="h-4 w-4 text-primary" /> Comunicação por WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          {ativo ? (
            <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 gap-1">
              <ShieldCheck className="h-3 w-3" /> {rotuloStatus("concedido")}
            </Badge>
          ) : (
            <Badge variant="secondary">{rotuloStatus(status)}</Badge>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{TEXTO_TERMO_CONSENTIMENTO}</p>
        </div>

        {pref?.consentimento_at && (
          <p className="text-[11px] text-muted-foreground">
            Última atualização em {fmt(pref.consentimento_at)}
            {pref.consentimento_origem ? ` ${ORIGEM_LABEL[pref.consentimento_origem] ?? ""}` : ""}.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!ativo ? (
            <Button size="sm" disabled={loading || saving} onClick={() => handle("concedido")}>
              {saving ? "Salvando..." : "Autorizar WhatsApp"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={loading || saving} onClick={() => handle("revogado")}>
              {saving ? "Salvando..." : "Revogar consentimento"}
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
                    {h.acao === "concedido" ? "Autorizado" : "Revogado"}
                  </span>{" "}
                  {ORIGEM_LABEL[h.origem] ?? h.origem}
                </span>
                <span>{fmt(h.created_at)}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-muted-foreground">
          Você também pode revogar a qualquer momento respondendo "PARAR" no WhatsApp.
          Mensagens em volume controlado — nunca spam.
        </p>
      </CardContent>
    </Card>
  );
}
