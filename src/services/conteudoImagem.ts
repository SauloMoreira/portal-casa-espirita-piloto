import { supabase } from "@/integrations/supabase/client";
import type { ConteudoTipo, ImagemFormato, DadosConteudo } from "@/lib/conteudoImagem";
import { montarPromptGeracao, montarPromptOtimizacao, formatoSize } from "@/lib/conteudoImagem";

const BUCKET = "avatars";
const MAX_DIM = 1600;
const QUALITY = 0.85;

/** Redimensiona (mantendo proporção) e converte para WEBP/JPEG no navegador. */
export function otimizarUpload(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      const tryFormat = (format: string) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else if (format === "image/webp") tryFormat("image/jpeg");
            else reject(new Error("Falha ao processar imagem"));
          },
          format,
          QUALITY,
        );
      };
      tryFormat("image/webp");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida")); };
    img.src = url;
  });
}

/** Envia arquivo manual para o storage e retorna a URL pública. */
export async function uploadImagemManual(file: File, tipo: ConteudoTipo): Promise<string> {
  const optimized = await otimizarUpload(file);
  const { data: authData } = await supabase.auth.getUser();
  const uid = authData.user?.id;
  if (!uid) throw new Error("Sessão expirada. Faça login novamente.");
  const ext = optimized.type === "image/webp" ? "webp" : "jpg";
  const path = `${uid}/conteudo-${tipo}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, optimized, {
    cacheControl: "31536000",
    contentType: optimized.type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export type ResultadoImagemIa = { url: string; origem: "ai"; otimizada: boolean };

/** Gera uma imagem promocional com IA a partir dos dados do conteúdo. */
export async function gerarImagemIa(
  tipo: ConteudoTipo,
  dados: DadosConteudo,
  formato: ImagemFormato = "card",
): Promise<ResultadoImagemIa> {
  const prompt = `${montarPromptGeracao(tipo, dados, formato)} (Saída ${formatoSize(formato)}).`;
  const { data, error } = await supabase.functions.invoke("conteudo-imagem-ia", {
    body: { modo: "gerar", prompt },
  });
  if (error) throw new Error(error.message || "Falha ao gerar imagem com IA");
  if (data?.error) throw new Error(data.error);
  return data as ResultadoImagemIa;
}

/** Otimiza uma imagem existente (IA, upload ou URL) com IA. */
export async function otimizarImagemIa(
  imagemUrl: string,
  formato: ImagemFormato = "card",
): Promise<ResultadoImagemIa> {
  const prompt = montarPromptOtimizacao(formato);
  const { data, error } = await supabase.functions.invoke("conteudo-imagem-ia", {
    body: { modo: "otimizar", prompt, imagemUrl },
  });
  if (error) throw new Error(error.message || "Falha ao otimizar imagem com IA");
  if (data?.error) throw new Error(data.error);
  return data as ResultadoImagemIa;
}
