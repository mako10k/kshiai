# 実接続前の動作契約候補 v1

> 後継の所有者指示：[ADR0051](adr/0051-observed-llm-usage-accounting.md)が意識パイプライン awareness-v5を継承し、新規試合の会計を実利用計測へ変更。事前料金証明は必須ではなく、未知のusage・料金は不明として記録する。[詳細設計](battle-consciousness-usage-measurement-2026-10-05.md)。下記の料金証明必須記述は旧方針の履歴。旧切替試行の契約改訂は保留。

- Status: Accepted。2026-10-05、所有者が「候補v1一式を採用して実装を続ける」と回答。

2026-10-05。所有者は実装開始と型整合性・SRP・疎結合を指示した。自然文入力とLuna/Grok配分は既決。以下は設計で未決定だった製品動作を具体化した候補であり、実装指示から数値・移行等の受入を推定しない。対象はADR0050の残るQ契約。新pipelineの有料実行・配備・旧試合変更は対象外。

## 推奨する候補一式

1. **時間・起動・有限終了（Q01/Q02/Q07/Q08）**：運用契約候補v1を採用。公開12turn×3beat、1tick=1beat、最小1秒間隔。潜在は構造的知覚変化・未受取介入・期限で起動し、最大3tickで再評価。顕在は時点Aの凍結入力と直前の受理済み本人向け投影から並行起動し、実際の完了後の次境界へ合流。キャラごとに1job。終了不明の送信は再送しない。潜在・裁定の失敗や予算不足では現tickをcommitせずincomplete終了。初回顕在が期限内に届かない場合もincomplete。受理済み思考がある場合の失敗継続は運用候補§3の有限範囲のみ。実況失敗は確定世界・勝敗を保持して描写未完了を表示する。
2. **試行上限（Q08）**：36tick、180秒、physical attempt合計200、0.50USD。枠配分は必須反応/裁定60%、顕在25%、実況15%。physical同時6。application repair最大1、transport retry/fallbackの自動起動0。token上限とrole deadlineは[運用候補§4](battle-consciousness-operating-policy-2026-10-05.md)をそのまま採用。取消・timeout・usage不明も予約を保持し、検証済み価格/token見積方式がなければ有料dispatchを拒否する。これらは品質実測前の試行設定で、全試合を自然に完遂できる保証ではない。
3. **顕在度（Q03）**：各潜在項目に0〜1の顕在度を持たせる。意味更新writerは潜在LLM。顕在は変更を介入として提案し、次の潜在更新へ1回だけ配送する。同一潜在応答に、低い値は原因を明示しない感覚、高い値は本人が自覚する内容として短い本人向け投影を返す。serverは値から隠れた原因を文章化せず、本人向け投影だけを顕在へ渡す。数値だけで正準真実や他者・読者への公開許可を作らない。代案は3段階のenumだが、連続的な変化の表現を減らす。
4. **意欲の強さ・競合（Q04）**：強さは0〜1の共通尺度。反射・潜在・顕在という出所の固定優先は設けない。身体行為は既存resolverが扱える1件を選び、発声は別資源。競合時は強い方、同値は既に受理済みの意欲、さらに同値は不変IDの昇順で決める。意欲の有効期間はproducer指定1〜3tick、減衰は自動で行わず期限到達で失効。新しく強い意欲は次の更新境界から適用し、確定済み行為を巻き戻さない。最新正準状態で不成立なら代替行動を捏造しない。身体の細かな部分を同時に独立制御する版は今回導入しない。この制約では、同じtickの異なる身体動作は1つの複合行為としてproducerが提案する必要がある。
5. **発声（Q05）**：潜在は短い反射声、顕在は意図的な台詞を提案できる。両者を同じvoice資源の意欲として扱い、§4の強さ・同値規則を使う。既存の発声成立/伝達処理を通った言葉だけが相手の次知覚へ入る。内部の発声意欲は公開しない。ナレータへ成立済みの原文を渡し、別台詞へ書き換えない。沈黙・意図的反復は合法。代案は反射声を出さず顕在だけで発声するが、痛みへの短い声などの表現を失う。
6. **世代と適用範囲（Q06）**：新pipelineの識別子をawareness-v5とし、切替後に作成する新規試合だけに不変policy・prompt/output revision・asset snapshotを束縛する。既存dynamic-v4以前の試合はその世代で読取/継続し、自動移行・書換え・削除をしない。既存V3キャラrevisionの特性を投影して初期化し、新しい癖や訓練を創作して定義へ保存しない。代案は既存試合も移行することだが、別途migrationと結果互換性の受入が必要。
7. **モデル（既決D11）**：潜在openai/gpt-6-luna/none、顕在と裁定はconfigured Grok engine、実況はconfigured Grok fast。モデル名とtransport configは実attemptへ記録し、試合のsemantic identityと分ける。別provider/modelへの黙ったfallbackをしない。顕在をfastへ落とす代案は後の実測比較で判断する。
8. **実況batch（Q07）**：運用候補§7の最大3receipt/最古6秒flush、公開deadline36秒、queue12beatを採用。公開identityは既存battleId/turnReceiptIdを維持し、receiptごとの出力とsource coverageを検証する。世界進行は確定結果を先にcommitして継続する。queue期限超過時は新advanceを止める。代案は現行の1receipt=1callで、接続は簡単だがcall削減を失う。

## 型・責務・依存方向

sharedのauthoritative schema/DTO/state reducer → backendの投影/port契約 → role別promptとprovider transport。orchestratorはportを受け取り、SDKやDB実装に依存しない。永続化adapterはrevision/fence・mailbox・job・attemptを所有し、意味stateを生成しない。世界resolverだけが正準stateを変更する。反射/感情/投影は1つの潜在callに閉じ、別classifier/要約/書換えLLMを加えない。

公開契約に型escapeを入れず、schemaと推論型を共通源から導出する。各source moduleに実責務を示すRコメントを付ける。内部実装・テストでこの候補の製品動作を勝手に再解釈しない。

## 検証とリスク

LLM-free検証では凍結入力、3tick以上進行中の後着合流、取消後不適用、privacy、同値/期限、mailbox一回配送、latest-world不成立、予約拒否、unknown費用保持、worker再開、実況receipt順序を確認する。実モデルの自然さ・強度校正・日本語品質・latency・費用は別の予算とシナリオで評価する。上記上限では密な刺激・長い能力定義・遅いモデルでincompleteが増える可能性がある。構造テストで体験品質を受入済みと扱わない。

## 判断対象

推奨は上記1〜8と運用候補v1を新規試行用として採用し、ADR0050の対応条項をAcceptedへ進めること。変更したい項目があれば番号と希望動作を指定する。新pipeline接続の内部工数は暫定12〜20時間、低信頼度（契約/詳細設計2〜4、shared/state3〜5、job/persistence/role接続4〜7、統合検証3〜4）。有料実行と配備は含まない。既存実装の開始/完了を正準PERTに記録して見積りを更新する。
