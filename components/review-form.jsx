"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createReview } from "@/actions/medical";
import useFetch from "@/hooks/use-fetch";
import { toast } from "sonner";
import { Star, Loader2, CheckCircle2 } from "lucide-react";

export function ReviewForm({ appointmentId, existing }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [submittedReview, setSubmittedReview] = useState(existing || null);
  const { loading, fn, data, error } = useFetch(createReview);

  const isLocked = loading;

  const submit = async (event) => {
    event.preventDefault();
    if (isLocked || submittedReview) return;
    const formData = new FormData();
    formData.set("appointmentId", appointmentId);
    formData.set("rating", String(rating));
    if (commentText.trim()) {
      formData.set("comment", commentText.trim());
    }
    await fn(formData);
  };

  useEffect(() => {
    if (data?.success) {
      setSubmittedReview({
        rating,
        comment: commentText.trim(),
      });
      toast.success("Thank you for your feedback! Review submitted.");
      router.refresh();
    }
  }, [data, rating, commentText, router]);

  if (submittedReview) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`size-4 ${
                  s <= (submittedReview.rating || 5)
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/30"
                }`}
              />
            ))}
            <span className="text-xs font-bold text-foreground ml-1">
              {submittedReview.rating || 5} / 5
            </span>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            Reviewed
          </span>
        </div>
        {submittedReview.comment && (
          <p className="text-xs text-muted-foreground italic leading-relaxed">
            &ldquo;{submittedReview.comment}&rdquo;
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Your feedback helps other patients make informed healthcare decisions.
        </p>
      </div>
    );
  }

  const activeRating = hoverRating || rating;

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Rating
        </label>
        <div
          className="flex items-center gap-1.5"
          role="radiogroup"
          aria-label="Doctor consultation rating"
        >
          {[1, 2, 3, 4, 5].map((starValue) => (
            <button
              type="button"
              key={starValue}
              onClick={() => setRating(starValue)}
              onMouseEnter={() => setHoverRating(starValue)}
              onMouseLeave={() => setHoverRating(0)}
              className="p-1 rounded-md hover:bg-muted/60 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
              aria-label={`${starValue} out of 5 stars`}
              aria-checked={rating === starValue}
              role="radio"
            >
              <Star
                className={`size-6 transition-all ${
                  starValue <= activeRating
                    ? "fill-amber-400 text-amber-400 scale-105"
                    : "text-muted-foreground/40 hover:text-muted-foreground"
                }`}
              />
            </button>
          ))}
          <span className="text-xs font-semibold text-foreground ml-2">
            {rating === 5 ? "Excellent (5/5)" : rating === 4 ? "Very Good (4/5)" : rating === 3 ? "Average (3/5)" : rating === 2 ? "Below Average (2/5)" : "Poor (1/5)"}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`review-comment-${appointmentId}`} className="block text-xs font-medium text-muted-foreground">
          Written feedback (optional)
        </label>
        <Textarea
          id={`review-comment-${appointmentId}`}
          name="comment"
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          maxLength={2000}
          placeholder="Share your experience regarding the consultation, doctor's explanation, and treatment advice..."
          className="text-sm min-h-[80px] resize-y"
        />
      </div>

      {(error?.message || data?.error) && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error?.message || data?.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={isLocked}
        className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
      >
        {isLocked ? (
          <>
            <Loader2 className="mr-2 size-3.5 animate-spin" />
            Submitting review...
          </>
        ) : (
          "Submit Review"
        )}
      </Button>
    </form>
  );
}
