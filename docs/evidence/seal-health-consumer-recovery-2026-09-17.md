# M1 下流consumerの根拠照合 — 2026-09-17

状態: 作業中。全Seal健全化、cc304、移行機能の完了を意味しない。

## 範囲と根拠

- E-CONSUMER-001: 所有者はM1の計画・実装・テストについて、現行上位根拠との照合、承認済み内容内の修復、Lunaレビュー、再Sealを確認した。新rootや仕様判断は本人レビュー対象。cc304実装再開、外部環境変更、commit/pushは含まない。
- E-CONSUMER-002: 開始時の作業ツリーは `codex/compact-psyche-repair-integration`、HEAD `e022fdc`。既存WIPを保持。ローカル追跡REF `85c5647` に対して1commit先行、リモート最新性は未確認。本記録はローカル根拠修復に限定する。
- E-CONSUMER-003: [上流修復記録](seal-health-recovery-2026-09-17.md) の9REFは登録済み。計画revision10はcc304をsuspendedとし、既存完了条件・依存順序を保持している。
- C-CONSUMER-001 📜 高信頼: 今回の権限は根拠修復であり、下流機能実装や外部操作の再開権限ではない。根拠: E-CONSUMER-001〜003。
- A-CONSUMER-001 🚀 [実行中]: current consumerと履歴・未受入提案を区別し、意味照合と個別Lunaレビューで根拠が揃った非rootだけを登録する。参照: C-CONSUMER-001。未解決の意味をリンクの付替えだけで有効化しない。

着手判断のCLI LLMThink監査 `SealConsumerRecovery` はfatal/error/warning各0。未確認のconsumer範囲をpendingとして保持。監査は作業権限や意味適合の証明ではない。

## 着手時のテスト選別観測

`node scripts/test-authority.mjs --list` の読取結果はunit 156件、active 2、provisional 1、disabled 153（うちunsealed 136）。テストは実行していない。この件数は選別器の観測値であり、期待値の意味レビューや全体合格ではない。

- ハーネス自身の `verification/test-authority-selector-v2` は `source_diverged`。
- `verification/character-focused-authoring-request-scope-v1` は `stale`。
- `verification/character-migration-ollama-adapter` は `draft_basis`。

受入済みADR-0036の正本はHEADに存在するが、開始時のsource bindingsに対応REFはなかった。ADR-0034は非draft・非stale・source一致。ADR-0036の本文監査はfatal/error/warning各0。既存Accepted本文の変更や新たな受入は行わない。

## レビュー・登録結果

個別レビューと登録後readbackを以下へ追記する。記録の存在だけでは未完了項目を有効化しない。

### テスト選別ハーネスの根拠チェーン

Lunaが現在の実装・テスト期待値とADR-0034/0036を照合し、次の4件を登録後に独立readbackした。すべて非root・非draft・非stale、source一致、Candidateなし。今回アプリやハーネスのコード本文は変更していない。既存WIPの意味を確認して現行Sealへ対応させた。

| REF | 現行Seal | 根拠と限界 |
| --- | --- | --- |
| `acceptance/adr-0036` | `cea40cbb3b12ac7d91040f1c9615cb9d8ed232fb47cd941d38d04bfdd544bc30` | ADR-0034 `5e0e2c6339e1aa17306f57963d3f32437cec1a22903e129ece02cc90bffe368a` の下流。既存Accepted正本不変 |
| `implementation/test-authority-selector-v2` | `16980ad8b7b49c3d991fccc5991011ea22c876fffed2cf4b0829584d98fa6b99` | ADR-0034/0036に従うdisabled/provisional/active選別 |
| `implementation/test-authority-inventory-v2` | `7153451577c03dfe3a0798438c37ef6fb0311533f9def0195063fc2e09f97eea` | ADR-0034に従う候補REF対応表だけ。mapped testの適合性やadmissionではない |
| `verification/test-authority-selector-v2` | `4e04a95be1bf6edb1697dfed17332ec09b832de1f32ab8ccede207597dc73b88` | 上のselector/inventoryとADR-0036。実装の旧Sealとのrevision対応をCause内に明示 |

再Seal後の `node --test scripts/test-authority.test.mjs` は9件成功。期待値はADR-0034 D1–D3のSeal/source/Cause/stale判定と、ADR-0036 D1–D3のdraft分類・正式集計除外へ対応する。これは正規化済み `draft_basis` を入力とした選別関数・集計の証拠であり、SealGraph自体の推移的publication制約やアプリの意味適合の独立検証ではない。選別器はSealGraphの非draft公開制約（ADR-0036 E3）に依拠する。

inventoryの旧目的→新目的REFの変更は [当時の目的切替記録](test-purpose-transition-cc304-2026-09-16.md) に対応する。Luna初回指摘「mappingがファイル全体の意味を代表するか」を、この記録と現在の独立admission判定の実装で照合し、mappingとしてPASSとした。`verification/character-focused-authoring-request-scope-v1` は引き続きstaleで、今回正式テストへ昇格していない。当時の `active/current` 表記はADR-0036適用前の履歴であって、現行状態ではない。

着手前／公開前監査 `CurrentTestBasis` と `SelectorConsumerSeal` はfatal/error/warning各0。登録後readback PASSはコード変更や製品完成の承認ではない。

### 現行計画の主張と上位根拠

計画本文 `docs/character-semantic-migration.pert` revision10の再Seal対象は、これから行う作業の目的・順序・境界である。既存done/reachedは当時の履歴であり、本照合で過去の実装・テスト結果を再認定しない。旧 `plan/character-semantic-migration` とその実装・検証へのCauseは不変で残す。

| 計画の主張・工程 | 支配する受入済み節・判断 | 本照合の限界 |
| --- | --- | --- |
| M1 / cs316、cc304のsuspend | 本人の「まずSealをすべて健全化」、revision10の範囲確認。テストに関してADR-0034 D1–D3、ADR-0036 D1–D3 | 全Sealの用途確認は本人指示であり、ADR-0034から全資料の新しい製品完了条件を導かない |
| cc304 / CS_REVISE_SCOPE | ADR-0035 D1–D3、character v5 R2/R3、foundation v3 F4/F11 | 自然文scope推定・同一試行内計数・一つの外見テキスト候補。顔画像や最終acceptanceはこの試行外 |
| cc311–cc312 | foundation F1/F6/F7/F8/F11/F12、character R1/R2/R5/R9/R15–R18 | revise→create→migrateは本人受入済みrev8/rev9の試行順。技術的必須順や新しい移行精度条件ではない |
| cc315、cc314 / CS_STAGE_TRIAL | character R2/R4/R17/R18/R19、migration v6 R19/R21/R25、ADR-0030 D10/D11。Stageゲーム利用という途中通過点はrev9の本人判断 | exact source・generation・receipt・所有者受入とStage-only操作。sourceの実在やゲーム成功は未観測。配備・provider・pointerは別認可 |
| cc313 / CS_CONNECTED | foundation F9/F10/F11/F15、character R12–R19/R21、Accepted kernel design rev6のpublic mapping/conformance | 三モードの局所接続・回復・Q&Aの残件。初回Stage試行を全モード適合の代用にしない |
| cc308、cc309とM2の時間・永続化境界 | ADR-0032 D1–D5、ADR-0033 D1–D3、Accepted kernel design rev6 | 旧時間literalやConfig世代の永続化要求を復活させない。既存doneは過去の判断記録 |
| cc310と以後のテスト結果の扱い | ADR-0034 D1–D3、ADR-0036 D1–D3 | Seal・Cause・source・staleとdraftの区別。選別器の成功は製品挙動の証明ではない |
| cc306 / CS_EVALUATION | character R20、foundation F14 | corpus・閾値・予算は別の本人判断。初回Stage利用を後続評価完了とは扱わない |
| cc305、cc307 / CS_PRODUCTION | migration v6 R24/R25、ADR-0030 D12/D13、rev9の途中通過点への並替え判断 | コード配備・readbackとpolicy/pointer操作を分離。既存rc12は履歴 |
| cb209–cb214 / CS_FINAL | migration v6 R8/R15/R19–R25、ADR-0030 D10–D13、character R16–R20とMode-specific completion contracts | 本番manifest・候補生成・候補受入・append/CAS・readback・policy切替を分離。8件は固定された元の対象契約で、現在の実在状態は再確認が必要 |

foundation/characterの節番号は、それぞれaccepted snapshot v3/v5に対する参照。ADR-0030の旧全候補LLM・固定repair回数は、foundation/characterとADR-0032が置換した範囲では復活させない。現行計画は置換後のfocused経路を指定している。

Luna初回レビューは構造上条件付きPASS、主張と節の対応を明示する指摘。本表で対応を記録し、現行計画本文・基準・工程を変更せず対象箇所を再レビューする。rev8/rev9は当時の本人受入と工程順の記録であり、上位製品要件を作るCauseではない。rev10記録も同じ上位根拠に従属する計画判断記録として扱い、新rootは作らない。

限定再レビューはPASS。`MigrationPlanProvenance` のCLI監査fatal/error/warning各0の後、以下を公開した。現行計画本文とrevision10記録のbytesは変更していない。

| REF | Seal | 直接Cause |
| --- | --- | --- |
| `plan/character-semantic-migration-revision10-record` | `35708f3cb4ca1a677d933d7e13c1840706b609511b2582ed808dd4c10362b4e3` | foundation v3、character v5、migration v6受入、successor-plan受入、ADR-0030/0032-current/0033-current/0034/0035-current/0036、design-current |
| `plan/character-semantic-migration-current` | `f95f16db41613dca37582e25322a108b96d1247f839ce0e980afda500dc349a8` | 上記11根拠とrevision10記録 |

主担当readbackで非draft・非stale・source一致・Candidateなしを確認。旧 `plan/character-semantic-migration` は変更していない。revision10記録の「改訂計画の再Sealは未実施」は計画修正完了時点の状態を保存したもので、現在の登録結果は本表で示す。旧記録の全文を新結果に合わせて書き換えない。

計画2件のLuna最終readbackもPASS。公開後fsckはok、926 Seals/404 HEAD REFs。unit選別readbackは156件中active3/provisional1/disabled152。追加されたactiveはハーネス自身だけで、cc304のテストはstaleのまま。

### provider-json検証の根拠不足と本人判断

観測対象 `backend/src/llm/provider-json.test.ts` は、不正JSON時のHTTP実行回数、実usageの先行精算、予約数とHTTP成功状態を検証する。直接implementation Cause `805f3da3395d75a85a513e34405d436d06171b0af6835a083041f8dc51796479` は `implementation/provider-response-schema` であり、この実装だけでは観測対象のHTTP/accounting/parse/retry経路を表さない。もう一方のdesign Causeは旧draft/staleである。これはcoverage差の観測であり、障害のroot causeを確定するものではない。

Luna照合で実際の対象は `openai-compatible.ts`、`provider-json.ts`、`provider-accounting.ts` とretry境界と確認。現行`implementation/llm-adapter`はsource不一致で、後二者のsource-bound implementation REFはない。ADR-0007は物理attempt台帳の部分根拠だがSealが未登録だった。

ADR-0007の原文不変root候補 `acceptance/adr-0007-existing-baseline`（予定Seal `6c982de4ffcb50602b855449b797a1c9cbec2668023186e732128b4ab7da0057`）を未公開で準備した。正本digestと全文日本語訳、代替・限界は [本人レビュー資料](adr-0007-seal-root-review-ja-2026-09-17.md)。このroot登録案のLunaレビューはPASS。本人判断待ちなのでCauseには使用しない。

「不正JSONをtransport retryしない」という期待値の当該character-generation経路への上位適合は未確認。ADR-0028 D8はconscious経路の既存retryカテゴリ維持を述べるが、それだけを当該経路の新仕様へ拡張しない。テスト本文やアプリコードを変えず、検証REFは未admitのまま保持する。rootを承認してもこの残件や実装coverageが自動的に閉じることはない。

### 純粋kernelの実装根拠

Lunaはpure kernel sliceのsourceとAccepted design rev6を照合。source不一致はそれ自体で仕様不適合ではなく、現行bytesをレビューする対象として扱う。

初回指摘は、orchestrationのresource判定がstepだけ`>=`、call/token/costは`>`であるためcontracts/accounting/orchestration/verificationを保留するというものだった。主担当がfoundation F15.1「required budget unavailable」とdesign 7.2のreservation admissionを示し、要求する資源が違う決定論的処理と新provider予約を区別した限定再確認を依頼した。Lunaは「具体的なAccepted句との矛盾なし、当初の保留は過度」と修正。provider追加予約は上限ちょうどでも拒否される。これは新たな仕様承認を要求する問題とはしない。一方、境界全体の実行検証が完了したとの主張もしない。

`implementation/semantic-authoring-proposal-decoder-v1-current` をSeal `68080dc1f6e744e248594ade337627f6fe16c6e218d0351ed1064b8013a68607` として公開。個別Luna意味レビューPASS、現行source SHA-256 `0fa806814eb320c8832f7077c493caa823c58d98f152e47bd2f81131d7ae5ff8` 不変。CauseはAccepted design rev6の4.3/4.4とfoundation v3 F5–F7。6KiB上限・JSONと供給schemaのdecodeという限定範囲で、adapter/runtime全体やテストadmissionではない。主担当readbackは非draft・非stale・source一致・Candidateなし。

依存するshared contracts/accountingを先に個別確認し、以下の6件も公開した。旧draft REFは不変。公開判断 `PureKernelConsumerRecovery` のCLI監査はfatal/error/warning各0。

| implementation/semantic-authoring-以下のREF | Seal | 限定レビュー範囲 |
| --- | --- | --- |
| `contracts-v1-current` | `f57ae0386e589f9c7c5558f2a92980db6d2da4fd18c5d7c5e44c4699ac041ff3` | design rev6、foundation、ADR-0032/0033の共通型と資源判定 |
| `accounting-v1-current` | `bb23b8fd585328b805b70ad52042def381ab5ca70a0c7407a462dfa75a65eb70` | 同上とcontracts。予約・実績計数 |
| `progress-monitor-v1-current` | `b0eb4b9faaf3c796db29eacb9f4531a61eeff6d11b6a16b94285faac41aa338a` | design7.3、foundationF15の進捗・停滞・反復 |
| `run-state-v1-current` | `259189536d954a68eedc73cc443fa2d348f2e721a9d90e4eaf88ea7b917a862a` | design8.2/8.3の終了状態遷移 |
| `capability-session-v1-current` | `a00986370784ce00fc06b48203a9a3248e6d9e6b34e1c05f0bbeb994cba8b3c3` | design4.2、foundationF4–F7のsession binding・許可操作・呼出上限 |
| `scripted-ports-v1-current` | `ad6699fb3c12d11e51d1faa66636cd81a5b8f2113d7c6996320266fdc806dc92` | design10/11のテスト用port。live providerの証拠ではない |

各件Luna意味レビューPASS、主担当readbackで非draft・非stale・source一致・Candidateなし。capability-sessionのレビュー記録のdigest転記誤りを公開前照合で検出し、実ファイルとLuna再確認により `16786f35f5e7a558bd6116f07f0214e99e5320e7f186e7308202190501ec3195` に訂正した。実装bytesの変更はない。

今回の合計13件公開後fsckはok、933 Seals/411 HEAD REFs。未参照blob1件は未公開ADR-0007 Candidateの内容で、破損ではない。アプリのkernel/ports/integrationテストやorchestration全体の意味照合・admissionは未完了であり、この登録では昇格しない。

pure kernel7件の独立Luna最終readbackもPASS。正確なSeal ID、source pathとbytes、nonroot/nondraft、Cause対応、staleなし、Candidateなしを再確認した。`git diff --check` 成功。root ADR-0007は引き続きHEADなし・UNSEALED・sourceがCandidateと一致する状態で保留した。

## 残件と価値

全REFの用途分類と、現行利用する下流主張の個別照合は継続中。旧Sealは元の根拠に対する記録として保持し、stale/draftをゼロ件にすることは目標にしない。

[用途別一覧](seal-health-disposition-2026-09-17.json) の411 HEAD REFに対する暫定分類はcurrent-use57、historical14、unresolved340。これは有効なテスト数や完了率ではない。current-useは用途の識別であり、個別の意味レビュー・admissionとは区別する。Proposedという原文headerだけでは後続受入の有無を判定できない14件を未確認へ戻した。ADR-0007 CandidateはHEAD一覧から分離した。

利用者がV3移行機能を使えるようになった増分は0。今回の寄与は、再開時に使える根拠と使えない根拠を区別できる状態へ戻すこと。実利用までにはM1の残件、M2の接続、別途認可されたM3のStage試行が残る。費用と完了時期は未確定。
