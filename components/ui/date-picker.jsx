"use client";

import { useState, useRef, useEffect } from "react";
import { format, parse, isValid, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, setMonth, setYear } from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DatePicker({
  name,
  defaultValue = "",
  value: controlledValue,
  onChange,
  placeholder = "Select date",
  minDate,
  maxDate,
  disabled = false,
  className = "",
  id,
}) {
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  const value = controlledValue !== undefined ? (controlledValue || "") : internalValue;
  const [isOpen, setIsOpen] = useState(false);
  
  // Current view month & year in calendar
  const initialDate = value && isValid(parse(value, "yyyy-MM-dd", new Date()))
    ? parse(value, "yyyy-MM-dd", new Date())
    : new Date();
  const [viewDate, setViewDate] = useState(initialDate);

  const containerRef = useRef(null);

  // Sync internal state if defaultValue changes
  useEffect(() => {
    if (defaultValue !== undefined && controlledValue === undefined) {
      setInternalValue(defaultValue || "");
      if (defaultValue && isValid(parse(defaultValue, "yyyy-MM-dd", new Date()))) {
        setViewDate(parse(defaultValue, "yyyy-MM-dd", new Date()));
      }
    }
  }, [defaultValue, controlledValue]);

  // Close popover on outside click or escape
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectDate = (date) => {
    const formatted = format(date, "yyyy-MM-dd");
    if (controlledValue === undefined) {
      setInternalValue(formatted);
    }
    if (onChange) {
      onChange(formatted);
    }
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (controlledValue === undefined) {
      setInternalValue("");
    }
    if (onChange) {
      onChange("");
    }
  };

  const handleToday = () => {
    const today = new Date();
    setViewDate(today);
    handleSelectDate(today);
  };

  // Generate calendar days
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = [];
  let day = startDate;
  while (day <= endDate) {
    days.push(day);
    day = addDays(day, 1);
  }

  const selectedDate = value && isValid(parse(value, "yyyy-MM-dd", new Date()))
    ? parse(value, "yyyy-MM-dd", new Date())
    : null;

  const currentYear = viewDate.getFullYear();
  const years = [];
  for (let y = currentYear - 20; y <= currentYear + 20; y++) {
    years.push(y);
  }
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {name && <input type="hidden" name={name} value={value} id={id} />}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          isOpen ? "ring-2 ring-ring ring-offset-2" : ""
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={value ? "text-foreground font-medium" : "text-muted-foreground"}>
            {value && selectedDate ? format(selectedDate, "MMM dd, yyyy") : placeholder}
          </span>
        </div>

        {value && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClear}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClear(e); }}
            aria-label="Clear date"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {/* Popover Calendar */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Calendar date picker"
          className="absolute left-0 z-50 mt-1.5 w-72 rounded-xl border border-border bg-card p-3 shadow-xl backdrop-blur-xs animate-in fade-in-50 zoom-in-95"
        >
          {/* Header Controls: Navigation, Month & Year Pickers */}
          <div className="flex items-center justify-between gap-1 pb-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setViewDate((prev) => subMonths(prev, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-1">
              <label className="sr-only" htmlFor="date-picker-month">Month</label>
              <select
                id="date-picker-month"
                value={viewDate.getMonth()}
                onChange={(e) => setViewDate((prev) => setMonth(prev, Number(e.target.value)))}
                className="h-7 rounded border border-border/80 bg-background px-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {months.map((m, idx) => (
                  <option key={m} value={idx}>{m.slice(0, 3)}</option>
                ))}
              </select>

              <label className="sr-only" htmlFor="date-picker-year">Year</label>
              <select
                id="date-picker-year"
                value={viewDate.getFullYear()}
                onChange={(e) => setViewDate((prev) => setYear(prev, Number(e.target.value)))}
                className="h-7 rounded border border-border/80 bg-background px-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setViewDate((prev) => addMonths(prev, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground mb-1">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((dateItem) => {
              const isCurrentMonth = dateItem.getMonth() === viewDate.getMonth();
              const isSelected = selectedDate && format(dateItem, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
              const isToday = format(dateItem, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
              const dateItemStr = format(dateItem, "yyyy-MM-dd");

              const isBeforeMin = minDate && dateItemStr < minDate;
              const isAfterMax = maxDate && dateItemStr > maxDate;
              const isDayDisabled = isBeforeMin || isAfterMax;

              return (
                <button
                  key={dateItemStr}
                  type="button"
                  disabled={isDayDisabled}
                  onClick={() => handleSelectDate(dateItem)}
                  className={`h-8 w-8 rounded-lg text-xs font-medium transition-colors flex items-center justify-center relative ${
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : !isCurrentMonth
                      ? "text-muted-foreground/35 hover:bg-muted/40"
                      : isDayDisabled
                      ? "text-muted-foreground/30 cursor-not-allowed"
                      : "text-foreground hover:bg-muted/70"
                  } ${isToday && !isSelected ? "border border-primary/50 text-primary font-semibold" : ""}`}
                >
                  {format(dateItem, "d")}
                </button>
              );
            })}
          </div>

          {/* Footer Actions: Today & Clear */}
          <div className="mt-3 pt-2.5 border-t border-border/80 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleToday}
              className="font-medium text-primary hover:underline px-1 py-0.5 rounded"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground px-1 py-0.5 rounded"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
