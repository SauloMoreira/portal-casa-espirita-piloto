import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "administrador_master" | "entrevistador" | "tarefeiro" | "assistido" | "coordenador_de_tratamento";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface UserProfile {
  nome_completo: string | null;
  foto_url: string | null;
  senha_temporaria: boolean | null;
  status: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  roles: AppRole[];
  isMaster: boolean;
  profile: UserProfile | null;
  loading: boolean;
  /** True only once role/profile resolution has SUCCEEDED. While false, protected
   *  UI must stay closed instead of assuming a permissive default role. */
  rolesResolved: boolean;
  /** True when the account has a verified second factor but the current session
   *  is still aal1 — i.e. the TOTP step must be completed before access. */
  mfaPending: boolean;
  /** Re-evaluate the assurance level (call after completing/disabling MFA). */
  refreshMfa: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);
  // Fail-closed authorization state: only true once role/profile resolution
  // has SUCCEEDED. A read failure must never collapse into a permissive role.
  const [rolesResolved, setRolesResolved] = useState(false);

  const refreshMfa = async () => {
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setMfaPending(data?.currentLevel === "aal1" && data?.nextLevel === "aal2");
    } catch {
      setMfaPending(false);
    }
  };

  const fetchRoleAndProfile = async (userId: string, accessToken: string) => {
    try {
      const [roleRes, profileRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}&select=role`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}&select=nome_completo,foto_url,senha_temporaria,status&limit=1`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
        }),
      ]);
      // Fail-closed: if the role read itself fails we MUST NOT grant any access.
      // Treat it as unresolved (no role) rather than defaulting to "assistido".
      if (!roleRes.ok) {
        setRoles([]);
        setRole(null);
        setRolesResolved(false);
        return;
      }
      const rows = (await roleRes.json()) as Array<{ role: AppRole }> | null;
      const list = (rows ?? []).map((r) => r.role);
      setRoles(list);
      // Master holds both 'administrador_master' and 'admin'; collapse any
      // administrative role to 'admin' so existing route guards keep working.
      // Priority order guarantees operational roles override the base 'assistido'
      // when a user accumulates both (e.g. volunteer/tarefeiro who is also
      // an auto-created assistido). Without this, list order from the API is
      // undefined and can pin the effective role to 'assistido' after a grant.
      const priority: AppRole[] = [
        "admin",
        "coordenador_de_tratamento",
        "entrevistador",
        "tarefeiro",
        "assistido",
      ];
      if (list.includes("administrador_master") || list.includes("admin")) {
        setRole("admin");
      } else {
        const effective = priority.find((r) => list.includes(r));
        setRole(effective ?? (list[0] as AppRole) ?? "assistido");
      }
      if (profileRes.ok) {
        const profileRows = (await profileRes.json()) as UserProfile[] | null;
        setProfile(profileRows?.[0] ?? null);
      }
      // Role read succeeded → authorization is now validly resolved.
      setRolesResolved(true);
    } catch {
      // Network/parse failure: stay fail-closed (no permissive fallback).
      setRoles([]);
      setRole(null);
      setRolesResolved(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user && session.access_token) {
          await fetchRoleAndProfile(session.user.id, session.access_token);
          // Defer AAL lookup to avoid deadlocks inside the auth callback.
          setTimeout(() => { refreshMfa(); }, 0);
        } else {
          setRole(null);
          setRoles([]);
          setRolesResolved(false);
          setMfaPending(false);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user && session.access_token) {
        fetchRoleAndProfile(session.user.id, session.access_token);
        refreshMfa();
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setRoles([]);
    setProfile(null);
    setRolesResolved(false);
    setMfaPending(false);
  };

  const isMaster = roles.includes("administrador_master");

  return (
    <AuthContext.Provider value={{ session, user, role, roles, isMaster, profile, loading, rolesResolved, mfaPending, refreshMfa, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
