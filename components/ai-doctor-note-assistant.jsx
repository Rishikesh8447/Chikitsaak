"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generateDoctorNoteDraft } from "@/actions/ai";
import { Loader2, Sparkles } from "lucide-react";

function draftText(draft) {
  return [
    `Consultation summary:\n${draft.consultationSummary}`,
    draft.keyObservations.length ? `Key observations:\n${draft.keyObservations.map((item) => `- ${item}`).join("\n")}` : "",
    draft.patientExplanation ? `Patient-friendly explanation:\n${draft.patientExplanation}` : "",
    draft.followUpInstructions ? `Follow-up instructions:\n${draft.followUpInstructions}` : "",
  ].filter(Boolean).join("\n\n");
}

export function AiDoctorNoteAssistant({ appointmentId, onAccept }) {
  const [consultationInformation, setConsultationInformation] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    setLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("appointmentId", appointmentId);
    formData.append("consultationInformation", consultationInformation);
    try {
      const result = await generateDoctorNoteDraft(formData);
      if (!result.success) setError(result.error || "AI assistance is temporarily unavailable.");
      else setDraft(draftText(result.draft));
    } catch {
      setError("AI assistance is temporarily unavailable. You can write notes manually.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-emerald-900/20 bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-foreground">AI Assistance <span className="text-xs font-normal text-muted-foreground">(draft only)</span></p>
        {draft && <div className="flex gap-2"><Button type="button" variant="outline" onClick={generate} disabled={loading}>Regenerate</Button><Button type="button" variant="outline" onClick={() => setDraft("")}>Discard</Button></div>}
      </div>
      {!draft && <Textarea value={consultationInformation} onChange={(event) => setConsultationInformation(event.target.value)} placeholder="Describe your consultation observations in your own words..." maxLength={5000} rows={4} />}
      {!draft && <Button type="button" variant="outline" onClick={generate} disabled={loading || !consultationInformation.trim()}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Generate draft</Button>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {draft && <><p className="text-xs text-amber-400">DRAFT — AI generated. Review and edit before accepting.</p><Textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={10000} rows={10} /><Button type="button" onClick={() => onAccept(draft)} className="bg-primary hover:bg-primary/90">Accept draft into notes</Button></>}
    </div>
  );
}
