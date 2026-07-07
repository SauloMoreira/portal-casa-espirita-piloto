import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveInvokeErrorMessage, edgeBodyError } from "@/lib/edgeFunctionResponse";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, ShieldAlert, Smartphone, KeyRound, Copy, Download, Lock, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isValidTotpCode, formatRecoveryCode } from "@/lib/mfa";

type Step = "idle" | "password" | "enroll" | "codes";

export default function SegurancaConta() {
  const { user, isMaster, refreshMfa } = useAuth();
  const { toast } = useToast();

  const [hasMfa, setHasMfa] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("idle");

  const [password, setPassword] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);

  // Disable dialog
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [masterConfirm, setMasterConfirm] = useState(false);

  // Master-only: administrative reset of another user's MFA.
  const [profiles, setProfiles] = useState<{ user_id: string; nome_completo: string | null }[]>([]);
  const [resetTarget, setResetTarget] = useState("");

  const loadStatus = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = (data?.totp || []).some((f) => f.status === "verified");
    setHasMfa(verified);
    if (user) {
      const { count } = await supabase
        .from("mfa_recovery_codes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("used_at", null);
      setRemaining(count ?? 0);
    }
  }, [user]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    if (!isMaster) return;
    supabase.from("profiles").select("user_id, nome_completo").eq("status", "ativo")
      .then(({ data }) => setProfiles(data || []));
  }, [isMaster]);

  const handleAdminReset = async () => {
    if (!resetTarget) { toast({ title: "Selecione um usuário.", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("mfa-manager", {
        body: { action: "admin_reset", target_user_id: resetTarget },
      });
      if (error) {
        throw new Error(await resolveInvokeErrorMessage(error));
      }
      const bodyErr = edgeBodyError(data);
      if (bodyErr) throw new Error(bodyErr);
      toast({ title: "MFA resetado", description: "O usuário deverá reativar o MFA." });
      setResetTarget("");
    } catch (err: any) {
      toast({ title: "Falha no reset", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const auditEvent = (evento: string, detalhe?: string) =>
    supabase.functions.invoke("mfa-manager", { body: { action: "audit", evento, detalhe } }).catch(() => {});

  // Step 1: confirm current password, then enroll a TOTP factor.
  const startActivation = async () => {
    if (!user?.email) return;
    if (!password) {
      toast({ title: "Informe sua senha atual.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error: pwErr } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (pwErr) throw new Error("Senha atual incorreta.");

      // Clean up any half-finished factors before enrolling a fresh one.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.totp || []) {
        if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStep("enroll");
      auditEvent("MFA_ATIVACAO_INICIADA");
    } catch (err: any) {
      toast({ title: "Não foi possível iniciar", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Step 2: confirm the TOTP code, then mint recovery codes.
  const confirmActivation = async () => {
    if (!factorId || !isValidTotpCode(code)) {
      toast({ title: "Informe os 6 dígitos do app.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error: verErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
      if (verErr) throw new Error("Código incorreto. Tente novamente.");

      const { data, error } = await supabase.functions.invoke("mfa-manager", { body: { action: "generate_recovery" } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      setCodes((data as any).codes || []);
      setStep("codes");
      setPassword(""); setCode(""); setQr(null); setSecret(null);
      auditEvent("MFA_ATIVADO");
      await refreshMfa();
      await loadStatus();
    } catch (err: any) {
      toast({ title: "Falha na confirmação", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const finishCodes = () => {
    setCodes([]);
    setStep("idle");
    toast({ title: "MFA ativado", description: "Sua conta está protegida com segundo fator." });
  };

  const copyCodes = () => {
    navigator.clipboard.writeText(codes.map(formatRecoveryCode).join("\n"));
    toast({ title: "Códigos copiados" });
  };
  const downloadCodes = () => {
    const blob = new Blob([
      "Códigos de recuperação - Tratamentos FER\n",
      "Guarde em local seguro. Cada código funciona uma única vez.\n\n",
      codes.map(formatRecoveryCode).join("\n"),
    ], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "codigos-recuperacao-fer.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  // Disable: password + a valid TOTP code (reaches aal2), master needs extra confirm.
  const handleDisable = async () => {
    if (!user?.email) return;
    if (!disablePassword) { toast({ title: "Confirme sua senha.", variant: "destructive" }); return; }
    if (!isValidTotpCode(disableCode)) { toast({ title: "Informe um código válido do app.", variant: "destructive" }); return; }
    if (isMaster && !masterConfirm) {
      toast({ title: "Confirmação reforçada necessária", description: "Administrador Master deve confirmar a desativação.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = (factors?.totp || []).find((f) => f.status === "verified");
      if (!factor) throw new Error("Nenhum fator ativo encontrado.");

      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (chErr) throw chErr;
      const { error: verErr } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code: disableCode.trim() });
      if (verErr) throw new Error("Código incorreto.");

      const { error: unErr } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unErr) throw unErr;

      auditEvent("MFA_DESATIVADO");
      toast({ title: "MFA desativado" });
      setDisableOpen(false);
      setDisablePassword(false); setDisableCode(""); setMasterConfirm(false);
      await refreshMfa();
      await loadStatus();
    } catch (err: any) {
      toast({ title: "Não foi possível desativar", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Segurança da Conta
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Proteja sua conta administrativa com autenticação em dois fatores (MFA).
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Autenticação em dois fatores</span>
            <Badge variant={hasMfa ? "default" : "secondary"}>{hasMfa ? "Ativo" : "Inativo"}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasMfa && step === "idle" && (
            <>
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Recomendado para administradores</AlertTitle>
                <AlertDescription className="text-xs">
                  Ao ativar, será exigido um código do app autenticador a cada login. Você receberá códigos de
                  recuperação para usar caso perca o dispositivo.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="pw"><Lock className="inline h-3.5 w-3.5 mr-1" />Senha atual</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Confirme sua senha para ativar" autoComplete="current-password" />
              </div>
              <Button onClick={startActivation} disabled={loading}>
                {loading ? "Aguarde..." : "Ativar MFA"}
              </Button>
            </>
          )}

          {step === "enroll" && (
            <div className="space-y-4">
              <Alert>
                <Smartphone className="h-4 w-4" />
                <AlertTitle>Escaneie o QR Code</AlertTitle>
                <AlertDescription className="text-xs">
                  Abra o Google Authenticator, Microsoft Authenticator ou Authy e escaneie o código abaixo.
                </AlertDescription>
              </Alert>
              {qr && (
                <div className="flex justify-center rounded-xl bg-white p-4">
                  <img src={qr} alt="QR Code MFA" className="h-48 w-48" />
                </div>
              )}
              {secret && (
                <div className="text-center text-xs text-muted-foreground">
                  Não consegue escanear? Use a chave: <code className="font-mono text-foreground">{secret}</code>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="confirm-code">Código de confirmação</Label>
                <Input id="confirm-code" value={code} inputMode="numeric"
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000" className="text-center text-xl tracking-[0.4em]" />
              </div>
              <div className="flex gap-2">
                <Button onClick={confirmActivation} disabled={loading}>
                  {loading ? "Confirmando..." : "Confirmar e ativar"}
                </Button>
                <Button variant="ghost" onClick={() => { setStep("idle"); setQr(null); setCode(""); }}>Cancelar</Button>
              </div>
            </div>
          )}

          {step === "codes" && (
            <div className="space-y-4">
              <Alert>
                <KeyRound className="h-4 w-4" />
                <AlertTitle>Guarde seus códigos de recuperação</AlertTitle>
                <AlertDescription className="text-xs">
                  Eles aparecem <strong>apenas uma vez</strong>. Cada código funciona uma única vez para recuperar
                  o acesso caso você perca o autenticador.
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-4 font-mono text-sm">
                {codes.map((c) => <div key={c} className="text-center">{formatRecoveryCode(c)}</div>)}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyCodes}><Copy className="h-4 w-4 mr-1" /> Copiar</Button>
                <Button variant="outline" size="sm" onClick={downloadCodes}><Download className="h-4 w-4 mr-1" /> Baixar</Button>
              </div>
              <Button onClick={finishCodes}><Check className="h-4 w-4 mr-1" /> Guardei meus códigos</Button>
            </div>
          )}

          {hasMfa && step === "idle" && (
            <div className="space-y-4">
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>MFA ativo</AlertTitle>
                <AlertDescription className="text-xs">
                  Códigos de recuperação restantes: <strong>{remaining ?? "—"}</strong>.
                </AlertDescription>
              </Alert>
              <Button variant="destructive" onClick={() => setDisableOpen(true)}>Desativar MFA</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isMaster && (
        <Card className="glass-card border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Reset administrativo de MFA
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Procedimento controlado</AlertTitle>
              <AlertDescription className="text-xs">
                Exclusivo do Administrador Master. Use apenas quando o usuário perdeu o autenticador e os códigos
                de recuperação. A ação é auditada (quem executou, quem foi afetado e quando).
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select value={resetTarget} onValueChange={setResetTarget}>
                <SelectTrigger><SelectValue placeholder="Selecione o usuário" /></SelectTrigger>
                <SelectContent>
                  {profiles.filter((p) => p.user_id !== user?.id).map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.nome_completo || p.user_id.substring(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="destructive" onClick={handleAdminReset} disabled={loading || !resetTarget}>
              Resetar MFA do usuário
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={disableOpen} onOpenChange={(o) => !o && setDisableOpen(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Desativar autenticação em dois fatores</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Desativar o MFA reduz a segurança da sua conta. Confirme com senha e um código do autenticador.
              </AlertDescription>
            </Alert>
            <div className="flex items-center gap-2">
              <Checkbox id="dpw" checked={disablePassword} onCheckedChange={(v) => setDisablePassword(!!v)} />
              <Label htmlFor="dpw" className="text-sm font-normal">Confirmo que sou o titular e desejo desativar.</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dcode">Código do autenticador</Label>
              <Input id="dcode" value={disableCode} inputMode="numeric"
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000" className="text-center text-lg tracking-[0.3em]" />
            </div>
            {isMaster && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <Checkbox id="mc" checked={masterConfirm} onCheckedChange={(v) => setMasterConfirm(!!v)} />
                <Label htmlFor="mc" className="text-sm font-normal">
                  Sou Administrador Master e confirmo a desativação reforçada.
                </Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={handleDisable} disabled={loading}>
              {loading ? "Desativando..." : "Desativar MFA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
