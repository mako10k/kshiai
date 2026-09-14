# D11 部分構造化意味作成基盤 設計v1 revision 2 — 再レビュー全文日本語訳

- 状態: 再レビュー完了、`PASS`、推奨`ACCEPT`
- 日付: 2026-09-11
- 正確なレビュー対象: DRAFT Seal `c4f8cb366d78…`
- 範囲: 英語設計候補revision 2全文と、その日本語全文projection
- 照合Authority: 受理済みADR-0031 revision 1、基盤要件v3、キャラクタ作成要件v5、
  現行shared公開契約
- 独立性: 現在のCodex task内で実施。別reviewer identityを要求する独立review gateは満たさない
- Review原則: 後続の詳細化未達をREVISE理由にしない
- 対象外: acceptance、実装、provider call、cutover、deployment、本番作用、commit、push

## 結論

P0〜P3指摘なしで`PASS`。revision 2は、訂正版revision-1 reviewの実質的指摘2件をどちらも
解消した。受理済みの意味、権限、互換境界との新しい矛盾は確認されなかった。このexact design
revisionに対するowner `ACCEPT`を推奨する。

## 以前の指摘の解消

### Semantic-skeleton順序 — 解消

skeleton phaseはcluster 1に加え、server指定済みのessential ability/limitとkey relationshipの
claim sliceだけをcluster 2・3から含む。残りのdependent workがfan-outする前に、それらclaimが
存在し、該当hard checkへ合格する必要がある。modelにはclosedな
`CharacterSkeletonPhaseOperationV1` subsetを通じて登録済みtargetだけを渡すため、修正によって
cluster全体を早期公開することはない。

根拠: 候補297〜307・394〜405行、character要件v5 R6・R10。

### Portrait権限 — 解消

model operation catalogから`set_portrait`を除外した。createはnullまたはpre-authorizedなserver
binding、revise/migrateは凍結baseline bindingを維持し、別途認可されたserver operationだけが
変更できる。providerがportrait identifierを選択しようとした場合はunknown operationとして拒否する。

根拠: 候補323〜341・413〜417行、character要件v5 R7。

## 指摘

P0、P1、P2、P3の指摘なし。

## 後続の完了条件 — 指摘ではない

次の要件は、それぞれのgateで有効なままである。

1. 実装が依存する前のexact DTO・focused patch schema詳細化
2. durable execution有効化前のexact process-loss takeover transition
3. test完了を主張する前の15 conformance case全件の1対1 mapping
4. 公開route配線前のowner-Q&A projection全体

本設計の受理は、これらを免除しない。後の具体化で実際の矛盾が判明した場合は、そのevidenceに
基づいて新しい指摘を発行できる。

## Owner判断点 — 指摘ではない

- proposed default limitとしての8 call・USD 0.50
- additiveなlegacy `failed` projectionとversioned public statusの選択
- new-attempt Q&A recoveryとsame-run resumeの選択
- no-progress／cycle-detector threshold

## Revision 1からの重要差分

revision 1とのimmutable比較で確認した変更は次だけである。

- revision／status表記
- cross-clusterのfocused skeleton-phase訂正
- portrait bindingのmodel operation削除とserver側処理
- 対応する自己レビュー説明

その他のarchitecture、互換境界、persistence方向、resource policy案、Q&A flow、conformance方向、
acceptance境界は変更されていない。

## 代案とtrade-off

1. **Revision 2を受理（推奨）:** 実証された2 defectを閉じ、後続詳細は適切なgateへ維持する。
2. **後続contractを今さらに詳細化して再改訂:** 後の記述量を減らせる可能性はあるが、現在の
   defectは要求しておらず、不必要に早いgateを再び作る。
3. **Architectureを棄却:** 受理済みthin kernel、focused capability、server authority方向を
   再検討したい場合だけ妥当。本reviewではrollbackを必要とするevidenceはなかった。

## RiskとUnknown

- Provider convergenceと数値妥当性は未検証。
- 4つのowner判断点は、このexact design revisionの一部としてownerが選択するまで未受理。
- 同じtask内のreviewは、別の独立reviewer identityのevidenceではない。

## Review判断

- Verdict: `PASS`
- 指摘: なし
- 推奨: exact DRAFT Seal `c4f8cb366d78…`に対するowner `ACCEPT`
- Acceptance効果: designだけを受理する。実装、provider実行、cutover、deployment、本番作用は
  引き続き別gate
