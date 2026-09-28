"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, ChevronRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { groupSlotsByLocalDate, parseLocalCalendarDate } from "@/lib/appointment-time.mjs";

export function SlotPicker({ days, onSelectSlot }) {
  const [selectedSlot, setSelectedSlot] = useState(null);
  const localDays = groupSlotsByLocalDate(days);

  // Find first day with slots as default tab
  const firstDayWithSlots =
    localDays.find((day) => day.slots.length > 0)?.date || localDays[0]?.date;
  const [activeTab, setActiveTab] = useState(firstDayWithSlots);

  const handleSlotSelect = (slot) => {
    setSelectedSlot(slot);
  };

  const confirmSelection = () => {
    if (selectedSlot) {
      onSelectSlot(selectedSlot);
    }
  };

  return (
    <section aria-label="Choose appointment time" className="space-y-6">
      <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground"><span className="font-medium">Consultation cost: 2 credits</span><span className="ml-2 text-muted-foreground">Choose a day and a 30-minute time.</span></div>
      <Tabs
        defaultValue={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="w-full justify-start gap-1 overflow-x-auto bg-muted/40 p-1" aria-label="Available appointment dates">
          {localDays.map((day) => (
            <TabsTrigger
              key={day.date}
              value={day.date}
              disabled={day.slots.length === 0}
              className={day.slots.length === 0 ? "cursor-not-allowed opacity-50" : "data-active:bg-primary data-active:text-primary-foreground data-active:font-semibold data-active:shadow-sm"}
            >
              <div className="flex gap-2">
                <div className=" opacity-80">
                  {format(parseLocalCalendarDate(day.date), "MMM d")}
                </div>
                <div>({format(parseLocalCalendarDate(day.date), "EEE")})</div>
              </div>
              {day.slots.length > 0 && (
                <div className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary data-active:bg-primary-foreground/20 data-active:text-primary-foreground">
                  {day.slots.length} slots
                </div>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {localDays.map((day) => (
          <TabsContent key={day.date} value={day.date} className="pt-4">
            {day.slots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No available slots for this day.
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="mb-2 text-base font-semibold text-foreground">
                  {day.displayDate}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {day.slots.map((slot) => (
                    <Button
                      key={slot.startTime}
                      type="button"
                      variant={selectedSlot?.startTime === slot.startTime ? "default" : "outline"}
                      className={`h-auto justify-start p-0 text-left ${
                        selectedSlot?.startTime === slot.startTime
                          ? ""
                          : "hover:border-primary/40"
                      }`}
                      onClick={() => handleSlotSelect(slot)}
                    >
                      <CardContent className="p-3 flex items-center">
                        <Clock
                          className={`h-4 w-4 mr-2 ${
                            selectedSlot?.startTime === slot.startTime
                              ? "text-primary-foreground"
                              : "text-muted-foreground"
                          }`}
                        />
                        <span
                          className={
                            selectedSlot?.startTime === slot.startTime
                            ? "text-primary-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {format(new Date(slot.startTime), "h:mm a")}
                        </span>
                      </CardContent>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <div className="sticky bottom-0 -mx-2 flex justify-end border-t border-border bg-card/95 px-2 py-3 backdrop-blur sm:mx-0 sm:px-0">
        <Button
          onClick={confirmSelection}
          disabled={!selectedSlot}
          size="lg"
          className="w-full sm:min-w-48 sm:w-auto"
        >
          Continue
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
