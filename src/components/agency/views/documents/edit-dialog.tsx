"use client";

/**
 * AgencyOS — edit document dialog (Documents view).
 * Note + client/website/project links only; the file itself is immutable.
 * The form mounts fresh per document (Radix unmounts closed dialog content),
 * so no state-sync effects are needed.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, type DocumentRecord } from "@/lib/types";
import { LinkFields, type LinkValue } from "@/components/agency/views/tasks/link-fields";

export function DocumentEditDialog({
  document,
  onOpenChange,
}: {
  document: DocumentRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!document} onOpenChange={onOpenChange}>
      {document ? (
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit document</DialogTitle>
            <DialogDescription className="truncate">
              {document.fileName} — update the note or where it is linked.
            </DialogDescription>
          </DialogHeader>
          <DocumentEditInner document={document} onOpenChange={onOpenChange} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function DocumentEditInner({
  document,
  onOpenChange,
}: {
  document: DocumentRecord;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(document.note ?? "");
  const [links, setLinks] = useState<LinkValue>({
    clientId: document.clientId ?? "",
    websiteId: document.websiteId ?? "",
    projectId: document.projectId ?? "",
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<DocumentRecord>(`/api/documents/${document.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          note: note.trim() ? note.trim() : null,
          clientId: links.clientId || null,
          websiteId: links.websiteId || null,
          projectId: links.projectId || null,
        }),
      }),
    onSuccess: () => {
      toast.success("Document updated");
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["client"] });
      queryClient.invalidateQueries({ queryKey: ["website"] });
      queryClient.invalidateQueries({ queryKey: ["project"] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the document."),
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        saveMutation.mutate();
      }}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="document-edit-note">Note</Label>
        <Textarea
          id="document-edit-note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note (max 2000 characters)."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Links</Label>
        <LinkFields value={links} onChange={setLinks} />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={saveMutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          Save changes
        </Button>
      </DialogFooter>
    </form>
  );
}
