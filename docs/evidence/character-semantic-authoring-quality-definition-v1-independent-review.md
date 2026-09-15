# 品質属性・レビュー十分性定義 revision 1 — 独立レビュー

- 実施日: 2026-09-15
- lifecycle: requirement-authority-review Step 3
- first-owner route: `REVIEW`
- 結果: `completed`
- 推奨: `REVISE`
- 候補: `docs/character-semantic-authoring-quality-definition-v1.md`
- 候補SHA-256: `3a7380e50ec4aedf8cf6bc730031adbb0a7bbc34820e9b6f0f49590ff0b1931f`
- review input: `docs/character-semantic-authoring-quality-definition-v1-review-input.md`
- review input SHA-256: `d95f12e5facf576646e88ebf677f9acbc2fa93b5aa92da78011aa96ac20cc8c7`

## 結論

定義の中心部分は成立している。安全性を指定危害のrisk、互換性を方向付きversion行列、
性能を固定workload下の時間・容量・resource/costとして分離している。利用者価値をテスト、
review PASS、配備状態で代用せず、任意改善をblockerにしない。受入済み要件または外部namespaceとの
矛盾も、下記F1以外には確認しなかった。

ただし、有限reviewを実現する契約そのものに、変更後snapshotの扱いに関する矛盾が1件、
免除authorityとprofile具体化に関する未決が2件ある。そのまま受け入れると、review statusの
不適切な持越し、無権限な免除、または不足項目をreviewerが補う余地を残す。Step 4では
`REVISE`を推奨する。候補本文は本reviewで変更していない。

## findings

### F1 — contradiction with authoritative review lifecycle / High

候補6.2は、固定snapshotのすべてのin-scope品質主張・所見に結果・分類を付ける一方、
修正後は影響主張だけを再確認するとしている。受入基準10も同じ規則を採用している。

requirement-authority-review lifecycleは、requirement本文のbytesが変われば新revisionとして
Step 1へ戻り、以前のreview statusを持ち越さず、Step 3でowner-reviewed exact snapshot全体を
扱う。影響する検査の実行だけを絞ることはできるが、新snapshotの全in-scope claimに現在の
dispositionを与えず、以前の結果をそのまま持ち越すことはできない。

影響: 本候補がrequirement reviewにも適用される以上、候補6.2/受入基準10をそのまま採用すると、
本候補2.1の既存authority維持と衝突する。

必要なrevision境界: 「新snapshotでは全claimを現在形でdispositionする。変更のないclaimの
証拠はcurrent-fit確認後に再利用できる。検査の再実行は影響範囲へ限定できる」に分ける。
これはreview項目を増やす案ではなく、結果持越しと検査再実行を区別する修正である。

### F2 — evidence gap or unresolved unknown / High

候補3章は品質結果に`免除`を含めるが、必須claimを誰が免除できるか、必要な理由・期限・
代替control・影響scope、免除がowner acceptanceを代行しないことを定義していない。

影響: reviewerまたは実装者が、自分で必須基準を免除する余地がある。authority境界と
traceabilityが未決である。

必要なowner decision: `免除`を削除して3結果にするか、免除authorityを当該claimの決定ownerに
限定し、記録項目と期限を定めるか。本reviewはどちらかを選ばない。

### F3 — evidence gap or unresolved unknown / Medium

候補3章は、判定可能な品質主張に8項目を要求する。5章の`QV-01`〜`QM-01`は属性、対象、基準を
示すが、環境・version等の境界、証拠方法、結果dispositionを完全には持たず、各review instanceで
残りを埋めるtemplateなのか、表自体が完全なclaimなのかを明示していない。

影響: profile表だけで判定可能と誤認するか、不足項目をreviewerが都度創作する可能性がある。

必要なrevision境界: profile行はclaim templateであり、review開始時に8項目を完成させると明記する。
既存要件・既存基準から決まる値とowner未決値を分け、reviewerへ仕様決定を移さない。

### F4 — evidence gap or unresolved unknown / Later evaluation, nonblocking here

corpus構成、成功・失敗・質問・収束率、latency percentile・上限、token/cost評価上限、Stage観測値は
未決である。候補はこれを明示し、reviewerによる創作を禁止しているため、定義候補との矛盾ではない。
これらの未決は、後の実評価を`適合`と判定する前にowner decisionが必要である。

### F5 — optional or future candidate

他機能・他repositoryへ同じ語彙を展開する案は有用になり得るが、本候補は自動適用を対象外としている。
現在候補の修正または受入blockerではない。

### F6 — out of scope

implementation、PERT変更、provider評価、配備、production操作、数値threshold選択は本reviewの
対象外であり、実施も完了認定もしていない。

## review questionsへの回答

1. **安全性:** 適合。指定危害、重大度、可能性、影響範囲、可逆性で定義され、配備順や検査数と分離されている。
2. **互換性:** 適合。version行列、方向、操作、保持対象、非互換時の扱いを要求している。
3. **性能:** 適合。workload、環境、統計、時間、resource/costを要求し、hard ceilingと性能目標を分けている。
4. **既存authority:** F1を除き適合。受入済み機能要件、上限、namespaceを置換していない。
5. **未決値:** 適合。数値を明示的未決として保持し、reviewerの創作を禁止している。
6. **有限review:** 条件付き不適合。任意改善の非blocker化とreview完了状態は妥当だが、F2の免除authorityが未定義。
7. **delta review:** 不適合。F1のとおり、requirement bytes変更時の全claim current dispositionが不足する。
8. **利用者価値:** 適合。部品、テスト件数、review PASS、配備済みを利用者価値と扱っていない。

## acceptance criteria disposition

| AC | 結果 | 根拠 |
| --- | --- | --- |
| 1 | 判定不能 | 共通8項目は妥当だが、profileのinstance化がF3で未決 |
| 2 | 適合 | 9属性を分離 |
| 3 | 適合 | 安全性をriskとして定義 |
| 4 | 適合 | 互換性の行列・方向・操作等を要求 |
| 5 | 適合 | 性能のworkload・環境・統計等を要求 |
| 6 | 適合 | hard ceiling、性能、成功率、利用者価値を分離 |
| 7 | 判定不能 | 4分類は妥当だが、4結果の`免除`authorityがF2で未決 |
| 8 | 適合 | review完了、適合、owner受入、配備、activationを分離 |
| 9 | 適合 | 未決値とowner decisionを明示 |
| 10 | 不適合 | F1のreview status持越し問題 |
| 11 | 適合 | 新しいreview工程は追加していない |

## authorityと次状態

Step 3は`completed`。first-owner routeが`REVIEW`なので、変更していない候補snapshotをStep 4へ返す。
ownerは`REVISE`、digest不変で質問を変更・追加する`REREVIEW`、またはexact snapshotの`ACCEPT`を
選べる。本reviewの推奨は`REVISE`である。

本reviewは候補を受け入れず、ADR、計画、実装、commit、push、provider call、配備、activation、
production操作を認可しない。

## reasoning audit

- DSL: `docs/evidence/character-semantic-authoring-quality-definition-v1-independent-review.think`
- CLI LLMThink audit: fatal 0、error 0、warning 0、info 0
- hintsはshared-reference可能性と長文styleであり、上記findingsの分類または結論を変更しない。
