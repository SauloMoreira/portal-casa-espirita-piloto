import { useMemo, useState, type ReactNode } from "react";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search,
  User,
  CalendarClock,
  History as HistoryIcon,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  Loader2,
  ArrowRight,
  Phone,
  Mail,
  IdCard,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  buscarAssistidos,
  carregarVisaoConsolidada,
  type AssistidoResumoBusca,
  type TratamentoConsolidado,
  type SessaoConsolidada,
  type VisaoConsolidada,
} from "@/services/assistidos/consultaConsolidada";

const STATUS_LABEL: Record<string, string> = {
  aguardando_inicio: "Aguardando início",
  aguardando_liberacao: "Aguardando liberação",
  aguardando_agendamento: "Aguardando agendamento",
  liberado: "Liberado",
  em_andamento: "Em andamento",
  ativo: "Em andamento",
  concluido: "Concluído",
  suspenso: "Suspenso",
  pausado: "Pausado",
  cancelado: "Cancelado",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  concluido: "default",
  em_andamento: "default",
  ativo: "default",
  aguardando_inicio: "secondary",
  aguardando_liberacao: "outline",
  aguardando_agendamento: "outline",
  liberado: "secondary",
  suspenso: "destructive",
  cancelado: "destructive",
  pausado: "outline",
};

const SESSAO_STATUS_LABEL: Record<string, string> = {
  agendado: "Agendada",
  presente: "Presente",
  falta: "Falta",
  justificada: "Justificada",
  cancelado: "Cancelada",
  realizado: "Realizada",
};

const iniciais = (nome: string) =>
  nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

const fmtData = (d: string) => {
  try {
    return format(parseISO(d), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return d;
  }
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export default function ConsultaAssistido() {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<AssistidoResumoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [visao, setVisao] = useState<VisaoConsolidada | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const handleBuscar = async (valor: string) => {
    setTermo(valor);
    setErro(null);
    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    try {
      setResultados(await buscarAssistidos(valor));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro na busca.");
    } finally {
      setBuscando(false);
    }
  };

  const selecionar = async (id: string) => {
    setCarregando(true);
    setErro(null);
    setResultados([]);
    try {
      setVisao(await carregarVisaoConsolidada(id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar assistido.");
      setVisao(null);
    } finally {
      setCarregando(false);
    }
  };

  const hoje = startOfDay(new Date());
  const { futuras, historico } = useMemo(() => {
    const fut: SessaoConsolidada[] = [];
    const hist: SessaoConsolidada[] = [];
    for (const s of visao?.sessoes ?? []) {
      const passou = isBefore(parseISO(s.data_sessao), hoje);
      if (passou || (s.status_presenca && s.status_presenca !== "pendente")) hist.push(s);
      else fut.push(s);
    }
    fut.sort((a, b) => a.data_sessao.localeCompare(b.data_sessao));
    hist.sort((a, b) => b.data_sessao.localeCompare(a.data_sessao));
    return { futuras: fut, historico: hist };
  }, [visao, hoje]);

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-6">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Consulta consolidada do assistido
        </h1>
        <p className="text-sm text-muted-foreground">
          Visão administrativa de tratamentos, agendas, status e progresso em um só lugar.
        </p>
      </header>

      {/* Busca */}
      <Card className="rounded-xl">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={termo}
              onChange={(e) => handleBuscar(e.target.value)}
              placeholder="Buscar por nome, celular, CPF ou e-mail..."
              className="pl-9"
              aria-label="Buscar assistido"
            />
            {buscando && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {resultados.length > 0 && (
            <div className="mt-3 divide-y rounded-lg border">
              {resultados.map((r) => (
                <button
                  key={r.id}
                  onClick={() => selecionar(r.id)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{iniciais(r.nome)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[r.celular, r.email].filter(Boolean).join(" · ") || "Sem contato"}
                    </p>
                  </div>
                  {r.migrado_legado && <Badge variant="outline">Legado</Badge>}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
          {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}
        </CardContent>
      </Card>

      {carregando && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando visão consolidada...
        </div>
      )}

      {visao && !carregando && (
        <div className="space-y-6">
          <CabecalhoAssistido visao={visao} />
          <BlocoTratamentos tratamentos={visao.tratamentos} sessoes={visao.sessoes} />
          <BlocoSessoes titulo="Próximas sessões" icone={<CalendarClock className="h-4 w-4" />} sessoes={futuras} vazio="Nenhuma sessão futura agendada." />
          <BlocoSessoes titulo="Histórico de sessões" icone={<HistoryIcon className="h-4 w-4" />} sessoes={historico} vazio="Nenhuma sessão no histórico." historico />
        </div>
      )}

      {!visao && !carregando && resultados.length === 0 && termo.length < 2 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
          <User className="h-10 w-10 opacity-40" />
          <p className="text-sm">Pesquise um assistido para ver a visão consolidada.</p>
        </div>
      )}
    </div>
  );
}

function CabecalhoAssistido({ visao }: { visao: VisaoConsolidada }) {
  const a = visao.assistido;
  return (
    <Card className="rounded-xl">
      <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
        <Avatar className="h-16 w-16">
          {a.foto_url && <AvatarImage src={a.foto_url} alt={a.nome} />}
          <AvatarFallback>{iniciais(a.nome)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{a.nome}</h2>
            {a.migrado_legado ? (
              <Badge variant="outline">Legado</Badge>
            ) : (
              <Badge variant="secondary">Cadastro normal</Badge>
            )}
            {a.status && <Badge>{STATUS_LABEL[a.status] ?? a.status}</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {a.celular && (
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {a.celular}
              </span>
            )}
            {a.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> {a.email}
              </span>
            )}
            {a.cpf && (
              <span className="flex items-center gap-1">
                <IdCard className="h-3.5 w-3.5" /> {a.cpf}
              </span>
            )}
          </div>
          {a.migrado_legado && (
            <div className="pt-1 text-xs text-muted-foreground">
              {a.data_migracao && <span>Migrado em {fmtData(a.data_migracao.slice(0, 10))}. </span>}
              {a.observacao_migracao && <span className="italic">{a.observacao_migracao}</span>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BlocoTratamentos({
  tratamentos,
  sessoes,
}: {
  tratamentos: TratamentoConsolidado[];
  sessoes: SessaoConsolidada[];
}) {
  const proximaPorVinculo = useMemo(() => {
    const hoje = startOfDay(new Date());
    const m = new Map<string, string>();
    for (const s of [...sessoes].sort((a, b) => a.data_sessao.localeCompare(b.data_sessao))) {
      if (m.has(s.vinculo_id)) continue;
      if (!isBefore(parseISO(s.data_sessao), hoje)) m.set(s.vinculo_id, s.data_sessao);
    }
    return m;
  }, [sessoes]);

  // Para a cadeia sequencial, identificar o tratamento anterior por ordem.
  const sequenciais = tratamentos
    .filter((t) => t.sequencial_bloqueante)
    .sort((a, b) => (a.ordem_tratamento ?? 999) - (b.ordem_tratamento ?? 999));

  const anteriorDe = (t: TratamentoConsolidado): TratamentoConsolidado | null => {
    if (!t.sequencial_bloqueante) return null;
    const idx = sequenciais.findIndex((s) => s.vinculo_id === t.vinculo_id);
    return idx > 0 ? sequenciais[idx - 1] : null;
  };

  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-base">Tratamentos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tratamentos.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum tratamento vinculado.</p>
        )}
        {tratamentos.map((t) => {
          const pct =
            t.quantidade_total > 0
              ? Math.round((t.quantidade_realizada / t.quantidade_total) * 100)
              : 0;
          const sessoesGeradas = sessoes.filter((s) => s.vinculo_id === t.vinculo_id).length;
          const proxima = proximaPorVinculo.get(t.vinculo_id);
          const anterior = anteriorDe(t);
          const bloqueado =
            t.sequencial_bloqueante &&
            !!anterior &&
            anterior.status !== "concluido" &&
            t.quantidade_realizada === 0;

          return (
            <div key={t.vinculo_id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                {t.ordem_tratamento != null && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {t.ordem_tratamento}
                  </span>
                )}
                <span className="font-medium">{t.tratamento_nome}</span>
                <StatusBadge status={t.status} />
                {t.sequencial_bloqueante && (
                  <Badge variant="outline" className="gap-1">
                    {bloqueado ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    Sequencial
                  </Badge>
                )}
                {t.origem === "legado" && <Badge variant="outline">Legado</Badge>}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>
                      {t.quantidade_realizada} de {t.quantidade_total} realizadas
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Faltam {Math.max(t.quantidade_total - t.quantidade_realizada, 0)} · {sessoesGeradas} sessões geradas
                  </p>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1">
                    {t.status === "concluido" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    {proxima ? `Próxima sessão: ${fmtData(proxima)}` : "Sem próxima sessão agendada"}
                  </p>
                  {t.sequencial_bloqueante && anterior && (
                    <p className={bloqueado ? "text-amber-600 dark:text-amber-500" : ""}>
                      {bloqueado
                        ? `Bloqueado por: ${anterior.tratamento_nome} (em andamento)`
                        : `Depende de: ${anterior.tratamento_nome} (${STATUS_LABEL[anterior.status] ?? anterior.status})`}
                    </p>
                  )}
                </div>
              </div>

              {t.observacoes && (
                <p className="mt-2 text-xs italic text-muted-foreground">{t.observacoes}</p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function BlocoSessoes({
  titulo,
  icone,
  sessoes,
  vazio,
  historico = false,
}: {
  titulo: string;
  icone: ReactNode;
  sessoes: SessaoConsolidada[];
  vazio: string;
  historico?: boolean;
}) {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icone}
          {titulo}
          <Badge variant="secondary" className="ml-1">
            {sessoes.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {sessoes.length === 0 && <p className="text-sm text-muted-foreground">{vazio}</p>}
        {sessoes.map((s) => {
          const statusVisivel = s.status_presenca ?? s.status;
          return (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50"
            >
              <Separator orientation="vertical" className="h-8" />
              <div className="w-24 shrink-0 font-medium">{fmtData(s.data_sessao)}</div>
              <div className="w-16 shrink-0 text-muted-foreground">{s.horario?.slice(0, 5) ?? "--:--"}</div>
              <div className="min-w-0 flex-1 truncate">{s.tratamento_nome}</div>
              <Badge variant={historico ? "outline" : "secondary"}>
                {SESSAO_STATUS_LABEL[statusVisivel] ?? statusVisivel}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
