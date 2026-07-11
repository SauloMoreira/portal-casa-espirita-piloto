import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInstituicaoAtiva } from "@/contexts/InstituicaoContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldCheck, ShieldAlert, Plus, Check, X, Info, Wrench, UserCog, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  PROMOTION_STATUS_LABELS, PROMOTION_ROLE_LABELS, isPromotionOpen,
  type PromotionStatus, type AdminPromotionRole,
} from "@/lib/adminPromotion";
import {
  solicitarPromocaoAdmin, decidirPromocaoAdmin,
  concederAcessoOperacional, revogarAcessoOperacional,
} from "@/services/governanca/acessoService";
import {
  provisionarAcessoVoluntario,
  fetchVoluntariosOrfaosDoTenant,
  isEmailValido,
  type VoluntarioOrfao,
} from "@/lib/voluntarioAcessoProvisioning";
import { Input } from "@/components/ui/input";

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

interface RoleRow {
  user_id: string;
  role: string;
}

const STATUS_VARIANT: Record<PromotionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pendente: "secondary",
  aprovado_parcialmente: "outline",
  aprovado: "default",
  rejeitado: "destructive",
  expirado: "secondary",
};

// ── Acessos operacionais (concessão direta e auditada) ──────────────────────
type OperationalRole = "entrevistador" | "tarefeiro" | "coordenador_de_tratamento";

const OPERATIONAL_ROLES: OperationalRole[] = [
  "entrevistador",
  "tarefeiro",
  "coordenador_de_tratamento",
];

const OPERATIONAL_ROLE_LABELS: Record<OperationalRole, string> = {
  entrevistador: "Entrevistador",
  tarefeiro: "Tarefeiro",
  coordenador_de_tratamento: "Coordenador de Tratamento",
};

const isOperationalRole = (r: string): r is OperationalRole =>
  (OPERATIONAL_ROLES as string[]).includes(r);

export default function GovernancaAcessos() {
  const { user, isMaster } = useAuth();
  const { selecionada } = useInstituicaoAtiva();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [activeMasters, setActiveMasters] = useState<number>(0);
  const [aptAdmins, setAptAdmins] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [targetRole, setTargetRole] = useState<AdminPromotionRole>("admin");
  const [justificativa, setJustificativa] = useState("");

  const [rejectTarget, setRejectTarget] = useState<RequestRow | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState("");

  // Operational grant dialog state
  const [opOpen, setOpOpen] = useState(false);
  const [opUserId, setOpUserId] = useState("");
  const [opRole, setOpRole] = useState<OperationalRole>("entrevistador");
  const [opMotivo, setOpMotivo] = useState("");

  // Órfãos (voluntários sem auth.users) — SAAS-06-C1-FIX16
  const [orfaos, setOrfaos] = useState<VoluntarioOrfao[]>([]);
  const [provOpen, setProvOpen] = useState(false);
  const [provOrfao, setProvOrfao] = useState<VoluntarioOrfao | null>(null);
  const [provEmail, setProvEmail] = useState("");
  const [provRole, setProvRole] = useState<OperationalRole>("tarefeiro");
  const [provMotivo, setProvMotivo] = useState("");
  const [provLoading, setProvLoading] = useState(false);

  const nameOf = useCallback(
    (id: string) => profiles.find((p) => p.user_id === id)?.nome_completo || id.substring(0, 8) + "…",
    [profiles],
  );

  const fetchAll = useCallback(async () => {
    const [{ data: profs }, { data: reqs }, { data: apps }, { data: allRoles }, { count: mastersCount }, { data: adminRoles }] = await Promise.all([
      supabase.from("profiles").select("user_id, nome_completo").eq("status", "ativo"),
      supabase.from("admin_promotion_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("admin_promotion_approvals").select("*"),
      supabase.from("user_roles").select("user_id, role"),
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
    setRoles((allRoles as RoleRow[]) || []);
    setActiveMasters(mastersCount || 0);
    setAptAdmins(distinctActiveAdmins.size);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchOrfaos = useCallback(async () => {
    if (!selecionada?.id) { setOrfaos([]); return; }
    setOrfaos(await fetchVoluntariosOrfaosDoTenant(selecionada.id));
  }, [selecionada?.id]);
  useEffect(() => { fetchOrfaos(); }, [fetchOrfaos]);

  const openProvisionar = (o: VoluntarioOrfao) => {
    setProvOrfao(o);
    setProvEmail(o.email ?? "");
    setProvRole("tarefeiro");
    setProvMotivo("");
    setProvOpen(true);
  };

  const handleProvisionar = async () => {
    if (!provOrfao) return;
    if (!isEmailValido(provEmail)) {
      toast({ title: "Informe um e-mail válido para criar o acesso ao sistema.", variant: "destructive" });
      return;
    }
    setProvLoading(true);
    try {
      const r = await provisionarAcessoVoluntario({
        voluntarioId: provOrfao.voluntario_id,
        email: provEmail,
        role: provRole,
        motivo: provMotivo.trim() || null,
      });
      toast({
        title: r.userCriado ? "Acesso criado" : "Acesso vinculado",
        description: `${OPERATIONAL_ROLE_LABELS[provRole]} concedido a ${provOrfao.nome_completo}.`,
      });
      setProvOpen(false);
      setProvOrfao(null);
      await Promise.all([fetchAll(), fetchOrfaos()]);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setProvLoading(false);
    }
  };

  const handleSolicitar = async () => {
    if (!targetUserId || justificativa.trim().length < 5) {
      toast({ title: "Selecione um usuário e informe a justificativa.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await solicitarPromocaoAdmin({
        targetUserId,
        targetRole,
        justificativa: justificativa.trim(),
      });
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
      const { status } = await decidirPromocaoAdmin({
        requestId: req.id,
        decision,
        motivo: motivo || null,
      });
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

  const handleConcederOperacional = async () => {
    if (!opUserId) {
      toast({ title: "Selecione um usuário.", variant: "destructive" });
      return;
    }
    if (!selecionada?.id) {
      toast({
        title: "Selecione uma instituição antes de conceder acesso.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const { status } = await concederAcessoOperacional({
        targetUserId: opUserId,
        role: opRole,
        motivo: opMotivo.trim() || null,
        instituicaoId: selecionada.id,
      });
      toast({
        title: status === "ja_concedido" ? "Acesso já existia" : "Usuário vinculado à instituição e acesso concedido com sucesso",
        description: status === "ja_concedido"
          ? "O usuário já possuía este acesso nesta instituição."
          : `${OPERATIONAL_ROLE_LABELS[opRole]} concedido a ${nameOf(opUserId)}.`,
      });
      setOpOpen(false);
      setOpUserId(""); setOpRole("entrevistador"); setOpMotivo("");
      fetchAll();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRevogarOperacional = async (userId: string, opRoleToRevoke: OperationalRole) => {
    setLoading(true);
    try {
      await revogarAcessoOperacional({
        targetUserId: userId,
        role: opRoleToRevoke,
        motivo: null,
      });
      toast({ title: "Acesso operacional revogado", description: `${OPERATIONAL_ROLE_LABELS[opRoleToRevoke]} de ${nameOf(userId)}.` });
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

  // Operational holders: group operational roles per user (active profiles only).
  const operationalByUser = (() => {
    const activeIds = new Set(profiles.map((p) => p.user_id));
    const map = new Map<string, OperationalRole[]>();
    for (const r of roles) {
      if (isOperationalRole(r.role) && activeIds.has(r.user_id)) {
        const arr = map.get(r.user_id) || [];
        arr.push(r.role);
        map.set(r.user_id, arr);
      }
    }
    return Array.from(map.entries())
      .map(([userId, rs]) => ({ userId, roles: rs.sort() }))
      .sort((a, b) => nameOf(a.userId).localeCompare(nameOf(b.userId)));
  })();

  // Roles already held by the selected candidate user, used to filter the
  // operational grant dialog so it never proposes duplicates (idempotência).
  const rolesDoUsuario = (uid: string): OperationalRole[] => {
    if (!uid) return [];
    return roles
      .filter((r) => r.user_id === uid && isOperationalRole(r.role))
      .map((r) => r.role as OperationalRole);
  };
  const opAvailableRoles: OperationalRole[] = opUserId
    ? OPERATIONAL_ROLES.filter((r) => !rolesDoUsuario(opUserId).includes(r))
    : OPERATIONAL_ROLES;

  // Abre o mesmo diálogo de concessão pré-selecionando o usuário e o primeiro
  // papel operacional ainda não concedido — permite adicionar papel
  // complementar sem remover o(s) existente(s) (STAB03).
  const openAdicionarPapel = (userId: string, current: OperationalRole[]) => {
    const proximo = OPERATIONAL_ROLES.find((r) => !current.includes(r));
    if (!proximo) {
      toast({
        title: "Sem papéis para adicionar",
        description: "Este usuário já possui todos os acessos operacionais disponíveis.",
      });
      return;
    }
    setOpUserId(userId);
    setOpRole(proximo);
    setOpMotivo("");
    setOpOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Gestão de Acesso
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fonte única de gestão manual dos acessos elevados, separada por natureza: operacional e administrativa.
          O papel <strong>Assistido</strong> é base automática e não é gerenciado aqui.
        </p>
      </div>

      <Tabs defaultValue="operacionais" className="space-y-4">
        <TabsList>
          <TabsTrigger value="operacionais" className="gap-2">
            <Wrench className="h-4 w-4" /> Acessos operacionais
          </TabsTrigger>
          <TabsTrigger value="administrativos" className="gap-2">
            <ShieldAlert className="h-4 w-4" /> Acessos administrativos
          </TabsTrigger>
        </TabsList>

        {/* ───────────────────── Acessos operacionais ───────────────────── */}
        <TabsContent value="operacionais" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <Alert className="flex-1">
              <UserCog className="h-4 w-4" />
              <AlertTitle>Concessão direta e auditada</AlertTitle>
              <AlertDescription className="text-xs">
                Acessos operacionais (Entrevistador, Tarefeiro, Coordenador de Tratamento) são concedidos
                diretamente por um administrador ativo, <strong>sem dupla aprovação</strong>, e toda concessão
                ou revogação fica registrada na trilha de auditoria. Conceder um acesso não altera a atuação
                voluntária — não há concessão automática cruzada.
              </AlertDescription>
            </Alert>
            <Dialog open={opOpen} onOpenChange={setOpOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> Conceder acesso operacional</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Conceder acesso operacional</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Usuário *</Label>
                    <Select value={opUserId} onValueChange={setOpUserId}>
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
                    <Label>Acesso operacional *</Label>
                    <Select value={opRole} onValueChange={(v) => setOpRole(v as OperationalRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {opAvailableRoles.map((r) => (
                          <SelectItem key={r} value={r}>{OPERATIONAL_ROLE_LABELS[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {opUserId && opAvailableRoles.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Este usuário já possui todos os acessos operacionais.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Justificativa (opcional)</Label>
                    <Textarea
                      value={opMotivo}
                      onChange={(e) => setOpMotivo(e.target.value)}
                      placeholder="Motivo da concessão (registrado na auditoria)"
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleConcederOperacional}
                    disabled={loading || (!!opUserId && opAvailableRoles.length === 0)}
                    className="w-full"
                  >
                    {loading ? "Concedendo..." : "Conceder acesso"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {orfaos.length > 0 && (
            <Card className="glass-card border-amber-200">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCog className="h-4 w-4 text-amber-600" />
                  Pessoas pendentes de acesso
                  <Badge variant="secondary">{orfaos.length}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Voluntários cadastrados nesta instituição sem conta de acesso ao sistema.
                  Para gerar acesso, informe um e-mail real — o sistema não usa e-mail
                  fictício ou placeholder.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {orfaos.map((o) => (
                  <div key={o.voluntario_id} className="rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{o.nome_completo}</p>
                      <p className="text-xs text-amber-700">Informe um e-mail para gerar acesso</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openProvisionar(o)} className="gap-2">
                      <ShieldCheck className="h-4 w-4" /> Gerar acesso
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Dialog open={provOpen} onOpenChange={setProvOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Gerar acesso — {provOrfao?.nome_completo}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Este voluntário ainda não tem conta de acesso. Informe um <strong>e-mail real</strong>
                    para criar o acesso ao sistema. Não é permitido usar e-mail fictício.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label>E-mail real *</Label>
                  <Input
                    type="email"
                    value={provEmail}
                    onChange={(e) => setProvEmail(e.target.value)}
                    placeholder="pessoa@exemplo.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Acesso operacional *</Label>
                  <Select value={provRole} onValueChange={(v) => setProvRole(v as OperationalRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OPERATIONAL_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{OPERATIONAL_ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Justificativa (opcional)</Label>
                  <Textarea value={provMotivo} onChange={(e) => setProvMotivo(e.target.value)} rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleProvisionar} disabled={provLoading} className="w-full">
                  {provLoading ? "Gerando acesso..." : "Gerar acesso"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card className="glass-card">
            <CardHeader><CardTitle className="text-base">Acessos operacionais ativos</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {operationalByUser.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhum acesso operacional concedido.</p>
              ) : operationalByUser.map(({ userId, roles: userRoles }) => (
                <div key={userId} className="rounded-xl border p-4 space-y-2">
                  <p className="font-medium">{nameOf(userId)}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {userRoles.map((r) => (
                      <Badge key={r} variant="secondary" className="gap-1 pr-1">
                        {OPERATIONAL_ROLE_LABELS[r]}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 hover:bg-destructive/10"
                          title="Revogar acesso"
                          disabled={loading}
                          onClick={() => handleRevogarOperacional(userId, r)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────────────────── Acessos administrativos ──────────────────── */}
        <TabsContent value="administrativos" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <Alert className="flex-1">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Fluxo reforçado de aprovação</AlertTitle>
              <AlertDescription className="text-xs">
                O papel <strong>Administrador</strong> dá acesso total ao sistema e nunca é concedido automaticamente.
                Com 2 ou mais administradores master aptos, é exigida <strong>dupla aprovação</strong>. Enquanto houver
                apenas 1 master, sua <strong>aprovação única</strong> é permitida e registrada como fluxo excepcional.
                Masters ativos atualmente: <strong>{activeMasters}</strong>.
              </AlertDescription>
            </Alert>
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
                const requesterBlocked = isRequester && !soleAdmin;
                const blocked = !!decided || requesterBlocked || isTarget || needsMaster;
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
                      <Button size="sm" variant="destructive" disabled={rejectBlocked || loading}
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
        </TabsContent>
      </Tabs>

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
