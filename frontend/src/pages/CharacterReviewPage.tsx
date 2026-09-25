import { useNavigate } from "react-router-dom";
import { useRef } from "react";
import type { CharacterAuthoringReview, CharacterPublic } from "@kshiai/shared";
import { api } from "../api";
import { getCharacterReview, retryCharacterAuthoring } from "../authoring-api";
import { useAssetReview } from "../hooks/useAssetReview";
import {
  AssetReviewShell,
  ReviewCandidatePanel,
  ReviewField,
  reviewLoading,
  runReviewAction,
} from "./asset-review-shared";

function backPath(review: CharacterAuthoringReview): string {
  return review.kind === "create"
    ? "/characters/new"
    : `/characters/${review.characterId}`;
}

function skillText(character: CharacterPublic): string {
  return character.skillSummaries
    .map((skill) => `${skill.name} — ${skill.description}`)
    .join("\n");
}

function CharacterReviewContent(props: { candidate: CharacterPublic; current: CharacterPublic | null }) {
  if (!props.current) {
    const character = props.candidate;
    return (
      <div className="card review-summary">
        <strong>{character.displayName}</strong>
        <p>{character.narrativeBlurb}</p>
        <p className="muted">{character.appearance.summary}</p>
        <p>
          <strong>{character.basicAttackName}</strong> — {character.basicAttackDescription}
        </p>
        {character.skillSummaries.map((skill) => (
          <p key={skill.name} className="review-skill">
            <strong>{skill.name}</strong> — {skill.description}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className="review-compare-stack">
      <ReviewField label="名前" current={props.current.displayName} next={props.candidate.displayName} />
      <ReviewField label="紹介" current={props.current.narrativeBlurb} next={props.candidate.narrativeBlurb} />
      <ReviewField
        label="外見"
        current={props.current.appearance.summary}
        next={props.candidate.appearance.summary}
      />
      <ReviewField
        label="基本行動"
        current={`${props.current.basicAttackName} — ${props.current.basicAttackDescription}`}
        next={`${props.candidate.basicAttackName} — ${props.candidate.basicAttackDescription}`}
      />
      <ReviewField label="スキル" current={skillText(props.current)} next={skillText(props.candidate)} />
    </div>
  );
}

export function CharacterReviewPage() {
  const nav = useNavigate();
  const retryCommand = useRef<{ attemptId: string; commandId: string } | null>(null);
  const {
    review, error, busy, draftMessage, setDraftMessage, setBusy, setError, setReview,
  } = useAssetReview(getCharacterReview);

  const loading = reviewLoading(review, error);
  if (loading || !review) return loading;

  return (
    <AssetReviewShell
      kind={review.kind}
      backHref={backPath(review)}
      latestHref={`/reviews/${review.latestAttemptId}`}
      retryLabel={review.kind === "create" ? "もう一度生成する" : "キャラ画面でやり直す"}
      progress={review.progress}
      stale={review.stale}
      failed={review.failed}
      canAccept={review.canAccept}
      status={review.status}
      error={error ?? review.acceptanceError}
    >
      {review.sourceRetryAvailable && !review.stale ? (
        <section className="card">
          <p>失敗時の候補を流用せず、保存済みの元情報から新しい試行を開始します。</p>
          <button disabled={busy} onClick={() => runReviewAction(setBusy, setError, async () => {
            if (retryCommand.current?.attemptId !== review.attemptId) {
              retryCommand.current = { attemptId: review.attemptId, commandId: crypto.randomUUID() };
            }
            const accepted = await retryCharacterAuthoring(review.attemptId, retryCommand.current.commandId);
            nav(`/reviews/${accepted.attemptId}`);
            setReview(await getCharacterReview(accepted.attemptId));
          }, "再試行に失敗しました")}>元情報から再試行</button>
        </section>
      ) : null}
      {review.semanticCandidateReview ? (
        <section className="card">
          <h2>保存済みの構造化候補（V3）</h2>
          <p>{review.semanticCandidateReview.limitation}</p>
          {review.semanticCandidateReview.fields.map((field) => (
            <details key={field.key}>
              <summary>{field.label}{field.source !== null && field.source !== field.candidate ? "（変更あり）" : ""}</summary>
              {field.source !== null ? <><h4>元の内容</h4><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{field.source}</pre></> : null}
              <h4>候補</h4><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{field.candidate}</pre>
            </details>
          ))}
          {review.semanticCandidateReview.sourceDispositions?.length ? (
            <section>
              <h3>V2 元データの扱い</h3>
              {review.semanticCandidateReview.sourceDispositions.map((decision) => (
                <details key={decision.sourceClaimId}>
                  <summary>{decision.sourceClaimId} — {decision.disposition}</summary>
                  <p>{decision.rationale}</p>
                  {decision.capsuleCopyVerified !== null ? (
                    <p>正式カプセル内の完全一致コピー: {decision.capsuleCopyVerified ? "確認済み" : "未確認"}</p>
                  ) : null}
                  {decision.pendingCopyVerified !== null ? (
                    <p>候補段階の未コミットコピー: {decision.pendingCopyVerified ? "元データと完全一致" : "不一致"}</p>
                  ) : null}
                </details>
              ))}
            </section>
          ) : null}
          {review.semanticCandidateReview.pendingPreservation?.length ? (
            <section>
              <h3>保留中の保持（未コミット）</h3>
              {review.semanticCandidateReview.pendingPreservation.map((entry) => (
                <details key={entry.sourceClaimId}>
                  <summary>{entry.sourceClaimId} — {entry.disposition}</summary>
                  <p>{entry.rationale}</p>
                  <p>元データとの完全一致: {entry.exactSourceCopyVerified ? "確認済み" : "未確認"}</p>
                </details>
              ))}
            </section>
          ) : null}
          {review.semanticCandidateReview.deferredValues?.length ? (
            <section>
              <h3>後で解決する値</h3>
              <p>元データのコピーを保持することと、V3 側の値を延期することは別です。保持した元データは、延期した機能で自動使用されません。</p>
              {review.semanticCandidateReview.deferredValues.map((value) => (
                <details key={value.targetPath}>
                  <summary>{value.targetPath} — {value.requiringCapability}</summary>
                  <p>{value.reason}</p>
                  <p>元データ: {value.candidateSourcePaths.join(", ")}</p>
                </details>
              ))}
            </section>
          ) : null}
          {review.semanticCandidateReview.compatibility ? (
            <section>
              <h3>候補段階の互換性</h3>
              <p>必要なコンシューマーの検証が未完了のため、利用可能とは判定していません。</p>
              <p>状態: {review.semanticCandidateReview.compatibility.status}</p>
              {review.semanticCandidateReview.compatibility.deferred.map((entry) => (
                <p key={entry.capability}>延期: {entry.capability} — {entry.targetPaths.join(", ")}</p>
              ))}
              {review.semanticCandidateReview.compatibility.blocked.map((entry) => (
                <p key={entry.capability}>未確認: {entry.capability} — {entry.reasonCode}</p>
              ))}
            </section>
          ) : null}
        </section>
      ) : null}
      {review.canAccept && review.candidate ? (
        <ReviewCandidatePanel
          assistantMessage={review.assistantMessage}
          confirmLabel={review.kind === "create" ? "確定して保存" : "この内容で確定"}
          busy={busy}
          chat={review.kind === "create" ? {
            value: draftMessage,
            placeholder: "例: もっと防御寄りに。髪色を暗い赤に。",
            busy,
            onChange: setDraftMessage,
            onSubmit: (event) => {
              event.preventDefault();
              if (!draftMessage.trim()) return;
              runReviewAction(setBusy, setError, async () => {
                await api.chatCharacterDraft(review.attemptId, draftMessage.trim());
                setDraftMessage("");
                setReview(await getCharacterReview(review.attemptId));
              }, "failed");
            },
          } : undefined}
          onConfirm={() => runReviewAction(setBusy, setError, async () => {
            const res = await api.confirmCharacterDraft(review.attemptId);
            nav(`/characters/${res.character.id}`);
          }, "確定に失敗しました")}
          onDiscard={() => runReviewAction(setBusy, setError, async () => {
            await api.discardCharacterDraft(review.attemptId);
            nav(backPath(review));
          }, "破棄に失敗しました")}
        >
          <CharacterReviewContent current={review.current} candidate={review.candidate} />
        </ReviewCandidatePanel>
      ) : null}
      {!review.canAccept && review.candidate ? (
        <section className="card">
          <h2>保存済み候補</h2>
          <p className="muted">
            この候補は現在の実行条件を満たさないため、内容の確認だけができます。
          </p>
          <CharacterReviewContent
            current={review.current}
            candidate={review.candidate}
          />
        </section>
      ) : null}
    </AssetReviewShell>
  );
}
