"use client";

export default function LaboratoryWorkspaceError({ unstable_retry }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <section role="alert" className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Laboratory workspace unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We could not load this organization’s workspace. Your access has not changed. Please try again, or return later if the issue continues.
        </p>
        <button type="button" onClick={() => unstable_retry()} className="mt-4 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Try again
        </button>
      </section>
    </main>
  );
}
