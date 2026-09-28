"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generatePatientAiSummary } from "@/actions/ai";
import { Loader2, Sparkles } from "lucide-react";

function formatSummary(result) {
  const lines = [result.summary];
  if (result.symptoms.length) lines.push(`\nSymptoms mentioned:\n${result.symptoms.map((item) => `- ${item}`).join("\n")}`);
  if (result.duration) lines.push(`\nDuration:\n${result.duration}`);
  if (result.relevantInformation.length) lines.push(`\nRelevant information provided:\n${result.relevantInformation.map((item) => `- ${item}`).join("\n")}`);
  if (result.questions.length) lines.push(`\nQuestions to discuss:\n${result.questions.map((item) => `- ${item}`).join("\n")}`);
  return lines.join("\n").trim();
}

export function AiPreconsultation({ description, summary, setSummary, specialtySuggestion, setSpecialtySuggestion }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    setLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("description", description);
    try {
      const result = await generatePatientAiSummary(formData);
      if (!result.success) {
        setError(result.error || "AI assistance is temporarily unavailable. You can continue manually.");
      } else {
        setSummary(formatSummary(result.summary));
        setSpecialtySuggestion(result.summary.specialtySuggestion || "");
      }
    } catch {
      setError("AI assistance is temporarily unavailable. You can continue manually.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-emerald-900/20 bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">AI Assistance</p>
          <p className="text-xs text-muted-foreground">Prepare a discussion summary from your own description.</p>
        </div>
        <Button type="button" variant="outline" onClick={generate} disabled={loading || !description.trim()}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {summary ? "Regenerate" : "Generate"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {summary && (
        <div className="space-y-2">
          <label htmlFor="ai-summary" className="text-sm font-medium text-foreground">AI-generated summary (edit before booking)</label>
          <Textarea id="ai-summary" value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={5000} rows={8} />
          <label htmlFor="ai-specialty" className="text-sm font-medium text-foreground">Possible specialty to consider (optional)</label>
          <input id="ai-specialty" value={specialtySuggestion} onChange={(event) => setSpecialtySuggestion(event.target.value)} maxLength={120} className="h-10 w-full rounded-md border border-emerald-900/20 bg-background px-3 text-sm text-foreground" />
          <p className="text-xs text-muted-foreground">AI-generated summary. This is not a medical diagnosis. Review it with your doctor.</p>
        </div>
      )}
    </div>
  );
}
