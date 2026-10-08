# 旧顕在状態のサービス接続・保存の因果レビュー

2026-10-07。新規Seal対象は conscious-agency-binding 5件、runtime 9件（3phaseを含む）、persistence 3件の計17件。全case/assertionを保持する。旧切替試行の破棄を取り消さず、現行awareness-v5の完走・実モデル品質へ証明を拡張しない。

## 契約と適用範囲

- Accepted ADR0018正本 D1/D3/D4、保持されたADR0028正本 D2〜D6：旧V3 tuple、compilers、心理policy、設定・override identity、目標固定、単一顕在判断、later時の反応更新なし、私的状態を公開しないこと。0028はSupersededであり、Accepted ADR0047の旧契約保持と現在のAccepted ADR0051の旧世代保持を経由してのみ用いる。新規dynamic-v4応答/修復へ旧規則を復活させない。
- requirements F-BTL13/14/15/23/25/26/37/48：状態継続・観測境界・発話独立受理・公開への私的判断混入防止。
- 既存の所有者受入記録 cc319-owner-acceptance-2026-09-29.md と同日accepted-identities JSONを照合した。ADR0039 think、MD、lifecycle design-v2、cutover requirements-v2の4つの現在hashは全て受入後readbackと一致する。Accepted要件R1とADR0039 D1が、current immutable V3 / battle-mechanics@3のみの新規参加資格を定める。legacy fixtureのstartBattle拒否はこの条項の検証である。Rejected ADR0029を根拠にしない。
- ADR0039 thinkにOWNER_ACCEPTANCEは存在するがformal decision ACCEPTANCEがない既存構造上の問題は残る。所有者の正確な受入記録を否定・補作せず、その既存受入の範囲からのみcauseを引く。書式検査問題の解決や切替全体の完了を主張しない。

## 17件が実際に証明すること

binding 5件は合成されたV3 manifest/compiler/schemaの完全性、generation一致、設定版/compact/policy必須、override identityの対、既定V1の保持を検証する。実作成で全consumerが凍結世代を使う証明ではない。

runtime 9件は実advanceCharacterAgentsとprovider境界を使い、chatJsonだけを置換する。3phaseの顕在1回・心理0回、旧自由文の非送信、先の受理状態の次入力への受渡し、同文発話の受理と私的markerのDTO除外、無効判断から独立した発話、tuple driftのdispatch前拒否、無効化/観測欠落時の呼出しなしと反応保持、laterで再tickしないこと、request外キーを送らないこと、3/legacy override拒否を検証する。これは旧helper直null減衰とは別の、V3欠落時のサービス側holdを実際に通す証拠である。ただし全心理状態の保持、全公開フィールドの秘密漏えい不存在を網羅するものではない。

persistence 3件は、実startBattleでlegacy参加者を拒否してDB未挿入・顕在0回、合成V3状態のservice判断→SQLite保存/再読込→次判断→古いrevision保存拒否、直接受理した目標/判断の保存・公開marker除外を検証する。insertNewBattleによる内部fixtureの保存は公開作成成功経路を迂回している。切替済み旧未完了試合を再開可能にする製品方針、旧枝の試行完了、実DB変更や実provider品質の承認ではない。最後のlastSpeech不変assertionは直接helper/storageの範囲であり、全サービス経路のlastSpeech意味まで証明しない。

## 型修正と検証

独立レビューで見つかった最終正準状態組立の2つの `as CharacterAgentState` を除いた。両者を生成済みのlocal stateの型を `BattleState & Required<Pick<BattleState, "agentStateA" | "agentStateB">>` とし、perception更新を含む全再代入で必須性を型チェックへ渡す。fallback・新エラー・実行規則を追加しない。RCA thinkのCLI auditはfatal/error/warning0。修正前からruntime全17件は通っており、実データ欠落事故をこの静的問題から推定しない。

元の現在ソースは既に他のWIPを含んでいた。変更前にsource-matchだったstable-area-ready-bindingのraw Sealを読み戻し、現在ソースがそのbytesから3行だけ変更されたことをsource-delta JSONで確認した。HEAD全体との差分を今回の変更と扱わない。3対象testは未変更。

修正後は新規対象17件、既存Seal対象の関連HTTP14件、未封印のspeech/consumer wiring診断45件が全て0fail/0skip。対象5ファイルのstrict検査と全workspace/deployment型検査exit0。後者45件は今回ファイルSeal対象ではなく診断証拠のみ。

source bytes変更に伴い、以前source-matchのstable-area-ready-bindingとその現行dependent3件（authoring-http implementation、battlefield/narration HTTP verification）も正確な以前causeを残して再封印する。test14件を再実行した上でcause-scoped previousを記録する。他の過去からsource-divergedのbindingを一括で正当化しない。全251ファイルと未封印停止条件を維持し、全体合格は残る未封印/不成立が解消するまで宣言しない。
