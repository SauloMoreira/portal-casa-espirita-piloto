import type { AppRole } from "@/contexts/AuthContext";

export type { AppRole };

/** All application roles as a const tuple (single source of truth). */
export const APP_ROLES = [
  "admin",
  "administrador_master",
  "entrevistador",
  "tarefeiro",
  "assistido",
  "coordenador_de_tratamento",
] as const;

/**
 * Canonical single-role identifiers. These are presentation/consumer-level
 * constants that mirror the `app_role` enum values exactly. Using them instead
 * of bare string literals removes drift risk in route/menu/view logic.
 *
 * IMPORTANT: these are NOT authorization boundaries. The effective security
 * guards remain in the backend (RLS / SECURITY DEFINER / RPC). Substituting a
 * literal for one of these constants is a behavior-identical refactor only.
 */
export const ROLE = {
  ADMIN: "admin",
  ADMINISTRADOR_MASTER: "administrador_master",
  ENTREVISTADOR: "entrevistador",
  TAREFEIRO: "tarefeiro",
  ASSISTIDO: "assistido",
  COORDENADOR_DE_TRATAMENTO: "coordenador_de_tratamento",
} as const satisfies Record<string, AppRole>;

/** Managerial view roles (admin + coordenador) — presentation-only grouping. */
export const GERENCIAL_ROLES: AppRole[] = ["admin", "coordenador_de_tratamento"];

/** Human-readable labels for each role. */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  administrador_master: "Administrador Master",
  entrevistador: "Entrevistador",
  tarefeiro: "Tarefeiro",
  assistido: "Assistido",
  coordenador_de_tratamento: "Coordenador de Tratamento",
};

/**
 * Roles that may be assigned directly through the user form. Administrative
 * roles are intentionally excluded: they can only be granted via the
 * approval-gated promotion workflow (Governança de Acessos).
 */
export const ASSIGNABLE_ROLES = [
  "entrevistador",
  "tarefeiro",
  "assistido",
  "coordenador_de_tratamento",
] as const;

/** Convenience groups frequently reused across route guards and menus. */
export const ALL_ROLES: AppRole[] = [...APP_ROLES];
export const STAFF_ROLES: AppRole[] = [
  "admin",
  "entrevistador",
  "tarefeiro",
  "coordenador_de_tratamento",
];
export const ATENDIMENTO_ROLES: AppRole[] = ["admin", "entrevistador"];
export const PRESENCA_ROLES: AppRole[] = ["admin", "tarefeiro"];
export const ADMIN_ONLY: AppRole[] = ["admin"];

export const getRoleLabel = (role?: AppRole | null): string =>
  role ? ROLE_LABELS[role] ?? role : "";

/**
 * Role access classification — the three layers surfaced read-only in the user
 * screen. "Acesso" (system permission) is split into:
 *  - base: the automatic `assistido` role every person is born with
 *  - operacional: operational roles managed in Gestão de Acesso
 *  - administrativo: administrative roles managed via the approval-gated flow
 *
 * This is a presentation-only grouping. Manual role management lives exclusively
 * in Gestão de Acesso (INV-ACC-GOV-001 / INV-ACC-NOCROSS-001).
 */
export type RoleClass = "base" | "operacional" | "administrativo";

export const OPERATIONAL_ROLES: AppRole[] = [
  "entrevistador",
  "tarefeiro",
  "coordenador_de_tratamento",
];

export const ADMINISTRATIVE_ROLES: AppRole[] = ["admin", "administrador_master"];

export const ROLE_CLASS_LABELS: Record<RoleClass, string> = {
  base: "Acesso base",
  operacional: "Acessos operacionais",
  administrativo: "Acessos administrativos",
};

export const classifyRole = (role: AppRole | string): RoleClass => {
  if (role === "assistido") return "base";
  if ((ADMINISTRATIVE_ROLES as string[]).includes(role)) return "administrativo";
  return "operacional";
};

/** Group an array of cumulative roles by access class, preserving input order. */
export const groupRolesByClass = (
  roles: (AppRole | string)[],
): Record<RoleClass, string[]> => {
  const groups: Record<RoleClass, string[]> = {
    base: [],
    operacional: [],
    administrativo: [],
  };
  for (const r of roles) groups[classifyRole(r)].push(r);
  return groups;
};
