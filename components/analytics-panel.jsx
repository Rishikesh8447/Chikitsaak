import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  CalendarDays,
  Users,
  Stethoscope,
  HeartPulse,
  CalendarCheck,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  Activity,
  AlertCircle,
  FileCheck,
} from "lucide-react";

const metricMeta = {
  users: {
    label: "Registered users",
    description: "Total platform accounts",
    icon: Users,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
  },
  doctors: {
    label: "Clinicians",
    description: "Doctor accounts registered",
    icon: Stethoscope,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  patients: {
    label: "Patients",
    description: "Patients seeking care",
    icon: HeartPulse,
    color: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-500/10",
  },
  totalAppointments: {
    label: "Total consultations",
    description: "Booked in selected period",
    icon: CalendarCheck,
    color: "text-primary dark:text-primary",
    bg: "bg-primary/10",
  },
  total: {
    label: "Total appointments",
    description: "Consultations in window",
    icon: CalendarCheck,
    color: "text-primary dark:text-primary",
    bg: "bg-primary/10",
  },
  completed: {
    label: "Completed visits",
    description: "Concluded consultations",
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  upcoming: {
    label: "Upcoming visits",
    description: "Scheduled & confirmed",
    icon: Clock,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-500/10",
  },
  cancelled: {
    label: "Cancelled visits",
    description: "Patient or clinician cancellations",
    icon: XCircle,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
  },
  noShow: {
    label: "No-shows",
    description: "Unattended scheduled slots",
    icon: AlertCircle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
  },
  patientsTreated: {
    label: "Patients treated",
    description: "Unique patients completed",
    icon: HeartPulse,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  doctorsConsulted: {
    label: "Doctors consulted",
    description: "Unique clinicians seen",
    icon: Stethoscope,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
  },
};

function MetricCards({ metrics, admin = false }) {
  if (!metrics) return null;

  return (
    <div
      className={`grid min-w-0 w-full ${
        admin
          ? "grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 sm:gap-4"
          : "grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      }`}
    >
      {Object.entries(metrics).map(([key, value]) => {
        const meta = metricMeta[key] || {
          label: key.replace(/([A-Z])/g, " $1").toLowerCase(),
          description: "Database metric",
          icon: Activity,
          color: "text-primary",
          bg: "bg-primary/10",
        };
        const Icon = meta.icon;

        return (
          <div
            key={key}
            className="min-w-0 flex flex-col justify-between rounded-xl border border-border/80 bg-card/70 p-4 shadow-xs transition-colors hover:border-border"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground truncate">
                {meta.label}
              </span>
              <div className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
                <Icon className={`size-4 ${meta.color}`} />
              </div>
            </div>

            <div className="mt-2.5">
              <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums sm:text-3xl">
                {typeof value === "number" ? value.toLocaleString() : value}
              </p>
              {admin && meta.description && (
                <p className="mt-1 text-[11px] text-muted-foreground truncate">
                  {meta.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrendBarChart({ title, data = [], emptyLabel = "No appointment data recorded for this period." }) {
  const max = Math.max(1, ...data.map((item) => item.count));
  const hasData = data.some((item) => item.count > 0);
  const total = data.reduce((sum, item) => sum + item.count, 0);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
        <Activity className="size-6 text-muted-foreground/40 mb-2" />
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Volume distribution</span>
        <span className="font-medium text-foreground tabular-nums">Total: {total.toLocaleString()}</span>
      </div>

      <div
        className="grid grid-flow-col auto-cols-fr items-end gap-1.5 h-36 pt-4 pb-1 border-b border-border/60"
        aria-label={`${title}: ${data.map((item) => `${item.label}: ${item.count}`).join(", ")}`}
        role="img"
      >
        {data.map((item, idx) => {
          const heightPct = Math.max(6, Math.round((item.count / max) * 100));

          return (
            <div
              key={item.label || idx}
              className="group relative flex h-full flex-col justify-end items-center"
              title={`${item.label}: ${item.count} consultations`}
            >
              <div
                className={`w-full max-w-[28px] rounded-t-md transition-all duration-300 ${
                  item.count > 0
                    ? "bg-primary group-hover:bg-primary/80"
                    : "bg-muted/40 group-hover:bg-muted/60"
                }`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          );
        })}
      </div>

      {data.length > 1 && (
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{data[0]?.label}</span>
          {data.length > 2 && (
            <span>{data[Math.floor((data.length - 1) / 2)]?.label}</span>
          )}
          <span>{data[data.length - 1]?.label}</span>
        </div>
      )}
    </div>
  );
}

function StatusBreakdownBars({ data = [] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const hasData = data.some((item) => item.count > 0);

  const statusColorMap = {
    COMPLETED: { bar: "bg-emerald-500", badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
    CONFIRMED: { bar: "bg-teal-500", badge: "border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-300" },
    IN_PROGRESS: { bar: "bg-blue-500", badge: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300" },
    SCHEDULED: { bar: "bg-sky-500", badge: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
    CANCELLED: { bar: "bg-rose-500", badge: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
    NO_SHOW: { bar: "bg-amber-500", badge: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
    VERIFIED: { bar: "bg-emerald-500", badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
    PENDING: { bar: "bg-amber-500", badge: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
    REJECTED: { bar: "bg-rose-500", badge: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  };

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
        <Activity className="size-6 text-muted-foreground/40 mb-2" />
        <p>No status records available for this period.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {data.map((item) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        const color = statusColorMap[item.status] || {
          bar: "bg-primary",
          badge: "border-primary/20 bg-primary/10 text-primary",
        };

        return (
          <div key={item.status} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                {item.status.replaceAll("_", " ")}
              </span>
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-semibold text-foreground">{item.count}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">({pct}%)</span>
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
              <div
                className={`h-full rounded-full ${color.bar} transition-all duration-300`}
                style={{ width: `${Math.max(item.count > 0 ? 3 : 0, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DoctorVerificationSummary({ data = [] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  const statusMap = {
    VERIFIED: { label: "Verified Clinicians", color: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
    PENDING: { label: "Pending Application", color: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
    REJECTED: { label: "Rejected Profiles", color: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {["VERIFIED", "PENDING", "REJECTED"].map((status) => {
          const item = data.find((entry) => entry.status === status) || { count: 0 };
          const meta = statusMap[status];

          return (
            <div
              key={status}
              className="rounded-lg border border-border/70 bg-card/60 p-3 text-center space-y-1"
            >
              <span className="text-[11px] font-medium text-muted-foreground block truncate">
                {meta.label.split(" ")[0]}
              </span>
              <p className="text-xl font-bold tabular-nums text-foreground">
                {item.count}
              </p>
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Verification ratio</span>
          <span className="font-medium text-foreground">
            {total > 0
              ? `${Math.round(((data.find((e) => e.status === "VERIFIED")?.count || 0) / total) * 100)}% verified`
              : "No doctor applications"}
          </span>
        </div>

        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/60">
          {data.map((item) => {
            const pct = total > 0 ? (item.count / total) * 100 : 0;
            const meta = statusMap[item.status] || { color: "bg-primary" };

            return (
              <div
                key={item.status}
                className={`${meta.color} transition-all duration-300`}
                style={{ width: `${pct}%` }}
                title={`${item.status}: ${item.count}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPanel({ title, analytics, basePath, admin = false }) {
  const ranges = [7, 30, 90, 365];
  const activeRange = Number(analytics?.range) || 30;

  return (
    <div className={`min-w-0 w-full ${admin ? "space-y-6" : "space-y-6"}`}>
      {/* Analytics Dashboard Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border/80 bg-card/60 p-4 sm:p-5 shadow-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="size-4.5" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {title || "Platform Analytics"}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Database-backed operational summary for the selected reporting period.
          </p>
        </div>

        {/* Date Range Selector with tab preservation */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap" role="radiogroup" aria-label="Reporting period selector">
          {ranges.map((range) => {
            const isActive = activeRange === range;
            const href = admin
              ? `${basePath}?tab=analytics&range=${range}`
              : `${basePath}?range=${range}`;

            return (
              <Link key={range} href={href} scroll={false}>
                <Badge
                  variant={isActive ? "default" : "outline"}
                  className={`cursor-pointer px-3 py-1 text-xs transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-checked={isActive}
                >
                  Last {range === 365 ? "year" : `${range} days`}
                </Badge>
              </Link>
            );
          })}
        </div>
      </div>

      {/* KPI Metric Cards */}
      <MetricCards metrics={analytics?.metrics} admin={admin} />

      {/* Analytics Visualization Charts Grid */}
      <div className="grid min-w-0 w-full gap-4 sm:gap-6 md:grid-cols-2">
        {/* Chart 1: Appointments Over Time */}
        <Card className="min-w-0 border-border/80 bg-card/70 shadow-xs">
          <CardHeader className="gap-1 p-4 sm:p-5 pb-2">
            <CardTitle className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
              <CalendarCheck className="size-4 text-primary" />
              <span>Appointments over time</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Trend of consultation bookings across the active period.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-2">
            <TrendBarChart
              title="Appointments"
              data={analytics?.trend}
              emptyLabel="No appointment activity recorded in this period."
            />
          </CardContent>
        </Card>

        {/* Chart 2: Appointment Status Breakdown */}
        <Card className="min-w-0 border-border/80 bg-card/70 shadow-xs">
          <CardHeader className="gap-1 p-4 sm:p-5 pb-2">
            <CardTitle className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              <span>Status breakdown</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Distribution of scheduled, completed, and cancelled visits.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-2">
            <StatusBreakdownBars data={analytics?.statuses} />
          </CardContent>
        </Card>

        {/* Chart 3: Doctor Verification Pipeline (Admin only) */}
        {admin && analytics?.verification && (
          <Card className="min-w-0 border-border/80 bg-card/70 shadow-xs">
            <CardHeader className="gap-1 p-4 sm:p-5 pb-2">
              <CardTitle className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                <span>Doctor verification status</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Distribution of clinician verification applications.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-2">
              <DoctorVerificationSummary data={analytics.verification} />
            </CardContent>
          </Card>
        )}

        {/* Chart 4: Platform User Growth (Admin only) */}
        {admin && analytics?.userGrowth && (
          <Card className="min-w-0 border-border/80 bg-card/70 shadow-xs">
            <CardHeader className="gap-1 p-4 sm:p-5 pb-2">
              <CardTitle className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
                <CalendarDays className="size-4 text-primary" />
                <span>Platform user growth</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                New user registrations during the active reporting period.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-2">
              <TrendBarChart
                title="New users"
                data={analytics.userGrowth}
                emptyLabel="No new user registrations recorded in this period."
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Non-admin fallbacks */}
      {!admin && analytics?.verification && (
        <Card className="border-border/80 bg-card/70 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Doctor verification status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBreakdownBars data={analytics.verification} />
          </CardContent>
        </Card>
      )}

      {!admin && analytics?.userGrowth && (
        <Card className="border-border/80 bg-card/70 shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CalendarDays className="h-4 w-4 text-primary" />
              User growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TrendBarChart title="New users" data={analytics.userGrowth} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
