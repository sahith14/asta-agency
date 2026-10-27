"use client";

/**
 * AgencyOS — client-detail Contacts card: list, add/edit inline dialog,
 * per-contact menu (Set primary, Edit, Remove with confirmation).
 * API (Task 2-a): POST /api/clients/[id]/contacts, PATCH/DELETE /api/contacts/[id].
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Mail, MoreHorizontal, Phone, Plus, Star } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { apiFetch, type ContactRecord } from "@/lib/types";
import { initials } from "@/components/agency/shared/record-list-helpers";
import { ConfirmDialog } from "@/components/agency/shared/confirm-dialog";

const emailField = z
  .string()
  .trim()
  .max(320, "Email must be 320 characters or fewer.")
  .refine((v) => v === "" || z.email().safeParse(v).success, "Please enter a valid email address.");

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160, "Name must be 160 characters or fewer."),
  email: emailField,
  phone: z.string().trim().max(60, "Phone must be 60 characters or fewer."),
  jobTitle: z.string().trim().max(160, "Job title must be 160 characters or fewer."),
  isPrimary: z.boolean(),
});

type ContactFormValues = z.infer<typeof contactSchema>;

function ContactFormDialog({
  clientId,
  contact,
  open,
  onOpenChange,
}: {
  clientId: string;
  contact?: ContactRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      jobTitle: contact?.jobTitle ?? "",
      isPrimary: contact?.isPrimary ?? false,
    },
  });

  async function onSubmit(values: ContactFormValues) {
    setServerError(null);
    const body = {
      name: values.name.trim(),
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      jobTitle: values.jobTitle.trim() || null,
      isPrimary: values.isPrimary,
    };
    try {
      if (contact) {
        await apiFetch<ContactRecord>(`/api/contacts/${contact.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        toast.success("Contact updated");
      } else {
        await apiFetch<ContactRecord>(`/api/clients/${clientId}/contacts`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Contact added");
      }
      void queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      onOpenChange(false);
    } catch (err) {
      const message = (err as Error).message || "Something went wrong.";
      setServerError(message);
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle>
          <DialogDescription>
            {contact
              ? "Update this contact's details."
              : "The first contact for a client becomes the primary contact."}
          </DialogDescription>
        </DialogHeader>

        {serverError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {serverError}
          </p>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="contact-name">Name</Label>
            <Input
              id="contact-name"
              autoFocus
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            {errors.name ? (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                placeholder="Optional"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                type="tel"
                placeholder="Optional"
                aria-invalid={!!errors.phone}
                {...register("phone")}
              />
              {errors.phone ? (
                <p className="text-xs text-destructive">{errors.phone.message}</p>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-job-title">Job title</Label>
            <Input
              id="contact-job-title"
              placeholder="Optional"
              aria-invalid={!!errors.jobTitle}
              {...register("jobTitle")}
            />
            {errors.jobTitle ? (
              <p className="text-xs text-destructive">{errors.jobTitle.message}</p>
            ) : null}
          </div>
          <Controller
            control={control}
            name="isPrimary"
            render={({ field }) => (
              <label
                htmlFor="contact-primary"
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  id="contact-primary"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
                Primary contact for this client
              </label>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {contact ? "Save changes" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContactsCard({
  clientId,
  contacts,
}: {
  clientId: string;
  contacts: ContactRecord[];
}) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContactRecord | null>(null);
  const [removing, setRemoving] = useState<ContactRecord | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [primaryBusyId, setPrimaryBusyId] = useState<string | null>(null);

  function invalidateContacts() {
    void queryClient.invalidateQueries({ queryKey: ["client", clientId] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
  }

  async function setPrimary(contact: ContactRecord) {
    setPrimaryBusyId(contact.id);
    try {
      await apiFetch<ContactRecord>(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPrimary: true }),
      });
      toast.success(`${contact.name} is now the primary contact`);
      invalidateContacts();
    } catch (err) {
      toast.error((err as Error).message || "Could not update the contact.");
    } finally {
      setPrimaryBusyId(null);
    }
  }

  async function removeContact() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      await apiFetch(`/api/contacts/${removing.id}`, { method: "DELETE" });
      toast.success(`Removed ${removing.name}`);
      invalidateContacts();
    } catch (err) {
      toast.error((err as Error).message || "Could not remove the contact.");
    } finally {
      setRemoveBusy(false);
      setRemoving(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contacts</CardTitle>
        <CardDescription>People at this client</CardDescription>
        <CardAction>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus aria-hidden />
            Add contact
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card/60 px-4 py-6 text-center text-sm text-muted-foreground">
            No contacts yet — add the first person at this client.
          </p>
        ) : (
          <ul className="divide-y">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                    {initials(contact.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{contact.name}</p>
                    {contact.isPrimary ? (
                      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                        <Star aria-hidden className="size-2.5" />
                        Primary
                      </Badge>
                    ) : null}
                  </div>
                  {contact.jobTitle ? (
                    <p className="truncate text-xs text-muted-foreground">{contact.jobTitle}</p>
                  ) : null}
                  <div className="mt-1 flex flex-col gap-0.5">
                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground outline-none hover:text-primary hover:underline focus-visible:underline"
                      >
                        <Mail aria-hidden className="size-3" />
                        {contact.email}
                      </a>
                    ) : null}
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone}`}
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground outline-none hover:text-primary hover:underline focus-visible:underline"
                      >
                        <Phone aria-hidden className="size-3" />
                        {contact.phone}
                      </a>
                    ) : null}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Actions for ${contact.name}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      disabled={contact.isPrimary || primaryBusyId === contact.id}
                      onSelect={() => void setPrimary(contact)}
                    >
                      <Star aria-hidden />
                      Set primary
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing(contact);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setRemoving(contact)}
                    >
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {formOpen ? (
        <ContactFormDialog
          key={editing?.id ?? "add"}
          clientId={clientId}
          contact={editing}
          open
          onOpenChange={setFormOpen}
        />
      ) : null}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => {
          if (!o) setRemoving(null);
        }}
        title={`Remove ${removing?.name ?? "contact"}?`}
        description="This permanently removes the contact from this client. This cannot be undone."
        confirmLabel="Remove"
        destructive
        loading={removeBusy}
        onConfirm={() => void removeContact()}
      />
    </Card>
  );
}
