import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type UserRole = "admin" | "funcionario";

export interface Profile {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
}

interface AuthCtx {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  signIn: (email: string, senha: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setSession(data.session);
      if (!data.session) setIsLoading(false);
    });

    const { data: assinatura } = supabase.auth.onAuthStateChange((_event, proximaSessao) => {
      if (!ativo) return;
      setSession(proximaSessao);
      if (!proximaSessao) {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => {
      ativo = false;
      assinatura.subscription.unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    if (!session) return;
    let ativo = true;
    setIsLoading(true);

    supabase
      .from("profiles")
      .select("id, nome, email, role")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!ativo) return;
        setProfile(error ? null : (data as Profile));
        setIsLoading(false);
      });

    return () => {
      ativo = false;
    };
  }, [session]);

  const signIn = React.useCallback(async (email: string, senha: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return error ? { error: error.message } : {};
  }, []);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = React.useMemo<AuthCtx>(
    () => ({
      session,
      profile,
      isLoading,
      isAdmin: profile?.role === "admin",
      signIn,
      signOut,
    }),
    [session, profile, isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
