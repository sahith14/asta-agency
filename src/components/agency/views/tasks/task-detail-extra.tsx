"use client";

/**
 * AgencyOS — Phase 5 task detail panels (workflow, checklist, evidence,
 * comments). Rendered inside the task drawer between the description and the
 * link details.
 *
 * Server rules mirrored for UX only — the API remains the enforcement layer:
 *  - transitions come from task.allowedTransitions (TASK_TRANSITIONS)
 *  - APPROVED is founder-only (rendered for OWNER sessions)
 *  - completion requires recorded evidence (note or document)
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Loader2, MessageSquarePlus, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/agency/shared/status-badge";
import { apiFetch, label, type TaskCommentRecord, type TaskRecord } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { useAppStore } from "@/components/agency/store";

// ---------------------------------------------------------------------------
// Workflow panel — transitions + developer fields
// ---------------------------------------------------------------------------

export function TaskWorkflowPanel({
  task,
  busy,
  onStatusChange,
  onPatch,
}: {
  task: TaskRecord;
  busy: boolean;
  onStatusChange: (status: string) => void;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const user = useAppStore((s) => s.user);
  const isFounder = user?.role === "OWNER";
  const allowed = task.allowedTransitions ?? [];
  const evidencePresent =
    (task.evidenceNote != null && task.evidenceNote.trim() !== "") || task.evidenceDocumentId != null;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Workflow</p>
        <span className="text-[11px] text-muted-foreground">
          {label(task.source ?? "FOUNDER_REQUEST")} · {label(task.scopeStatus ?? "IN_SCOPE")}
          {task.subscriptionAllowanceIncluded ? " · in allowance" : ""}
          {task.estimatedMinutes != null ? ` · ~${task.estimatedMinutes} min` : ""}
        </span>
      </div>

      {/* Transition buttons — real workflow moves, validated server-side */}
      <div className="flex flex-wrap gap-1.5">
        {allowed.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {task.status === "CANCELLED"
              ? "This task was cancelled."
              : "No transitions available from this state."}
          </p>
        ) : (
          allowed.map((target) => {
            const founderOnly = target === "APPROVED";
            if (founderOnly && !isFounder) {
              return (
                <Badge key={target} variant="outline" className="gap-1 font-normal text-muted-foreground">
                  <ArrowRight aria-hidden className="size-3" />
                  {label(target)} — founder only
                </Badge>
              );
            }
            return (
              <Button
                key={target}
                type="button"
                size="sm"
                variant={target === "COMPLETED" || target === "APPROVED" ? "default" : "outline"}
                className="gap-1.5"
                disabled={busy}
                onClick={() => onStatusChange(target)}
              >
                <ArrowRight aria-hidden className="size-3.5" />
                {target === "COMPLETED" ? "Mark complete" : label(target)}
              </Button>
            );
          })
        )}
      </div>

      {(task.approvalRequired || task.releaseStatus !== "NOT_APPLICABLE" || task.escalationReason) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {task.approvalRequired ? <Badge variant="outline">Founder approval required</Badge> : null}
          {task.releaseStatus !== "NOT_APPLICABLE" ? (
            <Badge variant="outline">Release: {label(task.releaseStatus)}</Badge>
          ) : null}
          {task.escalationReason ? (
            <span className="text-destructive">Escalated: {task.escalationReason}</span>
          ) : null}
        </div>
      )}

      {task.acceptanceCriteria ? (
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Acceptance criteria</p>
          <p className="text-sm whitespace-pre-wrap">{task.acceptanceCriteria}</p>
        </div>
      ) : null}

      {/* Completion evidence — required before COMPLETED (server-enforced) */}
      {task.status !== "COMPLETED" ? (
        <div className="space-y-1.5">
          <Label htmlFor="task-evidence" className="text-xs">
            Completion evidence {evidencePresent ? "" : "(required before completing)"}
          </Label>
          <Textarea
            id="task-evidence"
            rows={2}
            defaultValue={task.evidenceNote ?? ""}
            placeholder="What was done, what was tested, where the proof lives…"
            onBlur={(e) => {
              if (e.target.value !== (task.evidenceNote ?? "")) {
                onPatch({ evidenceNote: e.target.value.trim() || null });
              }
            }}
            disabled={busy}
          />
          {task.evidenceDocumentId ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip aria-hidden className="size-3" />
              Evidence document attached ({task.evidenceDocumentId.slice(-6).toUpperCase()})
            </p>
          ) : null}
        </div>
      ) : task.evidenceNote ? (
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Completion evidence</p>
          <p className="text-sm whitespace-pre-wrap">{task.evidenceNote}</p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test checklist — recorded results only; toggling PATCHes the task
// ---------------------------------------------------------------------------

interface ChecklistItem {
  label: string;
  done: boolean;
}

function parseChecklist(raw: string | null | undefined): ChecklistItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i): i is ChecklistItem => typeof i === "object" && i != null && typeof (i as ChecklistItem).label === "string")
      .map((i) => ({ label: i.label, done: i.done === true }));
  } catch {
    return [];
  }
}

export function TaskChecklistPanel({
  task,
  busy,
  onPatch,
}: {
  task: TaskRecord;
  busy: boolean;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const [newLabel, setNewLabel] = useState("");
  const items = parseChecklist(task.testChecklist);

  function toggle(index: number) {
    const next = items.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
    onPatch({ testChecklist: next });
  }

  function addItem() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    onPatch({ testChecklist: [...items, { label: trimmed, done: false }] });
    setNewLabel("");
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Test checklist</p>
        {items.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {doneCount}/{items.length} done
          </span>
        ) : null}
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={item.done}
                  onCheckedChange={() => toggle(index)}
                  disabled={busy}
                  className="mt-0.5"
                  aria-label={`Toggle: ${item.label}`}
                />
                <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No test checklist yet — record the checks you actually run.
        </p>
      )}
      <div className="flex gap-2">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder="Add a check (e.g. Verify mobile layout)"
          className="h-8 text-sm"
        />
        <Button type="button" size="sm" variant="outline" onClick={addItem} disabled={busy || !newLabel.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comments thread
// ---------------------------------------------------------------------------

export function TaskCommentsPanel({ task }: { task: TaskRecord }) {
  const queryClient = useQueryClient();
  const user = useAppStore((s) => s.user);
  const [draft, setDraft] = useState("");

  const addComment = useMutation({
    mutationFn: (body: string) =>
      apiFetch<TaskCommentRecord>(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not post the comment."),
  });

  const comments = task.comments ?? [];

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <MessageSquarePlus aria-hidden className="size-3.5" />
        Comments
      </p>
      {comments.length > 0 ? (
        <ul className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border bg-muted/30 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{c.authorName ?? "Unknown"}</span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim()) addComment.mutate(draft.trim());
            }
          }}
          placeholder={user ? `Comment as ${user.displayName}…` : "Write a comment…"}
          className="h-8 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => draft.trim() && addComment.mutate(draft.trim())}
          disabled={addComment.isPending || !draft.trim()}
          aria-label="Post comment"
        >
          {addComment.isPending ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Send aria-hidden className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}

/** Small helper badge row for the drawer header area. */
export function TaskWorkflowBadges({ task }: { task: TaskRecord }) {
  return (
    <>
      <StatusBadge value={task.status} />
      {task.releaseStatus === "PENDING_RELEASE" ? (
        <Badge variant="outline" className="gap-1">
          <CheckCircle2 aria-hidden className="size-3" />
          Pending release
        </Badge>
      ) : null}
    </>
  );
}
