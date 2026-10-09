# 裁定失敗と実行結果の追跡

ADR0064・0065の修正候補用手順。実環境での確認結果はリリース証跡に記録する。

`free_action_adjudication_failed` は裁定の呼出し・復号・返答検証の失敗を表す。`failureStage` と `reasonCode` で区別し、`fallbackKind=unavailable_receipt` は未確定の裁定を成功扱いしていないことを表す。

`free_action_resolution` はサーバーが確定した行動結果を表す。`outcome`・`reasonCode`・`failureSubtype`・`operationKinds` を確認する。`applied=true` は正準状態への操作が適用されたことを表し、行動意図の達成やダメージ発生を保証しない。物理的な不可能判定は通信・返答検証の失敗と区別する。

両イベントの `battleId`・`tick`・`actionId`（失敗イベントでは `actionIds`）をキーに追跡する。プロバイダーのリクエストIDは利用台帳の `snapshot_json.requestId` に記録される。ログの `requestId=null` はIDの不在を断定せず、台帳との照合を指示する。PostgreSQLでの参照例は以下。`$1` は対象のbattleId、`$2` はactionIdで、読み取り専用トランザクション内で実行する。

```sql
SELECT id, started_at, provider, requested_model,
       snapshot_json::jsonb ->> 'requestId' AS request_id,
       snapshot_json::jsonb ->> 'status' AS physical_status,
       snapshot_json::jsonb ->> 'errorClass' AS provider_error
FROM llm_usage_attempts
WHERE battle_id = $1
  AND (snapshot_json::jsonb -> 'receiptIds') ? $2
ORDER BY started_at, id;
```

複数行は再試行などの物理呼出しを含む。台帳の `completed` はAPI通信完了であり、裁定の受理を保証しない。行がない場合は、送信前の失敗や未送信をログ・予約記録と照合する。プロバイダーがリクエストIDを返さなかった場合は時刻・モデルで絞り込む。生プロンプト、秘密値、非公開の思考をログに追加しない。
