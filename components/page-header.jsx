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
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="text-emerald-600 dark:text-emerald-400 shrink-0">
            {React.cloneElement(icon, {
              className: "h-7 w-7 sm:h-9 sm:w-9",
            })}
          </div>
        )}
        <h1 className="min-w-0 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
      </div>
      <Link href={backLink} className="w-fit">
        <Button
          variant="outline"
          className="border-border/80 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel}
        </Button>
      </Link>
    </div>
  );
}
