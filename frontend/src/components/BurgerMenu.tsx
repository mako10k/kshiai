import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth";

/** Low-frequency destinations that belong in the burger menu, not primary nav. */
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

export function BurgerMenu() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div className="burger">
      <button
        ref={buttonRef}
        type="button"
        className="burger-toggle btn ghost"
        aria-label={open ? "メニューを閉じる" : "メニューを開く"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="burger-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="burger-backdrop"
            aria-label="メニューを閉じる"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            id={panelId}
            className="burger-panel"
            role="dialog"
            aria-modal="true"
            aria-label="その他のメニュー"
          >
            <div className="burger-panel-header">
              <div>
                <div className="burger-panel-title">その他</div>
                <Link
                  to={`/users/${user.id}`}
                  className="muted burger-user"
                  onClick={() => setOpen(false)}
                >
                  {user.displayName || user.username}
                </Link>
              </div>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
              >
                閉じる
              </button>
            </div>

            <nav className="burger-links" aria-label="低頻度機能">
              {LOW_FREQUENCY_LINKS.map((link) => (
                <Link key={link.to} to={link.to} onClick={() => setOpen(false)}>
                  <strong>{link.title}</strong>
                  <div className="muted">{link.description}</div>
                </Link>
              ))}
            </nav>

            <div className="burger-footer">
              <button
                type="button"
                className="btn ghost danger"
                onClick={() => {
                  setOpen(false);
                  void logout();
                }}
              >
                ログアウト
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
