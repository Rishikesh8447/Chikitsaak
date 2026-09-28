import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import React from "react";
import { Button } from "./ui/button";

/**
 * Reusable page header component with back button and title
 *
 * @param {React.ReactNode} props.icon - Icon component to display next to the title
 * @param {string} props.title - Page title
 * @param {string} props.backLink - URL to navigate back to (defaults to home)
 * @param {string} props.backLabel - Text for the back link (defaults to "Back to Home")
 */
export function PageHeader({
  icon,
  title,
  backLink = "/",
  backLabel = "Back to Home",
  description,
  action,
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{React.cloneElement(icon, { className: "size-4" })}</span>}
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">{title}</h1>
        </div>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action || (backLink && <Button asChild variant="outline" size="sm" className="w-fit"><Link href={backLink}><ArrowLeft className="size-4" />{backLabel}</Link></Button>)}
    </div>
  );
}
