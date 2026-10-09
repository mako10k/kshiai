# 修正範囲の評価とローカルadapter

元2wholefile・15ケースを保持。独立INSIDE、診断15pass/0fail/0skip。証跡 docs/evidence/revision-scope-independent-review-2026-10-08.json と revision-scope-preseal-2026-10-08.tap。

Accepted ADR0035 D1は自然文から有界候補を提案しサーバが範囲検証・固定する。D2は初回製品経路を明確な単一領域に制限する。共通基盤要件v3 F1/F2/F5/F14とキャラ要件v5 R2/R3/R20に従い、純粋評価器は管理済みcorpusのtrusted labelに対するscope欠落/拡大/grounding/曖昧性を判定する。cross-clusterという評価結果は複数領域の製品処理を許可しない。評価器は質問、保存、provider選択を行わない。

ローカルadapterは注入fetchだけで一回のrequest、strictschema、無credential、invalidraw/validationissueとtokenreceiptを検査する。固定qwen2.5:3b/context4096/output512等は実験変数の保存であり本番のモデル/数値policy採用ではない。英語/日本語/few-shot切替はsystempromptだけを変える。実際のLLM品質やcorpus代表性は証明しない。ProposedADR0059、公開質問API、通常製品multi-cluster成功、実provider呼出しを含めない。

CauseはAccepted0035、exactAccepted要件の現在ref、実評価器、実adapter、元各wholefileをcurrentbytesで結ぶ。受入後の設計projectionをexact受入bytesとは呼ばない。旧実験結果を製品合格へ昇格しない。
