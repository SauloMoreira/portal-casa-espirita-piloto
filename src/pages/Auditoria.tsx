import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, Search, Eye } from "lucide-react";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  user_id: string | null;
  tabela: string;
  acao: string;
  registro_id: string | null;
  dados_anteriores: any;
  dados_novos: any;
  created_at: string;
}

const TABELA_LABELS: Record<string, string> = {
  entrevistas_fraternas: "Entrevistas",
  assistido_tratamentos: "Tratamentos do Assistido",
  agenda_tratamentos_assistido: "Agenda de Sessões",
  presencas_tratamentos: "Presenças",
};

const ACAO_COLORS: Record<string, string> = {
  INSERT: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
};

export default function Auditoria() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [tabelaFilter, setTabelaFilter] = useState("todas");
  const [acaoFilter, setAcaoFilter] = useState("todas");
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setLogs((data as AuditLog[]) || []);
      setLoading(false);

      // Load profile names
      const { data: profs } = await supabase.from("profiles").select("user_id, nome_completo");
      if (profs) {
        const map: Record<string, string> = {};
        profs.forEach((p: any) => { if (p.user_id && p.nome_completo) map[p.user_id] = p.nome_completo; });
        setProfiles(map);
      }
    };
    load();
  }, []);

  const filtered = logs.filter((l) => {
    if (tabelaFilter !== "todas" && l.tabela !== tabelaFilter) return false;
    if (acaoFilter !== "todas" && l.acao !== acaoFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const userName = (l.user_id && profiles[l.user_id]) || "";
      return userName.toLowerCase().includes(s) || l.tabela.toLowerCase().includes(s) || (l.registro_id || "").includes(s);
    }
    return true;
  });

  const getDiffFields = (old: any, newData: any): string[] => {
    if (!old || !newData) return [];
    const fields: string[] = [];
    const allKeys = new Set([...Object.keys(old), ...Object.keys(newData)]);
    allKeys.forEach((key) => {
      if (key === "updated_at" || key === "created_at") return;
      if (JSON.stringify(old[key]) !== JSON.stringify(newData[key])) {
        fields.push(key);
      }
    });
    return fields;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Auditoria</h1>
        <p className="text-sm text-muted-foreground mt-1">Histórico detalhado de alterações críticas</p>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por usuário, tabela..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={tabelaFilter} onValueChange={setTabelaFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Tabela" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as tabelas</SelectItem>
                {Object.entries(TABELA_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={acaoFilter} onValueChange={setAcaoFilter}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Ação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="INSERT">Inserção</SelectItem>
                <SelectItem value="UPDATE">Alteração</SelectItem>
                <SelectItem value="DELETE">Exclusão</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground text-sm">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Shield className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum registro encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Tabela</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead className="hidden md:table-cell">Campos Alterados</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => {
                    const changedFields = l.acao === "UPDATE" ? getDiffFields(l.dados_anteriores, l.dados_novos) : [];
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(l.created_at), "dd/MM/yy HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(l.user_id && profiles[l.user_id]) || (l.user_id ? l.user_id.substring(0, 8) + "..." : "Sistema")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {TABELA_LABELS[l.tabela] || l.tabela}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={ACAO_COLORS[l.acao] as any || "default"} className="text-xs">
                            {l.acao === "INSERT" ? "Inserção" : l.acao === "UPDATE" ? "Alteração" : "Exclusão"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {changedFields.length > 0 ? changedFields.join(", ") : "—"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedLog(l)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Alteração</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Data:</span>{" "}
                  {format(new Date(selectedLog.created_at), "dd/MM/yyyy HH:mm:ss")}
                </div>
                <div>
                  <span className="text-muted-foreground">Usuário:</span>{" "}
                  {(selectedLog.user_id && profiles[selectedLog.user_id]) || selectedLog.user_id || "Sistema"}
                </div>
                <div>
                  <span className="text-muted-foreground">Tabela:</span>{" "}
                  {TABELA_LABELS[selectedLog.tabela] || selectedLog.tabela}
                </div>
                <div>
                  <span className="text-muted-foreground">Ação:</span>{" "}
                  <Badge variant={ACAO_COLORS[selectedLog.acao] as any || "default"} className="text-xs">
                    {selectedLog.acao}
                  </Badge>
                </div>
              </div>

              {selectedLog.acao === "UPDATE" && selectedLog.dados_anteriores && selectedLog.dados_novos && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Campos alterados</h4>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Campo</TableHead>
                          <TableHead className="text-xs">Valor Anterior</TableHead>
                          <TableHead className="text-xs">Valor Novo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getDiffFields(selectedLog.dados_anteriores, selectedLog.dados_novos).map((field) => (
                          <TableRow key={field}>
                            <TableCell className="font-mono text-xs">{field}</TableCell>
                            <TableCell className="text-xs text-destructive">
                              {JSON.stringify(selectedLog.dados_anteriores[field]) ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-green-600">
                              {JSON.stringify(selectedLog.dados_novos[field]) ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {selectedLog.acao === "INSERT" && selectedLog.dados_novos && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Dados inseridos</h4>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                    {JSON.stringify(selectedLog.dados_novos, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.acao === "DELETE" && selectedLog.dados_anteriores && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Dados removidos</h4>
                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                    {JSON.stringify(selectedLog.dados_anteriores, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
