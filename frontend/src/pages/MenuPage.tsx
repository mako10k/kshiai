import { Link } from "react-router-dom";

/** Primary destinations; low-frequency tools live in the topbar burger menu. */
export function MenuPage() {
  return (
    <div className="panel">
      <h1>メインメニュー</h1>
      <p className="muted">
        AI闘技場 — キャラを整え、戦場を選び、物語として試合を進める。
      </p>
      <nav className="menu-links" style={{ marginTop: "1rem" }} aria-label="主要機能">
        <Link to="/match">
          <strong>新しい試合</strong>
          <div className="muted">相手と戦場を選んで開始</div>
        </Link>
        <Link to="/history">
          <strong>試合記録</strong>
          <div className="muted">履歴・検索・途中再開</div>
        </Link>
        <Link to="/characters">
          <strong>キャラ</strong>
          <div className="muted">作成・調整・顔画像</div>
        </Link>
      </nav>
      <p className="muted menu-secondary-hint">
        主要画面は下のアイコンからも移動できます。戦場・ナレーション・ログアウトは右上メニューです。
      </p>
    </div>
  );
}
