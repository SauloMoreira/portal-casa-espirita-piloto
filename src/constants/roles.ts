import type { AppRole } from "@/contexts/AuthContext";

export type { AppRole };

/** All application roles as a const tuple (single source of truth). */
export const APP_ROLES = [
  "admin",
  "entrevistador",
  "tarefeiro",
  "assistido",
  "coordenador_de_tratamento",
] as const;

/** Human-readable labels for each role. */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  entrevistador: "Entrevistador",
  tarefeiro: "Tarefeiro",
  assistido: "Assistido",
  coordenador_de_tratamento: "Coordenador de Tratamento",
};

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
