import { useEffect, useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import {
  BurgerPanel,
  BurgerUnreadBadge,
  burgerToggleLabel,
  useUnreadNotifications,
} from "./BurgerNotifications";

export function BurgerMenu() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { unreadCount, recent } = useUnreadNotifications();
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
        aria-label={burgerToggleLabel(open, unreadCount)}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="burger-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <BurgerUnreadBadge unreadCount={unreadCount} />
      </button>

      {open ? (
        <BurgerPanel
          userId={user.id}
          userLabel={user.displayName || user.username}
          panelId={panelId}
          panelRef={panelRef}
          recent={recent}
          onClose={() => {
            setOpen(false);
            buttonRef.current?.focus();
          }}
          onLogout={() => {
            setOpen(false);
            void logout();
          }}
        />
      ) : null}
    </div>
  );
}
