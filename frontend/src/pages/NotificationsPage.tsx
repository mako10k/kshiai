import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { OwnerNotificationPublic } from "@kshiai/shared";
import { listNotifications, markNotificationRead } from "../authoring-api";

export function notificationTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export async function openNotification(
  item: OwnerNotificationPublic,
  nav: ReturnType<typeof useNavigate>,
): Promise<void> {
  if (!item.readAt) {
    await markNotificationRead(item.id).catch(() => undefined);
  }
  nav(item.href);
}

export function NotificationList(props: {
  items: OwnerNotificationPublic[];
  empty: string;
}) {
  const nav = useNavigate();
  if (props.items.length === 0) return <p className="muted">{props.empty}</p>;
  return (
    <div className="notification-list">
      {props.items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`notification-item${item.readAt ? "" : " is-unread"}`}
          onClick={() => void openNotification(item, nav)}
        >
          <strong>{item.title}</strong>
          <span className="muted">{notificationTime(item.createdAt)}</span>
        </button>
      ))}
    </div>
  );
}

export function NotificationsPage() {
  const [items, setItems] = useState<OwnerNotificationPublic[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listNotifications(50)
      .then((result) => setItems(result.notifications))
      .catch((err) => setError(err instanceof Error ? err.message : "failed"));
  }, []);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>お知らせ</h1>
        <Link to="/">← メニュー</Link>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <NotificationList items={items} empty="お知らせはまだありません。" />
    </>
  );
}
