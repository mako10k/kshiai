import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CharacterPublic } from "@kshiai/shared";
import { api } from "../api";

export function MatchPage() {
  const nav = useNavigate();
  const [mine, setMine] = useState<CharacterPublic[]>([]);
  const [candidates, setCandidates] = useState<CharacterPublic[]>([]);
  const [myId, setMyId] = useState("");
  const [oppId, setOppId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [c, m] = await Promise.all([api.candidates(), api.listCharacters()]);
      setCandidates(c.candidates);
      setMine(m.characters);
      if (m.characters[0]) setMyId(m.characters[0].id);
    })().catch((e) => setError(String(e)));
  }, []);

  async function start(opponentCharacterId: string) {
    if (!myId) {
      setError("自分のキャラを選んでください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { battle } = await api.createBattle(myId, opponentCharacterId);
      nav(`/battles/${battle.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function randomMatch() {
    if (!myId) return;
    setBusy(true);
    try {
      const { opponent } = await api.randomOpponent(myId);
      setOppId(opponent.id);
      await start(opponent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
      setBusy(false);
    }
  }

  async function autoMatch() {
    if (!myId) return;
    setBusy(true);
    try {
      const { opponent } = await api.autoOpponent(myId);
      setOppId(opponent.id);
      await start(opponent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>戦闘相手選択</h1>
        <Link to="/">← メニュー</Link>
      </div>

      <div className="panel grid">
        <label>
          自分のキャラ
          <select value={myId} onChange={(e) => setMyId(e.target.value)}>
            <option value="">選択…</option>
            {mine.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>

        <div className="row">
          <button className="btn primary" type="button" disabled={busy || !myId} onClick={() => void randomMatch()}>
            ランダム選択
          </button>
          <button className="btn" type="button" disabled={busy || !myId} onClick={() => void autoMatch()}>
            自動選択
          </button>
        </div>

        <label>
          手動選択
          <select value={oppId} onChange={(e) => setOppId(e.target.value)}>
            <option value="">相手を選ぶ…</option>
            {candidates
              .filter((c) => c.id !== myId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
          </select>
        </label>
        <button
          className="btn primary"
          type="button"
          disabled={busy || !myId || !oppId}
          onClick={() => void start(oppId)}
        >
          試合開始
        </button>
        {error && <p className="error">{error}</p>}
        {mine.length === 0 && (
          <p className="muted">
            先に <Link to="/characters">キャラを生成</Link> してください。対戦には 2 体以上（または他ユーザーのキャラ）が必要です。
          </p>
        )}
      </div>
    </>
  );
}
