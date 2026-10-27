"use client";

/**
 * AgencyOS — Client → Website / Project cascade selects.
 * Shared by the task create/edit dialog and the document upload/edit dialogs.
 * When a client is chosen the website/project options narrow to that client;
 * changing the client clears the deeper selections.
 */
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useClientsLookup,
  useProjectsLookup,
  useWebsitesLookup,
} from "@/components/agency/views/tasks/lookups";

export interface LinkValue {
  clientId: string;
  websiteId: string;
  projectId: string;
}

const NONE = "none";

export function LinkFields({
  value,
  onChange,
}: {
  value: LinkValue;
  onChange: (next: LinkValue) => void;
}) {
  const clients = useClientsLookup();
  const websites = useWebsitesLookup(value.clientId);
  const projects = useProjectsLookup(value.clientId);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label>Client</Label>
        <Select
          value={value.clientId || NONE}
          onValueChange={(next) => {
            // Changing the client invalidates website/project (they must belong to it).
            onChange({ clientId: next === NONE ? "" : next, websiteId: "", projectId: "" });
          }}
        >
          <SelectTrigger className="w-full" aria-label="Client">
            <SelectValue placeholder="Client (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No client</SelectItem>
            {(clients.data ?? []).map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.businessName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Website</Label>
        <Select
          value={value.websiteId || NONE}
          onValueChange={(next) => onChange({ ...value, websiteId: next === NONE ? "" : next })}
        >
          <SelectTrigger className="w-full" aria-label="Website">
            <SelectValue placeholder="Website (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No website</SelectItem>
            {(websites.data ?? []).map((website) => (
              <SelectItem key={website.id} value={website.id}>
                {website.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Project</Label>
        <Select
          value={value.projectId || NONE}
          onValueChange={(next) => onChange({ ...value, projectId: next === NONE ? "" : next })}
        >
          <SelectTrigger className="w-full" aria-label="Project">
            <SelectValue placeholder="Project (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No project</SelectItem>
            {(projects.data ?? []).map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
