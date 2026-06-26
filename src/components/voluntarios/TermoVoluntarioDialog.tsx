import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Upload, Eye, CheckCircle2, XCircle, Loader2, RefreshCw, AlertTriangle,
} from "lucide-react";
import { TermoStatusBadge } from "./TermoStatusBadge";
import { TERMO_UPLOAD } from "@/constants/voluntarios";
import {
  canReviewTermo, canSendSigned, hasSignedTermo, validateTermoFile, buildTermoPath,
} from "@/lib/termoVoluntario";
import { podeGerarTermo } from "@/lib/voluntarioCadastro";
import {
  uploadTermoAssinado, validarTermo, rejeitarTermo, getTermoSignedUrl,
} from "@/services/voluntarios/voluntariosService";
import type { VoluntarioListItem } from "@/types/voluntarios";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voluntario: VoluntarioListItem;
  onOpenPrint: () => void;
  onChanged: () => void;
}

export function TermoVoluntarioDialog({ open, onOpenChange, voluntario, onOpenPrint, onChanged }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [motivo, setMotivo] = useState("");

  const signed = hasSignedTermo(voluntario);
  const review = canReviewTermo(voluntario);
  const canSend = canSendSigned(voluntario);
  const gating = podeGerarTermo(voluntario);

  const handleUpload = async (file: File) => {
    const v = validateTermoFile(file);
    if (!v.ok) {
      toast({ title: "Arquivo inválido", description: v.error, variant: "destructive" });
      return;
    }
    setBusy("upload");
    try {
      const path = buildTermoPath(voluntario.id, file.name);
      const res = await uploadTermoAssinado(voluntario.id, path, file);
      if (res?.error) throw new Error(res.error);
      toast({ title: "Termo assinado enviado", description: res?.message });
      onChanged();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro no envio", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleView = async () => {
    if (!voluntario.termo_assinado_path) return;
    setBusy("view");
    try {
      const url = await getTermoSignedUrl(voluntario.termo_assinado_path);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast({ title: "Erro ao abrir documento", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleValidate = async () => {
    setBusy("validate");
    try {
      const res = await validarTermo(voluntario.id);
      if (res?.error) throw new Error(res.error);
      toast({ title: "Termo validado", description: res?.message });
      onChanged();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao validar", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (!motivo.trim()) return;
    setBusy("reject");
    try {
      const res = await rejeitarTermo(voluntario.id, motivo.trim());
      if (res?.error) throw new Error(res.error);
      toast({ title: "Termo rejeitado", description: res?.message });
      onChanged();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao rejeitar", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Termo de Adesão
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{voluntario.nome_completo}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3">
            <span className="text-sm text-muted-foreground">Situação</span>
            <TermoStatusBadge status={voluntario.termo_status} />
          </div>

          {voluntario.termo_status === "rejeitado" && voluntario.termo_rejeitado_motivo && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-destructive">Motivo da rejeição: </span>
              {voluntario.termo_rejeitado_motivo}
            </div>
          )}

          {signed && voluntario.termo_assinado_nome && (
            <p className="text-xs text-muted-foreground">
              Arquivo enviado: <span className="font-medium text-foreground">{voluntario.termo_assinado_nome}</span>
              {voluntario.termo_assinado_em
                ? ` em ${new Date(voluntario.termo_assinado_em).toLocaleString("pt-BR")}`
                : ""}
            </p>
          )}

          {!gating.permitido && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 space-y-1.5">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4" /> Complete o cadastro para gerar o termo
              </p>
              <p>Campos pendentes:</p>
              <ul className="list-disc list-inside">
                {gating.pendencias.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2">
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={onOpenPrint}
              disabled={!gating.permitido}
            >
              <FileText className="h-4 w-4" /> Gerar / baixar termo preenchido
            </Button>

            {canSend && gating.permitido && (
              <label className="w-full">
                <input
                  type="file"
                  accept={TERMO_UPLOAD.acceptAttr}
                  className="hidden"
                  disabled={busy === "upload"}
                  onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ""; }}
                />
                <Button asChild variant="outline" className="w-full justify-start gap-2" disabled={busy === "upload"}>
                  <span>
                    {busy === "upload"
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                      : signed
                        ? <><RefreshCw className="h-4 w-4" /> Substituir termo assinado</>
                        : <><Upload className="h-4 w-4" /> Enviar termo assinado</>}
                  </span>
                </Button>
              </label>
            )}

            {signed && (
              <Button variant="outline" className="justify-start gap-2" onClick={handleView} disabled={busy === "view"}>
                {busy === "view" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                Visualizar termo assinado
              </Button>
            )}
          </div>

          {review && (
            <div className="space-y-2 rounded-xl border p-3">
              <p className="text-sm font-medium">Validação administrativa</p>
              {!rejecting ? (
                <div className="flex gap-2">
                  <Button className="flex-1 gap-2" onClick={handleValidate} disabled={busy === "validate"}>
                    {busy === "validate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Validar
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2 text-destructive" onClick={() => setRejecting(true)}>
                    <XCircle className="h-4 w-4" /> Rejeitar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs">Motivo da rejeição</Label>
                  <Textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Ex.: assinatura ausente, arquivo ilegível, documento incompleto..."
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setRejecting(false); setMotivo(""); }}>
                      Cancelar
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 gap-2"
                      onClick={handleReject}
                      disabled={busy === "reject" || !motivo.trim()}
                    >
                      {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar rejeição"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
