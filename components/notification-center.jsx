"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = async () => {
    const result = await getMyNotifications();
    setNotifications(result.notifications);
    setUnreadCount(result.unreadCount);
  };

  useEffect(() => { refresh().catch(() => undefined); }, []);

  const markRead = async (id) => {
    await markNotificationRead(id);
    await refresh();
  };

  const markAllRead = async () => {
    await markAllNotificationsRead();
    await refresh();
  };

  return (
    <div className="relative">
      <Button variant="ghost" className="relative h-10 w-10 p-0" onClick={() => setOpen((value) => !value)} aria-label="Notifications">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </Button>
      {open && <div className="absolute right-0 top-12 z-50 w-80 rounded-md border border-emerald-900/30 bg-background p-3 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-medium text-white">Notifications</h3>{unreadCount > 0 && <Button variant="ghost" size="sm" onClick={markAllRead}><CheckCheck className="mr-1 h-4 w-4" />Mark all read</Button>}</div>
        <div className="max-h-96 space-y-2 overflow-y-auto">{notifications.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">You don&apos;t have any notifications yet.</p> : notifications.map((notification) => <button key={notification.id} onClick={() => !notification.readAt && markRead(notification.id)} className={`w-full rounded-md p-3 text-left ${notification.readAt ? "bg-muted/10" : "bg-emerald-900/20"}`}><p className="text-sm font-medium text-white">{notification.title}</p><p className="mt-1 text-xs text-muted-foreground">{notification.message}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(notification.createdAt).toLocaleString()}</p></button>)}</div>
      </div>}
    </div>
  );
}
