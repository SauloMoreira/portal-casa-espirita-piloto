import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CalendarX, Lock, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  listarAvisosAusenciaPendentes,
  tratarAvisoAusencia,
  STATUS_AVISO_LABELS,
  type AvisoAusenciaPendente,
  type StatusAviso,
} from "@/services/avisos/avisosAusenciaService";

const STATUS_VARIANT: Record<StatusAviso, "default" | "secondary" | "outline" | "destructive"> = {
  aberto: "destructive",
  em_tratamento: "default",
  resolvido: "secondary",
  descartado: "outline",
};

export default function AvisosAusencia() {
  const [avisos, setAvisos] = useState<AvisoAusenciaPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [incluirResolvidos, setIncluirResolvidos] = useState(false);
  const [resolucoes, setResolucoes] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listarAvisosAusenciaPendentes(incluirResolvidos);
      setAvisos(data);
    } catch {
      toast({ title: "Erro ao carregar avisos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [incluirResolvidos, toast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const tratar = async (aviso: AvisoAusenciaPendente, novoStatus: Exclude<StatusAviso, "aberto">) => {
    try {
      await tratarAvisoAusencia({
        avisoId: aviso.id,
        novoStatus,
        resolucao: resolucoes[aviso.id] ?? null,
      });
      toast({ title: "Aviso atualizado" });
      await carregar();
    } catch {
      toast({ title: "Não foi possível tratar o aviso", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <CalendarX className="h-6 w-6 text-primary" /> Avisos de Ausência
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sinais de "não poderei comparecer". A agenda não muda automaticamente — trate cada aviso.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="resolvidos" checked={incluirResolvidos} onCheckedChange={setIncluirResolvidos} />
          <Label htmlFor="resolvidos" className="text-sm">Incluir tratados</Label>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Carregando...</div>
      ) : avisos.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Nenhum aviso de ausência pendente.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {avisos.map((a) => (
            <Card key={a.id} className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex flex-wrap items-center justify-between gap-2">
                  <span>{a.assistido_nome}</span>
                  <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_AVISO_LABELS[a.status]}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {a.tipo_compromisso === "sessao" ? "Sessão de tratamento" : "Entrevista fraterna"} em{" "}
                  {new Date(a.data_compromisso + "T12:00:00").toLocaleDateString("pt-BR")}
                </p>

                {a.pode_ver_conteudo ? (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> Motivo informado
                    </p>
                    <p>{a.motivo?.trim() || <span className="text-muted-foreground">Não informado</span>}</p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5" /> Conteúdo restrito. Aviso de não comparecimento recebido.
                  </div>
                )}

                {a.pode_ver_conteudo && a.status !== "resolvido" && a.status !== "descartado" && (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Resolução / observação da equipe (opcional)"
                      value={resolucoes[a.id] ?? ""}
                      maxLength={1000}
                      rows={2}
                      onChange={(e) => setResolucoes((p) => ({ ...p, [a.id]: e.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      {a.status === "aberto" && (
                        <Button size="sm" variant="outline" onClick={() => tratar(a, "em_tratamento")}>
                          Marcar em tratamento
                        </Button>
                      )}
                      <Button size="sm" onClick={() => tratar(a, "resolvido")}>
                        Resolver
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => tratar(a, "descartado")}>
                        Descartar
                      </Button>
                    </div>
                  </div>
                )}

                {a.pode_ver_conteudo && a.resolucao && (
                  <p className="text-xs text-muted-foreground">
                    <strong>Resolução:</strong> {a.resolucao}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
