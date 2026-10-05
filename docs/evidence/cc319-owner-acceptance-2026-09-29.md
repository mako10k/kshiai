# cc319 V3対戦パッケージ — 所有者受入記録

- 状態: Accepted
- 決定日: 2026-09-29
- 決定者: プロダクトオーナー
- 出所: この会話で提示した候補一式の採否質問への回答 **「この候補一式を採用して進める（推奨）」**。
- 続く指示: 引継資料を作成し、非クリーンならWIPコミット、プッシュする。

## 受け入れた正確な候補

| 文書 | 提示時SHA-256 |
| --- | --- |
| `docs/adr/0039-v3-battle-lifecycle-and-cutover.think` | `edf61ccdfc2deaf8ad188eb22679e7a0f3d62d0961ba8b840ab32d6241646e6c` |
| `docs/adr/0039-v3-battle-lifecycle-and-cutover.md` | `70758b64a1c3f01c54415de4f5ff0a1d3867cfbf1ed71e2e06b616ca75f73fa5` |
| `docs/battle-lifecycle-boundary-design-v2.md` | `f4fb81c3548f1a25f8ffa7dde17785d352848683cb30e8c86500a244d6ddfe8a` |
| `docs/character-v3-battle-cutover-requirements-v2.md` | `63d78ae5adef9ddec55e3db802b44429f5f82611e6591104f7fa8cc5a4c5a2b4` |

上記bytesは記録直前に再照合し、前回審査時から一致した。本文の判断はそのまま受け入れ、現在の文書にAcceptedメタデータと本記録へのリンクを付す。ADR `.think` の採否待ち記述は今回の受入証拠へ置き換える。更新後identityは[受入読戻しJSON](cc319-accepted-identities-2026-09-29.json)へ記録する。

## 受入内容と効力

新規V3同士をV4対戦bindingへ固定し、作成・読込・進行・破棄を狭い共通use caseへ集める。作成INSERTと進行UPDATEを分け、revision/lease・認可・存在確認・再送の順序を揃える。旧未完了対戦を物理削除し、再作成防止にBattle IDと切替identityだけの最小記録を使う。入口とtask投入を閉じ、旧処理を停止・収束してから削除し、読戻し後に開く。

完了履歴、キャラクター世代、会計・観測記録を保持する。保持記録の意味は既存Accepted契約を継承する。履歴移行が必要な場合の合計30分枠と、超過時の具体案提示も引き継ぐ。

ADR-0010と保存枝 `77ed6a01b9f6bea8d68702ab53839ef45ee78efd` の別内容ADR-0032について、ADR-0039 D4が列挙する保存・継続句だけを **R3の切替前作成かつ切替時点finished以外** の対象に限って置き換える。ADR-0010のauthoringと完了履歴、現行authoring時間境界ADR-0032は引き続き有効。保存枝の履歴は保持する。

この受入によりvt111の読戻し、vt102/vt110の実装へ進める。今回の最終指示に従い、ここでは受入・引継を保存し、vt102はsuspendedのまま継続地点とする。Stage/production配備・対象データ操作・release・mergeは個別の実行範囲として扱う。ADR-0038の採否は従前の状態を保つ。

## 計画・測定

cc319の完了はこの所有者決定で裏付ける。所有者の検討開始・作業時間は測定しておらず、開始時刻や速度を補作しない。vt111は受入文書のidentityと子計画への引継を読み戻したローカル作業だけを計測する。velocityはvt109の観測値だけを維持する。

判断監査: [CLI DSL](cc319-owner-acceptance-2026-09-29.think)、fatal/error/warning 0。
