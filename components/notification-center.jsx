"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyNotifications, getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";
import { useLanguage } from "@/components/language-provider";

export function NotificationCenter({ initialUnreadCount } = {}) {
  const { t, isStaff } = useLanguage();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(
    typeof initialUnreadCount === "number" ? initialUnreadCount : 0
  );
  const [hasLoadedList, setHasLoadedList] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const fetchList = async () => {
    setListLoading(true);
    setError("");
    try {
      const result = await getMyNotifications();
      setNotifications(result.notifications || []);
      setUnreadCount(result.unreadCount ?? 0);
      setHasLoadedList(true);
    } catch {
      setError(isStaff ? "Notifications could not be loaded. Please try again." : t("notifications.errorLoad", "Notifications could not be loaded. Please try again."));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (typeof initialUnreadCount === "number") {
      setUnreadCount(initialUnreadCount);
      return;
    }

    let active = true;
    getUnreadNotificationCount()
      .then((res) => {
        if (active && typeof res?.unreadCount === "number") {
          setUnreadCount(res.unreadCount);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [initialUnreadCount]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (!panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
      if (event.key === "Tab" && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll("button:not([disabled])")];
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.querySelector("button")?.focus();
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  const markRead = async (id) => {
    setSaving(true);
    setError("");
    try {
      await markNotificationRead(id);
      await fetchList();
    } catch {
      setError(isStaff ? "This notification could not be marked as read." : t("notifications.errorMark", "This notification could not be marked as read."));
    } finally {
      setSaving(false);
    }
  };

  const markAllRead = async () => {
    setSaving(true);
    setError("");
    try {
      await markAllNotificationsRead();
      await fetchList();
    } catch {
      setError(isStaff ? "Notifications could not be marked as read." : t("notifications.errorMarkAll", "Notifications could not be marked as read."));
    } finally {
      setSaving(false);
    }
  };

  const toggleOpen = () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && !hasLoadedList && !listLoading) {
      fetchList();
    }
  };

  return (
    <div className="relative">
      <button ref={triggerRef} type="button" className="relative inline-flex h-10 w-10 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={toggleOpen} aria-label={isStaff ? "Notifications" : t("notifications.title", "Notifications")} aria-expanded={open} aria-controls="notification-panel" aria-haspopup="dialog">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>
      {open && <div id="notification-panel" ref={panelRef} role="dialog" aria-label={isStaff ? "Notifications" : t("notifications.title", "Notifications")} className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-card p-3 text-foreground shadow-lg">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-medium text-foreground">{isStaff ? "Notifications" : t("notifications.title", "Notifications")}</h3>{unreadCount > 0 && <Button variant="ghost" size="sm" onClick={markAllRead} disabled={saving}><CheckCheck className="mr-1 h-4 w-4" />{isStaff ? "Mark all read" : t("notifications.markAllRead", "Mark all read")}</Button>}</div>
        {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
        <div className="max-h-96 space-y-1 overflow-y-auto">{listLoading ? <p className="py-6 text-center text-sm text-muted-foreground" role="status">{isStaff ? "Loading notifications..." : t("notifications.loading", "Loading notifications...")}</p> : notifications.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{isStaff ? "You don't have any notifications yet." : t("notifications.empty", "You don't have any notifications yet.")}</p> : notifications.map((notification) => <button key={notification.id} disabled={saving} onClick={() => !notification.readAt && markRead(notification.id)} className={`w-full border-b border-border p-3 text-left last:border-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${notification.readAt ? "" : "bg-primary/5"}`}><p className="text-sm font-medium text-foreground">{notification.title}</p><p className="mt-1 text-xs text-muted-foreground">{notification.message}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(notification.createdAt).toLocaleString()}</p></button>)}</div>
      </div>}
    </div>
  );
}
