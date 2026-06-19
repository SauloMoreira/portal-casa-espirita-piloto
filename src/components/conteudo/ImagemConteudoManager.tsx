import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Image as ImageIcon, ImageOff, Sparkles, Upload, Wand2, Trash2, Check, RefreshCw, X, Loader2,
} from "lucide-react";
import {
  FORMATOS, origemLabel, validarUploadImagem, podeGerarComIa, formatarAtualizacao,
  normalizarFormato, formatoAspectClass,
  type ConteudoTipo, type ImagemFormato, type ImagemOrigem, type DadosConteudo,
} from "@/lib/conteudoImagem";
import { uploadImagemManual, gerarImagemIa, otimizarImagemIa } from "@/services/conteudoImagem";

export type ImagemValue = { url: string; origem: ImagemOrigem; otimizada: boolean; formato?: string | null };

interface Props {
  tipo: ConteudoTipo;
  dados: DadosConteudo;
  value: ImagemValue;
  atualizadaEm?: string | null;
  onChange: (next: ImagemValue) => void;
}

type Candidato = { url: string; otimizada: boolean; formato: ImagemFormato } | null;

export function ImagemConteudoManager({ tipo, dados, value, atualizadaEm, onChange }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  // Formato é controlado pelo pai (value.formato) — fonte única de verdade.
  const formato: ImagemFormato = normalizarFormato(value.formato);
  const [busy, setBusy] = useState<null | "upload" | "gerar" | "otimizar">(null);
  const [candidato, setCandidato] = useState<Candidato>(null);

  const temImagem = !!value.url;

  const handleFormatoChange = (v: ImagemFormato) => {
    onChange({ ...value, formato: v });
  };

  const handleFile = async (file: File) => {
    const err = validarUploadImagem(file);
    if (err) { toast({ title: "Atenção", description: err, variant: "destructive" }); return; }
    setBusy("upload");
    try {
      const url = await uploadImagemManual(file, tipo);
      onChange({ url, origem: "upload", otimizada: false, formato });
      setCandidato(null);
      toast({ title: "Imagem enviada" });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleGerar = async () => {
    if (!podeGerarComIa(dados)) {
      toast({ title: "Preencha o título", description: "Informe ao menos o título antes de gerar com IA.", variant: "destructive" });
      return;
    }
    setBusy("gerar");
    try {
      const res = await gerarImagemIa(tipo, dados, formato);
      setCandidato({ url: res.url, otimizada: false, formato: res.formato });
    } catch (e: any) {
      toast({ title: "Erro ao gerar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleOtimizar = async () => {
    if (!value.url) return;
    setBusy("otimizar");
    try {
      const res = await otimizarImagemIa(value.url, formato);
      setCandidato({ url: res.url, otimizada: true, formato: res.formato });
    } catch (e: any) {
      toast({ title: "Erro ao otimizar", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const aceitarCandidato = () => {
    if (!candidato) return;
    onChange({ url: candidato.url, origem: "ai", otimizada: candidato.otimizada, formato: candidato.formato });
    setFormato(candidato.formato);
    setCandidato(null);
    toast({ title: "Imagem aplicada" });
  };

  const handleRemover = () => {
    onChange({ url: "", origem: "url", otimizada: false, formato });
    setCandidato(null);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2 text-sm font-semibold">
          <ImageIcon className="h-4 w-4 text-primary" /> Imagem do {tipo === "campanha" ? "card" : "evento"}
        </Label>
        {temImagem && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <Badge variant="outline" className="text-[10px]">{origemLabel(value.origem)}</Badge>
            {value.otimizada && <Badge variant="secondary" className="text-[10px] gap-1"><Wand2 className="h-3 w-3" />Otimizada</Badge>}
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }}
      />

      {/* Prévia da imagem ativa (no formato salvo) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className={`w-28 shrink-0 rounded-lg bg-secondary/40 overflow-hidden flex items-center justify-center border border-border/40 ${formatoAspectClass(value.formato)}`}>
          {temImagem ? (
            <img src={value.url} alt="Prévia da imagem" className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-7 w-7 text-muted-foreground/40" />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-xs text-muted-foreground">
            {temImagem ? "Imagem ativa atual." : "Nenhuma imagem definida."}
            {atualizadaEm && formatarAtualizacao(atualizadaEm) ? ` Atualizada em ${formatarAtualizacao(atualizadaEm)}.` : ""}
          </p>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Formato alvo</Label>
            <Select value={formato} onValueChange={(v) => setFormato(v as ImagemFormato)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORMATOS.map((f) => (
                  <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground/80">
              A geração e a otimização com IA recortam a imagem para este formato.
            </p>
          </div>
        </div>
      </div>

      {/* Ações principais */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === "upload" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
          Enviar arquivo
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={handleGerar}>
          {busy === "gerar" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          {temImagem ? "Gerar com IA" : "Criar arte com IA"}
        </Button>
        {temImagem && (
          <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={handleOtimizar}>
            {busy === "otimizar" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
            Otimizar com IA
          </Button>
        )}
        {temImagem && (
          <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={!!busy} onClick={handleRemover}>
            <Trash2 className="h-4 w-4 mr-1" /> Remover
          </Button>
        )}
      </div>

      {/* Candidato gerado/otimizado por IA aguardando decisão */}
      {candidato && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {candidato.otimizada ? "Versão otimizada pela IA" : "Imagem gerada pela IA"} — revise antes de aplicar.
          </p>
          <div className="flex items-start gap-3">
            {candidato.otimizada && temImagem && (
              <div className="text-center">
                <div className={`w-24 rounded-lg overflow-hidden border border-border/40 ${formatoAspectClass(value.formato)}`}>
                  <img src={value.url} alt="Original" className="h-full w-full object-cover" />
                </div>
                <span className="text-[10px] text-muted-foreground">Original</span>
              </div>
            )}
            <div className="text-center">
              <div className={`w-24 rounded-lg overflow-hidden border border-primary/50 ${formatoAspectClass(candidato.formato)}`}>
                <img src={candidato.url} alt="Nova versão" className="h-full w-full object-cover" />
              </div>
              <span className="text-[10px] text-muted-foreground">Nova versão</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={!!busy} onClick={aceitarCandidato}>
              <Check className="h-4 w-4 mr-1" /> {candidato.otimizada ? "Usar versão otimizada" : "Usar esta imagem"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={candidato.otimizada ? handleOtimizar : handleGerar}>
              <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={!!busy} onClick={() => setCandidato(null)}>
              <X className="h-4 w-4 mr-1" /> Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
