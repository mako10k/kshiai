# 行動Intentの型契約修復と類似箇所（2026-10-02）

## 結果と作業基点

本番ソースを含む `origin/codex/cc304-focused-revise` の
`1f4b572e292834769146e58b0d7623fd3804761f` を基点に
`codex/action-intent-contract` で修正した。
以前の作業ブランチと更新済み `main` は保存している。
分離が必要な理由を `branches:preflight --reason` に記録した。

自由行動の説明・非空対象参照、reflectの分析・指針をkind判別ユニオンで必須にした。
行動・解決結果も同じ枝から生成し、生成元の値を保持する共通再投影を使う。
修復判断の履歴はADR-0044に保持し、所有者の「その場しのぎ・文字列リテラルへの
置換をしない」という制約で代替内容の生成案を撤回した結果をADR-0045へ記録した。

## 今回修正した類似経路

| 場所 | 問題と修正 |
| --- | --- |
| `packages/shared/src/battle.ts` | Intent・BattleAction・ResolvedBattleActionのoptional＋追加検証を共通の判別ユニオンに変更。自由行動・reflectの不足と枝の混在を静的に拒否する。 |
| `backend/src/services/battle-service.ts` / `character-action-fallback.ts` | 種類だけから不完全な自由行動・reflectをparseしていた。機械的に完全なIntentを構築できる候補だけを型付きで構築し、それ以外はnullとする。 |
| `packages/shared/src/action-feasibility.ts` | 能力一覧作成時に、不完全な自由行動と定型分析を持つreflectを仮Intentとして作っていた。能力として可否を評価し、内容を作らない。 |
| `packages/shared/src/battle-engine.ts` | 個別フィールドの条件付きコピーで判別関係が失われる。型付き共通再投影を使う。 |
| `packages/shared/src/battle-turn-causal-receipt.ts` | 個別再投影がreflectの分析・指針を落としていた。共通再投影で元の値を保持する。 |
| `backend/src/services/free-action-service.ts` | 失敗記録のrequested生成が任意フィールド扱いで、説明がなければ定型文を補っていた。完全な元行動を再投影する。 |
| `backend/src/llm/mock.ts` | 判断内容の生成経路がunknown戻り値のため、不完全なkindだけの値を返せた。内部値をIntent型で構築し、既存の明示的な判断値を保持する。 |

## 値を保持する境界

本番用の代替生成には、自由行動の説明・参照やreflectの分析・指針を供給する
固定文を追加していない。能力の表示名や説明を実行の判断内容へ流用していない。
通常行動のkind、スキルID等は選んだ候補から渡す。
能力一覧の自分表示、未解決時のwait、Mockの既存の定型文は基点にも存在する。
説明等が欠落した場合に型を通すための新しい値を補うことはしない。

候補から完全な代替を構築できなければnullを返す。
既存の呼び出し側にはnullをwaitとして扱う経路があり、この方針は今回変更しない。
有効な規範内の自由行動・reflectは、代替値に置換せず保持する。

## 未修正の類似契約候補

以下は実装を読んで確認した構造上の候補であり、実障害が確認された箇所ではない。

| 優先 | 契約 | 静的な表現へ移せる条件 |
| --- | --- | --- |
| 1 | `TurnEvent` / `TurnEventSchema` (`battle.ts`) | utterance/manifestationの種別に対応するid・actorSide・ペイロードの必須化。他の種別へのペイロード混在禁止。 |
| 1 | `CharacterActionNormV3Schema` (`character-definition-v3.ts`) | allow_only/forbidはconstraint、prefer/avoidはそれ以外というforceとresponseの組合せ。 |
| 1 | `CharacterSemanticMigrationOperationV1Schema` (`character-semantic-change-set.ts`) | deferのdeferredメタデータ必須、copy/moveのsourcePaths長1・value=null、retireのvalue=null、operationとprovenanceの組合せ。 |
| 2 | `CharacterCompilerCapabilityV1Schema` (`character-definition-v3.ts`) | 登録済みconsumerとversionの組合せ。レジストリから同じ組合せのユニオンを導く。 |
| 2 | `CharacterSkeletonPhaseOperationV1Schema` (`character-semantic-authoring.ts`) | 段階外の操作を追加検証で拒否しているが、推論型は元の全操作ユニオンのまま。実際に許す枝へ絞る。 |
| 2 | Intentのskill枝 / `ObserverSafeAvailableAction` | 現行のskillIdはoptional。通常行動の能力メタデータと完全なスキル要求を分け、skillId必須化の入力互換・失敗分類を確認する。今回は既存のスキル実行可能性検証を維持。 |

IDの実在・参照先の一致、規範との適合、文字数・数値上限などは、
判別ユニオンへの移行後も実行時検証が必要。値の正しさを型だけで代替しない。

## 検証

- sharedビルド後、9ファイルの明示的診断テスト: 93件成功、失敗0。
- V4自由行動限定規範の実SQLite試合: 完全なfixture判断を渡し、説明・参照・目的が
  実行結果に一致すること、固定されたassetManifestが変わらないことを確認。
- 型テスト: 自由行動の説明・対象欠落／空参照、reflectの分析・指針欠落、
  不完全なBattleAction・ResolvedBattleAction、自由行動とスキル権限の混在を拒否。
- `npm test`: Seal選択対象45ファイル、provisional 2、disabled 142。
  実行した3グループは206・24・29件、すべて成功。
  新規・変更した根拠未更新のテストは、上記の明示的診断結果として扱う。
- 最初の通常実行は、既存テストの環境変数削除後に`.env`が再読込され、
  PostgreSQL設定が混入して1件失敗。`.env`を一時退避して再実行し成功。
  退避したファイルは終了時に戻し、SHA-256でバイト一致を確認した。
- `npm run typecheck`、`npm run build`成功。Viteの既存の大きいchunk警告は残る。
- 新規ADR2件の `adr:check` はfatal/error/warningなし。
- `git diff --check`成功。修復した契約経路に型escapeを追加していない。

古いV2戦闘用 `scene-beat-wiring.test.ts` も診断実行したが、
現在のV3-only運用に対して7件失敗した（旧fixtureの更新/新規作成契約不一致）。
このファイルは変更せず、今回の93件の合格には含めていない。

本番デプロイ、DB更新、有料provider実行、コミット、pushは行っていない。
実環境の停止試合が修復版で再開することは、まだ本番では確認していない。
