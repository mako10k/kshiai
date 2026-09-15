# ADR-0033 revision 1・実装設計 revision 6 レビュー記録

- 日付: 2026-09-15
- 対象ADR: `docs/adr/0033-runtime-config-not-run-identity.think`
- 対象ADR SHA-256: `ae8b736857b59188880acbf397e2da941caf5c102539b2410ddd7011fd1f529a`
- 対象設計: `docs/structured-semantic-authoring-kernel-implementation-design-v1.md`
- 対象設計 SHA-256: `a0f2ba909d3c71fb7de2235bd84125b420663f6f8b5400c4236eaf92e832ebff`
- 判定: PASS
- Finding: P0〜P3すべて0件

## レビュー課題

Provider Transport ConfigとWorker Execution Configの世代IDまたはsnapshotを
永続Run identityから除外しても、受理済みの再試行、会計、fence、遅延結果拒否、
技術的結果、および分離された時間境界の契約が維持されるかを確認した。

## 根拠

受理済みfoundation要件は、失敗した試行を終了し、明示的な再試行で保持sourceと
適用可能な認可済み入力から新しい試行を再構築することを認めている。中間candidate、
model context、worker checkpointの永続化は要求していない。

受理済みADR-0032は、provider通信とworker実行の時間制御、単調な会計、fence付きの
遅延結果拒否、型付き技術結果を要求する一方、具体値とruntime policyの受理を後続判断に
残している。

設計revision 6は二つのConfig identityをRunから外すが、source identity、semantic
policy、pricingおよびtoken estimator identity、provider request identityと状態、予約、
receipt、単調な会計、execution fence、技術結果、predecessor関係、source-basedな新規Run
再構築を維持している。このため、対象の受理済み契約は弱まらない。

独立レビュアー1名と主レビューの双方が、P0〜P3の設計欠陥なしと判断した。レビュー後も
対象ダイジェストは一致した。

## 実装段階の確認事項

実装は、runtime Configが変更された後の再起動でもworker leaseの失効を判定できるよう、
claim時刻、期限時刻、または同等の永続事実を保持する必要がある。正確なDDLは実装sliceの
責務であり、Config世代IDまたは完全snapshotを要求するものではない。このため現在の設計
blockerには分類しない。

## 判定と境界

判定はPASS、P0〜P3は0件とする。このレビュー自体はオーナー受理ではなく、実装、commit、
push、provider call、deployment、migration、activation、releaseを認可しない。
