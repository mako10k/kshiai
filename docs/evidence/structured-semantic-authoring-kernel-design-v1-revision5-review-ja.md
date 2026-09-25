# 構造化意味作成kernel設計v1 revision 5 独立レビュー — 全文日本語訳

- 判定: **PASS**
- 指摘: P0 0、P1 0、P2 0、P3 0
- レビュー対象: `design/structured-semantic-authoring-kernel-v1`
- Exact Seal: `69c9c98937d7d610384823ae339ea464724f6e983d8b5500d3aef6942945a240`
- Workfile SHA256: `426470047d0e380de90624192b9db71d3f30788fa44423ed0710f9cb1e6cdba4`
- 範囲: 受理済みADR-0032、維持されたADR-0031 D11、基盤v3 F8/F9/F15、revision 4の
  指摘、revision 5の回復遷移とconformance fixture
- 対象外: 実装適合性、時間policy数値選択、provider挙動、deployment、activation、owner受理

## Revision 4指摘の解消

Revision 5は以前のP1指摘2件を解消している。現行fence下でtransport recovery適格性を資源
admissionより先に評価し、recovery 0/消費済み/根拠なしを
`provider_transport_unavailable`へ、それ以外は適格だがadmission失敗の場合を
`resource_exhausted`へ送り、timeout receiptとaccountingを保持し、fixtureにも両分岐の区別を
要求している。

根拠: 設計543–560行、772–781行、revision 4 review判断D2・D3。

## Revision 5の元指摘に対する扱い

元reviewは、形式的なrecovery-basis verifier、exactなadmissible-evidence semantics、canonical
digest範囲、metadataだけの変更と古い証拠に関する追加fixtureが定義されていないことを、1件の
P1設計blockerとして扱っていた。この指摘は**採用しない**。

受理済み基盤F8は、source-supported synthesis、creative completion、coherent interpretation、
low-importance adjustment、valid deferral、preserved retirementを、review可能な移行結果として
許容する。F9はこれとは別に、retryごとに情報を追加する、問題を狭める、または実質的に異なる
代案を試すことを要求し、blind retryを禁止する。この実行制御は暴走を制約するものであり、
移行を意味上の厳密一致処理にするものではない。

Revision 5はすでに、有償admissionの前にserverが1つの真実な型付き`recoveryBasis`を確立する
こと、根拠がなければrecoveryを拒否すること、model自身の主張を根拠にできないこと、別の
replacement request identityを割り当てること、blind replayがscheduleされないことをcontrolled
fixtureで示すことを要求している。ADR-0031 D11は、元reviewが提案した追加の形式証明protocolを
設計受理要件にはしていない。

Digest不一致だけでは、実質的な情報増加は証明されない。この点はruntimeのF9適合性検証時に
評価すべき実装上の潜在riskであり、現設計の矛盾を示す証拠ではない。この任意の詳細化をP1
blockerへ昇格したことは、**AP-007 Control Accretion**に該当する。後工程の実装上の懸念を、
受理済み要件または具体的に未解決な設計結果なしに、新たな現工程の前提条件へ変換していた。

根拠: 基盤v3 F8 210–228行、F9 232–255行・375–378行、設計531–557行・772–781行、
受理済みADR-0031 D11。

## Evidence chain結論

- `C-RECOVERY-001` 📜: Revision 5はrevision 4の指摘2件を解消した。
  - 参照: `E2`、`E3`、revision 4 review `D2`・`D3`。
- `C-RECOVERY-002` 📜✅: 設計段階のrecovery contractは、移行の意味的厳密一致や元reviewの
  追加proof protocolを要求せずにF9を満たす。
  - 参照: authoritative review thoughtの`E4`〜`E8`、`C1`〜`C3`。
- `A-RECOVERY-001` ➖ [保留]: 実runtimeのF9適合性は実装工程で検証する。任意のverifier設計を
  このreviewへ遡及的に適用する要件にはしない。
  - 参照: `C-RECOVERY-002`、`U1`。

## 境界

このPASSは設計を受理せず、実装、provider call、PERT再開、route cutover、deployment、本番effect、
pointer/policy activation、rollback、releaseを認可しない。`cc304`はsuspendedのままとする。
Runtime実装適合性とprovider挙動は未確認である。
