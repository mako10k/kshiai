# バトル用の粗い正準世界モデル

作成日: 2026-08-05
対象: `BL-020`, `T_WORLD_MODEL`
実装: `packages/shared/src/battle-world.ts`

## 1. 責務境界

`BattleState.worldState` は、知覚、実行可能性、因果効果、時間解決が共有する
サーバー所有の機械的事実である。LLMが提案する `semanticState`、キャラ別の
認知frame、キャラの私的状態、公開ナレーションとは分離する。

| データ | 所有者 | 用途 | 禁止事項 |
|---|---|---|---|
| `worldState` | サーバー | 知覚・行動候補・効果・時間順序の正準入力 | LLM文章やナレータ応答から直接変更しない |
| `semanticState` | 検証付きsemantic reconciler | 外見・場面・物体の意味的継続 | 機械的な可否や勝敗を直接変更しない |
| キャラ別認知frame | observer別projection | 対応キャラの判断 | 未認知の `worldState` 全量を渡さない |
| 公開ナレーション | ナレータ | ユーザー表示 | `worldState` へフィードバックしない |

自然文から「暗い」「隠れた」「目隠しされた」等をサーバーがパターン判定する
経路は作らない。意味解釈が必要な場合は、確定イベントへ結び付いた構造化提案を
別途検証し、サーバーのworld transitionとして確定する。

## 2. 有限状態

厳密な座標や剛体シミュレーションは持たない。次の有限値だけを正準化する。

| 分類 | 主な値 |
|---|---|
| 存在 | `present`, `absent` |
| 所在・関係 | scene area, held, worn, attached, absent |
| 露出 | exposed, partially concealed, hidden, invisible |
| 相対距離 | contact, near, medium, far, separate area, out of scene |
| 視線・音 | clear, partial, blocked |
| 向き | facing, side on, away, indeterminate |
| 身体 | alert/dazed/unconscious/incapacitated、移動、拘束、姿勢 |
| 感覚 | vision/hearingのnormal, impaired, blocked, absent |
| 精神 | clear/confused/delirious、self-directed/compelled/uncontrolled |
| 場面 | 明るさ、騒音、空間密度、移動制約 |
| 物体 | 運搬、使用可否、排他使用、使用者、遮蔽、移動・感覚への作用 |

2エンティティ間の距離・遮蔽・向きはpair relationとして保持する。pairの格納順は
entity IDの辞書順だけで正規化し、Side A/Bの優先順位には使わない。

## 3. 初期状態

新規バトルでは、既存の検証済み `semanticState` から決定論的にrevision 0を作る。

- 同じ構造化areaにいるA/Bは `near`、視線・音とも `clear`、相互に`facing`。
- 異なるareaなら `separate_area` とし、初期視線は `blocked`、音は `partial`。
- 双方は `exposed`、感覚と意識は正常から開始する。
- semantic上のheld/attachedは対応する構造化placementへ移す。
- 地形名や障害物名の自然文から、遮蔽・暗さ・使用可否を推測しない。

旧BattleStateに `worldState` がない場合も、読み込み時に同じ変換を行う。LLM移行は
行わず、保存前の履歴や公開ナレーションを変換入力にしない。

## 4. 不変条件

- `character.a` と `character.b` は常に存在するactiveなcharacter rootである。
- absent entityはabsent placementを使い、inactive tombstoneもabsentである。
- scene placementは存在するareaだけを参照する。
- held/wornの親は存在中のcharacterで、対象物はportableである。
- attached/held/wornの参照欠落と循環を禁止する。
- `usableBy` は存在するcharacterだけを参照する。
- pair relationは重複せず、参照先が存在する。
- 不在者を含むpairは `out_of_scene` かつ視線・音とも `blocked` である。
- 同一areaを `separate_area`、異なるareaを同一area内距離として扱わない。
- A/Bのpair relationは必須である。

## 5. 遷移

`BattleWorldTransition` は `baseRevision`、turn、確定source event ID、最大24件の
構造化operationを持つ。area/entity追加、所在・露出・actor/object状態、area状態、
pair relationを変更できる。

全operationを一時コピーへ適用し、参照・循環・存在・距離等の不変条件をまとめて
検証してからrevisionを1増やす。途中のoperationが不正、revisionが古い、turnが
異なる、未確定eventを参照する場合は、入力stateを同一参照のまま返して一切
commitしない。ナレーション等の未知フィールドはstrict schemaで拒否する。

## 6. 後続タスクとの境界

- `T_PERCEPTION_BASE`: `worldState`から初期accessと明示的な知覚喪失を投影する。
- `T_PERCEPTION_APPARENT`: 変身・幻覚・発話をobserver別の見かけへ投影する。
- `T_ACTIONS`: world制約からobserver-safeな行動候補を作り、実行直前に再検証する。
- `T_CAUSALITY`: 物体能力や自覚/無自覚の効果からworld transitionを生成する。
- `T_TIMELINE`: 各initiative bucketが読むworld snapshotとcommit後stateを統一する。

このタスクではモデル・初期化・原子的遷移境界までを実装し、知覚や既存
`resolveTurn`への消費者接続は各後続タスクで行う。
