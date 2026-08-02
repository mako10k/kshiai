import { Link, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { LoginPage } from "./pages/LoginPage";
import { MenuPage } from "./pages/MenuPage";
import { CharactersPage } from "./pages/CharactersPage";
import { CharacterDetailPage } from "./pages/CharacterDetailPage";
import { MatchPage } from "./pages/MatchPage";
import { BattlePage } from "./pages/BattlePage";

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          kshiai
        </Link>
        {user && (
          <div className="topbar-right">
            <span className="muted">{user.username}</span>
            <button type="button" className="btn ghost" onClick={() => void logout()}>
              ログアウト
            </button>
          </div>
        )}
      </header>
      <main className="main">{children}</main>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="muted">読み込み中…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <MenuPage />
            </RequireAuth>
          }
        />
        <Route
          path="/characters"
          element={
            <RequireAuth>
              <CharactersPage />
            </RequireAuth>
          }
        />
        <Route
          path="/characters/:id"
          element={
            <RequireAuth>
              <CharacterDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/match"
          element={
            <RequireAuth>
              <MatchPage />
            </RequireAuth>
          }
        />
        <Route
          path="/battles/:id"
          element={
            <RequireAuth>
              <BattlePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
