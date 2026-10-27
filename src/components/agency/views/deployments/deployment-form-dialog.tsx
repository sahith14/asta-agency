"use client";

/**
 * AgencyOS — deployment record/edit/rollback dialog (Phase 4, task 4-b).
 *
 * create: POST /api/deployments (status starts QUEUED)
 * edit:   PATCH /api/deployments/[id] — only while QUEUED/BUILDING/DEPLOYING
 * rollback: create with rollbackOfId pre-filled; the copy explains the original
 *          deployment is marked Rolled back when the rollback succeeds.
 * Provider is a text input with datalist suggestions from PROVIDER_SUGGESTIONS.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import {
  apiFetch,
  DEPLOYMENT_ENVIRONMENTS,
  label,
  PROVIDER_SUGGESTIONS,
  type DeploymentRecord,
  type Paginated,
} from "@/lib/types";
import { useWebsitesLookup } from "@/components/agency/views/tasks/lookups";

const NONE = "none";

export function DeploymentFormDialog({
  open,
  onOpenChange,
  deployment,
  rollbackOf,
  presetWebsiteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit target (also controls editability by status). */
  deployment?: DeploymentRecord | null;
  /** When set the dialog records a ROLLBACK of this deployment. */
  rollbackOf?: DeploymentRecord | null;
  presetWebsiteId?: string;
  onSaved?: (deployment: DeploymentRecord) => void;
}) {
  const mode = rollbackOf ? "rollback" : deployment ? "edit" : "create";
  const title =
    mode === "rollback"
      ? `Record rollback of ${deploymentRefText(rollbackOf)}`
      : deployment
        ? "Edit deployment"
        : "Record deployment";
  const description =
    mode === "rollback"
      ? "This creates a new deployment linked as the rollback. When the rollback deployment is marked SUCCESSFUL, the original deployment is automatically marked Rolled back."
      : mode === "edit"
        ? "Deployments can be edited while queued, building or deploying."
        : "Log a deployment that happened (or started) in your hosting provider. It is recorded with status Queued until you update it.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent className="max-h-[90svh] overflow-y-auto scrollbar-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DeploymentFormInner
            mode={mode}
            deployment={deployment ?? null}
            rollbackOf={rollbackOf ?? null}
            presetWebsiteId={presetWebsiteId}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function deploymentRefText(deployment: DeploymentRecord | null | undefined): string {
  if (!deployment) return "the deployment";
  const label = deployment.commitSha
    ? deployment.commitSha.slice(0, 7)
    : deployment.deploymentRef ?? deployment.website?.name ?? "deployment";
  return `${deployment.website?.name ?? "deployment"} · ${label}`;
}

function DeploymentFormInner({
  mode,
  deployment,
  rollbackOf,
  presetWebsiteId,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit" | "rollback";
  deployment: DeploymentRecord | null;
  rollbackOf: DeploymentRecord | null;
  presetWebsiteId?: string;
  onOpenChange: (open: boolean) => void;
  onSaved?: (deployment: DeploymentRecord) => void;
}) {
  const queryClient = useQueryClient();
  const editableStatuses = ["QUEUED", "BUILDING", "DEPLOYING"];
  const isEdit = mode === "edit";
  const editLocked = isEdit && !editableStatuses.includes(deployment?.status ?? "");

  const [serverError, setServerError] = useState<string | null>(null);
  const [websiteId, setWebsiteId] = useState(
    deployment?.websiteId ?? rollbackOf?.websiteId ?? presetWebsiteId ?? "",
  );
  const [environment, setEnvironment] = useState(
    deployment?.environment ?? rollbackOf?.environment ?? "PRODUCTION",
  );
  const [projectId, setProjectId] = useState(deployment?.projectId ?? "");
  const [provider, setProvider] = useState(
    deployment?.provider ?? rollbackOf?.provider ?? "",
  );
  const [repositoryRef, setRepositoryRef] = useState(deployment?.repositoryRef ?? "");
  const [commitSha, setCommitSha] = useState(
    mode === "rollback" ? "" : (deployment?.commitSha ?? ""),
  );
  const [deploymentRef, setDeploymentRef] = useState(deployment?.deploymentRef ?? "");
  const [notes, setNotes] = useState(deployment?.notes ?? "");

  const websites = useWebsitesLookup("");

  const projectsQuery = useQuery({
    queryKey: ["projects", "lookup", "all"],
    queryFn: () =>
      apiFetch<Paginated<{ id: string; name: string }>>("/api/projects?pageSize=100"),
    staleTime: 60_000,
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = {
        websiteId,
        environment,
        projectId: projectId || null,
        provider: provider.trim() || null,
        repositoryRef: repositoryRef.trim() || null,
        commitSha: commitSha.trim() || null,
        deploymentRef: deploymentRef.trim() || null,
        notes: notes.trim() || null,
      };
      if (mode === "edit" && deployment) {
        return apiFetch<DeploymentRecord>(`/api/deployments/${deployment.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      return apiFetch<DeploymentRecord>("/api/deployments", {
        method: "POST",
        body: JSON.stringify({
          ...body,
          rollbackOfId: rollbackOf?.id ?? null,
        }),
      });
    },
    onSuccess: (record) => {
      toast.success(
        mode === "edit"
          ? "Deployment updated."
          : mode === "rollback"
            ? "Rollback recorded — update its status as it progresses."
            : "Deployment recorded with status Queued.",
      );
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      onSaved?.(record);
    },
    onError: (error: Error) => {
      setServerError(error.message || "Could not save the deployment.");
    },
  });

  // serverError starts null; Inner mounts only while the dialog is open,
  // so every open starts clean — no reset effect needed.

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setServerError(null);
        if (!websiteId) return;
        saveMutation.mutate();
      }}
      className="space-y-4"
      noValidate
    >
      {serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}
      {editLocked ? (
        <Alert variant="destructive">
          <AlertDescription>
            This deployment is {label(deployment?.status)} and can no longer be edited.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Website</Label>
          <Select
            value={websiteId || NONE}
            onValueChange={(next) => setWebsiteId(next === NONE ? "" : next)}
            disabled={isEdit}
          >
            <SelectTrigger className="w-full" aria-label="Website">
              <SelectValue placeholder="Select a website" />
            </SelectTrigger>
            <SelectContent>
              {(websites.data ?? []).map((website) => (
                <SelectItem key={website.id} value={website.id}>
                  {website.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Environment</Label>
          <Select value={environment} onValueChange={setEnvironment}>
            <SelectTrigger className="w-full" aria-label="Environment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEPLOYMENT_ENVIRONMENTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {label(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="deployment-provider">Provider</Label>
          <Input
            id="deployment-provider"
            list="provider-suggestions"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            placeholder="e.g. VERCEL"
            autoComplete="off"
          />
          <datalist id="provider-suggestions">
            {PROVIDER_SUGGESTIONS.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label>Project (optional)</Label>
          <Select
            value={projectId || NONE}
            onValueChange={(next) => setProjectId(next === NONE ? "" : next)}
          >
            <SelectTrigger className="w-full" aria-label="Project (optional)">
              <SelectValue placeholder="No project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No project</SelectItem>
              {(projectsQuery.data?.items ?? []).map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="deployment-repo">Repository ref</Label>
          <Input
            id="deployment-repo"
            value={repositoryRef}
            onChange={(event) => setRepositoryRef(event.target.value)}
            placeholder="e.g. main or org/repo"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deployment-commit">Commit SHA</Label>
          <Input
            id="deployment-commit"
            value={commitSha}
            onChange={(event) => setCommitSha(event.target.value)}
            placeholder="e.g. 9f3c2ab"
            className="font-mono"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="deployment-ref">Deployment ref</Label>
        <Input
          id="deployment-ref"
          value={deploymentRef}
          onChange={(event) => setDeploymentRef(event.target.value)}
          placeholder="Provider deployment id or URL"
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="deployment-notes">Notes</Label>
        <Textarea
          id="deployment-notes"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="What shipped, who asked for it…"
        />
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
        <Button type="submit" disabled={saveMutation.isPending || !websiteId || editLocked}>
          {saveMutation.isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          {mode === "edit" ? "Save changes" : mode === "rollback" ? "Record rollback" : "Record deployment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
