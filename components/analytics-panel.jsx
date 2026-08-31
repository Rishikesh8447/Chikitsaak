import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, CalendarDays } from "lucide-react";

const labels = { total: "Total appointments", upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled", noShow: "No-shows", patientsTreated: "Patients treated", doctorsConsulted: "Doctors consulted", users: "Registered users", doctors: "Doctors", patients: "Patients", totalAppointments: "Total appointments" };

function MetricCards({ metrics }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      {Object.entries(metrics || {}).map(([key, value]) => (
        <div key={key} className="rounded-xl border border-border/80 dark:border-border bg-card p-4 shadow-xs min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{labels[key] || key}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</p>
        </div>
      ))}
    </div>
  );
}

function Bars({ title, data = [], color = "bg-emerald-500" }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  const hasData = data.some((item) => item.count > 0);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {hasData ? (
        data.map((item) => (
          <div key={item.label || item.status} className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground font-medium">
              <span>{item.label || item.status}</span>
              <span className="text-foreground">{item.count}</span>
            </div>
            <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
              <div
                className={`h-2 rounded-full ${color} transition-all duration-300`}
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground text-center">
          No appointment data yet for this period.
        </div>
      )}
    </div>
  );
}

export function AnalyticsPanel({ title, analytics, basePath }) {
  const ranges = [7, 30, 90, 365];
  return (
    <div className="space-y-6 min-w-0 w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            {title}
          </h2>
          <p className="text-xs text-muted-foreground">Database-backed summary for the selected period.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ranges.map((range) => (
            <Link key={range} href={`${basePath}?range=${range}`}>
              <Badge
                variant={analytics.range === range ? "default" : "outline"}
                className={`cursor-pointer transition-all ${
                  analytics.range === range
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                Last {range === 365 ? "year" : `${range} days`}
              </Badge>
            </Link>
          ))}
        </div>
      </div>
      <MetricCards metrics={analytics.metrics} />
      <div className="grid gap-6 lg:grid-cols-2 min-w-0 w-full">
        <Card className="border-border/80 dark:border-border shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Appointments over time</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars title="Appointments" data={analytics.trend} />
          </CardContent>
        </Card>
        <Card className="border-border/80 dark:border-border shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Status breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars title="Appointment statuses" data={analytics.statuses} color="bg-teal-500" />
          </CardContent>
        </Card>
      </div>
      {analytics.verification && (
        <Card className="border-border/80 dark:border-border shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Doctor verification status</CardTitle>
          </CardHeader>
          <CardContent>
            <Bars title="Verification" data={analytics.verification} color="bg-amber-500" />
          </CardContent>
        </Card>
      )}
      {analytics.userGrowth && (
        <Card className="border-border/80 dark:border-border shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              User growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Bars title="New users" data={analytics.userGrowth} color="bg-indigo-500" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
