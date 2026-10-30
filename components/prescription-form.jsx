"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPrescription } from "@/actions/medical";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Pill, FlaskConical, Calendar, CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const COMMON_LAB_TEST_SUGGESTIONS = [
  "Complete Blood Count (CBC)",
  "Fasting Blood Sugar (FBS)",
  "HbA1c (Glycated Hemoglobin)",
  "Lipid Profile",
  "Liver Function Test (LFT)",
  "Kidney Function Test (KFT / Creatinine)",
  "Thyroid Stimulating Hormone (TSH)",
  "Urine Routine & Microscopic",
];

export function PrescriptionForm({ appointmentId, existing }) {
  const [diagnosisText, setDiagnosisText] = useState("");
  const [generalInstructionsText, setGeneralInstructionsText] = useState("");
  const [medicines, setMedicines] = useState([
    { name: "", dosage: "", frequency: "", duration: "", instructions: "" },
  ]);
  const [testsAdvised, setTestsAdvised] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDays, setFollowUpDays] = useState(14);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreated, setIsCreated] = useState(false);

  const router = useRouter();
  const { loading, fn, data, error: fetchError } = useFetch(createPrescription);


  const updateMedicine = (index, key, value) => {
    setMedicines((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      )
    );
  };

  const addMedicine = () => {
    setMedicines((items) => [
      ...items,
      { name: "", dosage: "", frequency: "", duration: "", instructions: "" },
    ]);
  };

  const removeMedicine = (index) => {
    if (medicines.length <= 1) return;
    setMedicines((items) => items.filter((_, i) => i !== index));
  };

  const appendTestSuggestion = (testName) => {
    setTestsAdvised((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return testName;
      if (trimmed.toLowerCase().includes(testName.toLowerCase())) return trimmed;
      return `${trimmed}\n• ${testName}`;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (loading || isSubmitting || isCreated) return;

    if (!diagnosisText.trim()) {
      toast.error("Please enter a clinical diagnosis");
      return;
    }

    for (let i = 0; i < medicines.length; i += 1) {
      const med = medicines[i];
      if (!med.name.trim() || !med.dosage.trim() || !med.frequency.trim() || !med.duration.trim()) {
        toast.error(`Please fill in name, dosage, frequency, and duration for Medicine ${i + 1}`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("appointmentId", appointmentId);
      formData.set("diagnosis", diagnosisText.trim());
      formData.set("medicines", JSON.stringify(medicines));
      if (generalInstructionsText.trim()) {
        formData.set("generalInstructions", generalInstructionsText.trim());
      }
      if (testsAdvised.trim()) {
        formData.set("testsAdvised", testsAdvised.trim());
      }
      await fn(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (data?.success) {
      setIsCreated(true);
      toast.success("Prescription created successfully");
      router.refresh();
    }
  }, [data, router]);

  const activeRecord = existing || (isCreated ? {
    diagnosis: diagnosisText,
    medicines,
    generalInstructions: [
      generalInstructionsText.trim() || null,
      testsAdvised.trim() ? `Recommended Laboratory Tests:\n${testsAdvised.trim()}` : null,
    ].filter(Boolean).join("\n\n") || null,
    followUpRequired,
    followUpDays: followUpRequired ? followUpDays : null,
  } : null);

  // Read-only display when prescription is already recorded or created
  if (activeRecord) {
    return (
      <div className="space-y-4 text-foreground">
        <div className="flex items-center gap-2 text-primary font-medium text-sm">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>Prescription recorded for this consultation.</span>
        </div>

        {activeRecord.diagnosis && (
          <div className="space-y-1 rounded-lg border border-border/80 bg-background/50 p-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Diagnosis</span>
            <p className="text-sm font-medium whitespace-pre-line">{activeRecord.diagnosis}</p>
          </div>
        )}

        {Array.isArray(activeRecord.medicines) && activeRecord.medicines.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Pill className="size-3.5 text-primary" />
              <span>Prescribed Medicines ({activeRecord.medicines.length})</span>
            </div>
            <div className="space-y-2">
              {activeRecord.medicines.map((med, idx) => (
                <div key={med.id || idx} className="rounded-lg border border-border/70 bg-background/40 p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-foreground">{med.name}</span>
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[11px]">
                      {med.dosage}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground flex gap-3 flex-wrap">
                    <span>Frequency: <strong className="text-foreground font-medium">{med.frequency}</strong></span>
                    <span>Duration: <strong className="text-foreground font-medium">{med.duration}</strong></span>
                  </div>
                  {med.instructions && (
                    <p className="text-muted-foreground italic pt-0.5">Instructions: {med.instructions}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeRecord.generalInstructions && (
          <div className="space-y-1 rounded-lg border border-border/80 bg-background/50 p-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clinical Instructions & Recommended Tests</span>
            <p className="text-xs whitespace-pre-line text-foreground/90">{activeRecord.generalInstructions}</p>
          </div>
        )}


        {activeRecord.followUpRequired && activeRecord.followUpDays && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
            <Calendar className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Follow-up consultation recommended within {activeRecord.followUpDays} days (included at ₹0).</span>
          </div>
        )}
      </div>
    );
  }

  const isPending = loading || isSubmitting;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Clinical Diagnosis <span className="text-destructive">*</span>
        </label>
        <Textarea
          name="diagnosis"
          required
          maxLength={3000}
          value={diagnosisText}
          onChange={(e) => setDiagnosisText(e.target.value)}
          placeholder="Primary diagnosis, findings, and clinical evaluation..."
          className="bg-background border-border text-sm"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Pill className="size-3.5 text-primary" />
            <span>Medicines Advised ({medicines.length})</span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addMedicine}
            disabled={medicines.length >= 25 || isPending}
            className="h-7 text-xs border-dashed gap-1"
          >
            <Plus className="size-3" />
            <span>Add Medicine</span>
          </Button>
        </div>

        <div className="space-y-2.5">
          {medicines.map((medicine, index) => (
            <fieldset
              key={index}
              className="rounded-xl border border-border/80 bg-background/50 p-3.5 space-y-3 relative group"
            >
              <div className="flex items-center justify-between">
                <legend className="px-1 text-xs font-bold text-foreground">
                  Medicine {index + 1}
                </legend>
                {medicines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMedicine(index)}
                    disabled={isPending}
                    className="h-6 px-2 text-destructive hover:bg-destructive/10 text-xs gap-1"
                  >
                    <Trash2 className="size-3" />
                    <span>Remove</span>
                  </Button>
                )}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium">
                  Medicine name <span className="text-destructive">*</span>
                  <Input
                    required
                    placeholder="e.g. Paracetamol 650mg"
                    value={medicine.name}
                    onChange={(e) => updateMedicine(index, "name", e.target.value)}
                    disabled={isPending}
                    className="h-8 text-xs bg-background"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Dosage <span className="text-destructive">*</span>
                  <Input
                    required
                    placeholder="e.g. 1 tablet / 5ml"
                    value={medicine.dosage}
                    onChange={(e) => updateMedicine(index, "dosage", e.target.value)}
                    disabled={isPending}
                    className="h-8 text-xs bg-background"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Frequency <span className="text-destructive">*</span>
                  <Input
                    required
                    placeholder="e.g. Twice daily after meals"
                    value={medicine.frequency}
                    onChange={(e) => updateMedicine(index, "frequency", e.target.value)}
                    disabled={isPending}
                    className="h-8 text-xs bg-background"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Duration <span className="text-destructive">*</span>
                  <Input
                    required
                    placeholder="e.g. 5 days / 2 weeks"
                    value={medicine.duration}
                    onChange={(e) => updateMedicine(index, "duration", e.target.value)}
                    disabled={isPending}
                    className="h-8 text-xs bg-background"
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium sm:col-span-2">
                  Specific instructions (optional)
                  <Input
                    placeholder="e.g. Take with warm water; avoid driving after dose"
                    value={medicine.instructions}
                    onChange={(e) => updateMedicine(index, "instructions", e.target.value)}
                    disabled={isPending}
                    className="h-8 text-xs bg-background"
                  />
                </label>
              </div>
            </fieldset>
          ))}
        </div>
      </div>

      {/* Recommended Laboratory Tests */}
      <div className="space-y-2 rounded-xl border border-border/80 p-3.5 bg-muted/10">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <FlaskConical className="size-3.5 text-primary" />
          <span>Recommended Laboratory Tests (Optional)</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Advised diagnostic investigations for the patient&apos;s record and care plan. Recommending tests here documents them clearly and does NOT automatically place or charge for an order.
        </p>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {COMMON_LAB_TEST_SUGGESTIONS.map((testName) => (
            <button
              key={testName}
              type="button"
              onClick={() => appendTestSuggestion(testName)}
              disabled={isPending}
              className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-background hover:border-primary/50 hover:bg-primary/5 text-foreground transition-colors"
            >
              + {testName}
            </button>
          ))}
        </div>

        <Textarea
          name="testsAdvised"
          value={testsAdvised}
          onChange={(e) => setTestsAdvised(e.target.value)}
          placeholder="Enter tests advised (e.g. Complete Blood Count, HbA1c, Lipid Profile)..."
          maxLength={1000}
          disabled={isPending}
          className="bg-background border-border text-xs min-h-[60px]"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          General Instructions & Lifestyle Advice (Optional)
        </label>
        <Textarea
          name="generalInstructions"
          maxLength={3000}
          value={generalInstructionsText}
          onChange={(e) => setGeneralInstructionsText(e.target.value)}
          placeholder="Dietary precautions, hydration advice, exercise limits, or warning signs..."
          disabled={isPending}
          className="bg-background border-border text-xs"
        />
      </div>

      {/* Document Attachment Status Notice */}
      <div className="space-y-1.5 rounded-xl border border-border/80 p-3.5 bg-muted/10">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Info className="size-3.5 text-primary" />
          <span>Prescription Document Attachments (Unavailable)</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Prescription document attachments are temporarily unavailable because secure storage integration has not been implemented. Please record all clinical findings, prescribed medicines, and test recommendations in the structured fields above.
        </p>
      </div>

      {/* Follow-up Recommendation Section */}
      <div className="rounded-xl border border-border/80 p-3.5 space-y-3 bg-muted/10">
        <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-foreground">
          <input
            type="checkbox"
            name="followUpRequired"
            checked={followUpRequired}
            onChange={(e) => setFollowUpRequired(e.target.checked)}
            disabled={isPending}
            className="size-4 rounded border-border text-primary focus:ring-primary"
          />
          <span>Recommend follow-up consultation (Included at ₹0)</span>
        </label>

        {followUpRequired && (
          <div className="pl-6.5 space-y-2">
            <label htmlFor="followUpDays" className="block text-xs font-medium text-muted-foreground">
              Recommended follow-up interval
            </label>
            <select
              id="followUpDays"
              name="followUpDays"
              value={followUpDays}
              onChange={(e) => setFollowUpDays(Number(e.target.value))}
              disabled={isPending}
              className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value={2}>Within 2 days (urgent acute review)</option>
              <option value={3}>Within 3 days (acute review)</option>
              <option value={5}>Within 5 days</option>
              <option value={7}>Within 7 days (1 week)</option>
              <option value={14}>Within 14 days (2 weeks)</option>
              <option value={21}>Within 21 days (3 weeks)</option>
              <option value={30}>Within 30 days (1 month)</option>
              <option value={60}>Within 60 days (2 months)</option>
              <option value={90}>Within 90 days (3 months)</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              The patient will be notified and can schedule an available slot within their entitlement. No doctor slot is reserved automatically until the patient confirms their booking.
            </p>
          </div>
        )}
      </div>

      {(data?.error || fetchError) && (
        <p className="text-xs font-medium text-destructive">
          {data?.error || fetchError?.message || "Failed to create prescription"}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 gap-1.5"
      >
        {isPending ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            <span>Saving Prescription...</span>
          </>
        ) : (
          <>
            <Pill className="size-3.5" />
            <span>Save & Issue Prescription</span>
          </>
        )}
      </Button>
    </form>
  );
}
