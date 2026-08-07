import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  api,
  type InternalBattleObservationDetail,
  type InternalBattleObservationSummary,
  type InternalAgentInvocationTrace,
} from "../api";

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP");
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="internal-json">{json(value)}</pre>;
}

function PipelineNode({
  title,
  subtitle,
  value,
}: {
  title: string;
  subtitle?: string;
  value: unknown;
}) {
  return (
    <details className="internal-pipeline-node">
      <summary>
        <span>{title}</span>
        {subtitle ? <small>{subtitle}</small> : null}
      </summary>
      <JsonBlock value={value} />
    </details>
  );
}

function AgentLane({
  label,
  trace,
}: {
  label: string;
  trace: InternalAgentInvocationTrace;
}) {
  return (
    <div className="internal-agent-lane">
      <h4>{label}</h4>
      <div className="internal-pipeline-flow">
        <PipelineNode title="入力コンテキスト" value={trace.input} />
        <span className="internal-pipeline-arrow" aria-hidden="true">→</span>
        <PipelineNode
          title="キャラ出力"
          subtitle={trace.providerStatus}
          value={trace.providerOutput}
        />
        <span className="internal-pipeline-arrow" aria-hidden="true">→</span>
        <PipelineNode title="採用後出力" value={trace.acceptedOutput} />
      </div>
    </div>
  );
}

function TurnPipelineDag({
  turn,
}: {
  turn: InternalBattleObservationDetail["canonicalTimeline"][number];
}) {
  const trace = turn.pipelineTrace;
  if (!trace) {
    return <p className="muted">このターンにはパイプラインtraceがありません。</p>;
  }
  return (
    <div className="internal-pipeline-dag">
      <div className="internal-pipeline-flow internal-pipeline-resolution-flow">
        <PipelineNode
          title="現在ターン裁定"
          value={{ actions: turn.actions, events: turn.events }}
        />
        <span className="internal-pipeline-arrow" aria-hidden="true">→</span>
        <PipelineNode title="正準遷移" value={turn.canonicalTransition} />
      </div>
      <div className="internal-pipeline-merge" aria-hidden="true">↓</div>
      {trace.characterAgents ? (
        <div className="internal-agent-lanes">
          <AgentLane label="Site A" trace={trace.characterAgents.a} />
          <AgentLane label="Site B" trace={trace.characterAgents.b} />
        </div>
      ) : null}
      <p className="muted internal-pipeline-note">
        採用後のnextActionは次ターン用。speechと現在の反応はこのターンのナレータ入力へ進みます。
      </p>
      <div className="internal-pipeline-merge" aria-hidden="true">↓</div>
      <div className="internal-pipeline-flow internal-pipeline-narrator-flow">
        <PipelineNode title="ナレータ入力" value={trace.narrator?.input ?? null} />
        <span className="internal-pipeline-arrow" aria-hidden="true">→</span>
        <PipelineNode
          title="ナレータ出力"
          subtitle={trace.narrator?.disposition ?? "unavailable"}
          value={{
            provider: trace.narrator?.providerOutput ?? null,
            public: trace.narrator?.publicOutput ?? null,
          }}
        />
      </div>
    </div>
  );
}

function accessError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "このアカウントでは内部観測画面を利用できません。";
  }
  return error instanceof Error ? error.message : "読み込みに失敗しました。";
}

export function InternalObservationsPage() {
  const [battles, setBattles] = useState<InternalBattleObservationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InternalBattleObservationDetail | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectBattle = useCallback(async (battleId: string) => {
    setSelectedId(battleId);
    setDetailLoading(true);
    setError(null);
    try {
      setDetail(await api.getInternalBattleObservation(battleId));
    } catch (caught) {
      setDetail(null);
      setError(accessError(caught));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listInternalBattleObservations(50);
      setRole(response.role);
      setBattles(response.battles);
      const first = response.battles[0]?.battleId ?? null;
      if (first) await selectBattle(first);
    } catch (caught) {
      setError(accessError(caught));
    } finally {
      setLoading(false);
    }
  }, [selectBattle]);

  useEffect(() => {
    void load();
  }, [load]);

  const rawLog = Array.isArray(detail?.rawBattleState.log)
    ? detail.rawBattleState.log
    : [];

  return (
    <div className="internal-observations-page">
      <div className="page-header">
        <div>
          <h1>内部戦闘観測</h1>
          <p className="muted internal-subtitle">
            生の戦闘状態、E2E観測結果、正準ターン推移を確認する独立画面
          </p>
        </div>
        <div className="row">
          {role && <span className="internal-role">{role}</span>}
          <button className="btn ghost" type="button" onClick={() => void load()}>
            再読込
          </button>
          <Link className="btn ghost" to="/">戻る</Link>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && battles.length === 0 ? <p className="muted">読み込み中…</p> : null}

      <div className="internal-observation-layout">
        <aside className="panel internal-battle-list" aria-label="保存済み戦闘">
          <h2>保存済み戦闘</h2>
          {battles.length === 0 && !loading ? (
            <p className="muted">表示できる戦闘はありません。</p>
          ) : null}
          {battles.map((battle) => (
            <button
              className={`internal-battle-item${selectedId === battle.battleId ? " is-selected" : ""}`}
              key={battle.battleId}
              type="button"
              onClick={() => void selectBattle(battle.battleId)}
            >
              <strong>{battle.sideAName ?? "?"} vs {battle.sideBName ?? "?"}</strong>
              <span>Turn {battle.turn ?? "?"}/{battle.turnLimit ?? "?"} · {battle.status ?? "unknown"}</span>
              <span>{formatWhen(battle.updatedAt)}</span>
              <span>{battle.observationRunId ? "E2E観測あり" : "戦闘データのみ"}</span>
            </button>
          ))}
        </aside>

        <section className="internal-observation-detail">
          {detailLoading ? <p className="muted">戦闘データを読み込み中…</p> : null}
          {detail ? (
            <>
              <div className="panel">
                <h2>{detail.summary.sideAName ?? "?"} vs {detail.summary.sideBName ?? "?"}</h2>
                <dl className="internal-summary-grid">
                  <div><dt>Battle ID</dt><dd>{detail.summary.battleId}</dd></div>
                  <div><dt>状態</dt><dd>{detail.summary.status ?? "—"}</dd></div>
                  <div><dt>勝者 / 終了理由</dt><dd>{detail.summary.winnerSide ?? "—"} / {detail.summary.finishReason ?? "—"}</dd></div>
                  <div><dt>戦場</dt><dd>{detail.summary.battlefieldName ?? "—"}</dd></div>
                  <div><dt>観測 Run</dt><dd>{detail.summary.observationRunId ?? "未記録"}</dd></div>
                  <div><dt>更新</dt><dd>{formatWhen(detail.summary.updatedAt)}</dd></div>
                </dl>
              </div>

              <div className="panel">
                <h2>キャラ・ナレータ パイプラインDAG</h2>
                <p className="muted">
                  {detail.capabilities.pipelineTraceCount}/{detail.capabilities.turnRecordCount} ターンで
                  Site A/Bの入力、キャラ出力、採用後出力、裁定、正準遷移、ナレータ入出力を保持。
                </p>
                <div className="internal-turn-list">
                  {detail.canonicalTimeline.map((turn, index) => (
                    <details key={`pipeline-${turn.turn ?? "unknown"}-${index}`} className="internal-turn">
                      <summary>
                        Turn {turn.turn ?? "?"}
                        {turn.pipelineTrace ? " · traceあり" : " · traceなし"}
                      </summary>
                      <TurnPipelineDag turn={turn} />
                    </details>
                  ))}
                </div>
              </div>

              <div className="panel">
                <h2>正準ターン推移</h2>
                <p className="muted">
                  {detail.capabilities.canonicalTransitionCount}/{detail.capabilities.turnRecordCount} ターンで詳細 transition を保持。
                  旧データでは action・event・parameter delta・world impact のみ確認できます。
                </p>
                <div className="internal-turn-list">
                  {detail.canonicalTimeline.map((turn, index) => (
                    <details key={`${turn.turn ?? "unknown"}-${index}`} className="internal-turn">
                      <summary>
                        Turn {turn.turn ?? "?"} · actions {turn.actions.length} · events {turn.events.length}
                        {turn.canonicalTransition ? " · transitionあり" : " · transitionなし"}
                      </summary>
                      <JsonBlock value={turn} />
                    </details>
                  ))}
                </div>
              </div>

              <details className="panel internal-section" open>
                <summary>現在の正準世界</summary>
                <JsonBlock value={detail.canonicalCurrent} />
              </details>

              <details className="panel internal-section">
                <summary>戦闘ログ（生）</summary>
                <JsonBlock value={rawLog} />
              </details>

              <details className="panel internal-section">
                <summary>E2E観測情報</summary>
                <JsonBlock value={detail.observation} />
              </details>

              <details className="panel internal-section">
                <summary>戦闘状態JSON（生）</summary>
                <JsonBlock value={detail.rawBattleState} />
              </details>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
