> 最新の受入・継続地点は [cc304引継](cc304-v3-wip-handoff-2026-09-29.md) を参照。以下は登録完了時点の記録。

# vt109 正式登録経路 — 完了・引継記録

2026-09-29、既存 `codex/cc304-focused-revise`。基点 `11a89da4dabf8bd846f41131a4a4decad6894a78`。

## 成果と利用範囲

Neva/Rio の固定V3候補について、通常の authoring attempt に準備し、所有者が元指定と追加設定・検証記録をレビューして確定し、immutable generation の append/CAS を経て選択する経路を実装した。即時有効化の専用 importer は、この準備処理へ置き換えた。

候補 digest と実際の attempt/source identity を確定時に照合する。確定の再送は保存済み結果世代を返す。破棄、期限切れ、別所有者、候補変更、current pointer 競合時の状態維持と rollback を確認した。準備から確定まで provider 呼出しを行わず、生成 job/outbox は準備transaction内で completed にする。

開発担当者は、明示したローカルDBの既存所有者に対して次のコマンドを使い、出力の `/reviews/{attemptId}` で確認できる。

```sh
npm run register:v3-stage-trial -w @kshiai/backend -- \
  --db /absolute/trial.sqlite --owner EXISTING_USER_ID
```

破棄後は `--request-key retry-1` など新しいキーで再準備する。設定DBを使う形式は `--configured-database --owner EXISTING_USER_ID`。実Stageへの適用は vt106 の実行範囲で、対象と権限を確認して使う。

Stageの実プレイという親ゴールの利用実績は **0件**。今回の将来価値は、登録時に内容を確認・確定できる経路と、そのローカル検証。次のV3 binding・ライフサイクル・統合、配備、Stage登録を経て利用できる。

## 検証

[検証JSON](vt109-validation-2026-09-29.json)、[独立レビュー](vt109-registration-review-2026-09-29.md)、[設計](../vt109-fixed-v3-registration-design.md)。

- `npm run typecheck`: 成功。
- `npm test`: 現行Sealで選択された12ファイル・117件が成功。保留2ファイル、無効146ファイルを明示した選択結果。
- `npm run test:e2e-gui`: 現行Sealの1ファイル・3件が成功。ブラウザ試験はHTTP応答を差し替えるUI契約試験。別のSQLite試験が実APIと永続化を通す。
- 実CLIを新規の一時SQLite DBへ2回実行。2件とも同じ attempt の `awaiting_owner_acceptance`、有効generationは0件。試験DBを終了時に削除。
- 新しい unit/UI verification は exact source に結合し、Accepted 要件・ADR0010/0014/0034、設計・実装manifestをCauseとして記録。sourceはHEAD一致、vt109関連のstaleなし、`sealgraph fsck`は成功。
- PostgreSQL向けの共通transaction、prepareキーlock、confirm行lockを実装し静的レビューした。実PostgreSQLサーバーでの実行は未観測。Stage実対象の検証に持ち越す範囲として明示する。

## 実測とPERT

実装・検証区間を **20:48:57–21:20:47（31分50秒）** として start/finish で記録。終了後の計画更新とGit同期はこの区間の外。`project observe-velocity --task vt109 --evidence declared` が開始時baseline `13/6p` と実績から **`780p/191h`** を返し、親子計画の暫定velocityとして採用した。人時の生産性ではなく、この1件の経過時間throughputである。

過去のvt101部分計測を速度算定へ含めていない。履歴のvt101/vt102 identity置換警告は保存し、選択したvt109の観測値はavailableである。[観測結果](vt109-velocity-observation-2026-09-29.json)。

2026-09-29の両スケジュール解析:

| ゴール | 残り | 依存順のみ | 資源制約込み |
| --- | --- | --- | --- |
| 初回 Neva 対 Rio のStage試行 | 13.35p | 3.000h | 3.269h |
| 後続の移行・全体復旧まで含む親計画 | 25.35p | 6.208h | 6.208h |

今回1件の登録作業を残作業にも当てはめた**暫定換算**。これは信頼区間ではなく、同じvelocityによる先行関係解析と資源解析の値。設計採否・release・Stage作業調整の待ち時間、作業カレンダーへの割当は別。日付の確約には使わず、次のvt102実経路試験を完了した時点で同じ観測手順により更新する。

vt109をdone、VST_CURRENTをreachedとし、親cc314の残作業を子の13.35pへ更新。親子のdocument check / dag analyze --schedule both / dag nextが成功。[計画検証](vt109-plan-verification-2026-09-29.json)。親nextは **cc319（具体的なV3実装パッケージの所有者採否）**、子は採否引継待ち。次は採否を記録してvt111で読戻し、vt102の不変リビジョン束縛を再開する。
