import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  api,
  type InternalBattleObservationDetail,
  type InternalBattleObservationSummary,
  type InternalAgentInvocationTrace,
  type InternalBattleTemporalPlan,
  type InternalCausalTurnExecution,
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
      <div className="internal-pipeline-flow internal-pipeline-main-flow">
        <PipelineNode title="入力コンテキスト" value={trace.input} />
        <span className="internal-pipeline-arrow" aria-hidden="true">→</span>
        <PipelineNode
          title="キャラ出力"
          subtitle={trace.providerStatus}
          value={trace.providerOutput}
        />
        <span className="internal-pipeline-arrow" aria-hidden="true">→</span>
        <PipelineNode
          title="行動提案の検証"
          subtitle={trace.actionProposalValidation?.status ?? "unavailable"}
          value={trace.actionProposalValidation ?? null}
        />
        <span className="internal-pipeline-arrow" aria-hidden="true">→</span>
        <PipelineNode title="採用後出力" value={trace.acceptedOutput} />
      </div>
    </div>
  );
}

function TemporalBuckets({
  plan,
  execution,
}: {
  plan: InternalBattleTemporalPlan;
  execution?: InternalCausalTurnExecution | null;
}) {
  const committed = new Set(execution?.committedBucketIndices ?? []);
  return (
    <div className="internal-temporal-plan">
      <div className="internal-temporal-heading">
        <strong>{plan.rulesetId}</strong>
        <span>A {plan.initiativeScores.a} / B {plan.initiativeScores.b}</span>
        {plan.initiativeOrder ? (
          <span>
            {plan.initiativeOrder.reason} · {plan.initiativeOrder.order.join(" → ")}
            {plan.initiativeOrder.draw
              ? ` · sample ${plan.initiativeOrder.draw.sample.toFixed(6)}`
              : ""}
          </span>
        ) : null}
      </div>
      <div className="internal-pipeline-flow internal-temporal-buckets">
        {plan.buckets.map((bucket) => {
          const active = execution?.bucketIndex === bucket.index &&
            execution.status !== "finished";
          const state = committed.has(bucket.index)
            ? "commit済み"
            : active
              ? execution.status
              : "未到達";
          return (
            <div className={`internal-temporal-bucket${active ? " is-active" : ""}`} key={bucket.index}>
              <small>Bucket {bucket.index} · {state}</small>
              <strong>{bucket.actorSides.map((side) => `Side ${side.toUpperCase()}`).join(" + ")}</strong>
              <span>{bucket.commitMode} · {bucket.readsFrom}</span>
            </div>
          );
        }).reduce<ReactNode[]>((nodes, bucket, index) => {
          if (index > 0) nodes.push(
            <span className="internal-pipeline-arrow" aria-hidden="true" key={`arrow-${index}`}>→</span>,
          );
          nodes.push(bucket);
          return nodes;
        }, [])}
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
  if (!trace && !turn.temporalResolution) {
    return <p className="muted">このターンにはパイプラインtraceがありません。</p>;
  }
  return (
    <div className="internal-pipeline-dag">
      {turn.temporalResolution ? (
        <>
          <TemporalBuckets plan={turn.temporalResolution} />
          <div className="internal-pipeline-merge" aria-hidden="true">↓</div>
        </>
      ) : (
        <p className="muted">このターンには initiative bucket 記録がありません。</p>
      )}
      <div className="internal-pipeline-flow internal-pipeline-resolution-flow">
        <PipelineNode
          title="現在ターン裁定"
          value={{ actions: turn.actions, events: turn.events }}
        />
        <span className="internal-pipeline-arrow" aria-hidden="true">→</span>
        {trace?.environmentProcess ? (
          <>
            <PipelineNode
              title="環境提案の正準化"
              subtitle={`${trace.environmentProcess.status} · ${trace.environmentProcess.reason}`}
              value={trace.environmentProcess}
            />
            <span className="internal-pipeline-arrow" aria-hidden="true">→</span>
          </>
        ) : null}
        <PipelineNode title="正準遷移" value={turn.canonicalTransition} />
      </div>
      <div className="internal-pipeline-merge" aria-hidden="true">↓</div>
      {trace?.characterAgents ? (
        <div className="internal-agent-lanes">
          <AgentLane label="Site A" trace={trace.characterAgents.a} />
          <AgentLane label="Site B" trace={trace.characterAgents.b} />
        </div>
      ) : null}
      <p className="muted internal-pipeline-note">
        legacy traceでは採用後のnextActionは次ターン用。因果実行への移行後は各bucketの判断・commitを順に表示します。
      </p>
      <div className="internal-pipeline-merge" aria-hidden="true">↓</div>
      <div className="internal-pipeline-flow internal-pipeline-narrator-flow">
        <PipelineNode title="ナレータ入力" value={trace?.narrator?.input ?? null} />
        <span className="internal-pipeline-arrow" aria-hidden="true">→</span>
        <PipelineNode
          title="ナレータ出力"
          subtitle={trace?.narrator?.disposition ?? "unavailable"}
          value={{
            provider: trace?.narrator?.providerOutput ?? null,
            public: trace?.narrator?.publicOutput ?? null,
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
                <h2>束縛済み資産世代</h2>
                {detail.canonicalCurrent.assetManifest ? (
                  <>
                    <p className="muted">
                      {detail.canonicalCurrent.assetManifest.boundAt} に固定。以後の編集はこの戦闘へ反映されません。
                    </p>
                    <p className="muted">
                      manifest検証: {Object.entries(detail.canonicalCurrent.assetManifestValidation ?? {})
                        .map(([name, status]) => `${name}=${status}`)
                        .join(" / ") || "legacy_unknown"}
                    </p>
                    <dl className="internal-summary-grid">
                      <div><dt>Side A character</dt><dd>{detail.canonicalCurrent.assetManifest.characters.a.generationId}</dd></div>
                      <div><dt>Side B character</dt><dd>{detail.canonicalCurrent.assetManifest.characters.b.generationId}</dd></div>
                      <div><dt>ナレーション</dt><dd>{detail.canonicalCurrent.assetManifest.narrationStyle.generationId}</dd></div>
                      <div><dt>戦場preset</dt><dd>{detail.canonicalCurrent.assetManifest.battlefield.presetGenerationId ?? "legacy unknown"}</dd></div>
                      <div><dt>戦場instance</dt><dd>{detail.canonicalCurrent.assetManifest.battlefield.generationId}</dd></div>
                      <div><dt>会話設定</dt><dd>{detail.canonicalCurrent.assetManifest.dialoguePipeline.generationId}</dd></div>
                      <div><dt>ルール</dt><dd>{detail.canonicalCurrent.assetManifest.rules.battleEngine} / {detail.canonicalCurrent.assetManifest.rules.temporalRules} / {detail.canonicalCurrent.assetManifest.rules.psycheReaction ?? "legacy psyche"}</dd></div>
                    </dl>
                  </>
                ) : (
                  <p className="muted">legacy unknown generation（記録のない現行資産から補完しません）</p>
                )}
              </div>

              <div className="panel">
                <h2>現在の因果ターン実行</h2>
                {detail.canonicalCurrent.causalExecution ? (
                  <>
                    <TemporalBuckets
                      plan={detail.canonicalCurrent.causalExecution.temporalPlan}
                      execution={detail.canonicalCurrent.causalExecution}
                    />
                    <dl className="internal-summary-grid internal-causal-summary">
                      <div><dt>Execution ID</dt><dd>{detail.canonicalCurrent.causalExecution.executionId}</dd></div>
                      <div><dt>状態</dt><dd>{detail.canonicalCurrent.causalExecution.status}</dd></div>
                      <div><dt>期待 revision</dt><dd>{detail.canonicalCurrent.causalExecution.expectedStateRevision}</dd></div>
                      <div><dt>判断済み side</dt><dd>{detail.canonicalCurrent.causalExecution.decidedSides.join(", ") || "—"}</dd></div>
                    </dl>
                    {detail.canonicalCurrent.causalBucketCommit ? (
                      <PipelineNode
                        title="Durable bucket mechanics receipt"
                        subtitle="後攻判断前に保存済み"
                        value={detail.canonicalCurrent.causalBucketCommit}
                      />
                    ) : null}
                    {detail.canonicalCurrent.causalEngineContinuation ? (
                      <PipelineNode
                        title="Restartable engine continuation"
                        subtitle="次bucketから再開するためのserver-private checkpoint"
                        value={detail.canonicalCurrent.causalEngineContinuation}
                      />
                    ) : null}
                  </>
                ) : (
                  <p className="muted">checkpointなし（旧形式、またはbucket実行開始前）</p>
                )}
              </div>

              <div className="panel">
                <h2>キャラ・ナレータ パイプラインDAG</h2>
                <div className="internal-agent-lanes">
                  {(["a", "b"] as const).map((side) => {
                    const reaction = detail.canonicalCurrent.psycheReaction[side];
                    return (
                      <div className="internal-agent-lane" key={`psyche-${side}`}>
                        <h4>Site {side.toUpperCase()} · deterministic psyche</h4>
                        {reaction ? (
                          <dl className="internal-summary-grid">
                            <div><dt>route</dt><dd>{reaction.route ?? "unavailable"}</dd></div>
                            <div><dt>reason</dt><dd>{reaction.reason ?? "unavailable"}</dd></div>
                            <div><dt>generation</dt><dd>{reaction.policyGeneration ?? "unavailable"}</dd></div>
                            <div><dt>source count</dt><dd>{reaction.sourceCount}</dd></div>
                          </dl>
                        ) : <p className="muted">legacy / not processed</p>}
                      </div>
                    );
                  })}
                </div>
                <p className="muted">
                  {detail.capabilities.pipelineTraceCount}/{detail.capabilities.turnRecordCount} ターンで
                  trace、{detail.capabilities.temporalResolutionCount}/{detail.capabilities.turnRecordCount} ターンで
                  initiative bucketを保持。Site A/Bの入力、採用後出力、裁定、正準遷移、ナレータ入出力を表示します。
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
