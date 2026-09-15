import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase, configured } from "../lib/supabase";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: true },
  },
});
const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
}>({ session: null, loading: true });
export const useAuth = () => useContext(AuthContext);
export function Providers({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(configured);
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((event, current) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        void queryClient.cancelQueries();
        queryClient.clear();
      }
      setSession(current);
      setLoading(false);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ session, loading }}>
        {children}
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
