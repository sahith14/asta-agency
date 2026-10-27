"use client";

/**
 * AgencyOS — document upload dialog (Documents view).
 * Multipart POST /api/documents via apiFetch (which skips Content-Type for
 * FormData, letting the browser set the multipart boundary). Client-side
 * pre-validation mirrors the server: 10 MB cap + MIME/extension allowlist.
 */
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, type DocumentRecord } from "@/lib/types";
import { fileSize } from "@/lib/format";
import {
  ALLOWED_MIME_HINT,
  MAX_UPLOAD_BYTES,
  mimeLooksAllowed,
} from "@/components/agency/views/tasks/lookups";
import { LinkFields, type LinkValue } from "@/components/agency/views/tasks/link-fields";

export function UploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: (document: DocumentRecord) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [links, setLinks] = useState<LinkValue>({ clientId: "", websiteId: "", projectId: "" });

  function reset() {
    setFile(null);
    setNote("");
    setLinks({ clientId: "", websiteId: "", projectId: "" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function validate(): string | null {
    if (!file) return "Choose a file to upload.";
    if (file.size > MAX_UPLOAD_BYTES) return "File exceeds the 10 MB limit.";
    if (!mimeLooksAllowed(file)) {
      return `Unsupported file type. Allowed: ${ALLOWED_MIME_HINT}.`;
    }
    return null;
  }

  const uploadMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("file", file!);
      if (note.trim()) formData.append("note", note.trim());
      if (links.clientId) formData.append("clientId", links.clientId);
      if (links.websiteId) formData.append("websiteId", links.websiteId);
      if (links.projectId) formData.append("projectId", links.projectId);
      // apiFetch omits Content-Type for FormData bodies (browser sets it).
      return apiFetch<DocumentRecord>("/api/documents", { method: "POST", body: formData });
    },
    onSuccess: (created) => {
      toast.success("Uploaded", { description: created.fileName });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      reset();
      onUploaded?.(created);
    },
    onError: (error: Error) => {
      // 400s carry the server's validation message (size / MIME / bad links).
      toast.error(error.message || "Upload failed.");
    },
  });

  function submit() {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    uploadMutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Contracts, screenshots, exports — up to 10 MB. Allowed: {ALLOWED_MIME_HINT}.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="document-file">File</Label>
            {file ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <FileUp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fileSize(file.size)}</span>
                </span>
                <button
                  type="button"
                  aria-label="Remove selected file"
                  className="rounded p-1 hover:bg-muted"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
            ) : (
              <Input
                id="document-file"
                ref={fileInputRef}
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="document-note">Note (optional)</Label>
            <Textarea
              id="document-note"
              rows={2}
              placeholder="What is this file for?"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Links (optional)</Label>
            <LinkFields value={links} onChange={setLinks} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploadMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : null}
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
