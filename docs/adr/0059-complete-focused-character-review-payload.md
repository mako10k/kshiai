# ADR-0059: 集中型キャラ作成・修正の最終候補を完全に接続する

- Status: Accepted
- Date: 2026-10-07
- Decision owner: Product owner
- Revision: 1
- Authority: [同名think](0059-complete-focused-character-review-payload.think)
- Related: ADR0011、ADR0030 D10、ADR0031、[受入済み要求revision5](../character-v3-authoring-requirements-v5.md)、[受入済み詳細設計](../structured-semantic-authoring-kernel-implementation-design-v1.md)、[原因分析](../evidence/character-create-boundary-rca-2026-10-07.think)

## Context

ローカルHTTP試験15件のうち13件は合格し、作成候補の採用可否と採用前の調整の2件が不合格である。構造化定義の完成がfamilyの「所有者採用待ち」へ直結しているが、採用に必要な公開プロフィール・根拠検証・完全なenvelopeは接続されていない。レビューは作成候補にも移行専用の採用判定を呼ぶ。draft chatにはこの候補の調整処理がない。

現行の詳細設計は閉じたproposal unionを定義する。プロフィール生成・根拠検証のworkと、採用前の候補を入力とする新しい修正コマンドは含まない。今回の追加はその設計の改訂を伴うため、このADRをAcceptedにするまでは実装しない。原因分析はCLI監査のfatal/error/warningが0。ただし監査は論理構造の検査であり、実モデルの品質や実行許可の証明ではない。

## Decision drivers

- キャラ作成・調整・確認という成功機能を保つ。拒否を期待する試験へ置き換えない。
- 構造化定義の完成と、公開プロフィールまで検証した採用可能状態を型で区別する。
- 未検証プロフィールや過去のプロフィールを自然作成の代用品にしない。
- すべての物理呼び出しを一つのrunの予算へ計上し、terminal後に別会計で続けない。
- 同じattemptを書き換えず、所有者の調整は新しい不変attemptへ記録する。

## Considered options

1. **推奨：完全な最終候補まで同じrunで作り、キャラ新規作成・修正の上限を10回にする。** 現在観測した作成経路の構造化8回と公開プロフィール2回を収容する。費用・累積トークン上限は引き上げない。呼び出し枠が25%増えるが、最大費用は据え置く。
2. **8回を維持して構造化処理を先に再設計する。** 作成時に公開プロフィール2回分を残すには、現状の8回を少なくとも6回へ減らす必要がある。意味レビューを保った分解・統合の効果は未検証で、修理の範囲と期間が大きくなる。検証や意味レビューを省略して8回に収めることは選択肢に含めない。
3. **公開プロフィールを別runで生成する。** terminal後に独立予算を持たせるとF15/R21の一つの試行の会計を迂回するため、現行要求と整合せず非推奨。
4. **構造化定義だけを採用可能とする／調整試験を拒否期待へ変更する。** 公開プロフィールの根拠検証と調整成功という要求を満たさず、採用しない。

## Decision

**2026-10-08、所有者が推奨案D1〜D6を採用。以下の提案時本文を採用契約として保持する。**

### D1. 型で最終候補の完成を要求する

内部のキャラ最終結果をmodeで区別する。create/reviseのready結果は検証済み `CharacterGenerationEnvelopeV3` と構造化・公開プロフィール・根拠検証のreceiptを必須にする。migrateは既存の保存・移行候補契約を維持し、create/reviseのenvelopeを要求する判定へ誤配線しない。

構造化定義だけが完成した段階はrunの内部段階とする。create/reviseを所有者採用待ちにし、authoring_ready通知を出すのは完全なenvelopeの検証後だけ。変換関数が戻す型、最終保存の入力型、採用判定の入力型を連結し、optional candidateや型assertionで欠落を通さない。外部・DB・LLMの値はstrict schemaで検証する。

### D2. 同じrun内で公開プロフィールと根拠検証を完了する

構造化定義の厳密な検証後に、登録済みworkとして公開プロフィール生成と根拠検証を実行する。family固有の型・投影・結果検証は専用モジュールへ分離し、汎用kernelやHTTP routeがプロフィールの意味を所有しない。

生成側へは凍結入力の公開可能な関連断片と `CharacterProfileSourceProjectionV2` に適合するV3投影だけを渡す。V3全候補・全schema・制限された保存情報は送らない。検証側へは表示用投影と生成されたプロフィールだけを渡す。support refsと各segmentを照合し、unsupported material claimは採用可能にならない。単一の生成応答が自分自身へ付けたsupportedラベルを独立検証の代用にしない。

両方とも既存のreservation→send→usage settlementとowner fenceを通す。profileの未完成・失敗・所有権喪失・予算切れは、完全な候補の保存や通知を許さない。terminal後の追加sendは禁止し、到着済み結果の会計完結は既存契約に従う。

### D3. 一つの予算を維持し、キャラcreate/reviseだけ呼び出し上限を10回にする

新しいキャラcreate/revise runに版付きpolicyを適用する。上限10回にはscope解釈、構造化、修復、profile生成、claim検証、および許可済みの物理再送をすべて含む。migrate・battlefield・narration-styleの既存8回policyと既存runの凍結policyは変更しない。

次は現行値を維持する：同時要求1件、counted steps48、入力各回6,000tokens/24,576bytes、出力各回1,500tokens/6,144bytes、累積入力32,000tokens、累積出力8,000tokens、費用上限500,000microUSD（0.50USD）、progress observations8、recovery strategy changes2。料金・token estimator・transport waitの既存identityと制御を維持する。10回は成功保証ではなく上限であり、どの累積制限でも先に尽きたら停止する。paid/live実行やデプロイは承認範囲に含めない。

### D4. 採用前の調整は新attemptを作る

既存 `POST /api/character-drafts/:id/chat` のmessageを所有者の調整要求として処理する。`Idempotency-Key`を必須にし、owner、predecessor attempt、候補digest、変更指示をrequest digestへ束縛する。exact replayは同じ後継attemptを返し、異なる指示で同じkeyを再利用したら拒否する。

凍結したレビュー候補を参照する専用source variantを追加する。候補を未存在のactive generationとして扱わない。predecessorの所有者、最新候補であること、完全な構造化候補のdigest・receipt、current pointerとの整合をサーバーで検証する。世代未採用ならexpectedCurrentGenerationIdはnullのまま、新attemptも作成中の同じcharacter identityを継承する。既に採用された世代の修正は既存の通常revision経路へ返す。

新attemptは前の候補を変更せず、登録済みscope解釈・関連部品の修正・再検証・公開プロフィール再生成を行う。responseは既存のaccepted DTOと同じ新attemptIdにpredecessorAttemptIdを添える。新しい最終候補のdigestへの別の所有者確認を要求する。HTTP試験は調整成功・新attempt履歴・確認成功を検証し、旧attemptの確認を継続しない。

### D5. 保存と読み取り

完全なfamily final envelope、candidate digest、run terminal結果、family status、通知、job完了を既存のowner-fenced transactionでまとめる。partial readyは保存しない。通知は既存attempt/kindの一意性を維持する。GETは投影だけを行い、新しいprovider workや候補の補完を行わない。confirmもprovider workを行わずexact candidate/receiptsとcurrent pointerを検証する。

この修正前の構造化のみreadyレコードは、自動的な追加呼び出しや自動採用をしない。旧レビュー情報を保持しcanAccept=falseと明確な未完了理由を返す。所有者が明示的に調整した場合だけ、検証できる旧構造化候補を新sourceとして後継attemptへ引き継ぐ。不正・欠落候補は推測補完せず拒否する。migrateの既存候補と完了世代は書き換えない。

## Consequences

### Positive

- 作成候補が採用可能になるまでの必須資料を型・実行・保存で接続できる。
- 同じ候補の上書きや、採用処理での追加LLM呼び出しを防げる。
- 同じ費用・token上限内でprofileの2段階を含めた検証を行える。

### Negative and risks

- 呼び出し上限が8から10へ増えるので、上限内で使う回数や待機が増える可能性がある。実増分tokens・費用・待機は未測定。
- 累積token/費用を増やさないため、10回目より前に予算切れになる場合がある。すべての自然入力の完走を保証しない。
- 新しい最終結果型とsource variantにより、保存済み結果の版判定と後継attemptの検証が必要になる。
- 実モデルのprofile品質や意味レビュー精度はローカルmock合格では証明できない。

## Compatibility and migration

V3の公開キャラ定義・世代schemaや完了済み世代は変更しない。現行の所有者レビューDTOを継承し、コマンド応答の新attemptIdを使用する。chatへIdempotency-Keyが必須になるため利用クライアントと試験を同時に更新する。DBは既存final candidate storageを使う想定で、新columnが必要なら確定DDLを別途提示する。旧runを新policyで再開しない。デプロイ・DB本番更新・paid実験・旧切替試行の復活は範囲外。

## Verification

- 現在のHTTP試験15件を全て成功させ、調整後の新attempt・旧候補不変・新digestでの確認を追加検証する。
- ready結果にenvelope/profile/claim receiptが欠けた場合は型または入口schemaで止まる契約試験。
- 同じ予算の全物理呼び出し計上、上限10・各累積cap、予算切れ、late reply、owner fence喪失、terminal後sendなしを検証。
- unsupported claimとprojection digest不一致ではready保存・採用・通知を拒否する。
- idempotency、predecessor drift、owner隔離、二重確認、GET純粋性、migration保持を検証。
- 247unit files＋4E2Eという全体範囲を維持し、Seal欠落の停止条件を維持する。
- 型チェックと全体テスト。paid/live品質検証は別許可・別証拠。

## Implementation references

現時点は提案のみ。実装・Accepted詳細設計の書き換え・policy変更は行っていない。

- [現在の原因分析監査](../evidence/character-create-boundary-rca-2026-10-07-audit.txt)
- [現在のソースsnapshot](../evidence/character-create-boundary-rca-source-snapshot-2026-10-07.json)
- [公開プロフィールV3 adapter](../../backend/src/services/character-v3-profile-adapter.ts)
- [focused worker](../../backend/src/services/character-focused-authoring.ts)

## 所有者受入

2026-10-08、会話で「キャラ作成は推奨通り」と直接受入。D1〜D6の実装を進める。有料/公開配備の許可は含まない。提案時の未採用記述は履歴であり、この受入記録が状態を更新する。
