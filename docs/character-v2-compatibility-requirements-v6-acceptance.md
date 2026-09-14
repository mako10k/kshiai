# キャラクター意味マイグレーション要件 改訂6 — 受入記録

- 日付: 2026-09-10
- 状態: **Accepted**
- lifecycle: requirement-authority-review Step 4完了
- 決定者: プロダクトオーナー

## 承認対象

次の正確な要件snapshotを受け入れる。要件本文は変更しない。

- 英語正本: `docs/character-v2-compatibility-requirements-v6.md`
- SHA-256: `c3e19e53c48f159c2c8379c81c645fa64b0293f67694d5880f53c8088de9b6e4`
- Seal: `da2f3a272a1110efa775f8312a6b0e34462270286538715f187e762ecce28718`
- 日本語レビュー入力: `docs/evidence/character-v2-compatibility-requirements-v6-owner-review.md`
- 入力SHA-256: `47fc18615673c196cbd0e8045f8d772f52e6bb3d09737ceaa3613a8a27910cd8`
- 入力Seal: `d6773021e83cd3f45027633b32a3d12f8667bd8a677ab545fb8fc5294914af55`
- 独立レビュー: `docs/evidence/character-semantic-migration-v6-independent-review.md`
- レビューSHA-256: `b768e9125bfb2db984536a9917a21ad00594f13b968cfc97ab25248fada54c8b`
- レビューSeal: `2881d89d9fc4f9ecba6aedd9ed9c12e1d4e5be50167efd47ec120747452c2a8e`

## オーナー判断と履歴

Step 2で、オーナーは追加質問なしの`REVIEW`を選択した。固定snapshotに対するStep 3独立レビューは
`completed`で、要件本文またはAcceptedな上位authorityとの矛盾を検出しなかった。独立レビューは、
改訂5のprovider request/attempt/replay identityとrepair closure authorityに関する指摘が改訂6で
解消されたと判断し、Step 4で`ACCEPT`を推奨した。

その結果の提示後、オーナーは次のように回答した。

> ACCEPT

これを、上記の正確な改訂6に対するStep 4の**ACCEPT**として記録する。要件候補、レビュー入力、
独立レビューのbytesを書き換えず、本記録を現在の受入状態とする。要件本文を変更する場合は新しい
revisionを作成し、Step 1から再度レビューする。

## 承認内容の概要

受け入れた要件は、恒久V2 reader例外を残さず、凍結したready V2キャラクター8件を、versionedで
レビュー可能なLLM支援型意味マイグレーションにより不変V3 generationへ移すことを目的とする。

意味が同じ値は決定論的に複写する。削除・追加・役割変更された値は、限定された`copy`、`move`、
`transform`、`synthesize`、`retire_to_capsule`、`defer` operationで扱う。移動・retire値はruntimeでは
使わない保全カプセルへ保持し、将来の登録済みmigration consumerだけが参照できる。

`migrationAttemptId`、provider呼出ごとの`providerRequestId`、candidate、generationを区別する。
未完了attemptの限定repairではvalid fragmentを再利用しつつ追加provider requestを記録できるが、
完了attemptのreplayではproviderを呼ばずgenerationを重複生成しない。

repair closureはserver既知の構造的依存、LLM提案の意味的依存、独立したcandidate全体の意味reviewの
和集合とする。merge後はcandidate全体を再検証し、意味的不整合が残るcandidateはactivationしない。

## 承認していない事項と残る証拠ギャップ

このacceptanceは要件だけを対象とする。次を承認または完了扱いしない。

- ADR-0010/0011を変更する後継ADRまたは具体設計
- V3 schema、capsule保存、capability identity、semantic-review/repair contract、retry上限の具体化
- implementation、test完了、deployment、trafficまたはauthoring-policy activation
- provider-backed production candidate生成、asset別owner acceptance、pointer migration、rollback
- 本番8件が実際に復旧済みであるという主張
- no-state 16件のmigration
- 別件response-schema修正のlive xAI検証
- commit、push、merge、release

独立レビューで残った次の証拠ギャップは、要件acceptanceによって解消済みにはならない。

- High: production provider work、generation append、pointer migration、readbackによる8件の実復旧証明
- Medium: consumer単位compatibility、capsule、provider-request receipt、V3 migrationへの現行実装適合

これらは後継ADR・実装・production実行の各authority境界で解消する。

## 判断根拠

- CLI LLMThink: `docs/evidence/character-semantic-migration-v6-acceptance.think`
- audit: fatal 0、error 0、warning 0、info 1
- infoは未完了の後続proof obligationを保持すべきという指摘であり、無視せず本記録に明示した。
