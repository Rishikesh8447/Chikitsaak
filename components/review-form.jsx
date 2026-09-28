"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createReview } from "@/actions/medical";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";

export function ReviewForm({ appointmentId, existing }) {
  const [rating, setRating] = useState(5);
  const { loading, fn, data } = useFetch(createReview);
  const submit = async (event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); formData.append("appointmentId", appointmentId); formData.append("rating", String(rating)); await fn(formData); };
  useEffect(() => { if (data?.success) toast.success("Review submitted"); }, [data]);
  if (existing) return <p className="text-sm text-primary">You reviewed this consultation.</p>;
  return <form onSubmit={submit} className="space-y-3"><fieldset className="flex gap-1"><legend className="text-sm text-muted-foreground">Rating</legend>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} onClick={() => setRating(value)} className={value <= rating ? "text-amber-400" : "text-muted-foreground"} aria-label={`${value} stars`} aria-pressed={rating === value}>★</button>)}</fieldset><label className="grid gap-2 text-sm font-medium">Review comment (optional)<Textarea name="comment" maxLength={2000} /></label>{data?.error && <p className="text-sm text-destructive">{data.error}</p>}<Button type="submit" disabled={loading} className="bg-primary hover:bg-primary/90">{loading ? "Submitting..." : "Submit review"}</Button></form>;
}
