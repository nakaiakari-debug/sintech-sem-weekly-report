# RemoteTrigger セットアップ手順

週次自動発火用の RemoteTrigger を作成する手順。

## 前提
- claude.ai のアカウントで RemoteTrigger（Scheduled Agents）が有効
- 対象案件用のMCPコネクタ（Google-Drive / Notion / Slack）が既に自分のアカウントに接続済み
- `config/clients/<client_code>.yml` に全パラメータが埋まっている
- `skills/sem-weekly-report/scripts/` のPythonスクリプト2本を、案件のGoogle Driveに事前アップし、fileIdを控えている

## 手順

### 1. トリガープロンプト作成
`trigger_prompt.md.template` を開き、以下 `{{PLACEHOLDER}}` を `config/clients/<client_code>.yml` の値で置換:

| Placeholder | Config Key |
|---|---|
| `{{CLIENT_NAME}}` | `client.name` |
| `{{CLIENT_CODE}}` | `client.code` |
| `{{SHEET_ID}}` | `data_source.sheet_id` |
| `{{SEARCH_QUERY_TAB}}` | `data_source.search_query_tab` |
| `{{AD_ASSET_TAB}}` | `data_source.ad_asset_tab` |
| `{{NOTION_PARENT_ID}}` | `notion.parent_page_id` |
| `{{MTG_NOTES_PARENT_PAGE_ID}}` | `notion.mtg_notes_parent_page_id` |
| `{{SLACK_CHANNEL_ID}}` | `slack.channel_id` |
| `{{SLACK_THREAD_TS}}` | `slack.thread_ts` |
| `{{DRIVE_SEARCH_QUERY_FOLDER_ID}}` | `drive.search_query_folder_id` |
| `{{DRIVE_AD_ASSET_FOLDER_ID}}` | `drive.ad_asset_folder_id` |

置換後の `---` から `---end---` までの内容が RemoteTrigger の `message` になる。

### 2. Slackスレッド親メッセージ作成
Slack で通知投稿先のチャネルに、以下のような親メッセージを一度だけ手動投稿:

```
【検索クエリ】週次速報通知
（週次で下記にスレッド返信されます）
```

投稿後、そのメッセージの ts（例: `1785484403.404289`）を控えて `config/clients/<client_code>.yml` の `slack.thread_ts` に記入。

### 3. RemoteTrigger作成（WebUI）
1. https://claude.ai/code/scheduled にアクセス
2. 「新しいトリガー」または「+」
3. 設定:
   - **Name**: `{{CLIENT_NAME}}週次_検索クエリ_広告アセット_月曜9時JST`
   - **Cron**: `0 0 * * 1` （毎週月曜 0:00 UTC = 9:00 JST）
   - **Model**: `claude-sonnet-4-6`
   - **MCP Connectors**: Google-Drive / Notion / Slack を有効化
   - **Message**: Step 1 で置換したプロンプト全文を貼り付け
4. 「作成」

### 4. RemoteTrigger作成（API 経由・オプション）
`RemoteTrigger.create` を Claude Code から呼ぶ場合の body 雛形:

```json
{
  "name": "{{CLIENT_NAME}}週次_検索クエリ_広告アセット_月曜9時JST",
  "cron_expression": "0 0 * * 1",
  "enabled": true,
  "job_config": {
    "ccr": {
      "events": [{
        "type": "user",
        "data": {
          "message": {
            "role": "user",
            "content": "<置換済みプロンプト本文>"
          }
        }
      }],
      "session_context": {
        "model": "claude-sonnet-4-6",
        "allowed_tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]
      }
    }
  },
  "mcp_connections": [
    { "name": "Google-Drive", "connector_uuid": "030d60ef-2cd5-44d0-9a2b-37343045135c", "url": "https://drivemcp.googleapis.com/mcp/v1" },
    { "name": "Notion", "connector_uuid": "0c685e37-8fcc-4530-894e-2a68b556ca08", "url": "https://mcp.notion.com/mcp" },
    { "name": "Slack", "connector_uuid": "<設定側のUUID>", "url": "https://mcp.slack.com/mcp" }
  ]
}
```

Slackの `connector_uuid` は案件ごとに接続認証が別のため、必ず `config/clients/<client_code>.yml` の `slack.connector_uuid` を使うこと。

### 5. 手動発火テスト
1. 作成したトリガーの `run` アクションで **月曜JST以外の日** に手動実行してみる
2. トリガー内の日付計算（`date -d 'yesterday'` 等）は実行日ベースなので、月曜以外だと集計期間が予期しない範囲になる
3. **正式な動作確認は「次の月曜9時JST の自動発火」で行う**。手動発火は「エラーなく完走するか」の確認用

### 6. 動作確認チェックリスト
初回自動発火の翌週にチェック:
- [ ] Ads Script（月曜 7:22 JST頃）が実行され、Sheetに14日分のデータが書き込まれた
- [ ] RemoteTrigger（月曜 9:00 JST頃）が発火し、xlsx2本 → Drive → Notion 2ページ → Slack速報まで完走
- [ ] Notionページに前週比が正しく表示されている
- [ ] Slack速報がスレッド返信として投稿されている（チャネル本体に流れていない）
- [ ] 議事録参照が所感に反映されている

## トラブルシュート

### RemoteTrigger が予定時刻に発火しない
- claude.ai/code/scheduled のトリガー一覧で `enabled: true` になっているか確認
- `next_run_at` が正しく未来を指しているか確認
- `last_fired_at` が更新されていない場合、Anthropic側のスケジューリング遅延の可能性 → 30分待って再確認

### 発火は成功しているが Sheet に当週データがない
→ **Ads Script側の問題**。`ads-script/SETUP.md` の「Silent skip」トラブルシュートを参照。

### Sheetは正常だが Notion登録で失敗
→ Notion MCP接続が期限切れの可能性。claude.ai の設定でコネクタを再認証。

### Slack投稿が親メッセージとして流れる（スレッド返信にならない）
→ トリガープロンプト内の `thread_ts` が誤り or 空。Slackで親メッセージを再確認し ts をコピーし直す。
