"use client";

/**
 * AgencyOS — sign-in view.
 * Premium centered card over the burgundy-tinted background. Posts directly
 * to /api/auth/login and parses the { ok, data } / { ok, error } envelope.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SessionUser } from "@/components/agency/store";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginView({ onSuccess }: { onSuccess: (user: SessionUser) => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { user?: SessionUser } | SessionUser;
        error?: { message?: string };
      };
      // The API returns the SessionUser flat in `data`; accept a nested
      // { user } shape too, defensively.
      const user =
        json.data && typeof json.data === "object" && "user" in json.data
          ? (json.data as { user?: SessionUser }).user
          : (json.data as SessionUser | undefined);
      if (!res.ok || !json.ok || !user) {
        setServerError(json.error?.message || "Invalid email or password.");
        return;
      }
      onSuccess(user);
    } catch {
      setServerError("Could not reach the server. Check your connection and try again.");
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Subtle burgundy radial accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(900px 480px at 50% -10%, oklch(0.42 0.104 22 / 0.08), transparent 65%)",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="rounded-xl border bg-card p-6 shadow-xs sm:p-8">
          {/* Brand */}
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary">
              { }
              <img src="/logo.svg" alt="" className="size-6" />
            </span>
            <div>
              <p className="text-lg font-semibold tracking-tight">AgencyOS</p>
              <p className="text-sm text-muted-foreground">Agency Operations Platform</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {serverError ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@agency.local"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Sign in
            </Button>
          </form>
        </div>

        {/* Honest first-run hint — no fake features, just the seeded owner. */}
        <div className="mt-4 rounded-lg border bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">First run?</span> Sign in with{" "}
          <span className="font-mono">owner@agencyos.local</span> /{" "}
          <span className="font-mono">AgencyOS2024!</span> — change the password in Settings.
        </div>
      </div>
    </div>
  );
}
