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
import { Building2, Check, ChevronDown, ExternalLink, LogOut } from "lucide-react";
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
  const {
    instituicoes,
    selecionada,
    selectInstituicao,
    isLoading,
    isPlatformAdmin,
  } = useInstituicaoAtiva();

  if (isLoading) return null;

  const ativas = instituicoes.filter((i) => i.vinculo_status === "ativo");

  // SAAS-06-C1-FIX17 — Sem nenhum vínculo e sem ser platform_admin: nada a mostrar.
  if (instituicoes.length === 0 && !isPlatformAdmin) return null;

  // Usuário não-admin com exatamente 1 instituição: badge estático.
  if (!isPlatformAdmin && ativas.length <= 1 && instituicoes.length === 1) {
    const inst = instituicoes[0];
    return (
      <div
        className="hidden md:inline-flex cursor-default select-none items-center gap-2 rounded-full bg-muted/60 px-3 py-1 text-xs text-muted-foreground"
        aria-label={`Instituição atual: ${inst.nome}`}
        title={`Instituição atual: ${inst.nome}`}
        data-testid="tenant-badge-single"
        role="status"
      >
        <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
          Instituição atual:
        </span>
        <span className="max-w-[220px] truncate font-semibold text-foreground">
          {inst.nome}
        </span>
      </div>
    );
  }

  // SAAS-06-C1-FIX17 — Rótulo do trigger reflete o contexto real. Sem tenant,
  // deixa claro que a visão é global; com tenant, mostra a instituição atual.
  const rotuloAtual = selecionada
    ? selecionada.nome
    : isPlatformAdmin
      ? "Visão global"
      : "Entrar na instituição";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 cursor-pointer gap-2"
          aria-label={selecionada ? "Trocar instituição" : "Entrar na instituição"}
          title={selecionada ? "Trocar instituição" : "Entrar na instituição"}
          data-testid="tenant-switcher-trigger"
        >
          <Building2 className="h-3.5 w-3.5 text-primary" />
          <span className="max-w-[180px] truncate">{rotuloAtual}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs">
          {isPlatformAdmin ? "Contexto de instituição" : "Suas instituições"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {selecionada && (
          <>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                selectInstituicao(null);
              }}
              className="flex items-center gap-2 py-2 text-xs"
              data-testid="tenant-switcher-exit"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair da instituição (visão global)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {instituicoes.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            Nenhum vínculo local ativo. Use o Portal Admin para gerir instituições.
          </div>
        )}
        {instituicoes.map((inst) => {
          const isSelected = inst.id === selecionada?.id;
          const podeSelecionar =
            inst.vinculo_status === "ativo" || isPlatformAdmin;
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
                  {inst.vinculo_status !== "ativo" && (
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
