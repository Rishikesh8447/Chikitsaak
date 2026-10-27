"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Plus,
  Loader2,
  Trash2,
  Edit2,
  Calendar,
  Globe,
  Ban,
  Check,
} from "lucide-react";
import { format } from "date-fns";
import {
  setAvailabilitySlots,
  updateAvailabilitySlot,
  removeAvailabilitySlot,
} from "@/actions/doctor";
import { toast } from "sonner";

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function TimeSelector({ value, onChange, disabled = false }) {
  const { hour, minute, period } = value;

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={hour}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, hour: Number(e.target.value) })}
        className="h-9 w-14 rounded-md border border-input bg-background px-1.5 text-center text-sm font-medium focus:ring-1 focus:ring-primary disabled:opacity-50"
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, "0")}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground font-semibold">:</span>
      <select
        value={minute}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, minute: Number(e.target.value) })}
        className="h-9 w-14 rounded-md border border-input bg-background px-1.5 text-center text-sm font-medium focus:ring-1 focus:ring-primary disabled:opacity-50"
      >
        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
        {![0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].includes(minute) && (
          <option value={minute}>{String(minute).padStart(2, "0")}</option>
        )}
      </select>
      <div className="flex rounded-md border border-input overflow-hidden shrink-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...value, period: "AM" })}
          className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
            period === "AM"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          AM
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...value, period: "PM" })}
          className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
            period === "PM"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          PM
        </button>
      </div>
    </div>
  );
}

export function AvailabilitySettings({ slots = [] }) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [scheduleType, setScheduleType] = useState("recurring"); // "recurring" | "specific_date"
  const [dayOfWeek, setDayOfWeek] = useState(""); // "" = Every day, "0".."6"
  const [specificDate, setSpecificDate] = useState("");
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [intervals, setIntervals] = useState([
    {
      start: { hour: 9, minute: 0, period: "AM" },
      end: { hour: 5, minute: 0, period: "PM" },
    },
  ]);

  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [timezoneInfo, setTimezoneInfo] = useState("");

  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const offsetMinutes = -new Date().getTimezoneOffset();
      const sign = offsetMinutes >= 0 ? "+" : "-";
      const absMinutes = Math.abs(offsetMinutes);
      const hours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
      const mins = String(absMinutes % 60).padStart(2, "0");
      setTimezoneInfo(`${tz} (GMT${sign}${hours}:${mins})`);
    } catch {
      setTimezoneInfo("Local browser timezone");
    }
  }, []);

  const openAddModal = () => {
    setEditingSlot(null);
    setScheduleType("recurring");
    setDayOfWeek("");
    setSpecificDate("");
    setIsUnavailable(false);
    setIntervals([
      {
        start: { hour: 9, minute: 0, period: "AM" },
        end: { hour: 5, minute: 0, period: "PM" },
      },
    ]);
    setIsModalOpen(true);
  };

  const openEditModal = (slot) => {
    setEditingSlot(slot);

    const startD = new Date(slot.startTime);
    const endD = new Date(slot.endTime);

    const startH24 = startD.getHours();
    const startM = startD.getMinutes();
    const startPeriod = startH24 >= 12 ? "PM" : "AM";
    const startH12 = startH24 % 12 === 0 ? 12 : startH24 % 12;

    const endH24 = endD.getHours();
    const endM = endD.getMinutes();
    const endPeriod = endH24 >= 12 ? "PM" : "AM";
    const endH12 = endH24 % 12 === 0 ? 12 : endH24 % 12;

    setIntervals([
      {
        start: { hour: startH12, minute: startM, period: startPeriod },
        end: { hour: endH12, minute: endM, period: endPeriod },
      },
    ]);

    if (slot.blockedDate) {
      setScheduleType("specific_date");
      setSpecificDate(format(new Date(slot.blockedDate), "yyyy-MM-dd"));
      setDayOfWeek("");
    } else {
      setScheduleType("recurring");
      setDayOfWeek(slot.dayOfWeek === null ? "" : String(slot.dayOfWeek));
      setSpecificDate("");
    }

    setIsUnavailable(slot.status === "BLOCKED");
    setIsModalOpen(true);
  };

  const addInterval = () => {
    const lastInterval = intervals[intervals.length - 1];
    let nextStartHour = lastInterval ? lastInterval.end.hour : 6;
    let nextStartPeriod = lastInterval ? lastInterval.end.period : "PM";

    if (nextStartHour >= 12) {
      nextStartHour = 1;
    } else {
      nextStartHour = Math.min(12, nextStartHour + 1);
    }

    let nextEndHour = nextStartHour + 3;
    let nextEndPeriod = nextStartPeriod;
    if (nextEndHour > 12) {
      nextEndHour = nextEndHour - 12;
      nextEndPeriod = nextStartPeriod === "AM" ? "PM" : "AM";
    }

    setIntervals([
      ...intervals,
      {
        start: { hour: nextStartHour, minute: 0, period: nextStartPeriod },
        end: { hour: nextEndHour, minute: 0, period: nextEndPeriod },
      },
    ]);
  };

  const removeInterval = (index) => {
    if (intervals.length <= 1) return;
    setIntervals(intervals.filter((_, i) => i !== index));
  };

  const updateInterval = (index, field, value) => {
    const updated = [...intervals];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setIntervals(updated);
  };

  const handleSaveChanges = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const convertedIntervals = [];

      if (!isUnavailable) {
        for (let i = 0; i < intervals.length; i++) {
          const item = intervals[i];
          const startH24 =
            item.start.period === "AM"
              ? item.start.hour === 12
                ? 0
                : item.start.hour
              : item.start.hour === 12
              ? 12
              : item.start.hour + 12;

          const endH24 =
            item.end.period === "AM"
              ? item.end.hour === 12
                ? 0
                : item.end.hour
              : item.end.hour === 12
              ? 12
              : item.end.hour + 12;

          const startMinutes = startH24 * 60 + item.start.minute;
          const endMinutes = endH24 * 60 + item.end.minute;

          if (startMinutes >= endMinutes) {
            toast.error(
              `Interval ${i + 1}: Start time must be before end time`
            );
            setSaving(false);
            return;
          }

          const baseDate =
            scheduleType === "specific_date" && specificDate
              ? new Date(specificDate + "T00:00:00")
              : new Date();
          const startD = new Date(
            baseDate.getFullYear(),
            baseDate.getMonth(),
            baseDate.getDate(),
            startH24,
            item.start.minute,
            0,
            0
          );
          const endD = new Date(
            baseDate.getFullYear(),
            baseDate.getMonth(),
            baseDate.getDate(),
            endH24,
            item.end.minute,
            0,
            0
          );

          convertedIntervals.push({
            startTime: startD.toISOString(),
            endTime: endD.toISOString(),
            startMinutes,
            endMinutes,
          });
        }

        // Validate overlapping intervals
        convertedIntervals.sort((a, b) => a.startMinutes - b.startMinutes);
        for (let i = 0; i < convertedIntervals.length - 1; i++) {
          if (
            convertedIntervals[i].endMinutes >
            convertedIntervals[i + 1].startMinutes
          ) {
            toast.error("Intervals cannot overlap each other");
            setSaving(false);
            return;
          }
        }
      } else {
        const baseDate =
          scheduleType === "specific_date" && specificDate
            ? new Date(specificDate + "T00:00:00")
            : new Date();
        const startD = new Date(
          baseDate.getFullYear(),
          baseDate.getMonth(),
          baseDate.getDate(),
          0,
          0,
          0,
          0
        );
        const endD = new Date(
          baseDate.getFullYear(),
          baseDate.getMonth(),
          baseDate.getDate(),
          23,
          59,
          0,
          0
        );
        convertedIntervals.push({
          startTime: startD.toISOString(),
          endTime: endD.toISOString(),
        });
      }

      const formData = new FormData();
      if (editingSlot?.id) {
        formData.set("slotId", editingSlot.id);
      }

      if (scheduleType === "specific_date") {
        if (!specificDate) {
          toast.error("Please select a specific date");
          setSaving(false);
          return;
        }
        formData.set("blockedDate", specificDate);
        formData.set("dayOfWeek", "");
      } else {
        formData.set("dayOfWeek", dayOfWeek);
      }

      formData.set("status", isUnavailable ? "BLOCKED" : "AVAILABLE");
      formData.set("startTime", convertedIntervals[0].startTime);
      formData.set("endTime", convertedIntervals[0].endTime);
      formData.set("intervals", JSON.stringify(convertedIntervals));

      const result = editingSlot?.id
        ? await updateAvailabilitySlot(formData)
        : await setAvailabilitySlots(formData);

      if (result?.success) {
        toast.success(
          editingSlot
            ? "Availability updated successfully"
            : "Availability added successfully"
        );
        setIsModalOpen(false);
        router.refresh();
      } else {
        toast.error(result?.error || "Failed to save availability");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save availability");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSlot = async (slotId) => {
    setRemovingId(slotId);
    try {
      const formData = new FormData();
      formData.set("slotId", slotId);
      const result = await removeAvailabilitySlot(formData);
      if (result?.success) {
        toast.success("Availability period removed");
        router.refresh();
      } else {
        toast.error(result?.error || "Failed to remove availability");
      }
    } catch (err) {
      toast.error(err.message || "Failed to remove availability");
    } finally {
      setRemovingId(null);
    }
  };

  const formatTimeString = (dateString) => {
    try {
      return format(new Date(dateString), "h:mm a");
    } catch {
      return "Invalid time";
    }
  };

  return (
    <>
      <Card className="border-border shadow-none">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold text-foreground flex items-center">
                <Clock className="h-5 w-5 mr-2 text-emerald-600 dark:text-primary" />
                Availability Settings
              </CardTitle>
              <CardDescription className="mt-1">
                Configure your consultation hours, multiple daily intervals, or
                unavailable periods.
              </CardDescription>
            </div>
            <Button
              type="button"
              onClick={openAddModal}
              className="shrink-0 font-medium"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Availability
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {timezoneInfo && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5 text-emerald-600 dark:text-primary shrink-0" />
              <span>
                Times are displayed in your local timezone:{" "}
                <span className="font-semibold text-foreground">
                  {timezoneInfo}
                </span>
              </span>
            </div>
          )}

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
              Current Availability Schedule
            </h3>

            {slots.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Clock className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium text-foreground">
                  No availability periods configured
                </p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Add your working hours to start accepting appointment bookings
                  from patients.
                </p>
                <Button
                  onClick={openAddModal}
                  variant="outline"
                  size="sm"
                  className="mt-4"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Set Availability Now
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {slots.map((slot) => {
                  const isBlocked = slot.status === "BLOCKED";
                  const scheduleLabel = slot.blockedDate
                    ? format(new Date(slot.blockedDate), "EEEE, MMM d, yyyy")
                    : slot.dayOfWeek === null
                    ? "Every day"
                    : `Every ${weekdays[slot.dayOfWeek]}`;

                  return (
                    <div
                      key={slot.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-border p-4 transition-colors hover:bg-muted/20 gap-3"
                    >
                      <div className="flex items-start sm:items-center gap-3">
                        <div
                          className={`rounded-lg p-2.5 shrink-0 ${
                            isBlocked
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {isBlocked ? (
                            <Ban className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {scheduleLabel}
                            </span>
                            <Badge
                              variant={isBlocked ? "destructive" : "secondary"}
                              className="text-[11px] font-medium"
                            >
                              {isBlocked ? "Unavailable" : "Available"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {isBlocked ? (
                              "Entire period marked unavailable"
                            ) : (
                              <>
                                <span className="font-medium text-foreground/90">
                                  {formatTimeString(slot.startTime)}
                                </span>{" "}
                                –{" "}
                                <span className="font-medium text-foreground/90">
                                  {formatTimeString(slot.endTime)}
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(slot)}
                          className="h-8 px-2.5 text-xs text-foreground hover:bg-muted"
                        >
                          <Edit2 className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={removingId === slot.id}
                          onClick={() => handleRemoveSlot(slot.id)}
                          aria-label={`Remove ${scheduleLabel} availability`}
                          className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          {removingId === slot.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 bg-muted/30 border border-border/80 rounded-xl">
            <h4 className="font-medium text-foreground mb-1 flex items-center text-xs uppercase tracking-wider">
              <Calendar className="h-3.5 w-3.5 mr-1.5 text-emerald-600 dark:text-primary shrink-0" />
              Appointment Protection Policy
            </h4>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Updating your availability will not cancel or reschedule existing
              confirmed appointments. If you modify your hours, any active
              booked appointment must remain within your newly defined working
              intervals.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Edit / Add Availability Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl">
          <form onSubmit={handleSaveChanges}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Clock className="h-5 w-5 text-emerald-600 dark:text-primary" />
                {editingSlot ? "Edit availability" : "Set availability"}
              </DialogTitle>
              <DialogDescription>
                Customize your working schedule or mark periods as unavailable.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              {/* Schedule / Scope Selector */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Schedule Scope
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setScheduleType("recurring")}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs font-medium transition-all ${
                      scheduleType === "recurring"
                        ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    <Calendar className="h-4 w-4" />
                    Recurring schedule
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleType("specific_date")}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-xs font-medium transition-all ${
                      scheduleType === "specific_date"
                        ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    <Clock className="h-4 w-4" />
                    Specific date
                  </button>
                </div>

                {scheduleType === "recurring" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="dayOfWeekSelect" className="text-xs">
                      Applies to
                    </Label>
                    <select
                      id="dayOfWeekSelect"
                      value={dayOfWeek}
                      onChange={(e) => setDayOfWeek(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Every day (daily schedule)</option>
                      <option value="1">Every Monday</option>
                      <option value="2">Every Tuesday</option>
                      <option value="3">Every Wednesday</option>
                      <option value="4">Every Thursday</option>
                      <option value="5">Every Friday</option>
                      <option value="6">Every Saturday</option>
                      <option value="0">Every Sunday</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="specificDateInput" className="text-xs">
                      Calendar Date
                    </Label>
                    <Input
                      id="specificDateInput"
                      type="date"
                      value={specificDate}
                      onChange={(e) => setSpecificDate(e.target.value)}
                      className="bg-background border-input"
                    />
                  </div>
                )}
              </div>

              {/* Availability Status / Unavailable Option */}
              <div className="rounded-lg border border-border p-3.5 bg-muted/20">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium text-foreground">
                      I&apos;m unavailable
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Block appointments during this entire schedule period
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isUnavailable}
                    onChange={(e) => setIsUnavailable(e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
                  />
                </label>
              </div>

              {/* Working Intervals */}
              {!isUnavailable && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Working Intervals
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addInterval}
                      className="h-7 text-xs font-medium"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      New interval
                    </Button>
                  </div>

                  <div className="space-y-2.5">
                    {intervals.map((interval, index) => (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border p-3 bg-background gap-3"
                      >
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-semibold text-muted-foreground w-16">
                            Interval {index + 1}:
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <TimeSelector
                            value={interval.start}
                            onChange={(val) =>
                              updateInterval(index, "start", val)
                            }
                          />
                          <span className="text-xs font-medium text-muted-foreground px-1">
                            to
                          </span>
                          <TimeSelector
                            value={interval.end}
                            onChange={(val) => updateInterval(index, "end", val)}
                          />
                        </div>

                        {intervals.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeInterval(index)}
                            aria-label={`Remove interval ${index + 1}`}
                            className="text-muted-foreground hover:text-destructive self-end sm:self-center"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timezone note */}
              {timezoneInfo && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Globe className="h-3 w-3 shrink-0" />
                  Hours are configured in your local timezone ({timezoneInfo}).
                </p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={saving}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving changes...
                  </>
                ) : (
                  <>
                    <Check className="mr-1.5 h-4 w-4" />
                    Save changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
