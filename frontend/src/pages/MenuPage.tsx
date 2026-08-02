import { Link } from "react-router-dom";

export function MenuPage() {
  return (
    <div className="panel">
      <h1>メインメニュー</h1>
      <p className="muted">キャラを整え、戦場を選び、物語として試合を進める。</p>
      <nav className="menu-links" style={{ marginTop: "1rem" }}>
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
        <Link to="/battlefields">
          <strong>戦場</strong>
          <div className="muted">プリセットの管理</div>
        </Link>
      </nav>
    </div>
  );
}
