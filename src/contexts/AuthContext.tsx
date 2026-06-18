import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "entrevistador" | "tarefeiro" | "assistido" | "coordenador_de_tratamento";

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
  profile: UserProfile | null;
  loading: boolean;
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRoleAndProfile = async (userId: string, accessToken: string) => {
    try {
      const [roleRes, profileRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}&select=role&limit=1`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}&select=nome_completo,foto_url,senha_temporaria&limit=1`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
        }),
      ]);
      if (roleRes.ok) {
        const rows = await roleRes.json();
        setRole((rows?.[0]?.role as AppRole) ?? "assistido");
      } else {
        setRole("assistido");
      }
      if (profileRes.ok) {
        const rows = await profileRes.json();
        setProfile(rows?.[0] ?? null);
      }
    } catch {
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
        } else {
          setRole(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user && session.access_token) {
        fetchRoleAndProfile(session.user.id, session.access_token);
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
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
