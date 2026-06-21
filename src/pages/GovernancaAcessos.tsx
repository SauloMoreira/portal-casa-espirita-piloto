import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldCheck, ShieldAlert, Plus, Check, X, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  PROMOTION_STATUS_LABELS, PROMOTION_ROLE_LABELS, isPromotionOpen,
  type PromotionStatus, type AdminPromotionRole,
} from "@/lib/adminPromotion";

interface ProfileLite {
  user_id: string;
  nome_completo: string | null;
}

interface RequestRow {
  id: string;
  target_user_id: string;
  target_role: AdminPromotionRole;
  requested_by: string;
  justificativa: string;
  status: PromotionStatus;
  required_approvals: number;
  excecao_master: boolean;
  created_at: string;
  concluido_em: string | null;
}

interface ApprovalRow {
  id: string;
  request_id: string;
  approver_id: string;
  decision: "aprovar" | "rejeitar";
  motivo: string | null;
  created_at: string;
}

const STATUS_VARIANT: Record<PromotionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pendente: "secondary",
  aprovado_parcialmente: "outline",
  aprovado: "default",
  rejeitado: "destructive",
  expirado: "secondary",
};

export default function GovernancaAcessos() {
  const { user, isMaster } = useAuth();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [activeMasters, setActiveMasters] = useState<number>(0);
  const [aptAdmins, setAptAdmins] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [targetRole, setTargetRole] = useState<AdminPromotionRole>("admin");
  const [justificativa, setJustificativa] = useState("");

  const [rejectTarget, setRejectTarget] = useState<RequestRow | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState("");

  const nameOf = useCallback(
    (id: string) => profiles.find((p) => p.user_id === id)?.nome_completo || id.substring(0, 8) + "…",
    [profiles],
  );

  const fetchAll = useCallback(async () => {
    const [{ data: profs }, { data: reqs }, { data: apps }, { count: mastersCount }, { data: adminRoles }] = await Promise.all([
      supabase.from("profiles").select("user_id, nome_completo").eq("status", "ativo"),
      supabase.from("admin_promotion_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("admin_promotion_approvals").select("*"),
      supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "administrador_master"),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
    ]);
    const activeIds = new Set(((profs as ProfileLite[]) || []).map((p) => p.user_id));
    const distinctActiveAdmins = new Set(
      ((adminRoles as { user_id: string }[]) || [])
        .map((r) => r.user_id)
        .filter((id) => activeIds.has(id)),
    );
    setProfiles((profs as ProfileLite[]) || []);
    setRequests((reqs as RequestRow[]) || []);
    setApprovals((apps as ApprovalRow[]) || []);
    setActiveMasters(mastersCount || 0);
    setAptAdmins(distinctActiveAdmins.size);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSolicitar = async () => {
    if (!targetUserId || justificativa.trim().length < 5) {
      toast({ title: "Selecione um usuário e informe a justificativa.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("solicitar_promocao_admin", {
        p_target_user_id: targetUserId,
        p_target_role: targetRole,
        p_justificativa: justificativa.trim(),
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Solicitação criada", description: "Aguardando aprovação." });
      setOpen(false);
      setTargetUserId(""); setJustificativa(""); setTargetRole("admin");
      fetchAll();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDecidir = async (req: RequestRow, decision: "aprovar" | "rejeitar", motivo?: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("decidir_promocao_admin", {
        p_request_id: req.id,
        p_decision: decision,
        p_motivo: motivo || null,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const status = (data as any)?.status as PromotionStatus;
      toast({
        title: decision === "rejeitar" ? "Solicitação rejeitada" : status === "aprovado" ? "Acesso concedido" : "Aprovação registrada",
        description: status === "aprovado_parcialmente" ? "Aguardando a segunda aprovação." : undefined,
      });
      setRejectTarget(null); setRejectMotivo("");
      fetchAll();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const approvalsFor = (reqId: string) => approvals.filter((a) => a.request_id === reqId);
  const myDecision = (reqId: string) => approvals.find((a) => a.request_id === reqId && a.approver_id === user?.id);

  const open_requests = requests.filter((r) => isPromotionOpen(r.status));
  const closed_requests = requests.filter((r) => !isPromotionOpen(r.status));

  const candidates = profiles.filter((p) => p.user_id !== user?.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Governança de Acessos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Concessão de acesso administrativo com aprovação obrigatória e auditoria.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Solicitar promoção</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Solicitar promoção administrativa</DialogTitle>
            </DialogHeader>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Acesso total ao sistema</AlertTitle>
              <AlertDescription className="text-xs">
                {activeMasters >= 2
                  ? "São necessárias 2 aprovações distintas de administradores aptos. O solicitante e o indicado não podem aprovar."
                  : "Cenário excepcional: existindo apenas 1 Administrador Master ativo, a aprovação única do master é permitida e auditada."}
              </AlertDescription>
            </Alert>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Usuário a promover *</Label>
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o usuário" /></SelectTrigger>
                  <SelectContent>
                    {candidates.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {p.nome_completo || p.user_id.substring(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Papel de acesso *</Label>
                <Select value={targetRole} onValueChange={(v) => setTargetRole(v as AdminPromotionRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{PROMOTION_ROLE_LABELS.admin}</SelectItem>
                    <SelectItem value="administrador_master">{PROMOTION_ROLE_LABELS.administrador_master}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Justificativa *</Label>
                <Textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Motivo da concessão de acesso administrativo"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSolicitar} disabled={loading} className="w-full">
                {loading ? "Enviando..." : "Criar solicitação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Como funciona</AlertTitle>
        <AlertDescription className="text-xs">
          O papel <strong>Administrador</strong> dá acesso total ao sistema e nunca é concedido automaticamente.
          Com 2 ou mais administradores master aptos, é exigida <strong>dupla aprovação</strong>. Enquanto houver
          apenas 1 master, sua <strong>aprovação única</strong> é permitida e registrada como fluxo excepcional.
          Masters ativos atualmente: <strong>{activeMasters}</strong>.
        </AlertDescription>
      </Alert>

      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Solicitações em andamento</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {open_requests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma solicitação pendente.</p>
          ) : open_requests.map((r) => {
            const decided = myDecision(r.id);
            const soleAdmin = aptAdmins <= 1;
            const isRequester = r.requested_by === user?.id;
            const isTarget = r.target_user_id === user?.id;
            const needsMaster = r.required_approvals === 1 && !isMaster;
            // Bootstrap: a sole administrator may approve their own request.
            const requesterBlocked = isRequester && !soleAdmin;
            // Approval restrictions: requester/target/exception-flow limits.
            const blocked = !!decided || requesterBlocked || isTarget || needsMaster;
            // Rejecting (cancelling) is always allowed to any active admin who
            // hasn't decided yet — including the requester. This prevents a
            // request from deadlocking with no way to cancel it.
            const rejectBlocked = !!decided;
            const approvedCount = approvalsFor(r.id).filter((a) => a.decision === "aprovar").length;
            return (
              <div key={r.id} className="rounded-xl border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{nameOf(r.target_user_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {PROMOTION_ROLE_LABELS[r.target_role]} · solicitado por {nameOf(r.requested_by)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[r.status]}>{PROMOTION_STATUS_LABELS[r.status]}</Badge>
                    <Badge variant="outline">{approvedCount}/{r.required_approvals} aprovações</Badge>
                    {r.excecao_master && <Badge variant="secondary">Fluxo excepcional</Badge>}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{r.justificativa}</p>
                {isRequester && soleAdmin && !decided && (
                  <p className="text-xs text-muted-foreground italic">
                    Você é o único administrador ativo — sua aprovação única é permitida e auditada.
                  </p>
                )}
                {blocked && (
                  <p className="text-xs text-muted-foreground italic">
                    {decided ? "Você já registrou sua decisão." :
                     requesterBlocked ? "Você é o solicitante e não pode aprovar." :
                     isTarget ? "Você é o indicado e não pode aprovar." :
                     "Apenas o Administrador Master pode aprovar este fluxo excepcional."}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" disabled={blocked || loading} onClick={() => handleDecidir(r, "aprovar")}>
                    <Check className="h-4 w-4 mr-1" /> Aprovar
                  </Button>
                  <Button size="sm" variant="destructive" disabled={blocked || loading}
                    onClick={() => { setRejectTarget(r); setRejectMotivo(""); }}>
                    <X className="h-4 w-4 mr-1" /> Rejeitar
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Histórico de aprovações</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {closed_requests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum histórico ainda.</p>
          ) : closed_requests.map((r) => (
            <div key={r.id} className="rounded-xl border p-4 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{nameOf(r.target_user_id)}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[r.status]}>{PROMOTION_STATUS_LABELS[r.status]}</Badge>
                  {r.excecao_master && r.status === "aprovado" && <Badge variant="secondary">Excepcional</Badge>}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {PROMOTION_ROLE_LABELS[r.target_role]} · solicitado por {nameOf(r.requested_by)}
                {r.concluido_em ? ` · concluído em ${new Date(r.concluido_em).toLocaleDateString("pt-BR")}` : ""}
              </p>
              <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
                {approvalsFor(r.id).map((a) => (
                  <div key={a.id}>
                    {a.decision === "aprovar" ? "✔ Aprovado" : "✘ Rejeitado"} por {nameOf(a.approver_id)}
                    {a.motivo ? ` — ${a.motivo}` : ""}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rejeitar solicitação</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da rejeição</Label>
            <Textarea value={rejectMotivo} onChange={(e) => setRejectMotivo(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="destructive" disabled={loading}
              onClick={() => rejectTarget && handleDecidir(rejectTarget, "rejeitar", rejectMotivo)}>
              Confirmar rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
