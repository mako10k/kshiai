# 初回キャラ主体性要件 — 第1回ownerレビュー入力

状態: step 1セルフレビュー済み、step 2のowner経路選択待ち。独立レビュー未実施。
対象: `docs/character-agency-requirements-v1.md` revision 1。
SHA-256: `f733f85a153349e4be28785fef05d93006d057e0e5d507a8423b658f9bb7f444`。
対象本文を変えたら新revisionとしてstep 1から再開する。本入力は要件本文を上書きしない。

## 提案する独立レビュー範囲

authority: ユーザーの目標/能力/対応発話の要望、Accepted ADR-0027 revision 1、
ADR-0025/0026、0008/0011、immutable generation。旧実装は非規範の比較資料。
対象§1の表でV1/V2を維持し、内部V3を別候補として扱う。外部APIの命名権は移転しない。
範囲: CA-01＋最小CA-02、状態/入力/phase/失敗/互換とAC1–AC8。
範囲外: 新機械効果、NN、長期学習、上位目標の途中変更、UI公開、有料実験/展開。

レビュー質問:
1. 明示作者目標と生成fallbackを区別するR1が、性格/関係からの導出を実質的に封じないか。
2. 初期goal/短期intentのwriter・寿命と後攻共有が、同じ顕在意識の判断になっているか。
3. 新phaseの心理0callと旧phase互換がADR-0027に整合するか。未定の「ここぞ」を勝手に定義していないか。
4. 不正goal/intent/actionと有効発話の部分受入、CAS、fallbackの組合せに矛盾はないか。
5. V3/状態V1のnamespace所有、上限、公開除去、operation計上に未確認の互換影響があるか。
6. CA-00のfixtureとAC1–AC8で「目標文だけ追加」と本来の成果を区別できるか。

未知: 実モデルの目的依存選択、上限の十分性、品質閾値/件数/予算。
新設定選択のAPI具体契約と追加ADRは要件受入後の作業であり、実装前に確定する。
これらを確認済み、または独立レビュー完了と報告しない。

## ownerへの経路提案

提案経路は `REVIEW_THEN_DECIDE`。ownerコメントを質問へ追加し、この未変更snapshotを
独立レビューした後、同じsnapshotと結果を第2回ownerレビューへ戻す。
ownerが `REVISE`、`REVIEW_THEN_REVISE`、`REVIEW` を選ぶこともできる。
現時点の選択は未取得。この提案だけでサブエージェントを起動しない。

独立レビューは本文を編集せず、所見を「authority/要件との矛盾」「証拠不足/未知」
「任意/将来候補」「範囲外」に分類する。任意案を必須要件にしない。
完了またはnot-reviewableを報告し、ownerが選んだ経路に従う。独立レビューは承認ではない。
第2回でのACCEPTはこのdigestだけに適用し、追加ADR・実装・公開・課金はそれぞれの境界を保つ。
