# ADR-0032 revision 1 レビュー結果

- 対象: `docs/adr/0032-separate-authoring-time-boundaries.think` 全文
- 対象SHA-256: `c9e8ee12edd8f57d796ab389958c8a8f741011fd853b49662f265291bbdb8409`
- レビュー結果: **PASS**
- 指摘: P0 0件、P1 0件、P2 0件、P3 0件
- 推奨: **ACCEPT**
- 候補の状態: Proposedのまま（このレビュー自体は受理ではない）

完全な日本語レビュー対象は
`docs/evidence/adr-0032-separate-authoring-time-boundaries-owner-review-ja.md`
に記録されている。本書はそのexact revision 1に対するレビュー結果である。

## 結論

ADR-0032 revision 1は、時間に関係する4種類の制御を分離し、固定された
attempt全体のwall-clockを意味的失敗から外す。同時に、call、step、token、
費用、無進捗、循環、fenceおよび単調会計を維持する。受理済みADR-0031との
重大な矛盾、権限の欠落、内部不整合は確認されなかった。

## 確認した主要論点

### 1. worker期限後の扱い

ADR-0032 D2単独では「回復可能な技術的結果」が広く読めるが、D5は
ADR-0031 D6とD9を維持している。この組合せにより意味は次に限定される。

- claimed runは、worker/process喪失時にfenceされた技術的失敗として終了する。
- 不明なin-flight消費は保守的に会計する。
- 同じrunを空のcounterで再開しない。
- オーナーがretryする場合は、新しいattemptとしてsource/pointer driftを再確認する。

したがって、同じattemptの自動再開や消費量resetは、このADRでは許可されない。

### 2. provider timeout後の限定回復

ADR-0032 D3は、明示的に受理された限定回復が存在する場合だけ、1回のtimeoutで
attempt全体を自動終了しないとしている。現時点では、その回復方式、追加費用、
具体値はU1とD4で未決のままである。

したがってD3は自動retryの権限ではない。後続判断が受理されるまでは、追加call、
同attempt継続、別routeへの切替を実装から推測してはならない。

### 3. 時間値が未決であること

具体的なprovider timeoutとworker期限を未決にしたことは指摘ではない。今回のADRは
境界の意味を決め、対象route、platform、代表request測定、オーナー待ち時間budget、
exact policyの受理が揃うまでactivationを明示的に禁止している。根拠のない別の秒数を
レビュー側で発明しない方が、今回の決定範囲に整合する。

### 4. ADRライフサイクル

ADR-0032は現在Proposedなので、ADR-0031を今Supersededにしないことが正しい。
ただし、このexact revisionを後で受理する場合、その受理処理ではリポジトリ規約に従い、
ADR-0031を`Superseded`に変更してADR-0032へのlinkを追加する必要がある。ADR-0031の
他の判断は、ADR-0032 D5が引き継ぐ。

## 未決事項と限界

- provider route/model、遅延分布、通常call数、オーナー待ち時間budget、platform期限、
  回復費用、具体的な時間値は後続判断である。
- 本レビューは現在のタスク内で同じagentが実施した。独立・委任レビューをユーザーが
  指示していないため、内容の正式レビューではあるが、別identityによる独立 corroboration
  ではない。
- PASSは受理、実装、provider call、deployment、activation、commit、pushの権限ではない。

## 次の判断

- `ACCEPT`: exact ADR-0032 revision 1を受理する。
- `REVISE`: 変更したい箇所を指定して候補を改訂する。
