import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pencil, FileText, Eye, MoreVertical, UserX, UserCheck, Trash2,
} from "lucide-react";
import { maskCPF, maskPhone } from "@/lib/validators";
import { VOLUNTARIO_MESSAGES } from "@/constants/voluntarios";
import { VoluntarioStatusBadge } from "./VoluntarioStatusBadge";
import { TermoStatusBadge } from "./TermoStatusBadge";
import { isVoluntarioAtivo } from "@/lib/voluntarioManagement";
import type { VoluntarioListItem } from "@/types/voluntarios";

interface Props {
  voluntarios: VoluntarioListItem[];
  onEdit: (v: VoluntarioListItem) => void;
  onFicha: (v: VoluntarioListItem) => void;
  onTermo: (v: VoluntarioListItem) => void;
  onInactivate: (v: VoluntarioListItem) => void;
  onReactivate: (v: VoluntarioListItem) => void;
  onDelete: (v: VoluntarioListItem) => void;
}

export function VoluntariosList({
  voluntarios, onEdit, onFicha, onTermo, onInactivate, onReactivate, onDelete,
}: Props) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden md:table-cell">CPF</TableHead>
              <TableHead className="hidden md:table-cell">Celular</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Termo</TableHead>
              <TableHead className="hidden lg:table-cell">Ingresso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {voluntarios.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {VOLUNTARIO_MESSAGES.emptyList}
                </TableCell>
              </TableRow>
            ) : (
              voluntarios.map((v) => {
                const ativo = isVoluntarioAtivo(v.status);
                return (
                  <TableRow key={v.id} className={ativo ? "" : "opacity-60"}>
                    <TableCell className="font-medium">{v.nome_completo}</TableCell>
                    <TableCell className="hidden md:table-cell">{maskCPF(v.cpf)}</TableCell>
                    <TableCell className="hidden md:table-cell">{maskPhone(v.celular)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {(v.tipos_voluntario || []).map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <VoluntarioStatusBadge status={v.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {v.data_ingresso_sistema
                        ? new Date(v.data_ingresso_sistema + "T12:00:00").toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => onEdit(v)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => onFicha(v)} title="Ficha">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => onTermo(v)} title="Termo de Adesão">
                          <FileText className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" title="Mais ações">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {ativo ? (
                              <DropdownMenuItem onClick={() => onInactivate(v)}>
                                <UserX className="h-4 w-4 mr-2" /> Inativar
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => onReactivate(v)}>
                                <UserCheck className="h-4 w-4 mr-2" /> Reativar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onDelete(v)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
