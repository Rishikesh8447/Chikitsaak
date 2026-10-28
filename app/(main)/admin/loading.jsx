export default function AdminLoading() {
  return (
    <div className="min-w-0 w-full space-y-6" aria-busy="true" aria-label="Loading administration workspace">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-muted/60 animate-pulse" />
        <div className="h-4 w-96 max-w-full rounded bg-muted/40 animate-pulse" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="min-h-24 rounded-xl border border-border/80 bg-card/60 p-4 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-muted/60 animate-pulse" />
              <div className="size-6 rounded-md bg-muted/40 animate-pulse" />
            </div>
            <div className="h-7 w-16 rounded bg-muted/80 animate-pulse" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        <div className="min-h-64 rounded-xl border border-border/80 bg-card/60 p-5 shadow-xs space-y-4">
          <div className="h-4 w-36 rounded bg-muted/60 animate-pulse" />
          <div className="h-48 rounded-lg bg-muted/30 animate-pulse" />
        </div>
        <div className="min-h-64 rounded-xl border border-border/80 bg-card/60 p-5 shadow-xs space-y-4">
          <div className="h-4 w-36 rounded bg-muted/60 animate-pulse" />
          <div className="h-48 rounded-lg bg-muted/30 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
