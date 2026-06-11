import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Camera, Upload, X, User, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MAX_SIZE_RAW = 10 * 1024 * 1024; // 10MB raw input limit
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const TARGET_SIZE = 600; // px – final square dimension
const QUALITY = 0.82; // JPEG/WEBP compression quality

interface PhotoUploadProps {
  currentUrl: string | null;
  onUrlChange: (url: string | null) => void;
  folder: string;
}

function optimizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate crop to square (center crop)
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;

      const canvas = document.createElement("canvas");
      canvas.width = TARGET_SIZE;
      canvas.height = TARGET_SIZE;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);

      // Try WEBP first, fallback to JPEG
      const tryFormat = (format: string, q: number) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else if (format === "image/webp") tryFormat("image/jpeg", q);
            else reject(new Error("Falha ao processar imagem"));
          },
          format,
          q,
        );
      };
      tryFormat("image/webp", QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida")); };
    img.src = url;
  });
}

export function PhotoUpload({ currentUrl, onUrlChange, folder }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      toast({ title: "Formato inválido", description: "Use JPG, PNG ou WEBP.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE_RAW) {
      toast({ title: "Arquivo muito grande", description: "Tamanho máximo: 10MB.", variant: "destructive" });
      return;
    }

    setUploading(true);

    try {
      const optimized = await optimizeImage(file);
      const previewUrl = URL.createObjectURL(optimized);
      setPreview(previewUrl);

      const ext = optimized.type === "image/webp" ? "webp" : "jpg";
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) {
        toast({ title: "Sessão expirada", description: "Faça login novamente para enviar a foto.", variant: "destructive" });
        setPreview(currentUrl);
        return;
      }
      const path = `${uid}/${folder}/${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage.from("avatars").upload(path, optimized, {
        cacheControl: "31536000",
        contentType: optimized.type,
        upsert: false,
      });

      if (error) {
        toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
        setPreview(currentUrl);
      } else {
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        onUrlChange(data.publicUrl);
        setPreview(data.publicUrl);
      }
    } catch (err: any) {
      toast({ title: "Erro ao processar foto", description: err.message, variant: "destructive" });
      setPreview(currentUrl);
    }
    setUploading(false);
  };

  const handleRemove = () => {
    setPreview(null);
    onUrlChange(null);
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-20 w-20 border-2 border-muted">
        {preview ? (
          <AvatarImage src={preview} alt="Foto" />
        ) : (
          <AvatarFallback><User className="h-8 w-8 text-muted-foreground" /></AvatarFallback>
        )}
      </Avatar>
      <div className="flex flex-col gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Otimizando...</>
          ) : (
            <><Camera className="h-4 w-4" /><Upload className="h-4 w-4" /> Foto</>
          )}
        </Button>
        {preview && !uploading && (
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-destructive" onClick={handleRemove}>
            <X className="h-3 w-3" /> Remover
          </Button>
        )}
      </div>
    </div>
  );
}
