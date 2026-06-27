import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ROLE_LABELS,
  ROLE_CLASS_LABELS,
  groupRolesByClass,
  type RoleClass,
} from "@/constants/roles";

/**
 * Read-only display of a person's cumulative roles, separated into the three
 * access classes (base / operacional / administrativo). Purely presentational —
 * role management happens exclusively in Gestão de Acesso.
 */

type Variant = "default" | "secondary" | "outline" | "destructive";

const CLASS_BADGE: Record<RoleClass, Variant> = {
  base: "outline",
  operacional: "secondary",
  administrativo: "default",
};

const CLASS_ICON: Record<RoleClass, typeof User> = {
  base: User,
  operacional: Shield,
  administrativo: ShieldCheck,
};

const CLASS_ORDER: RoleClass[] = ["administrativo", "operacional", "base"];

interface Props {
  roles: string[];
  /** When true, shows the class label above each group (used in forms). */
  showGroupLabels?: boolean;
  className?: string;
}

export function UserRolesBadges({ roles, showGroupLabels = false, className }: Props) {
  const groups = groupRolesByClass(roles);
  const activeClasses = CLASS_ORDER.filter((c) => groups[c].length > 0);

  if (activeClasses.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  if (showGroupLabels) {
    return (
      <div className={cn("space-y-2", className)}>
        {activeClasses.map((c) => (
          <div key={c} className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {ROLE_CLASS_LABELS[c]}
            </p>
            <div className="flex flex-wrap gap-1">
              {groups[c].map((r) => {
                const Icon = CLASS_ICON[c];
                return (
                  <Badge key={r} variant={CLASS_BADGE[c]} className="gap-1">
                    <Icon className="h-3 w-3" />
                    {ROLE_LABELS[r] ?? r}
                  </Badge>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {activeClasses.map((c) =>
        groups[c].map((r) => {
          const Icon = CLASS_ICON[c];
          return (
            <Badge
              key={r}
              variant={CLASS_BADGE[c]}
              className="gap-1"
              title={ROLE_CLASS_LABELS[c]}
            >
              <Icon className="h-3 w-3" />
              {ROLE_LABELS[r] ?? r}
            </Badge>
          );
        }),
      )}
    </div>
  );
}
