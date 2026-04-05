import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Camera, Upload, X, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

interface PhotoUploadProps {
  currentUrl: string | null;
  onUrlChange: (url: string | null) => void;
  folder: string; // e.g. "assistidos" or "usuarios"
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
    if (file.size > MAX_SIZE) {
      toast({ title: "Arquivo muito grande", description: "Tamanho máximo: 2MB.", variant: "destructive" });
      return;
    }

    setPreview(URL.createObjectURL(file));
    setUploading(true);

    const ext = file.name.split(".").pop();
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
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
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "Enviando..." : (
            <>
              <Camera className="h-4 w-4" />
              <Upload className="h-4 w-4" />
              Foto
            </>
          )}
        </Button>
        {preview && (
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-destructive" onClick={handleRemove}>
            <X className="h-3 w-3" /> Remover
          </Button>
        )}
      </div>
    </div>
  );
}
