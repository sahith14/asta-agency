"use client";

/**
 * AgencyOS — brief edit dialog (Phase 5).
 *
 * One large form covering every brief section the manager/founder captures:
 * business profile, goals & audience, scope, commercial, gaps, demo and
 * meeting prep. Founder-only review fields live in FounderReviewDialog.
 * PATCH /api/briefs/[id] with only the changed fields.
 */
import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, BRIEF_PREVIEW_STATUSES, label, type BriefRecord } from "@/lib/types";

interface BriefFormState {
  businessName: string;
  businessType: string;
  location: string;
  contactPerson: string;
  existingWebsite: string;
  publicReferences: string;
  businessGoals: string;
  currentProblems: string;
  targetAudience: string;
  requestedPages: string;
  requestedFeatures: string;
  brandingInfo: string;
  competitorReferences: string;
  inspiration: string;
  budgetMajor: string; // £ (stored as minor units)
  currency: string;
  budgetNote: string;
  deadline: string; // YYYY-MM-DD
  recommendedPackage: string;
  proposedCarePlan: string;
  missingInformation: string;
  outstandingQuestions: string;
  demoUrl: string;
  previewStatus: string;
  improvement1: string;
  improvement2: string;
  improvement3: string;
  preparationNotes: string;
}

function toFormState(brief: BriefRecord): BriefFormState {
  return {
    businessName: brief.businessName ?? "",
    businessType: brief.businessType ?? "",
    location: brief.location ?? "",
    contactPerson: brief.contactPerson ?? "",
    existingWebsite: brief.existingWebsite ?? "",
    publicReferences: brief.publicReferences ?? "",
    businessGoals: brief.businessGoals ?? "",
    currentProblems: brief.currentProblems ?? "",
    targetAudience: brief.targetAudience ?? "",
    requestedPages: brief.requestedPages ?? "",
    requestedFeatures: brief.requestedFeatures ?? "",
    brandingInfo: brief.brandingInfo ?? "",
    competitorReferences: brief.competitorReferences ?? "",
    inspiration: brief.inspiration ?? "",
    budgetMajor: brief.budgetMinor === null || brief.budgetMinor === undefined ? "" : String(brief.budgetMinor / 100),
    currency: brief.currency || "GBP",
    budgetNote: brief.budgetNote ?? "",
    deadline: brief.deadline ? brief.deadline.slice(0, 10) : "",
    recommendedPackage: brief.recommendedPackage ?? "",
    proposedCarePlan: brief.proposedCarePlan ?? "",
    missingInformation: brief.missingInformation ?? "",
    outstandingQuestions: brief.outstandingQuestions ?? "",
    demoUrl: brief.demoUrl ?? "",
    previewStatus: brief.previewStatus || "NOT_STARTED",
    improvement1: brief.improvement1 ?? "",
    improvement2: brief.improvement2 ?? "",
    improvement3: brief.improvement3 ?? "",
    preparationNotes: brief.preparationNotes ?? "",
  };
}

function payloadOf(state: BriefFormState): Record<string, unknown> {
  const major = Number.parseFloat(state.budgetMajor);
  return {
    businessName: state.businessName.trim() || null,
    businessType: state.businessType.trim() || null,
    location: state.location.trim() || null,
    contactPerson: state.contactPerson.trim() || null,
    existingWebsite: state.existingWebsite.trim() || null,
    publicReferences: state.publicReferences.trim() || null,
    businessGoals: state.businessGoals.trim() || null,
    currentProblems: state.currentProblems.trim() || null,
    targetAudience: state.targetAudience.trim() || null,
    requestedPages: state.requestedPages.trim() || null,
    requestedFeatures: state.requestedFeatures.trim() || null,
    brandingInfo: state.brandingInfo.trim() || null,
    competitorReferences: state.competitorReferences.trim() || null,
    inspiration: state.inspiration.trim() || null,
    budgetMinor:
      state.budgetMajor.trim() === "" || Number.isNaN(major) ? null : Math.round(major * 100),
    currency: state.currency,
    budgetNote: state.budgetNote.trim() || null,
    deadline: state.deadline ? new Date(`${state.deadline}T12:00:00Z`).toISOString() : null,
    recommendedPackage: state.recommendedPackage.trim() || null,
    proposedCarePlan: state.proposedCarePlan.trim() || null,
    missingInformation: state.missingInformation.trim() || null,
    outstandingQuestions: state.outstandingQuestions.trim() || null,
    demoUrl: state.demoUrl.trim() || null,
    previewStatus: state.previewStatus,
    improvement1: state.improvement1.trim() || null,
    improvement2: state.improvement2.trim() || null,
    improvement3: state.improvement3.trim() || null,
    preparationNotes: state.preparationNotes.trim() || null,
  };
}

function Field({
  label: text,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={htmlFor}>{text}</Label>
      {children}
    </div>
  );
}

export function BriefEditDialog({
  brief,
  open,
  onOpenChange,
  onSaved,
  includeCommercial = true,
}: {
  brief: BriefRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: BriefRecord) => void;
  /** The developer never edits briefs; the manager/founder sees everything. */
  includeCommercial?: boolean;
}) {
  const [state, setState] = useState<BriefFormState>(() => toFormState(brief));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setState(toFormState(brief));
    // toFormState(brief) is intentionally read only when the dialog opens.
  }, [open, brief.id]);

  const set = (patch: Partial<BriefFormState>) => setState((s) => ({ ...s, ...patch }));

  async function save() {
    setBusy(true);
    try {
      const updated = await apiFetch<BriefRecord>(`/api/briefs/${brief.id}`, {
        method: "PATCH",
        body: JSON.stringify(payloadOf(state)),
      });
      toast.success("Brief updated");
      onOpenChange(false);
      onSaved(updated);
    } catch (err) {
      toast.error((err as Error).message || "Could not save the brief.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-4rem)] overflow-y-auto scrollbar-thin sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit brief {brief.displayNumber}</DialogTitle>
          <DialogDescription>
            Everything here is internal — prepare the client demo before the founder review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3" aria-label="Business profile">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Business profile
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Business name" htmlFor="be-business-name">
                <Input
                  id="be-business-name"
                  value={state.businessName}
                  onChange={(e) => set({ businessName: e.target.value })}
                />
              </Field>
              <Field label="Business type" htmlFor="be-business-type">
                <Input
                  id="be-business-type"
                  value={state.businessType}
                  onChange={(e) => set({ businessType: e.target.value })}
                  placeholder="e.g. Restaurant"
                />
              </Field>
              <Field label="Location" htmlFor="be-location">
                <Input
                  id="be-location"
                  value={state.location}
                  onChange={(e) => set({ location: e.target.value })}
                />
              </Field>
              <Field label="Contact person" htmlFor="be-contact">
                <Input
                  id="be-contact"
                  value={state.contactPerson}
                  onChange={(e) => set({ contactPerson: e.target.value })}
                />
              </Field>
              <Field label="Existing website" htmlFor="be-existing">
                <Input
                  id="be-existing"
                  value={state.existingWebsite}
                  onChange={(e) => set({ existingWebsite: e.target.value })}
                  placeholder="URL or “none”"
                />
              </Field>
              <Field label="Public references" htmlFor="be-refs">
                <Input
                  id="be-refs"
                  value={state.publicReferences}
                  onChange={(e) => set({ publicReferences: e.target.value })}
                />
              </Field>
            </div>
          </section>

          <Separator />

          <section className="space-y-3" aria-label="Goals and audience">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Goals &amp; audience
            </p>
            <Field label="Business goals" htmlFor="be-goals">
              <Textarea
                id="be-goals"
                rows={3}
                value={state.businessGoals}
                onChange={(e) => set({ businessGoals: e.target.value })}
              />
            </Field>
            <Field label="Current problems" htmlFor="be-problems">
              <Textarea
                id="be-problems"
                rows={3}
                value={state.currentProblems}
                onChange={(e) => set({ currentProblems: e.target.value })}
              />
            </Field>
            <Field label="Target audience" htmlFor="be-audience">
              <Textarea
                id="be-audience"
                rows={2}
                value={state.targetAudience}
                onChange={(e) => set({ targetAudience: e.target.value })}
              />
            </Field>
          </section>

          <Separator />

          <section className="space-y-3" aria-label="Scope">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Scope
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Requested pages" htmlFor="be-pages">
                <Textarea
                  id="be-pages"
                  rows={2}
                  value={state.requestedPages}
                  onChange={(e) => set({ requestedPages: e.target.value })}
                />
              </Field>
              <Field label="Requested features" htmlFor="be-features">
                <Textarea
                  id="be-features"
                  rows={2}
                  value={state.requestedFeatures}
                  onChange={(e) => set({ requestedFeatures: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Branding info" htmlFor="be-branding">
              <Textarea
                id="be-branding"
                rows={2}
                value={state.brandingInfo}
                onChange={(e) => set({ brandingInfo: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Competitor references" htmlFor="be-competitors">
                <Textarea
                  id="be-competitors"
                  rows={2}
                  value={state.competitorReferences}
                  onChange={(e) => set({ competitorReferences: e.target.value })}
                />
              </Field>
              <Field label="Inspiration" htmlFor="be-inspiration">
                <Textarea
                  id="be-inspiration"
                  rows={2}
                  value={state.inspiration}
                  onChange={(e) => set({ inspiration: e.target.value })}
                />
              </Field>
            </div>
          </section>

          {includeCommercial ? (
            <>
              <Separator />
              <section className="space-y-3" aria-label="Commercial">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Commercial
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Budget (£)" htmlFor="be-budget">
                    <Input
                      id="be-budget"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={state.budgetMajor}
                      onChange={(e) => set({ budgetMajor: e.target.value })}
                    />
                  </Field>
                  <Field label="Currency" htmlFor="be-currency">
                    <Select value={state.currency} onValueChange={(v) => set({ currency: v })}>
                      <SelectTrigger id="be-currency" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["GBP", "EUR", "USD"].map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Deadline" htmlFor="be-deadline">
                    <Input
                      id="be-deadline"
                      type="date"
                      value={state.deadline}
                      onChange={(e) => set({ deadline: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Budget note" htmlFor="be-budget-note">
                  <Textarea
                    id="be-budget-note"
                    rows={2}
                    value={state.budgetNote}
                    onChange={(e) => set({ budgetNote: e.target.value })}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Recommended package" htmlFor="be-package">
                    <Input
                      id="be-package"
                      value={state.recommendedPackage}
                      onChange={(e) => set({ recommendedPackage: e.target.value })}
                    />
                  </Field>
                  <Field label="Proposed care plan" htmlFor="be-care">
                    <Input
                      id="be-care"
                      value={state.proposedCarePlan}
                      onChange={(e) => set({ proposedCarePlan: e.target.value })}
                    />
                  </Field>
                </div>
              </section>
            </>
          ) : null}

          <Separator />

          <section className="space-y-3" aria-label="Gaps and demo">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Gaps &amp; demo
            </p>
            <Field label="Missing information" htmlFor="be-missing">
              <Textarea
                id="be-missing"
                rows={2}
                value={state.missingInformation}
                onChange={(e) => set({ missingInformation: e.target.value })}
              />
            </Field>
            <Field label="Outstanding questions" htmlFor="be-questions">
              <Textarea
                id="be-questions"
                rows={3}
                value={state.outstandingQuestions}
                onChange={(e) => set({ outstandingQuestions: e.target.value })}
                placeholder="One question per line — shown in the Meeting prep card"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Demo URL" htmlFor="be-demo-url">
                <Input
                  id="be-demo-url"
                  type="url"
                  value={state.demoUrl}
                  onChange={(e) => set({ demoUrl: e.target.value })}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Preview status" htmlFor="be-preview">
                <Select value={state.previewStatus} onValueChange={(v) => set({ previewStatus: v })}>
                  <SelectTrigger id="be-preview" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRIEF_PREVIEW_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {label(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </section>

          <Separator />

          <section className="space-y-3" aria-label="Recommended improvements and meeting prep">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Improvements &amp; meeting prep
            </p>
            <Field label="Recommended improvement 1" htmlFor="be-imp1">
              <Textarea
                id="be-imp1"
                rows={2}
                value={state.improvement1}
                onChange={(e) => set({ improvement1: e.target.value })}
              />
            </Field>
            <Field label="Recommended improvement 2" htmlFor="be-imp2">
              <Textarea
                id="be-imp2"
                rows={2}
                value={state.improvement2}
                onChange={(e) => set({ improvement2: e.target.value })}
              />
            </Field>
            <Field label="Recommended improvement 3" htmlFor="be-imp3">
              <Textarea
                id="be-imp3"
                rows={2}
                value={state.improvement3}
                onChange={(e) => set({ improvement3: e.target.value })}
              />
            </Field>
            <Field label="Meeting preparation notes" htmlFor="be-prep">
              <Textarea
                id="be-prep"
                rows={3}
                value={state.preparationNotes}
                onChange={(e) => set({ preparationNotes: e.target.value })}
              />
            </Field>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
