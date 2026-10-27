"use client";

/**
 * AgencyOS — Settings › Profile & Security tab (task 4-c).
 * Profile card (displayName/email -> PATCH /api/auth/profile, updates the
 * auth store), Change password card (POST /api/auth/password with the same
 * policy as the server) and a session info block with Sign out.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Loader2, LogOut, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiFetch, label } from "@/lib/types";
import { useAppStore, type SessionUser } from "@/components/agency/store";

const PASSWORD_POLICY =
  "At least 8 characters and include a letter and a number.";

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be 2-80 characters.")
    .max(80, "Display name must be 2-80 characters."),
  email: z.email("Enter a valid email address."),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, PASSWORD_POLICY)
      .regex(/[A-Za-z]/, PASSWORD_POLICY)
      .regex(/[0-9]/, PASSWORD_POLICY),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

export function ProfileSecurity() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileCard user={user} setUser={setUser} />
        <PasswordCard />
      </div>
      <SessionBlock user={user} setUser={setUser} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function ProfileCard({
  user,
  setUser,
}: {
  user: SessionUser;
  setUser: (user: SessionUser) => void;
}) {
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user.displayName, email: user.email },
  });

  const saveMutation = useMutation({
    mutationFn: (values: ProfileFormValues) =>
      apiFetch<SessionUser>("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: values.displayName.trim(), email: values.email }),
      }),
    onSuccess: (updated) => {
      // Keep the shell (avatar, name, topbar) in sync immediately.
      setUser(updated);
      toast.success("Profile updated");
      form.reset({ displayName: updated.displayName, email: updated.email });
    },
    onError: (error: Error) => {
      // 409 CONFLICT ("email already in use") and validation errors surface here.
      toast.error(error.message || "Could not update the profile.");
      for (const issue of (error as Error & { issues?: { path: string; message: string }[] }).issues ?? []) {
        if (issue.path === "displayName" || issue.path === "email") {
          form.setError(issue.path, { message: issue.message });
        }
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRound aria-hidden className="size-4 text-muted-foreground" />
          Profile
        </CardTitle>
        <CardDescription>Your account name and sign-in email.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="profile-display-name">Display name</Label>
            <Input
              id="profile-display-name"
              autoComplete="name"
              aria-invalid={!!form.formState.errors.displayName}
              {...form.register("displayName")}
            />
            {form.formState.errors.displayName ? (
              <p className="text-xs text-destructive">{form.formState.errors.displayName.message}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              aria-invalid={!!form.formState.errors.email}
              {...form.register("email")}
            />
            {form.formState.errors.email ? (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Save aria-hidden />
              )}
              Save profile
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

function PasswordCard() {
  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const changeMutation = useMutation({
    mutationFn: (values: PasswordFormValues) =>
      apiFetch<Record<string, never>>("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      }),
    onSuccess: () => {
      toast.success("Password updated");
      form.reset();
    },
    onError: (error: Error) => {
      // e.g. 400 "Current password is incorrect."
      toast.error(error.message || "Could not change the password.");
      for (const issue of (error as Error & { issues?: { path: string; message: string }[] }).issues ?? []) {
        if (
          issue.path === "currentPassword" ||
          issue.path === "newPassword" ||
          issue.path === "confirmPassword"
        ) {
          form.setError(issue.path, { message: issue.message });
        }
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound aria-hidden className="size-4 text-muted-foreground" />
          Change password
        </CardTitle>
        <CardDescription>{PASSWORD_POLICY}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit((values) => changeMutation.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="password-current">Current password</Label>
            <Input
              id="password-current"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!form.formState.errors.currentPassword}
              {...form.register("currentPassword")}
            />
            {form.formState.errors.currentPassword ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.currentPassword.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="password-new">New password</Label>
              <Input
                id="password-new"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!form.formState.errors.newPassword}
                {...form.register("newPassword")}
              />
              {form.formState.errors.newPassword ? (
                <p className="text-xs text-destructive">{form.formState.errors.newPassword.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password-confirm">Confirm new password</Label>
              <Input
                id="password-confirm"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!form.formState.errors.confirmPassword}
                {...form.register("confirmPassword")}
              />
              {form.formState.errors.confirmPassword ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.confirmPassword.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={changeMutation.isPending}>
              {changeMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Session block
// ---------------------------------------------------------------------------

function SessionBlock({
  user,
  setUser,
}: {
  user: SessionUser;
  setUser: (user: SessionUser | null) => void;
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      setUser(null); // returns to the login gate
    } catch {
      toast.error("Could not sign out", { description: "Please try again." });
      setSigningOut(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">Session</p>
        <p className="truncate text-xs text-muted-foreground">
          Signed in as {user.email} · {label(user.role)}
        </p>
      </div>
      <Button variant="outline" onClick={() => void signOut()} disabled={signingOut}>
        {signingOut ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <LogOut aria-hidden />}
        Sign out
      </Button>
    </div>
  );
}
