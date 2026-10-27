"use client";

/**
 * AgencyOS — application root (client).
 * Auth gate: /api/auth/me on mount -> splash -> login -> shell + toaster.
 * Also owns the single QueryClient used by every view, plus the one-time
 * OAuth landing toast (?oauth=connected|error after the Gmail callback).
 */
import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { apiFetch } from "@/lib/types";
import { useAppStore, type SessionUser } from "@/components/agency/store";
import { AppShell } from "@/components/agency/shell/app-shell";
import { LoginView } from "@/components/agency/login-view";

/**
 * Module-level guard (NOT store state): the OAuth landing toast fires exactly
 * once per page load, regardless of React re-mounts or StrictMode.
 */
let oauthToastShown = false;

/** Human-readable copy for the OAuth callback error reasons. */
function oauthReasonText(reason: string | null): string {
  switch (reason) {
    case "auth_required":
      return "Sign in as the agency owner first.";
    case "state_mismatch":
      return "The connection attempt could not be verified (state mismatch). Please try Connect again.";
    case "denied":
    case "access_denied":
      return "Authorisation was denied at Google.";
    default:
      return "The OAuth callback reported an error.";
  }
}

export function AppRoot() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 15_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const user = useAppStore((s) => s.user);
  const authChecked = useAppStore((s) => s.authChecked);
  const setUser = useAppStore((s) => s.setUser);
  const setAuthChecked = useAppStore((s) => s.setAuthChecked);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ user: SessionUser | null }>("/api/auth/me")
      .then((data) => {
        if (!cancelled) setUser(data.user ?? null);
      })
      .catch(() => {
        // Treat any failure (404, network, bad envelope) as signed out.
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setUser, setAuthChecked]);

  // One-time OAuth landing handling: toast the callback outcome, then strip
  // the oauth/reason params from the URL. Guarded by the module flag so it
  // runs exactly once per page load; waits for the session so the Toaster is
  // mounted before the toast is shown.
  useEffect(() => {
    if (oauthToastShown || !user) return;
    const search = new URLSearchParams(window.location.search);
    const oauth = search.get("oauth");
    // Nothing to do on this page load — mark as handled forever.
    if (!oauth) {
      oauthToastShown = true;
      return;
    }

    // Clean the URL immediately (keep the path and any unrelated params).
    const reason = search.get("reason");
    search.delete("oauth");
    search.delete("reason");
    const remaining = search.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${remaining ? `?${remaining}` : ""}${window.location.hash}`,
    );

    oauthToastShown = true;
    if (oauth === "connected") {
      toast.success("Gmail connected — the mailbox is now syncing.");
    } else {
      toast.error("Gmail connection failed", {
        description: oauthReasonText(reason),
      });
    }
  }, [user]);

  return (
    <QueryClientProvider client={queryClient}>
      {!authChecked ? (
        <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background">
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">AgencyOS</span>
        </div>
      ) : !user ? (
        <LoginView onSuccess={setUser} />
      ) : (
        <>
          <AppShell />
          <Toaster position="top-right" richColors />
        </>
      )}
    </QueryClientProvider>
  );
}
