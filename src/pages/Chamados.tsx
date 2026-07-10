/**
 * SAAS-06-C1-FIX10 — Central de Chamados (visão institucional + global).
 *
 * Um único componente atende:
 *  - `scope="local"`: admin_instituicao/usuário comum vê chamados da instituição
 *    ativa (ou apenas os próprios, se não for admin — a RLS filtra).
 *  - `scope="global"`: platform_admin/platform_owner vê todos os chamados de
 *    todas as instituições.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2, LifeBuoy, Paperclip, Download, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useInstituicaoAtiva } from "@/contexts/InstituicaoContext";
import { toFriendlyError } from "@/lib/supabaseFriendlyErrors";
import {
  ACCEPT_ATTR,
  CHAMADO_PRIORIDADE_LABEL,
  CHAMADO_STATUS_LABEL,
  CHAMADO_TIPO_LABEL,
  MAX_ARQUIVOS_POR_ENVIO,
  atualizarStatus,
  criarChamado,
  enviarAnexo,
  enviarMensagem,
  listarChamados,
  obterAnexos,
  obterMensagens,
  urlAssinadaAnexo,
  validarArquivo,
  type Chamado,
  type ChamadoAnexo,
  type ChamadoMensagem,
  type ChamadoPrioridade,
  type ChamadoStatus,
  type ChamadoTipo,
} from "@/lib/chamados";

const TIPOS: ChamadoTipo[] = [
  "tecnico",
  "operacional",
  "comercial",
  "cobranca",
  "contrato_documento",
  "melhoria",
  "incidente",
];
const STATUS_OPCOES: ChamadoStatus[] = [
  "aberto",
  "em_analise",
  "aguardando_cliente",
  "aguardando_administrador_global",
  "aguardando_documento",
  "resolvido",
  "cancelado",
];
const PRIORIDADES: ChamadoPrioridade[] = ["baixa", "normal", "alta", "critica"];

function statusVariant(status: ChamadoStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "resolvido") return "secondary";
  if (status === "cancelado") return "outline";
  if (status === "aberto") return "default";
  return "outline";
}

function shortId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

interface ChamadosPageProps {
  scope: "local" | "global";
}

export default function ChamadosPage({ scope }: ChamadosPageProps) {
  const { user } = useAuth();
  const { isPlatformAdmin, instituicoes, selectedInstituicaoId } = useInstituicaoAtiva();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Chamado[]>([]);
  const [statusFiltro, setStatusFiltro] = useState<ChamadoStatus | "todos">("todos");
  const [tipoFiltro, setTipoFiltro] = useState<ChamadoTipo | "todos">("todos");
  const [instFiltro, setInstFiltro] = useState<string>("todos");
  const [openNovo, setOpenNovo] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const instAtivaId = scope === "local" ? selectedInstituicaoId : null;

  const instMap = useMemo(() => {
    const m = new Map<string, string>();
    instituicoes.forEach((i) => m.set(i.id, i.nome));
    return m;
  }, [instituicoes]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listarChamados({
        instituicaoId:
          scope === "local"
            ? instAtivaId ?? undefined
            : instFiltro !== "todos"
              ? instFiltro
              : undefined,
        status: statusFiltro !== "todos" ? statusFiltro : undefined,
        tipo: tipoFiltro !== "todos" ? tipoFiltro : undefined,
      });
      setItems(res);
    } catch (err) {
      const f = toFriendlyError(err, { operacao: "listar_chamados", entidade: "chamados_suporte" });
      toast.error(f.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, instAtivaId, statusFiltro, tipoFiltro, instFiltro]);

  const podeAbrir = scope === "global" || !!instAtivaId;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <LifeBuoy className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {scope === "global" ? "Chamados de todas as instituições" : "Central de Chamados"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {scope === "global"
                ? "Visão global do administrador da plataforma."
                : "Abra chamados técnicos, comerciais ou de documentos ao administrador geral."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={() => setOpenNovo(true)} disabled={!podeAbrir}>
            <Plus className="h-4 w-4 mr-2" /> Novo chamado
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <div className="min-w-[180px]">
            <Label className="text-xs">Status</Label>
            <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as ChamadoStatus | "todos")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {STATUS_OPCOES.map((s) => (
                  <SelectItem key={s} value={s}>{CHAMADO_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px]">
            <Label className="text-xs">Tipo</Label>
            <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as ChamadoTipo | "todos")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>{CHAMADO_TIPO_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scope === "global" && (
            <div className="min-w-[220px]">
              <Label className="text-xs">Instituição</Label>
              <Select value={instFiltro} onValueChange={setInstFiltro}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {instituicoes.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chamados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum chamado encontrado com esses filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">Assunto</th>
                    {scope === "global" && <th className="py-2 pr-4">Instituição</th>}
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Prioridade</th>
                    <th className="py-2 pr-4">Aberto em</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-2 pr-4 font-mono text-xs">{shortId(c.id)}</td>
                      <td className="py-2 pr-4">
                        <div className="font-medium">{c.assunto}</div>
                        {c.codigo_tecnico && (
                          <div className="text-xs text-muted-foreground">
                            Código: {c.codigo_tecnico}
                          </div>
                        )}
                      </td>
                      {scope === "global" && (
                        <td className="py-2 pr-4 text-xs">
                          {instMap.get(c.instituicao_id) ?? c.instituicao_id.slice(0, 8)}
                        </td>
                      )}
                      <td className="py-2 pr-4">
                        <Badge variant="outline">{CHAMADO_TIPO_LABEL[c.tipo]}</Badge>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={statusVariant(c.status)}>
                          {CHAMADO_STATUS_LABEL[c.status]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {CHAMADO_PRIORIDADE_LABEL[c.prioridade]}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="py-2 pr-4">
                        <Button variant="ghost" size="sm" onClick={() => setDetalheId(c.id)}>
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <NovoChamadoDialog
        open={openNovo}
        onOpenChange={setOpenNovo}
        scope={scope}
        instituicaoAtivaId={instAtivaId}
        instituicoes={instituicoes.map((i) => ({ id: i.id, nome: i.nome }))}
        onCreated={(c) => {
          setOpenNovo(false);
          setDetalheId(c.id);
          void load();
        }}
      />

      <DetalheChamadoSheet
        chamadoId={detalheId}
        onClose={() => {
          setDetalheId(null);
          void load();
        }}
        isPlatformAdmin={isPlatformAdmin}
        currentUserId={user?.id ?? null}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Novo chamado
// ---------------------------------------------------------------------------

interface NovoChamadoDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: "local" | "global";
  instituicaoAtivaId: string | null;
  instituicoes: Array<{ id: string; nome: string }>;
  onCreated: (c: Chamado) => void;
}

function NovoChamadoDialog(props: NovoChamadoDialogProps) {
  const { open, onOpenChange, scope, instituicaoAtivaId, instituicoes, onCreated } = props;
  const [tipo, setTipo] = useState<ChamadoTipo>("operacional");
  const [assunto, setAssunto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<ChamadoPrioridade>("normal");
  const [origem, setOrigem] = useState("");
  const [codigo, setCodigo] = useState("");
  const [instId, setInstId] = useState<string>(instituicaoAtivaId ?? "");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo("operacional");
      setAssunto("");
      setDescricao("");
      setPrioridade("normal");
      setOrigem("");
      setCodigo("");
      setInstId(instituicaoAtivaId ?? (scope === "global" ? "" : ""));
      setArquivos([]);
    }
  }, [open, instituicaoAtivaId, scope]);

  const handleArquivos = (list: FileList | null) => {
    if (!list) return;
    const acc: File[] = [...arquivos];
    for (const f of Array.from(list)) {
      if (acc.length >= MAX_ARQUIVOS_POR_ENVIO) {
        toast.error(`Máximo ${MAX_ARQUIVOS_POR_ENVIO} arquivos por envio.`);
        break;
      }
      const err = validarArquivo(f);
      if (err) {
        toast.error(`${f.name}: ${err}`);
        continue;
      }
      acc.push(f);
    }
    setArquivos(acc);
  };

  const submit = async () => {
    const instAlvo = instId || instituicaoAtivaId || "";
    if (!instAlvo) {
      toast.error("Selecione uma instituição para abrir o chamado.");
      return;
    }
    if (assunto.trim().length < 3) {
      toast.error("Informe um assunto (mínimo 3 caracteres).");
      return;
    }
    if (descricao.trim().length < 1) {
      toast.error("Informe uma descrição.");
      return;
    }
    setSalvando(true);
    try {
      const chamado = await criarChamado({
        instituicaoId: instAlvo,
        tipo,
        assunto,
        descricao,
        prioridade,
        origem: origem || null,
        codigoTecnico: codigo || null,
      });
      for (const f of arquivos) {
        try {
          await enviarAnexo({ id: chamado.id, instituicao_id: chamado.instituicao_id }, f);
        } catch (err) {
          const fr = toFriendlyError(err, {
            operacao: "enviar_anexo_chamado",
            entidade: "chamado_anexos",
            acao: "INSERT",
          });
          toast.error(`Anexo "${f.name}": ${fr.message}`);
        }
      }
      toast.success("Chamado aberto com sucesso.");
      onCreated(chamado);
    } catch (err) {
      const f = toFriendlyError(err, {
        operacao: "criar_chamado",
        entidade: "chamados_suporte",
        acao: "INSERT",
      });
      toast.error(f.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Abrir novo chamado</DialogTitle>
          <DialogDescription>
            Anexe prints, contratos ou documentos. Máximo {MAX_ARQUIVOS_POR_ENVIO} arquivos de até 10 MB.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {(scope === "global" || !instituicaoAtivaId) && (
            <div>
              <Label>Instituição</Label>
              <Select value={instId} onValueChange={setInstId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {instituicoes.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as ChamadoTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>{CHAMADO_TIPO_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as ChamadoPrioridade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>{CHAMADO_PRIORIDADE_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Assunto</Label>
            <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={5} maxLength={5000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Origem (opcional)</Label>
              <Input value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Ex.: Sessões Públicas" />
            </div>
            <div>
              <Label>Código técnico (opcional)</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: RLS_XYZ_DENIED" />
            </div>
          </div>
          <div>
            <Label>Anexos</Label>
            <Input
              type="file"
              multiple
              accept={MIME_PERMITIDOS.join(",")}
              onChange={(e) => handleArquivos(e.target.files)}
            />
            {arquivos.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {arquivos.map((f, i) => (
                  <li key={i}>• {f.name} ({(f.size / 1024).toFixed(0)} KB)</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={submit} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Abrir chamado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Detalhe / thread
// ---------------------------------------------------------------------------

interface DetalheChamadoSheetProps {
  chamadoId: string | null;
  onClose: () => void;
  isPlatformAdmin: boolean;
  currentUserId: string | null;
}

function DetalheChamadoSheet({ chamadoId, onClose, isPlatformAdmin, currentUserId }: DetalheChamadoSheetProps) {
  const [chamado, setChamado] = useState<Chamado | null>(null);
  const [mensagens, setMensagens] = useState<ChamadoMensagem[]>([]);
  const [anexos, setAnexos] = useState<ChamadoAnexo[]>([]);
  const [loading, setLoading] = useState(false);
  const [resposta, setResposta] = useState("");
  const [interno, setInterno] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [novoStatus, setNovoStatus] = useState<ChamadoStatus>("aberto");

  const load = async (id: string) => {
    setLoading(true);
    try {
      const [c, ms, ans] = await Promise.all([
        listarChamados({ limit: 1 }).then((all) => all.find((x) => x.id === id) ?? null),
        obterMensagens(id),
        obterAnexos(id),
      ]);
      // Fallback: buscar chamado diretamente se não estiver no cache
      const chamadoFinal =
        c ??
        (await listarChamados({}).then((all) => all.find((x) => x.id === id) ?? null));
      setChamado(chamadoFinal);
      setMensagens(ms);
      setAnexos(ans);
      if (chamadoFinal) setNovoStatus(chamadoFinal.status);
    } catch (err) {
      const f = toFriendlyError(err, { operacao: "obter_chamado", entidade: "chamados_suporte" });
      toast.error(f.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (chamadoId) void load(chamadoId);
    else {
      setChamado(null);
      setMensagens([]);
      setAnexos([]);
      setResposta("");
      setInterno(false);
    }
  }, [chamadoId]);

  const handleEnviar = async () => {
    if (!chamado || !resposta.trim()) return;
    setEnviando(true);
    try {
      await enviarMensagem(chamado, resposta, isPlatformAdmin && interno);
      setResposta("");
      setInterno(false);
      const ms = await obterMensagens(chamado.id);
      setMensagens(ms);
    } catch (err) {
      const f = toFriendlyError(err, {
        operacao: "responder_chamado",
        entidade: "chamado_mensagens",
        acao: "INSERT",
      });
      toast.error(f.message);
    } finally {
      setEnviando(false);
    }
  };

  const handleAnexar = async (fl: FileList | null) => {
    if (!chamado || !fl || fl.length === 0) return;
    for (const f of Array.from(fl).slice(0, MAX_ARQUIVOS_POR_ENVIO)) {
      const err = validarArquivo(f);
      if (err) { toast.error(`${f.name}: ${err}`); continue; }
      try {
        await enviarAnexo(chamado, f);
      } catch (e) {
        const fr = toFriendlyError(e, {
          operacao: "enviar_anexo_chamado",
          entidade: "chamado_anexos",
          acao: "INSERT",
        });
        toast.error(`Anexo "${f.name}": ${fr.message}`);
      }
    }
    setAnexos(await obterAnexos(chamado.id));
  };

  const handleBaixar = async (a: ChamadoAnexo) => {
    const url = await urlAssinadaAnexo(a);
    if (!url) { toast.error("Não foi possível gerar o link do anexo."); return; }
    window.open(url, "_blank", "noopener");
  };

  const handleAtualizarStatus = async () => {
    if (!chamado) return;
    try {
      await atualizarStatus(chamado.id, novoStatus);
      toast.success("Status atualizado.");
      await load(chamado.id);
    } catch (err) {
      const f = toFriendlyError(err, {
        operacao: "atualizar_status_chamado",
        entidade: "chamados_suporte",
        acao: "UPDATE",
      });
      toast.error(f.message);
    }
  };

  const podeEditarStatus =
    !!chamado &&
    (isPlatformAdmin || chamado.criado_por_user_id === currentUserId /* fallback UX; RLS decide */);

  return (
    <Sheet open={!!chamadoId} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{chamado?.assunto ?? "Chamado"}</SheetTitle>
          <SheetDescription>
            {chamado ? `#${shortId(chamado.id)} · ${CHAMADO_TIPO_LABEL[chamado.tipo]}` : ""}
          </SheetDescription>
        </SheetHeader>

        {loading || !chamado ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant={statusVariant(chamado.status)}>{CHAMADO_STATUS_LABEL[chamado.status]}</Badge>
              <Badge variant="outline">Prioridade: {CHAMADO_PRIORIDADE_LABEL[chamado.prioridade]}</Badge>
              {chamado.codigo_tecnico && <Badge variant="outline">{chamado.codigo_tecnico}</Badge>}
              {chamado.origem && <Badge variant="outline">Origem: {chamado.origem}</Badge>}
            </div>

            <div className="rounded-md border p-3 bg-muted/40">
              <div className="text-xs text-muted-foreground mb-1">Descrição inicial</div>
              <p className="text-sm whitespace-pre-wrap">{chamado.descricao}</p>
            </div>

            {isPlatformAdmin && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Alterar status</Label>
                  <Select value={novoStatus} onValueChange={(v) => setNovoStatus(v as ChamadoStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPCOES.map((s) => (
                        <SelectItem key={s} value={s}>{CHAMADO_STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={handleAtualizarStatus} disabled={!podeEditarStatus}>Salvar</Button>
              </div>
            )}

            <div>
              <div className="text-xs font-medium mb-2 text-muted-foreground uppercase">Histórico</div>
              <div className="space-y-2">
                {mensagens.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma resposta ainda.</p>
                )}
                {mensagens.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-md border p-2 text-sm ${m.interno ? "bg-amber-50 border-amber-200" : "bg-background"}`}
                  >
                    <div className="text-[10px] text-muted-foreground flex justify-between">
                      <span>
                        {m.autor_user_id === currentUserId ? "Você" : m.autor_user_id.slice(0, 8)}
                        {m.interno && " · nota interna"}
                      </span>
                      <span>{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                    <p className="whitespace-pre-wrap mt-1">{m.mensagem}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium mb-2 text-muted-foreground uppercase">Anexos</div>
              {anexos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem anexos.</p>
              ) : (
                <ul className="space-y-1">
                  {anexos.map((a) => (
                    <li key={a.id} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                      <span className="truncate flex items-center gap-2">
                        <Paperclip className="h-3 w-3" /> {a.nome_arquivo}
                        <span className="text-xs text-muted-foreground">
                          ({(a.tamanho_bytes / 1024).toFixed(0)} KB)
                        </span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => handleBaixar(a)}>
                        <Download className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2">
                <Input
                  type="file"
                  multiple
                  accept={MIME_PERMITIDOS.join(",")}
                  onChange={(e) => handleAnexar(e.target.files)}
                />
              </div>
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">Nova resposta</Label>
              <Textarea rows={4} value={resposta} onChange={(e) => setResposta(e.target.value)} maxLength={5000} />
              {isPlatformAdmin && (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} />
                  Nota interna (visível apenas para administradores da plataforma)
                </label>
              )}
              <Button onClick={handleEnviar} disabled={enviando || !resposta.trim()}>
                {enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
