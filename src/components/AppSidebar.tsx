import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  Heart,
  Calendar,
  ClipboardCheck,
  BookOpen,
  Settings,
  Shield,
  HandHeart,
  FileText,
  Cog,
  AlertTriangle,
  LogOut,
  User,
  Building2,
  Bell,
  Brain,
  UserCheck,
  ChevronDown,
  Stethoscope,
  BarChart3,
  Landmark,
  Palette,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  roles: AppRole[];
}

interface NavGroup {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Visão Geral",
    icon: LayoutDashboard,
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "entrevistador", "tarefeiro", "assistido", "coordenador_de_tratamento"] },
      { title: "Notificações", url: "/notificacoes", icon: Bell, roles: ["admin", "entrevistador", "tarefeiro", "assistido", "coordenador_de_tratamento"] },
    ],
  },
  {
    label: "Atendimento",
    icon: HandHeart,
    items: [
      { title: "Assistidos", url: "/assistidos", icon: HandHeart, roles: ["admin", "entrevistador"] },
      { title: "Agend. Entrevistas", url: "/entrevistas", icon: BookOpen, roles: ["admin", "entrevistador"] },
      { title: "Fazer Entrevista", url: "/fazer-entrevista", icon: ClipboardCheck, roles: ["admin", "entrevistador"] },
      { title: "Agenda", url: "/agenda", icon: Calendar, roles: ["admin", "entrevistador"] },
      { title: "Presença", url: "/presenca", icon: Heart, roles: ["admin", "tarefeiro"] },
    ],
  },
  {
    label: "Tratamentos",
    icon: Stethoscope,
    items: [
      { title: "Tratamentos", url: "/tratamentos", icon: Heart, roles: ["admin"] },
      { title: "Lista de Espera", url: "/lista-espera", icon: ClipboardCheck, roles: ["coordenador_de_tratamento"] },
      { title: "Meus Tratamentos", url: "/coordenador-tratamentos", icon: Heart, roles: ["coordenador_de_tratamento"] },
      { title: "Agenda do Tratamento", url: "/coordenador-agenda", icon: Calendar, roles: ["coordenador_de_tratamento"] },
      { title: "Meus Tratamentos", url: "/meus-tratamentos", icon: Heart, roles: ["assistido"] },
      { title: "Minha Agenda", url: "/minha-agenda", icon: Calendar, roles: ["assistido"] },
      { title: "Meu Perfil", url: "/meu-perfil", icon: User, roles: ["assistido"] },
      { title: "Documentos", url: "/meus-documentos", icon: FileText, roles: ["assistido"] },
    ],
  },
  {
    label: "Pessoas",
    icon: Users,
    items: [
      { title: "Usuários", url: "/usuarios", icon: Users, roles: ["admin"] },
      { title: "Voluntários", url: "/voluntarios", icon: UserCheck, roles: ["admin"] },
      { title: "Funções Voluntariado", url: "/funcoes-voluntariado", icon: ClipboardCheck, roles: ["admin"] },
    ],
  },
  {
    label: "Inteligência",
    icon: Brain,
    items: [
      { title: "Central de IA", url: "/central-ia", icon: Brain, roles: ["admin", "entrevistador"] },
      { title: "Relatórios", url: "/relatorios", icon: BarChart3, roles: ["admin", "entrevistador", "coordenador_de_tratamento", "tarefeiro"] },
      { title: "Exceções", url: "/excecoes", icon: AlertTriangle, roles: ["admin"] },
      { title: "Auditoria", url: "/auditoria", icon: Shield, roles: ["admin"] },
    ],
  },
  {
    label: "Institucional",
    icon: Landmark,
    items: [
      { title: "Instituição", url: "/instituicao", icon: Building2, roles: ["admin"] },
      { title: "Regras Operacionais", url: "/regras", icon: Cog, roles: ["admin"] },
      { title: "Configurações", url: "/configuracoes", icon: Settings, roles: ["admin"] },
      { title: "Gestão de Cores", url: "/configuracoes/cores", icon: Palette, roles: ["admin"] },
    ],
  },
];

const roleLabels: Record<AppRole, string> = {
  admin: "Administrador",
  entrevistador: "Entrevistador",
  tarefeiro: "Tarefeiro",
  assistido: "Assistido",
  coordenador_de_tratamento: "Coordenador",
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role, user, profile, signOut } = useAuth();
  const [inst, setInst] = useState<{ logo_url: string | null; nome_fantasia: string | null } | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.from("instituicao_config").select("logo_url, nome_fantasia").limit(1).then(({ data }) => {
      if (data && data.length > 0) setInst(data[0] as any);
    });
  }, []);

  useEffect(() => {
    const handleStorage = () => {
      supabase.from("instituicao_config").select("logo_url, nome_fantasia").limit(1).then(({ data }) => {
        if (data && data.length > 0) setInst(data[0] as any);
      });
    };
    window.addEventListener("instituicao-updated", handleStorage);
    return () => window.removeEventListener("instituicao-updated", handleStorage);
  }, []);

  // Auto-expand group containing active route
  useEffect(() => {
    const newOpen: Record<string, boolean> = {};
    navGroups.forEach((group) => {
      const hasActive = group.items.some((item) => location.pathname === item.url || location.pathname.startsWith(item.url + "/"));
      if (hasActive) newOpen[group.label] = true;
    });
    setOpenGroups((prev) => ({ ...prev, ...newOpen }));
  }, [location.pathname]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  // Filter groups: only show groups that have at least one visible item
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => role && item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="gradient-sidebar border-r-0">
      <SidebarContent className="px-0 py-0 overflow-y-auto scrollbar-thin">
        {/* Logo / Institution header */}
        {!collapsed ? (
          <div className="px-4 py-4 flex items-center gap-3 border-b border-sidebar-border/40">
            {inst?.logo_url ? (
              <img src={inst.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-sidebar-accent/60 flex items-center justify-center shrink-0">
                <Heart className="h-4 w-4 text-sidebar-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-display font-semibold text-sidebar-foreground truncate leading-tight">
                {inst?.nome_fantasia || "Casa Espírita"}
              </h2>
              <p className="text-[9px] text-sidebar-foreground/50 mt-0.5 tracking-wide uppercase">
                Sistema de Gestão
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-3 border-b border-sidebar-border/40">
            {inst?.logo_url ? (
              <img src={inst.logo_url} alt="" className="h-7 w-7 rounded-md object-cover" />
            ) : (
              <Heart className="h-5 w-5 text-sidebar-foreground" />
            )}
          </div>
        )}

        {/* Navigation groups */}
        <div className="flex-1 py-2">
          {visibleGroups.map((group, idx) => {
            const isGroupActive = group.items.some((item) => location.pathname === item.url);
            const isOpen = openGroups[group.label] ?? false;
            const GroupIcon = group.icon;

            return (
              <div key={group.label}>
                {idx > 0 && (
                  <div className="mx-3 my-1.5 border-t border-sidebar-border/30" />
                )}

                {collapsed ? (
                  /* Collapsed: show only icons with tooltips */
                  <div className="flex flex-col items-center gap-0.5 py-1">
                    {group.items.map((item) => {
                      const isActive = location.pathname === item.url;
                      return (
                        <Tooltip key={item.url} delayDuration={0}>
                          <TooltipTrigger asChild>
                            <NavLink
                              to={item.url}
                              end={item.url === "/dashboard"}
                              className={cn(
                                "flex items-center justify-center w-9 h-9 rounded-md transition-all duration-150",
                                isActive
                                  ? "bg-sidebar-accent text-sidebar-foreground"
                                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                              )}
                              activeClassName=""
                            >
                              <item.icon className="h-4 w-4" />
                            </NavLink>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="font-sans text-xs">
                            {item.title}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                ) : (
                  /* Expanded: collapsible groups */
                  <Collapsible open={isOpen} onOpenChange={() => toggleGroup(group.label)}>
                    <CollapsibleTrigger className="w-full">
                      <div
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 cursor-pointer select-none transition-colors duration-150",
                          isGroupActive
                            ? "text-sidebar-foreground"
                            : "text-sidebar-foreground/50 hover:text-sidebar-foreground/80"
                        )}
                      >
                        <GroupIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] flex-1 text-left truncate">
                          {group.label}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 shrink-0 transition-transform duration-200",
                            isOpen && "rotate-180"
                          )}
                        />
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                      <div className="pb-1">
                        {group.items.map((item) => {
                          const isActive = location.pathname === item.url;
                          return (
                            <NavLink
                              key={item.url}
                              to={item.url}
                              end={item.url === "/dashboard"}
                              className={cn(
                                "flex items-center gap-2.5 pl-7 pr-3 py-[7px] mx-2 rounded-md text-[13px] transition-all duration-150",
                                isActive
                                  ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                              )}
                              activeClassName=""
                            >
                              <item.icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{item.title}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            );
          })}
        </div>
      </SidebarContent>

      {/* Footer: user info */}
      <SidebarFooter className="border-t border-sidebar-border/40 p-3">
        {!collapsed ? (
          <div className="mb-2 flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-sidebar-accent/60 flex items-center justify-center overflow-hidden ring-2 ring-sidebar-border/30">
              {profile?.foto_url ? (
                <img src={profile.foto_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[11px] font-semibold text-sidebar-foreground/80">
                  {(profile?.nome_completo || user?.email || "")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0].toUpperCase())
                    .join("")}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-sidebar-foreground truncate leading-tight">
                {profile?.nome_completo || user?.email}
              </p>
              <span className="inline-block mt-0.5 text-[9px] uppercase tracking-wider bg-sidebar-accent/60 text-sidebar-foreground/70 px-1.5 py-0.5 rounded font-medium">
                {role ? roleLabels[role] : ""}
              </span>
            </div>
          </div>
        ) : (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <div className="flex justify-center mb-2">
                <div className="h-8 w-8 rounded-full bg-sidebar-accent/60 flex items-center justify-center overflow-hidden ring-2 ring-sidebar-border/30">
                  {profile?.foto_url ? (
                    <img src={profile.foto_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-4 w-4 text-sidebar-foreground/80" />
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-sans text-xs">
              {profile?.nome_completo || user?.email}
            </TooltipContent>
          </Tooltip>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 text-xs"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && "Sair"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
