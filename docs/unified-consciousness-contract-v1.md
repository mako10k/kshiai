# 統合意識の詳細契約案 第1版

- 状態: Accepted（2026-10-10所有者受入）。ADR-0067 revision2のD2〜D8を具体化するレビュー対象。
- 権限: 2026-10-10所有者の「OKです。進めて下さい。」によりADR-0067 revision2と本契約C1〜C8を受入、実装開始。有料試験・公開配備は別権限。
- canonical task: `docs/unified-consciousness.pert` のdesign。

## C1 記憶

本人ごとに `memory: { id: string; text: string }[]` を保持する。最大5件、配列位置+1が優先順位。本文は1〜400 Unicode code point。順位1が最上位。目標・感情・注意・行動指針を別fieldで持たない。内容に誤認・矛盾・重複があってもサーバーは意味で書き換えない。初期値は空配列で、初回も含め全入力に必ず含める。

出力の任意 `memoryOperations` は最大10操作。省略または空配列は変更なし。操作は次の二つだけ。

```typescript
type MemoryOperation =
  | { kind: "insert"; priority: 1 | 2 | 3 | 4 | 5; text: string }
  | { kind: "remove"; id: string };
```

操作を記載順で作業用配列へ適用する。insert位置は `min(priority - 1, currentLength)`。後続を押し下げ、挿入ごとに末尾から5件を超えた分を落とす。IDはサーバーがdecisionIdと操作indexから一意・再現可能に付与する。LLMは新規IDを発行しない。removeは現在の作業用配列に存在するIDを指定し、残りを詰める。未知ID・二重削除・押出し後のID削除は返答全体の検証失敗。新規挿入の削除や修正が必要なら次判断で行う。replace/clear/意味重複判定は設けない。変更する場合は既存IDをremoveしてinsertする。

例: [A,B,C,D,E]へpriority2でXを挿入すると[A,X,B,C,D]。続けてpriority1でYなら[Y,A,X,B,C]。初期[A]へpriority5でXなら[A,X]。この規則と操作順を入力側にも短く明記する。

## C2 意識の入出力

入力は不変の本人資料、本人別の現在知覚、前回受理後の未処理出来事、常時memory、選択可能な行為と参照、既に実行中の行為の状況。モデルにbattle全状態、相手の記憶、未公開の原因、実況文章を判断根拠として渡さない。実行中の状況やフィードバックは、LLMだけが読む短い文章にできる。イベントID等は消費・再実行制御の内部情報であり、本文に意味分類schemaを強制しない。

出力のトップ項目は以下のみ。余分な項目は禁止する。

```typescript
type Decision = {
  action?: CharacterActionIntent | null;
  speech?: string | null;
  memoryOperations?: MemoryOperation[];
};
```

action省略/nullは新しい行為なし。既存engine continuationは既存規則で進行するが、新しい攻撃等を生成しない。speech省略/nullは無言、指定時は1〜400 code point。行為・発言・記憶操作が全て空でも有効。無言・不作為・同じ発言を選ぶこと自体を拒否しない。専用goal/thought/emotion/attention/strength/reconsider/cancelThoughtは設けない。

行為は既存の型付き「試み」を再利用する。行為の構造・参照が有効でも、届かない/対象が変化した等は裁定上の不成立になり得る。その場合も記憶と発言は有効な本人の判断として保存できる。未知参照・壊れたJSON・不正記憶操作は構造/契約失敗として返答全体を拒否する。感情や記憶の内容の正誤では拒否しない。

## C3 起動

advance境界で各本人について次のいずれかなら一回起動する。

1. 初回。
2. 前回受理以後に未処理の本人向け出来事がある。受信発話、本人の行為結果、身体・対象・環境の知覚内容の変更/消失を含む。
3. 前回受理から3つのcommit済み世界tickが経過した。

意味的な重要度を判定する追加LLMは置かない。知覚変更判定では既存投影の対象・現象の追加/更新/削除を使い、tick/revision/生成時刻/差分管理情報だけの変化を除外する。本文が変わった場合は変更として扱い、類似文の意味一致判定をしない。本人の新しい行為結果は、同じ結果本文でも別event IDなら新しい出来事。同一event IDの再配送は重複排除する。実況公開・他者の非知覚状態変更・時間番号だけではイベントを作らない。

3tick再評価は飢餓防止の暫定値。無変化fixtureで頻度とtokenを測り、policy revisionで調整する。実時間timerで試合を自動進行・自動送信しない。

## C4 判断待ちと行為継続

起動が必要なA/Bを同じ確定済み世界snapshotから並列dispatchする。各本人最大1件、試合内最大2件の意識call。必要な判断が揃ってから、この境界の行為・発言を一回だけ解決して世界をcommitする。片側だけの判断で世界を先に進めない。待機中にworld tick、身体、記憶、発言を変えない。独立した確定済み実況の公開は継続できる。

起動不要側は追加call・追加行為・追加発言なし。記憶を保持し、既にサーバーに束縛されたengine continuationだけが進む。記憶の「攻撃を続けたい」からサーバーが攻撃を繰り返すことはない。単発攻撃/発言は一回で消費し、完了eventで次の判断を起動する。複数tick行為は既存engineが所有するcontinuationを使い、新しい自然文条件解釈器は作らない。

この同期方式を初期案とする理由は、遅延合流・古い入力上書き・意欲寿命・意欲競合・思考cancel mailboxを撤去できること。意識一回の応答時間が進行の下限になる不利益を受け入れ、品質と時間は測定する。非同期の継続思考を初期実装へ戻さない。

## C5 永続化と失敗

境界ごとに固定decisionId、world revision、本人memory revision、入力のdigest、入力に含めたevent ID集合、request/attempt IDを記録する。LLM用入力は凍結する。検証済み応答はprivateなprepared decisionとして保存し、world commit前には次の意識入力・公開表示へ出さない。片側成功後の他側失敗でもprepared結果と利用台帳は監査用に保持する。

世界・記憶操作・発言の実行記録・event消費cursor・decision適用済みマーカー・実況outboxを同じtransaction/fenceで確定する。成功したSDK通信と結果の受理・世界commitを別々に記録する。transaction失敗時は保存済みprepared結果を使い、同じ入力を再送しない。各操作の再適用はマーカーで拒否する。

dispatch開始を永続予約してから送る。通信終了不明や送信前後のcrashを自動再送しない。SDK返答を保存する前に失った場合も未知として保持し、別送信で穴埋めしない。lease失効時の応答は会計だけ確定し、world/memoryへ適用しない。重複advanceは同一boundaryを参照し、他ownerの処理を引き継いで新callを作らない。

必須判断のtimeout・通信失敗・不正返答では直前の確定世界を維持し、既存incomplete相当の技術終了にする。記憶・行為・発言を成功へ捏造しない。取消後に届いた結果も会計して適用しない。application repair/transport retry/automatic fallbackは0。手動再開や再試験は別attemptと明示的権限を要する。

## C6 有限上限と経済性

新規試合の候補policy `unified-consciousness-policy-v1`:

|項目|候補値|
|---|---:|
|世界tick上限|36（初期判断tick0を含め意識境界最大37）|
|意識call上限|74/試合、37/本人|
|意識call同時数|2/試合、1/本人|
|出力上限|1000token/意識call|
|意識deadline|60秒/call|
|試合全体deadline|600秒、既存の開始時刻から|
|入力全文の文字上限|24000 Unicode code point/system+user|
|未処理event保持上限|128件/本人、合計16000 code point|
|記憶|5件×400 code point|
|記憶操作|10件/返答|
|再評価間隔|3commit済みtick|
|意識自動repair/retry/fallback|0|

全体physical attempt上限200・同時数6を新policyへ明示的に束縛し、意識74と二重に検証する。裁定・creation・実況の個別deadline/outputは作成時の現在の運用設定を新policyへsnapshotし、曖昧な「最新値参照」はしない。最大call数は節約予測ではない。初回以外はevent/reassessmentに応じて減る。

文字上限はtoken上限・料金保証ではない。入力超過/event保持超過/attempt枯渇では黙って古いevent・記憶・本人資料を落とさず未送信のまま技術終了する。SDK利用token・cached token・elapsed・未知利用を永続記録。USD0.50は旧運用と同じ観測目標で保証上限にしない。

意識は新しい一つのroleと明示model bindingを要求する。初期比較候補は現行潜在transportのopenai/gpt-6-luna/noneの再利用（現行コードに存在する構成）とし、まだ品質適合や節約を認定しない。上位modelへの自動振替なし。裁定・実況のroleは保持。公開切替前に既存SDK型不一致を解消し、実wireと出力1000tokenでの適合を検証する。provider/model選択をbindingなしのglobal値に依存させない。

## C7 保存と互換性

候補識別子は意識パイプライン unified-consciousness-v1、意識出力形式 unified-consciousness-output-v1、意識prompt unified-consciousness-prompt-v1、新しい試合束縛形式 v6。キャラクター定義 v3は変えず、本人資料の投影を再利用する。既存試合束縛形式 v5以下は既存reader/engineで読み継続し、記憶へ自動変換しない。

新private runtime table（候補名battle_unified_consciousness）へbattle_id、revision、snapshot_jsonを保存し、decision/attemptを既存台帳と接続する。table/column/制約/transactionを含むDDLとSQLite/PostgreSQL両migrationは実装PRで提示する。旧awareness runtime tableを変更/削除しない。public advance/narration receipt契約を維持し、internal parser/routerへ新manifest分岐を追加する。public projectionへ新記憶・入力・思考本文を追加しない。新規作成selectorの切替は配備承認後とし、local fixtureでは新契約を明示選択する。

## C8 受入検証

|fixture|確認する動作|
|---|---|
|記憶操作|各順位、空配列、overflow、逐次挿入、remove後挿入、未知ID、文字数、全体拒否、再実行|
|会話|質問を本人の次入力へ一回配送し、無言と応答の両方を合法にする|
|負傷/環境消失|更新/削除を新出来事として届け、他者の非公開状態は渡さない|
|継続行為|既存continuationが進み、単発行為・発言を自動反復しない|
|誤認/矛盾|自然文の誤認や矛盾をserverが修正せず、後のLLM判断で記憶更新できる|
|無変化|tick/revisionだけではcallせず、3commit tickで再評価|
|並列と失敗|両側並列、片側失敗時にworld/memory不変、late応答は会計のみ|
|crash/replay|prepared再利用、二重送信・二重記憶挿入・二重発言なし|
|上限|超過を無送信で拒否、未処理eventのsilent lossなし|
|互換|新規manifest routing、旧保存試合継続、public/private projection分離|

上記offline契約検証後、同じ人物・知覚・出来事の固定fixtureで旧意識パイプライン awareness-v5と比較する。SDK回数、入力/出力token、未知利用、判断完了/行為確定/実況公開の時間を別に測る。反応漏れ、人物性、記憶の適切な更新、不要な反復は人が比較する。意味的な採点LLMを常設しない。有料比較は具体的fixture・model・attempt数・費用見積を示して別承認を得る。

## 完了と未検証境界

本詳細設計の完了は、C1〜C8をレビュー可能にしADR/PERT整合検査を通すこと。ownerによるexact revision受入、runtime実装、DB migration実行、実model品質、速度・費用改善、公開配備は後続。値は全て実測前の提案である。
