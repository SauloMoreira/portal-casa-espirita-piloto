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
      if (roleRes.ok) {
        const rows = await roleRes.json();
        const list = (rows ?? []).map((r: any) => r.role as AppRole);
        setRoles(list);
        // Master holds both 'administrador_master' and 'admin'; collapse any
        // administrative role to 'admin' so existing route guards keep working.
        if (list.includes("administrador_master") || list.includes("admin")) {
          setRole("admin");
        } else {
          setRole((list[0] as AppRole) ?? "assistido");
        }
      } else {
        setRoles([]);
        setRole("assistido");
      }
      if (profileRes.ok) {
        const rows = await profileRes.json();
        setProfile(rows?.[0] ?? null);
      }
    } catch {
      setRoles([]);
      setRole("assistido");
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
  };

  const isMaster = roles.includes("administrador_master");

  return (
    <AuthContext.Provider value={{ session, user, role, roles, isMaster, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
