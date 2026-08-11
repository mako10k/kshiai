import { NavLink } from "react-router-dom";
import { useAuth } from "../auth";

const PRIMARY_ITEMS = [
  {
    to: "/",
    end: true,
    label: "ホーム",
    icon: "⌂",
  },
  {
    to: "/match",
    end: false,
    label: "試合",
    icon: "⚔",
  },
  {
    to: "/history",
    end: false,
    label: "記録",
    icon: "☰",
  },
  {
    to: "/characters",
    end: false,
    label: "キャラ",
    icon: "◎",
  },
] as const;

export function BottomNav() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <nav className="bottom-nav" aria-label="主要ナビゲーション">
      {PRIMARY_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            isActive ? "bottom-nav-item is-active" : "bottom-nav-item"
          }
        >
          <span className="bottom-nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
