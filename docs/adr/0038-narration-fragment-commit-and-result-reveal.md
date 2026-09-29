# ADR-0038: Narration Fragment の確定と結果表示の進行位置

- Status: Proposed
- Revision: 3
- Date: 2026-09-29
- Decision owner: Product owner
- Replaces proposal: [ADR-0037](0037-append-only-narration-fragments.md)
- Affected Accepted records: [ADR-0006](0006-terminal-snapshot-narration-delivery.md), [ADR-0016](0016-scene-beats-batched-narration.md)
- Retained clock: [ADR-0017](0017-public-turn-intra-turn-beats.md)
- Authoritative record: [0038-narration-fragment-commit-and-result-reveal.think](0038-narration-fragment-commit-and-result-reveal.think)
- Source: 2026-09-29 のオーナーによる Fragment 生成モデル、入力・出力の Commit 条件、区切り、再試行、結果カード表示の指示。既存の[要件候補 revision 1](../narration-fragment-requirements-v1.md)は、その後の指示を含まないため別途改訂対象とする。

## Context

ADR-0037 候補は Fragment 単位の Immutable な記録と仮 Streaming を提案した。その後、オーナーは過去の確定 Fragment と Narrator 向け観測から次の Fragment を生成するモデル、ナレータ専用メモリ、Beat / Turn 境界と独立した区切り、確定入力を前提にした Commit、詰まった Fragment からの再試行を示した。さらに、Battle は先に確定させ、結果カードは終局を語る Fragment の確定後に表示することを選んだ。後続の指示では、自動リトライ上限などで実況エラーが確定した場合も結果を表示可能とし、手動リトライを維持すると決めた。「実況の確定**毎**に結果表示」という先の表現の「毎」は誤記であり、反復表示の事実や原因として扱わない。

現行の [BattlePageView](../../frontend/src/pages/BattlePageView.tsx) は `battle.status` で結果欄を表示する。この実装観測は変更箇所を探す材料であり、新しい表示仕様の根拠ではない。本 ADR はオーナー指示を新しい候補にまとめる。正確な文面の Acceptance は別の審査段階である。

## Decision drivers

- 確定済みの対戦入力から実況を生成し、Battle の完了を実況待ちにしない。
- Fragment とナレータメモリを、正常な生成と永続化が完了した位置だけで進める。
- 途中 Streaming を見せながら、確定済み Fragment の列と未確定試行を区別する。
- Fragment の物語上の区切りを、Beat / Turn の固定境界から独立させる。
- 勝敗の正史と利用者への結果カード表示を別々に進める。

## Considered options

1. **既存の receipt / Beat ごとの terminal block と、Battle 終了時の結果表示を維持する。** 現行の識別・表示規則を再利用できるが、オーナーの区切り・Streaming・結果表示の方向と一致しない。
2. **入力未確定の時点から本文を生成し、利用者にも公開する。** 生成を前倒しできる可能性があるが、確定しなかった対戦事実を表示し得る。効果を示す時間計測はなく、入力版の照合と表示訂正が必要になる。
3. **確定入力から仮 Streaming を始め、Fragment 確定と結果表示を別に進める。** 合意された生成・表示順序を表現できる。入力被覆、記憶、公開識別、表示到達条件の設計が必要になる。

## Proposed decision

Option 3 を提案する。一つの Battle に一つの論理的な Narration があり、Narration は確定した `Fragment[0..N]` を順に追記する。次の Fragment の生成入力は、選択した過去の**確定** Fragment、最後に確定したナレータ専用メモリ、確定した Battle 情報を Narrator 視点へ投影して固定した観測、Battle に束縛された資産・語り方・policy の revision からなる。ナレータメモリは表示専用で、Battle の正史やキャラクターの認知・記憶へ書き戻さない。

Fragment が語る確定情報の範囲を source coverage として記録する。区切りの定義は Beat / Turn 番号ではなく、その観測範囲と物語上のまとまりに置く。Beat / Turn 境界と一致する区切りも許す。具体的な cut 条件は基本設計に残す。

入力がすべて確定した後、生成試行の本文を仮 Streaming として表示できる。完成した出力の構造と出典を検証し、Fragment 本文、source coverage、採用するナレータメモリ次版を durable に一つの確定境界で保存した時にだけ、その Fragment を Commit する。未コミット入力による内部仮生成が後で必要と判断されても、入力版の照合前に Fragment を Commit せず、その prose を公開しない。試行の失敗では Fragment・メモリ・被覆位置を進めず、同じ位置を同じ固定入力で再試行する。再試行の文面やチャンク列は前回と一致しなくてよい。ADR-0037 候補で記録した途中表示保持、再試行案内、新試行の最初の本文チャンクでの表示入替え、最終失敗表示を引き継ぐ。自動リトライ上限への到達などで実況エラーが確定した後も、詰まった Fragment から手動リトライできる。自動リトライ回数は詳細設計で定める。

Battle の正史の Commit、Narration Fragment の Commit、利用者への表示の進行位置を独立させる。Battle は実況に先行して終局と勝敗を確定できる。**結果カードは、Battle の終局結果が確定した後、次のいずれかが先に確定した時点で表示する。** (1) 終局結果を参照し、その結果を実際に語ったと検証された Fragment の Commit。(2) 自動リトライ上限への到達など、終局結果までの実況進行を妨げるエラーの確定と永続化。エラーで詰まる位置は終局 Fragment より前でもよい。source coverage に終局結果が含まれるだけの場合や、一時的な失敗だけでは表示しない。表示は Battle ごとに一度確定し、その後の手動リトライで隠したり重複表示したりしない。手動リトライで Fragment が確定すれば、実況はその位置から進む。終局 Fragment の仮 Streaming は先に表示できるが、それだけでは結果カードを公開しない。この表示規則は Battle の勝敗、Turn、Beat、rating、確定イベントを変更しない。

本 ADR が Accepted になった場合、ADR-0006 の terminal-only 公開 prose と「receipt 一つ＝公開ブロック一つ」という識別・表示の前提、ADR-0016 の Beat close での実況 job 作成と Beat ごとの公開一ブロックという結合を、確定 Fragment と source coverage の規則へ置き換える。ADR-0006 の正史先行 Commit、Battle 内順序、durable outbox、有限の認証付き再接続、at-least-once 配信、worker / Battle fencing は保持する。ADR-0016/0017 の Battle 側 Turn / Beat の意味と進行は保持する。既存 Accepted ADR の状態は、正確な後継決定の Acceptance まで維持する。

## Consequences

### Positive

- Battle の計算・保存は Narration の待ち時間から独立し、利用者には確定済みの物語が順に届く。
- 失敗した試行の仮表示と確定 Fragment を区別し、詰まった位置から再試行できる。
- 終局の物語が確定したとき、または実況エラーが確定したときに、結果カードを表示できる。

### Negative and risks

- 確定 Battle 情報と Fragment の source coverage、表示到達位置を別々に管理する必要がある。
- エラー確定後は終局の物語に先行して結果カードが表示される。手動リトライが成功しても表示済みの結果カードを維持する。
- 既存 `(battleId, turnReceiptId)` と新しい Fragment 識別子の関係を定義する必要がある。

## Compatibility and migration

最終的なプログラムの複雑さを最小化するため、切替後は一つの Fragment 実行方式を目指す。既存の完了済み Battle 記録は一回限りの移行を第一候補とし、実データ調査・対応付け・変換・検証を含む総作業時間を**30分以内**とする。現行の receipt 単位の保存内容には Fragment の source coverage、ナレータメモリ遷移、終局を実際に語った検証結果が独立して記録されておらず、現時点で30分以内の完全移行は裏付けられない（[移行可能性の調査](../evidence/adr-0038-migration-feasibility-2026-09-29.md)）。旧本文を検証なしに新 Fragment と扱わない。上限内の成立を確認できない場合は、旧 Battle の書き出しと消去・初期化など、履歴・キャラクター別検索・過去対戦参照への影響を明示した具体案をオーナーへ示す。恒久的な新旧二重実行は時間超過だけで採用しない。実データの移行・消去と旧クライアントへの適用は別途決定する。

結果カード以外の画面・履歴・通知で終局情報をいつ表示するかも別途定める。公開 Fragment の識別子と receipt 参照、ナレータメモリの最小項目、cut 条件、全ページ再読込後の途中表示は基本設計以降で決める。要件候補 revision 1 は後続のオーナー決定を反映してから審査する。production データ変更と release / deployment は別の権限境界に置く。

## Verification

- Battle は Narration の生成・失敗と独立に終局結果を確定できる。
- 確定入力からの Streaming は仮表示され、正常終了・検証・永続化の後にのみ Fragment とメモリが進む。
- 詰まった Fragment の再試行は先行 Fragment を変更せず、同じ入力範囲を対象にする。
- Beat / Turn の途中を含む source coverage でも確定 Fragment を識別できる。
- 結果カードは、終局を実際に語る Fragment の Commit、または終局結果までの実況進行を妨げる確定・永続化されたエラーのどちらかが成立したときに表示される。一時的な失敗や仮 Streaming では表示されない。
- エラー確定後も詰まった Fragment を手動で再試行できる。表示済みの結果カードは手動リトライ中と成功後も維持され、重複しない。
- 上記の表示状態は Battle の正史を変更しない。

## Open owner decisions

- 30分以内の実データ移行が成立しない場合の旧 Battle 記録の処置、旧クライアントへの適用範囲、および結果カード以外の公開面の表示時点。
- 公開 Fragment 識別子と既存 receipt の対応。詳細設計のイベント名・DB 配置・再試行回数は後続へ渡す。

## Implementation references

- [前提となる旧候補 ADR-0037](0037-append-only-narration-fragments.md)
- [既存設計](../battle-narration-stream-design.md) は ADR-0006 の方式を記述する。新方式の詳細設計は本 ADR の Accepted 後に整合させる。
