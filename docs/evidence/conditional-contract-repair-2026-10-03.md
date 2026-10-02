# 条件付き契約の順次修復と配置前検証

所有者の「コミットしてからその他も順次対応、コミット、デプロイ」指示に基づく。
[ADR0045](../adr/0045-preserve-action-intent-producer-values.md)、
[ADR0046](../adr/0046-align-conditional-contracts.md)、
[専用PERT](../action-contract-repair.pert)を適用する。既存cc304に集約する。

## 実装と値の所有権

- fefbb5a: 最初の行動Intent修復。能力から自由行動／省察の判断を捏造しない。
- 6cffd1e: TurnEventの発話／動作payload必須、通常イベントのpayload禁止、出典の排他をschema unionから推論。
- 3a4877b: V2/V3規範のforce/dispositionを連動させる。生成元の規範値を保持。
- c0ede98: 意味移行のoperation/provenance、出典数、value/deferredの条件をunionで表現。provider用の広い文法と受信後の権威的validatorを区別。profile adapterは元のforce分岐でresponseをそのまま渡す。
- 70677c3: compilerの登録済みconsumer/versionペアを単一schema registryにし、skeleton phaseを実際の許可schema部分集合にする。
- 312c6f5: 能力一覧のskillIdを必須にして元のIDを保持。fixtureの既存定数へ型を付け、値は変更しない。外部入力の不正payloadテストはunknownとしてdecodeへ渡し、従来のas neverを除去。

Intent全体のskillId必須化は行わない。既存の不完全入力は実行可能性検証で
skill_unavailableとなり、入口schema拒否へ変えると失敗分類が変わる。
この互換性は回帰で確認した。engine内の旧findSkillにも先頭skill選択の歴史的処理があり、
型修復に伴って暗黙にゲーム規則を変えない。

追加したliteralはschemaで宣言する既存の種別／登録バージョンとテストfixtureのみ。
production判断の説明、参照、分析、規範disposition、移行valueを型の都合で固定値へ置換していない。
既存profile adapterのstatement fallback、selfAwareness、schemaVersion投影は既存処理を保持した。

## 配置前検証

- npm run build: 全workspace成功。
- npm run typecheck: shared/backend/frontend/Worker成功。
- npm run static: jscpd/Lizard成功。既存閾値内。
- 変更ADR3件: audit fatal/error/warning 0。
- 26ファイルを明示した診断回帰: 204 tests / 27 suites、204 pass、0 fail。
- npm test: active42/provisional2/disabled149。選択実行182+19+29 = 230 pass、0 fail。
  変更によるSeal根拠のstaleおよび未封印診断は、正式な選択対象の受入れと区別する。
  Seal履歴の書換え、根拠なしの再封印、disabled一括復帰はしていない。
- ローカル.envのDATABASE_URL再読込が既存SQLite試験へ干渉するため、npm testだけ
  .envを権限700の一時ディレクトリへ退避した。終了時に復元しSHA256一致を確認。
- provider schemaの過去probeとの比較は、今回強化したrequiringCapabilityの文法のみ
  差分として認め、その他のrequired/operations/value/strictnessは比較を維持した。
  retained evidenceは変更しない。generic JSONの循環除去は従来どおり等価性をチェックする。

ログは/tmp/kshiai-conditional-{final-build,final-typecheck,static,adr,focused-tests,governed-tests}.log。
デプロイ結果は別のreceiptに記録する。正式リリース、main統合、DB migration、
実ユーザーの有料試合進行確認は、このローカル検証の達成とは区別する。
