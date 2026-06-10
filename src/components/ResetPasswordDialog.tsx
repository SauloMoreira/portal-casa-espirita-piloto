import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Copy, Check, Mail, Lock } from "lucide-react";

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetUserName: string;
  targetUserEmail?: string | null;
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  targetUserId,
  targetUserName,
  targetUserEmail,
}: ResetPasswordDialogProps) {
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleReset = async (mode: "temporary" | "email") => {
    setLoading(true);
    setTempPassword(null);
    try {
      const { data, error } = await supabase.functions.invoke("reset-password", {
        body: { target_user_id: targetUserId, mode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (mode === "temporary" && data?.temp_password) {
        setTempPassword(data.temp_password);
        toast({ title: "Senha temporária gerada com sucesso" });
      } else {
        toast({ title: data?.message || "Link de redefinição enviado" });
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const copyToClipboard = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setTempPassword(null);
      setCopied(false);
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Redefinir Senha
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">Usuário</p>
            <p className="font-medium text-foreground">{targetUserName}</p>
            {targetUserEmail && (
              <p className="text-xs text-muted-foreground mt-0.5">{targetUserEmail}</p>
            )}
          </div>

          {tempPassword ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <Label className="text-xs text-muted-foreground">Senha temporária</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    value={tempPassword}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button variant="outline" size="icon" onClick={copyToClipboard}>
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Informe esta senha ao usuário. Ele será obrigado a definir uma nova senha no próximo acesso.
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => handleClose(false)}>
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                className="w-full gap-2"
                onClick={() => handleReset("temporary")}
                disabled={loading}
              >
                <Lock className="h-4 w-4" />
                Gerar senha temporária
              </Button>

              {targetUserEmail && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => handleReset("email")}
                  disabled={loading}
                >
                  <Mail className="h-4 w-4" />
                  Enviar link de redefinição por e-mail
                </Button>
              )}

              {!targetUserEmail && (
                <p className="text-xs text-muted-foreground text-center">
                  Envio de link por e-mail indisponível — usuário sem e-mail cadastrado.
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
