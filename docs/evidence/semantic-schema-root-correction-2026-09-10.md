# 構造化出力の再発RCAと是正 — 2026-09-10

状態：ローカル是正・検証済み。実LLM再実行、本番復旧、B6完了ではない。
作業場所：`codex/compact-psyche-repair-integration`。変更は未コミット。
所有者指示：「では、是正を進めてください。妥協せずRCAで根本原因を探して。」
因果判断の正本は[CLI監査済みthink](semantic-schema-root-correction-2026-09-10.think)。

## 結論

欠陥を作ったのは「内部のJSON検証用スキーマを、そのままprovider出力文法として
利用する」という変換設計だった。型の厳密化そのものやGrokの推論能力が原因ではない。
既知のprovider制約とドメイン固有の変換処理がキャラクタ作成機能内に閉じており、
新しい移行経路がそれらを通らずに出力文法を生成していた。

今回、生成部分を是正したうえで共通の送信前検査を接続した。
「エラーを早く返すだけ」の修正ではない。

## 観測・推論・不明の区別

E-SCHEMA-001：保存済みの[初回要求](semantic-migration-grok-2026-09-10-v1/call-1-before.json)と
[応答](semantic-migration-grok-2026-09-10-v1/call-1-response.json)を確認。
1要求目がHTTP 400で自己参照非対応として拒否された。生成内容、usage、会計receiptはない。
再送は行っていない。実費用は不明で、事前予約0.17413625 USDは請求実績ではない。

E-SCHEMA-002：`CharacterMigrationJsonSchema`は配列・オブジェクトを再帰的に検証し、
`operation.value`がこれを使用する。旧`CHANGE_SCHEMA`はこれを`zodResponseFormat`へ
直接渡す。保存済み送信スキーマを現コードで再生成すると完全に一致し、
`value`定義が配列itemsとobject additionalPropertiesから自分自身を参照する。

E-SCHEMA-003：先行の[キャラ作成RCA](../character-authoring-selection-rca-2026-09-10.llmthink.dsl)では、
Zod.parseが返す複製を補正し、実送信対象に補正が届かない問題を修正済みだった。
循環検査はキャラ作成テスト内の私有関数、5項目の補正は作成adapter内の私有関数だった。
新しい移行処理は別経路でスキーマを生成していた。

E-SCHEMA-004：[先行準備判断](semantic-probe-readiness-2026-09-10.think)は、
provider受理を未確認とし、ローカルのダブル成功をもとに実行レビューへ進んでいた。
既知の「循環参照不可」と新しい実送信スキーマの照合を判断根拠に含めていない。
これは記録と成果物から確認した判断上の問題であり、エージェントの内心を推測したものではない。

E-SCHEMA-005：prompt入力の移行先V3スキーマにも、reach、requiresSight、mobility、
requiresSpeech、requiresUsableHeldObjectの5つの自己参照aliasが存在した。
具体的なenum/boolean/defaultはbasicAction.mechanics.constraints.propertiesに存在する。
これは生成に渡す仕様表現の不整合だが、今回のHTTP 400はresponse_format側で発生した。
このprompt不整合がモデルの意味判断をどう変えるかは未測定。

外部仕様：xAIは[非循環の参照のみをサポート](https://docs.x.ai/developers/model-capabilities/text/structured-outputs)。
JSON Schemaの[空のobjectスキーマは任意の正しいJSONを表現する](https://json-schema.org/understanding-json-schema/basics)。
仕様上の値集合の等価性と、実エンドポイントが新版を受理することは別の主張である。

## 原因の分類

- C-SCHEMA-001／根本原因・高信頼：内部の再帰検証器とprovider出力文法を同一視し、
  真の再帰を含む出力文法を新経路で直接生成・送信した。
- C-SCHEMA-003／関連欠陥・高信頼：移行先仕様の生成が既存のalias補正を迂回した。
  前回と同じ5項目の不整合を新しいpromptへ持ち込んだ。HTTP 400の原因とは区別する。
- 寄与条件：provider経路ごとにスキーマ生成が分かれ、既存の補正・制約が機能ローカルだった。
- C-SCHEMA-002／作業判断上の再発機序：新経路の準備時に既知の制約を適用せず、
  この具体的な不適合まで一般的な「実provider未確認」の中へ含めて進めた。
  将来の実応答が未知であることは、既知制約との照合を省く理由にはならない。
- 見逃しの原因：テストダブルがproviderの文法制約を検査せず、既存の循環回帰検査も
  キャラ作成専用だった。これは欠陥の生成原因ではなく、局所試験を通過した理由。
- 顕在化：承認された最初の実要求でproviderが出力文法を拒否した。

## 是正内容

1. `character-migration-response-schema.ts`で、正本から生成したスキーマのうち、
   任意JSONを意味する定義だけを非循環の等価表現へ変換する。
   変換前の定義が期待する6種類の再帰JSON形状であることを比較し、未知の循環や
   制約付きの別フィールドを勝手に開放しない。
2. その定義は`{ additionalProperties: true }`とする。JSON Schema上は型制限のない
   任意JSONの表現であり、xAIのobject既定閉鎖も明示的に避ける。
   周囲のstrict object、必須value、6操作、上限、他の定義は変わらない。
   任意深さのJSONを有限深度に切り詰めず、文字列化・再パースもしない。
3. `character-definition-response-schema.ts`へ既存の5項目補正を共通化。
   キャラ作成V2と移行先V3で同じ補正を使う。期待する完全な定義名と具体的な型を照合し、
   defaultを保持する。複製を補正して返し、補正前の入力は変更しない。
4. `provider-response-schema.ts`へ循環参照検査を共通化。
   通常adapter、移行probe、知覚評価スクリプトの3つのstrict送信入口に接続した。
   xAIにだけ適用し、他providerの正当な再帰スキーマは禁止しない。
   ローカル参照の直接・間接循環、root参照、escaped pointerを調べる。
   const/default/examples内の文字列・JSONデータをスキーマ参照と誤認しない。
5. 新しい移行試行は`character-semantic-migration-prompt-v2`を選ぶ。
   v1は保存済みpayload/receiptを再現するために保持し、黙って新版へ置き換えない。
   受信後の共有型検証、統合、権限・公開範囲、メカニクス保全、全体意味レビュー、
   最大2回の影響先を含む限定修正は維持する。

## 対案と判断

- 固定深度への展開：深い値を表現できなくなるため採用しない。
- JSON文字列を返させる：型付き値の経路を二重エンコードへ変えるため採用しない。
- json_objectへの切替：外枠の構造化出力を弱めるため採用しない。
- 移行先の全フィールド型ごとの大きなunion：より具体的な出力制約は得られるが、
  今回の任意JSON契約にない制限や型表の重複を持ち込む必要がないため採用しない。
- 共通検査だけの追加：不適合を早期に拒否するだけなので、生成側の是正と併せて実施した。

## ローカル検証

E-SCHEMA-006：全768テスト成功（shared 339、backend 401、frontend 20、deployment 3、release 5）。
基準756テストから12テスト追加。型検査・ビルド・jscpd・Lizardも成功。
既存のVite chunk-size警告は残る。Lizard 1.23.0：209 files / 3488 functions。
CC>15は117/121、長さ>100は67/67、引数>6は5/5で、基準値は緩和していない。

確認した内容：

- 保存した不正な実送信文法を再現し、新検査がfetch前・送信証跡作成前に拒否する。
- 新旧の変更集合スキーマの差分は、任意JSON定義の表現1か所だけ。
- 80段のobject/arrayの入れ子も型付きで保持。undefined、Infinity等は従来通り拒否。
- Python jsonschema 4.10.3 Draft7で11種類の値を新旧とも受理し、value欠落を両方拒否。
- V3の補正は5つのaliasだけ。その他の内容とdefaultを保持し、入力を変更しない。
  保存された合成キャラのbaseline定義が補正後のV3スキーマを通ることも別検証器で確認。
- キャラ作成の既存各出力形式と知覚の3形式を共通検査へ通した。
- 移行の生成・レビュー・修正・再レビューで、出力文法と移行先仕様の両方を検査した。
- 過去のv1と新しいv2を区別し、曖昧な要求を再送しない既存テストも維持。

開発中、追加テストのmodelFast不足と新helperの型述語不足を型検査で検出した。
それぞれCLI監査後に、明示設定と実行時検査を伴う型述語で是正した。
型castや契約の緩和で回避していない。現在の型検査は成功している。

## Sealと未完了事項

既存の変更前Sealを対象としたreseal前impactで、移行処理、既存顕在意識の検証、
計画・設計、過去のprobe証跡への到達を確認した。一部はコード編集後の採取であり、
全件で編集前に実施したとは報告しない。変更箇所を含む73参照の
[個別判定](semantic-schema-impact-review-2026-09-10.json)で、内容更新、互換確認、
歴史資料の維持を区別した。一部の経路列挙は100件で打ち切られたが、
CLI仕様上、影響先のmembership自体は省略されない。
Seal完了状態は[読戻し記録](semantic-schema-seal-readback-2026-09-10.json)で確認し、impactだけで確認済みとはしない。
ローカル完了とSeal操作の判断も[別のCLI監査](semantic-schema-local-verification-2026-09-10.think)を通した。

A-SCHEMA-001（実行済み）：生成側の是正、共通検査、回帰試験、RCA記録。
再発防止はグローバル指示の追加ではなく、既知の変換と制約を共通実装へ接続した。
`evidence-chain`で原因と見逃しを分離し、`agent-antipatterns`で既知手順の不適用を点検した。

実provider再送は0。消費済みv1の承認・要求・HTTP応答・DBは変更していない。
v2での実API受理、生成内容の意味保存、自然に発生する修正の品質、実コストは未確認。
共通検査はxAIの仕様すべてを実装したvalidatorではない。
新しい実行には別runの準備と明示承認が必要で、旧proofを新版の承認として流用できない。
本番復旧、B6以降、deployment、設定activation、commit/pushは今回行っていない。
