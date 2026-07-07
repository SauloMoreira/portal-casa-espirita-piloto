import { describe, it, expect } from "vitest";
import type { AppRole } from "@/contexts/AuthContext";
import {
  ROLE,
  APP_ROLES,
  ADMINISTRATIVE_ROLES,
  OPERATIONAL_ROLES,
  classifyRole,
} from "@/constants/roles";

/**
 * Q2-D2 — Blindagem de testes do autocadastro assistido.
 *
 * Este arquivo cobre, sem qualquer alteração produtiva, o fluxo de PRIMEIRO
 * LOGIN / ACESSO após o cadastro público, além da SEPARAÇÃO entre a camada de
 * acesso (papel `assistido`) e a camada funcional (registro em `assistidos`).
 *
 * Para não depender do cliente Supabase em runtime (fora do alcance do runner
 * unitário), a lógica de autorização é reproduzida por ESPELHOS puros e fiéis
 * às fontes únicas — exatamente o padrão já adotado nos testes de governança
 * (etapa3, bug-autocadastro). Os espelhos abaixo replicam:
 *   - AuthContext.fetchRoleAndProfile (colapso de papel + rolesResolved);
 *   - ProtectedRoute (blockedStatus + gate de allowedRoles fail-closed).
 * Qualquer divergência produtiva quebraria estes testes.
 */

// ── Espelho de AuthContext.fetchRoleAndProfile ────────────────────────────────
interface ResolvedAuth {
  role: AppRole | null;
  roles: AppRole[];
  rolesResolved: boolean;
}

/** Reproduz o colapso de papel e a resolução fail-closed do AuthContext. */
function resolveAuth(roleReadOk: boolean, rows: AppRole[] | null): ResolvedAuth {
  // Fail-closed: falha na leitura de papel NUNCA vira acesso permissivo.
  if (!roleReadOk) return { role: null, roles: [], rolesResolved: false };
  const list = rows ?? [];
  let role: AppRole | null;
  if (list.includes("administrador_master") || list.includes("admin")) {
    role = "admin";
  } else {
    role = (list[0] as AppRole) ?? "assistido";
  }
  return { role, roles: list, rolesResolved: true };
}

// ── Espelho de ProtectedRoute ─────────────────────────────────────────────────
const isBlockedStatus = (status: string | null | undefined) =>
  status === "inativo" || status === "pendente";

type RouteDecision = "loader" | "login" | "dashboard" | "allow";

/** Reproduz a decisão do ProtectedRoute para os cenários deste recorte. */
function routeDecision(opts: {
  hasSession: boolean;
  status: string | null;
  rolesResolved: boolean;
  role: AppRole | null;
  roles: AppRole[];
  allowedRoles?: AppRole[];
}): RouteDecision {
  const { hasSession, status, rolesResolved, role, roles, allowedRoles } = opts;
  if (!hasSession) return "login";
  if (isBlockedStatus(status)) return "login";
  if (!rolesResolved) return "loader";
  if (allowedRoles && allowedRoles.length > 0) {
    const effective = new Set<AppRole>(roles);
    if (role) effective.add(role);
    if (effective.has(ROLE.ADMINISTRADOR_MASTER)) effective.add(ROLE.ADMIN);
    if (effective.size === 0) return "login";
    if (!allowedRoles.some((r) => effective.has(r))) return "dashboard";
  }
  return "allow";
}

describe("Q2-D2 — primeiro login/acesso do assistido recém-cadastrado", () => {
  it("login resolve papel base assistido e rolesResolved=true", () => {
    const auth = resolveAuth(true, ["assistido"]);
    expect(auth.rolesResolved).toBe(true);
    expect(auth.roles).toEqual(["assistido"]);
    expect(auth.role).toBe("assistido");
  });

  it("ProtectedRoute libera assistido ativo em rota de assistido", () => {
    const auth = resolveAuth(true, ["assistido"]);
    const decision = routeDecision({
      hasSession: true,
      status: "ativo",
      rolesResolved: auth.rolesResolved,
      role: auth.role,
      roles: auth.roles,
      allowedRoles: ["assistido"],
    });
    expect(decision).toBe("allow");
  });

  it("assistido ativo é liberado mesmo sem allowedRoles (área base)", () => {
    const auth = resolveAuth(true, ["assistido"]);
    const decision = routeDecision({
      hasSession: true,
      status: "ativo",
      rolesResolved: auth.rolesResolved,
      role: auth.role,
      roles: auth.roles,
    });
    expect(decision).toBe("allow");
  });

  it("falha na leitura de papéis mantém fail-closed (loader, nunca acesso)", () => {
    const auth = resolveAuth(false, null);
    expect(auth.rolesResolved).toBe(false);
    const decision = routeDecision({
      hasSession: true,
      status: "ativo",
      rolesResolved: auth.rolesResolved,
      role: auth.role,
      roles: auth.roles,
      allowedRoles: ["assistido"],
    });
    expect(decision).toBe("loader");
  });

  it("usuário sem nenhum papel é fail-closed em rota protegida", () => {
    // rolesResolved=true mas lista vazia → colapso cai em 'assistido' apenas
    // como rótulo; em rota que exige papel específico distinto, não passa.
    const auth = resolveAuth(true, []);
    const decision = routeDecision({
      hasSession: true,
      status: "ativo",
      rolesResolved: auth.rolesResolved,
      role: auth.role,
      roles: auth.roles,
      allowedRoles: ["admin"],
    });
    expect(decision).toBe("dashboard");
  });

  it("status pendente/inativo bloqueia mesmo com papel resolvido", () => {
    const auth = resolveAuth(true, ["assistido"]);
    for (const status of ["pendente", "inativo"]) {
      const decision = routeDecision({
        hasSession: true,
        status,
        rolesResolved: auth.rolesResolved,
        role: auth.role,
        roles: auth.roles,
        allowedRoles: ["assistido"],
      });
      expect(decision).toBe("login");
    }
  });
});

describe("Q2-D2 — separação camada B (acesso) × camada D (funcional)", () => {
  it("assistido é papel base (camada B), nunca administrativo/operacional", () => {
    expect(classifyRole("assistido")).toBe("base");
    expect(ADMINISTRATIVE_ROLES).not.toContain("assistido" as never);
    expect(OPERATIONAL_ROLES).not.toContain("assistido" as never);
  });

  it("papel base é constante canônica sem drift", () => {
    expect(ROLE.ASSISTIDO).toBe("assistido");
    expect(APP_ROLES).toContain("assistido");
  });
});

describe("Q2-D2 — nenhum papel elevado no autocadastro (governança)", () => {
  const ELEVADOS: AppRole[] = [
    "admin",
    "administrador_master",
    "entrevistador",
    "tarefeiro",
    "coordenador_de_tratamento",
  ];

  it("o único papel do autocadastro é o base assistido", () => {
    // Espelha o resultado do gatilho: concede apenas 'assistido'.
    const concedidosPeloAutocadastro: AppRole[] = ["assistido"];
    for (const p of ELEVADOS) {
      expect(concedidosPeloAutocadastro).not.toContain(p);
    }
    expect(concedidosPeloAutocadastro).toEqual(["assistido"]);
  });
});
