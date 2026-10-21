import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, CalendarDays } from "lucide-react";

const labels = { total: "Total appointments", upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled", noShow: "No-shows", patientsTreated: "Patients treated", doctorsConsulted: "Doctors consulted", users: "Registered users", doctors: "Doctors", patients: "Patients", totalAppointments: "Total appointments" };

function MetricCards({ metrics, admin = false }) {
  return (
    <div className={`grid min-w-0 w-full ${admin ? "grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"}`}>
      {Object.entries(metrics || {}).map(([key, value]) => (
        <div key={key} className={`min-w-0 rounded-xl border border-border/80 bg-card shadow-xs ${admin ? "min-h-20 p-3 sm:min-h-24 sm:p-4" : "p-4"}`}>
          <p className="text-xs font-medium text-muted-foreground">{labels[key] || key}</p>
          <p className={`mt-1 font-bold tracking-tight text-foreground ${admin ? "text-xl sm:text-2xl" : "text-2xl"}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function Bars({ title, data = [], color = "bg-emerald-500", compact = false, admin = false, statusColors = false }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const hasData = data.some((item) => item.count > 0);
  return (
    <div className={admin ? "min-w-0" : "space-y-3"}>
      {!admin && <h3 className="text-sm font-medium text-foreground">{title}</h3>}
      {hasData ? (
        compact ? (
          <>
          <div className={`grid grid-flow-col auto-cols-fr items-end gap-px ${admin ? "h-24" : "h-28"}`} aria-label={`${title}: ${data.map((item) => `${item.label}: ${item.count}`).join(", ")}`} role="img">
            {data.map((item) => (
              <div key={item.label || item.status} className="group relative h-full rounded-t bg-muted/60" title={`${item.label || item.status}: ${item.count}`}>
                <div className={`absolute inset-x-0 bottom-0 rounded-t ${color}`} style={{ height: `${Math.max(4, (item.count / Math.max(1, ...data.map((entry) => entry.count))) * 100)}%` }} />
              </div>
            ))}
          </div>
          {admin && data.length > 1 && <div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>{data[0].label}</span><span>{data[Math.floor((data.length - 1) / 2)].label}</span><span>{data[data.length - 1].label}</span></div>}
          </>
        ) : data.map((item) => {
          const itemColor = statusColors
            ? ({ COMPLETED: "bg-primary", VERIFIED: "bg-primary", CONFIRMED: "bg-primary", IN_PROGRESS: "bg-teal-700", SCHEDULED: "bg-teal-500", PENDING: "bg-amber-500", CANCELLED: "bg-slate-400", NO_SHOW: "bg-rose-400", REJECTED: "bg-rose-400" }[item.status] || "bg-muted-foreground")
            : color;
          return (
          <div key={item.label || item.status} className={admin ? "space-y-1" : "space-y-1.5"}>
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>{item.label || item.status}</span>
              <span className="text-foreground">{item.count}</span>
            </div>
            <div className={`overflow-hidden rounded-full bg-muted/60 ${admin ? "h-1.5" : "h-2"}`}>
              <div
                className={`h-full rounded-full ${itemColor} transition-all duration-300`}
                style={{ width: `${(item.count / Math.max(total, 1)) * 100}%` }}
              />
            </div>
          </div>
        )})
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground text-center">
          No appointment data yet for this period.
        </div>
      )}
    </div>
  );
}

export function AnalyticsPanel({ title, analytics, basePath, admin = false }) {
  const ranges = [7, 30, 90, 365];
  return (
    <div className={`min-w-0 w-full ${admin ? "space-y-4" : "space-y-6"}`}>
      <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${admin ? "sm:gap-4" : ""}`}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <BarChart3 className={`h-5 w-5 shrink-0 ${admin ? "text-primary" : "text-emerald-600 dark:text-primary"}`} />
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">Database-backed summary for the selected period.</p>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:shrink-0">
          {ranges.map((range) => (
            <Link key={range} href={`${basePath}?range=${range}`}>
              <Badge
                variant={analytics.range === range ? "default" : "outline"}
                className={`cursor-pointer transition-all ${
                  analytics.range === range
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                Last {range === 365 ? "year" : `${range} days`}
              </Badge>
            </Link>
          ))}
        </div>
      </div>
      <MetricCards metrics={analytics.metrics} admin={admin} />
      <div className={`grid min-w-0 w-full ${admin ? "gap-4 md:grid-cols-2" : "gap-6 lg:grid-cols-2"}`}>
        <Card className={`min-w-0 border-border/80 shadow-xs ${admin ? "h-full" : "dark:border-border"}`}>
          <CardHeader className={admin ? "gap-1 p-4 pb-2" : ""}>
            <CardTitle className={`${admin ? "text-sm" : "text-base"} font-semibold text-foreground`}>Appointments over time</CardTitle>
          </CardHeader>
          <CardContent className={admin ? "px-4 pb-4 pt-0" : ""}>
            <Bars title="Appointments" data={analytics.trend} compact admin={admin} />
          </CardContent>
        </Card>
        <Card className={`min-w-0 border-border/80 shadow-xs ${admin ? "h-full" : "dark:border-border"}`}>
          <CardHeader className={admin ? "gap-1 p-4 pb-2" : ""}>
            <CardTitle className={`${admin ? "text-sm" : "text-base"} font-semibold text-foreground`}>Status breakdown</CardTitle>
          </CardHeader>
          <CardContent className={admin ? "space-y-3 px-4 pb-4 pt-0" : ""}>
            <Bars title="Appointment statuses" data={analytics.statuses} color="bg-primary" admin={admin} statusColors />
          </CardContent>
        </Card>
      {admin && analytics.verification && <Card className="h-full min-w-0 border-border/80 shadow-xs"><CardHeader className="gap-1 p-4 pb-2"><CardTitle className="text-sm font-semibold text-foreground">Doctor verification status</CardTitle></CardHeader><CardContent className="space-y-3 px-4 pb-4 pt-0"><Bars title="Verification" data={analytics.verification} admin statusColors /></CardContent></Card>}
      {admin && analytics.userGrowth && <Card className="h-full min-w-0 border-border/80 shadow-xs"><CardHeader className="gap-1 p-4 pb-2"><CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground"><CalendarDays className="h-4 w-4 text-primary" />User growth</CardTitle></CardHeader><CardContent className="px-4 pb-4 pt-0"><Bars title="New users" data={analytics.userGrowth} compact admin /></CardContent></Card>}
      </div>
      {analytics.verification && (
        !admin && <Card className="border-border/80 shadow-xs dark:border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Doctor verification status</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars title="Verification" data={analytics.verification} color="bg-amber-500" />
          </CardContent>
        </Card>
      )}
      {analytics.userGrowth && (
        !admin && <Card className="border-border/80 shadow-xs dark:border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-primary" />
              User growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Bars title="New users" data={analytics.userGrowth} color="bg-indigo-500" compact />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
