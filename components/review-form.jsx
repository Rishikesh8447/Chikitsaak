"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createReview } from "@/actions/medical";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";

export function ReviewForm({ appointmentId, existing }) {
  const [rating, setRating] = useState(5);
  const { loading, fn, data } = useFetch(createReview);
  const submit = async (event) => { event.preventDefault(); const formData = new FormData(event.currentTarget); formData.append("appointmentId", appointmentId); formData.append("rating", String(rating)); await fn(formData); };
  if (existing) return <p className="text-sm text-emerald-400">You reviewed this consultation.</p>;
  if (data?.success) toast.success("Review submitted");
  return <form onSubmit={submit} className="space-y-3"><div className="flex gap-1" aria-label="Rating"><span className="text-sm text-muted-foreground">Rating:</span>{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} onClick={() => setRating(value)} className={value <= rating ? "text-amber-400" : "text-muted-foreground"} aria-label={`${value} stars`}>★</button>)}</div><Textarea name="comment" placeholder="Share your experience (optional)" maxLength={2000} />{data?.error && <p className="text-sm text-red-400">{data.error}</p>}<Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">{loading ? "Submitting..." : "Submit review"}</Button></form>;
}
