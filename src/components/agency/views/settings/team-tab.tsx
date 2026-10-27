"use client";

/**
 * AgencyOS — Settings → Team tab (Phase 5, spec §1A/§9).
 * FOUNDER-ONLY: staff account management — create, change roles, suspend /
 * reactivate, reset passwords. Escalation guards live server-side (single
 * founder, no self-role-change, no OWNER grants); this tab mirrors the rules
 * in its disabled states and reports the API's reasons on failure.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pause, Play, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { useAppStore } from "@/components/agency/store";
import { apiFetch, label, type UserRecord } from "@/lib/types";
import { formatDate } from "@/lib/format";

const STAFF_ROLES = ["CLIENT_MANAGER", "WEB_DEVELOPER", "SUPPORT_FINANCE"] as const;

function apiMessage(err: unknown): string {
  const anyErr = err as { message?: string; error?: { message?: string } };
  return anyErr?.error?.message ?? anyErr?.message ?? "Something went wrong.";
}

export function TeamTab() {
  const queryClient = useQueryClient();
  const me = useAppStore((s) => s.user);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRecord | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<UserRecord | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserRecord | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", "team"],
    queryFn: () => apiFetch<UserRecord[]>("/api/users"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["users"] });
    void queryClient.invalidateQueries({ queryKey: ["users", "team"] });
  };

  const patchUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch<UserRecord>(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("Staff account updated");
      invalidate();
      setEditTarget(null);
      setPasswordTarget(null);
      setSuspendTarget(null);
    },
    onError: (err: Error) => toast.error("Update rejected", { description: apiMessage(err) }),
  });

  const rows = usersQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Team &amp; roles</h3>
          <p className="text-xs text-muted-foreground">
            Create staff accounts and assign roles. Only the founder can manage accounts; role changes are
            audit-logged. There is exactly one founder account (yours).
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <UserPlus aria-hidden className="size-4" />
          Add staff
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Last login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Loading team…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No accounts yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((u) => {
                const isSelf = u.id === me?.id;
                const isFounder = u.role === "OWNER";
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <span className="font-medium">{u.displayName}</span>
                      {isSelf ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={isFounder ? "default" : "outline"}>{label(u.role)}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={u.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!isSelf ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => setEditTarget(u)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setPasswordTarget(u)}>
                              <KeyRound aria-hidden className="size-3.5" />
                              Password
                            </Button>
                            {!isFounder ? (
                              u.status === "ACTIVE" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1.5 text-destructive hover:text-destructive"
                                  onClick={() => setSuspendTarget(u)}
                                >
                                  <Pause aria-hidden className="size-3.5" />
                                  Suspend
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={() => patchUser.mutate({ id: u.id, body: { status: "ACTIVE" } })}
                                  disabled={patchUser.isPending}
                                >
                                  <Play aria-hidden className="size-3.5" />
                                  Reactivate
                                </Button>
                              )
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Founder account</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create staff */}
      <CreateStaffDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={invalidate} />

      {/* Edit (name + role) */}
      {editTarget ? (
        <EditStaffDialog
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(body) => patchUser.mutate({ id: editTarget.id, body })}
          busy={patchUser.isPending}
        />
      ) : null}

      {/* Reset password */}
      {passwordTarget ? (
        <ResetPasswordDialog
          target={passwordTarget}
          onClose={() => setPasswordTarget(null)}
          onSave={(password) => patchUser.mutate({ id: passwordTarget.id, body: { password } })}
          busy={patchUser.isPending}
        />
      ) : null}

      {/* Suspend confirmation */}
      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={(o) => !o && setSuspendTarget(null)}
        title={`Suspend ${suspendTarget?.displayName ?? "this account"}?`}
        description="Suspended staff cannot sign in. Their records and assignments are kept. Reactivate any time."
        confirmLabel="Suspend account"
        destructive
        onConfirm={() => {
          if (suspendTarget) patchUser.mutate({ id: suspendTarget.id, body: { status: "SUSPENDED" } });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function CreateStaffDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<string>("CLIENT_MANAGER");
  const [password, setPassword] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiFetch<UserRecord>("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), displayName: displayName.trim(), role, password }),
      }),
    onSuccess: (u) => {
      toast.success(`Account created for ${u.displayName} (${label(u.role)})`);
      onSaved();
      onOpenChange(false);
      setEmail("");
      setDisplayName("");
      setPassword("");
      setRole("CLIENT_MANAGER");
    },
    onError: (err: Error) => toast.error("Could not create the account", { description: apiMessage(err) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add staff account</DialogTitle>
          <DialogDescription>
            The staff member signs in with this email and password. Roles follow the least-privilege matrix;
            there can only be one founder account.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="staff-name">Full name</Label>
            <Input id="staff-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Sarah Miller" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="staff-email">Email</Label>
            <Input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sarah@agencyos.local" />
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {label(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="staff-password">Temporary password</Label>
            <Input id="staff-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 10 characters" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !email.trim() || displayName.trim().length < 2 || password.length < 10}
          >
            {create.isPending ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStaffDialog({
  target,
  onClose,
  onSave,
  busy,
}: {
  target: UserRecord;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const me = useAppStore((s) => s.user);
  const [displayName, setDisplayName] = useState(target.displayName);
  const [role, setRole] = useState(target.role);
  const isSelf = target.id === me?.id;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {target.displayName}</DialogTitle>
          <DialogDescription>
            {isSelf
              ? "You cannot change your own role — ask… actually, only another founder could, and there is only one founder account."
              : "Role changes are audit-logged and take effect at the next API call."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-name">Full name</Label>
            <Input id="edit-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            {isSelf ? (
              <Input value={label(target.role)} disabled aria-label="Your role (locked)" />
            ) : target.role === "OWNER" ? (
              <Input value={label(target.role)} disabled aria-label="Founder role (locked)" />
            ) : (
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {label(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const body: Record<string, unknown> = {};
              if (displayName.trim() && displayName.trim() !== target.displayName) body.displayName = displayName.trim();
              if (!isSelf && target.role !== "OWNER" && role !== target.role) body.role = role;
              if (Object.keys(body).length === 0) {
                onClose();
                return;
              }
              onSave(body);
            }}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  target,
  onClose,
  onSave,
  busy,
}: {
  target: UserRecord;
  onClose: () => void;
  onSave: (password: string) => void;
  busy: boolean;
}) {
  const [password, setPassword] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password — {target.displayName}</DialogTitle>
          <DialogDescription>
            Share the new password with {target.displayName} over a trusted channel. Passwords are hashed and
            never logged.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 10 characters"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onSave(password)} disabled={busy || password.length < 10}>
            {busy ? "Saving…" : "Set password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
