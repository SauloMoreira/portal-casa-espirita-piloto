/**
 * SAAS-04 — Tenant switcher persistente exibido no header global.
 *
 * Regras de UI:
 * - Escondido quando o usuário não tem nenhuma instituição vinculada.
 * - Quando há apenas 1 instituição ativa: exibe nome estático (sem dropdown).
 * - Quando há ≥ 2 instituições ativas: dropdown com seleção persistente.
 * - Instituições com vínculo != ativo aparecem desabilitadas no menu.
 *
 * A seleção é propagada via `InstituicaoContext` e persistida em localStorage
 * pelo `useSelectedInstituicao`. A RLS no backend continua sendo a verdade.
 */
import { Link } from "react-router-dom";
import { Building2, Check, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useInstituicaoAtiva } from "@/contexts/InstituicaoContext";
import { ROUTES } from "@/constants/routes";
import { cn } from "@/lib/utils";

export function TenantSwitcher() {
  const { instituicoes, selecionada, selectInstituicao, isLoading } =
    useInstituicaoAtiva();

  if (isLoading || instituicoes.length === 0) return null;

  const ativas = instituicoes.filter((i) => i.vinculo_status === "ativo");

  // Caso simples: 1 instituição — apenas rótulo, sem dropdown.
  if (ativas.length <= 1 && instituicoes.length === 1) {
    const inst = instituicoes[0];
    return (
      <div
        className="hidden md:flex items-center gap-2 rounded-md border px-2 py-1 text-xs text-muted-foreground"
        aria-label="Instituição ativa"
      >
        <Building2 className="h-3.5 w-3.5 text-primary" />
        <span className="max-w-[180px] truncate font-medium text-foreground">
          {inst.nome}
        </span>
      </div>
    );
  }

  const rotuloAtual = selecionada?.nome ?? "Selecionar instituição";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2"
          aria-label="Trocar instituição ativa"
        >
          <Building2 className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[160px] truncate">{rotuloAtual}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs">
          Suas instituições
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {instituicoes.map((inst) => {
          const isSelected = inst.id === selecionada?.id;
          const podeSelecionar = inst.vinculo_status === "ativo";
          return (
            <DropdownMenuItem
              key={inst.id}
              disabled={!podeSelecionar}
              onSelect={(e) => {
                e.preventDefault();
                if (podeSelecionar) selectInstituicao(inst.id);
              }}
              className={cn(
                "flex items-start gap-2 py-2",
                isSelected && "bg-primary/5",
              )}
            >
              <Check
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  isSelected ? "text-primary" : "opacity-0",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {inst.nome}
                  </span>
                  {!podeSelecionar && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {inst.vinculo_status}
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {[inst.cidade, inst.uf].filter(Boolean).join(" · ") || "—"}
                  {inst.plano ? ` · ${inst.plano.nome}` : ""}
                </p>
              </div>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={ROUTES.portal} className="flex items-center gap-2 text-xs">
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir Portal SaaS
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
