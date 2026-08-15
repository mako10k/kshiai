import { useEffect, useState, type RefObject } from "react";
import { Link, useLocation } from "react-router-dom";
import type { OwnerNotificationPublic } from "@kshiai/shared";
import { listNotifications } from "../authoring-api";
import { NotificationList } from "../pages/NotificationsPage";

const LOW_FREQUENCY_LINKS = [
  {
    to: "/friends",
    title: "フレンド",
    description: "対戦相手の公開範囲に使う",
  },
  {
    to: "/battlefields",
    title: "戦場",
    description: "プリセットの管理",
  },
  {
    to: "/narration-styles",
    title: "ナレーション",
    description: "語り口のプリセット・自作",
  },
] as const;

export function useUnreadNotifications(): {
  unreadCount: number;
  recent: OwnerNotificationPublic[];
} {
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<OwnerNotificationPublic[]>([]);

  useEffect(() => {
    void listNotifications(5)
      .then((result) => {
        setUnreadCount(result.unreadCount);
        setRecent(result.notifications);
      })
      .catch(() => undefined);
  }, [location.pathname]);

  return { unreadCount, recent };
}

export function BurgerNotifications(props: {
  recent: OwnerNotificationPublic[];
  onNavigate: () => void;
}) {
  return (
    <div className="burger-notify">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>お知らせ</strong>
        <Link to="/notifications" onClick={props.onNavigate}>
          すべて
        </Link>
      </div>
      <NotificationList items={props.recent} empty="新しいお知らせはありません。" />
    </div>
  );
}

export function burgerToggleLabel(open: boolean, unreadCount: number): string {
  if (open) return "メニューを閉じる";
  if (unreadCount > 0) return `メニューを開く、未読のお知らせ ${unreadCount} 件`;
  return "メニューを開く";
}

export function BurgerUnreadBadge(props: { unreadCount: number }) {
  if (props.unreadCount <= 0) return null;
  return (
    <span className="burger-badge">
      {props.unreadCount > 9 ? "9+" : props.unreadCount}
    </span>
  );
}

export function BurgerPanel(props: {
  userId: string;
  userLabel: string;
  panelId: string;
  panelRef: RefObject<HTMLDivElement | null>;
  recent: OwnerNotificationPublic[];
  onClose: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="burger-backdrop"
        aria-label="メニューを閉じる"
        onClick={props.onClose}
      />
      <div
        ref={props.panelRef}
        id={props.panelId}
        className="burger-panel"
        role="dialog"
        aria-modal="true"
        aria-label="その他のメニュー"
      >
        <div className="burger-panel-header">
          <div>
            <div className="burger-panel-title">その他</div>
            <Link
              to={`/users/${props.userId}`}
              className="muted burger-user"
              onClick={props.onClose}
            >
              {props.userLabel}
            </Link>
          </div>
          <button type="button" className="btn ghost" onClick={props.onClose}>
            閉じる
          </button>
        </div>
        <nav className="burger-links" aria-label="低頻度機能">
          <BurgerNotifications recent={props.recent} onNavigate={props.onClose} />
          {LOW_FREQUENCY_LINKS.map((link) => (
            <Link key={link.to} to={link.to} onClick={props.onClose}>
              <strong>{link.title}</strong>
              <div className="muted">{link.description}</div>
            </Link>
          ))}
        </nav>
        <div className="burger-footer">
          <button
            type="button"
            className="btn ghost danger"
            onClick={props.onLogout}
          >
            ログアウト
          </button>
        </div>
      </div>
    </>
  );
}
