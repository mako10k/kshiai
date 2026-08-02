import { Link } from "react-router-dom";

export function MenuPage() {
  return (
    <div className="panel">
      <h1>メインメニュー</h1>
      <p className="muted">キャラを育て、対戦相手を選び、物語として試合を進める。</p>
      <nav className="menu-links" style={{ marginTop: "1rem" }}>
        <Link to="/characters">
          <strong>キャラ管理</strong>
          <div className="muted">生成・検索・コピー・削除・画像</div>
        </Link>
        <Link to="/match">
          <strong>対戦</strong>
          <div className="muted">相手選択（手動 / ランダム / 自動）</div>
        </Link>
      </nav>
    </div>
  );
}
