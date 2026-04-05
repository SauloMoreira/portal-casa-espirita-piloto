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
  LogOut,
  User,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  roles: AppRole[];
}

const navItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["admin", "entrevistador", "tarefeiro", "assistido"] },
  { title: "Usuários", url: "/usuarios", icon: Users, roles: ["admin"] },
  { title: "Tratamentos", url: "/tratamentos", icon: Heart, roles: ["admin"] },
  { title: "Assistidos", url: "/assistidos", icon: HandHeart, roles: ["admin", "entrevistador"] },
  { title: "Entrevistas", url: "/entrevistas", icon: BookOpen, roles: ["admin", "entrevistador"] },
  { title: "Agenda", url: "/agenda", icon: Calendar, roles: ["admin", "entrevistador"] },
  { title: "Presença", url: "/presenca", icon: ClipboardCheck, roles: ["admin", "tarefeiro"] },
  { title: "Meus Tratamentos", url: "/meus-tratamentos", icon: Heart, roles: ["assistido"] },
  { title: "Minha Agenda", url: "/minha-agenda", icon: Calendar, roles: ["assistido"] },
  { title: "Relatórios", url: "/relatorios", icon: FileText, roles: ["admin"] },
  { title: "Configurações", url: "/configuracoes", icon: Settings, roles: ["admin"] },
  { title: "Auditoria", url: "/auditoria", icon: Shield, roles: ["admin"] },
];

const roleLabels: Record<AppRole, string> = {
  admin: "Administrador",
  entrevistador: "Entrevistador",
  tarefeiro: "Tarefeiro",
  assistido: "Assistido",
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role, user, signOut } = useAuth();

  const filteredItems = navItems.filter((item) => role && item.roles.includes(role));

  return (
    <Sidebar collapsible="icon" className="gradient-sidebar border-r-0">
      <SidebarContent>
        <SidebarGroup>
          {!collapsed && (
            <div className="px-4 py-5">
              <h2 className="text-lg font-display font-semibold text-sidebar-foreground">
                Casa Espírita
              </h2>
              <p className="text-xs text-sidebar-foreground/60 mt-0.5">
                Sistema de Gestão
              </p>
            </div>
          )}
          {collapsed && (
            <div className="flex items-center justify-center py-4">
              <Heart className="h-6 w-6 text-sidebar-foreground" />
            </div>
          )}
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider">
            Navegação
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="mb-2 flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-sidebar-accent flex items-center justify-center overflow-hidden">
              {profile?.foto_url ? (
                <img src={profile.foto_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs font-semibold text-sidebar-foreground/80">
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
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {profile?.nome_completo || user?.email}
              </p>
              <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wider bg-sidebar-accent text-sidebar-foreground/80 px-2 py-0.5 rounded">
                {role ? roleLabels[role] : ""}
              </span>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center mb-2">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center overflow-hidden">
              {profile?.foto_url ? (
                <img src={profile.foto_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-4 w-4 text-sidebar-foreground/80" />
              )}
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {!collapsed && "Sair"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
