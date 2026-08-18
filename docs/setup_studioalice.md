# スタジオアリス案件 SEM週次スキル 展開チェックリスト

配布リハーサル兼、スタジオアリスへの `sem-weekly-report` スキル新規展開手順。
2026-08-18 起票。既存の月曜14時発火の週次レポート自動化とは **別物・並行運用**。

---

## 前提条件

- 既存の月曜14時発火の週次レポート自動化（`reference_studioalice_reports.md`）は継続稼働
- SHERPA型の**検索クエリ+広告アセット** 2本xlsxをNotionにアップする追加レポートとして展開
- Google広告のみカバー（Yahoo広告は現状スコープ外）
- 既存Sheet「【New社内】スタジオアリス_こども写真館」(`1E5YT0jo8l_ABp8VJrVAWd0Qvu_gtBUImSECBtO4Jg7I`) にタブ2つを追加

---

## Phase 1（完了・本セッションで実施）

- [x] `config/clients/studioalice.yml` ドラフト作成（既知値埋め、未定値は `REPLACE_WITH_`）
- [x] 展開チェックリスト（本ファイル）作成

---

## Phase 2（中井さん手動作業）

### 2-1. 既存Sheetにタブ追加

- [ ] 【New社内】スタジオアリス_こども写真館 を開く（`1E5YT0jo8l_ABp8VJrVAWd0Qvu_gtBUImSECBtO4Jg7I`）
- [ ] 「検索クエリ_raw」タブを新規追加（空でOK、Ads Scriptが列を書き込む）
- [ ] 「広告アセット_raw」タブを新規追加（同上）

### 2-2. Ads Script 設置

`ads-script/SETUP.md` に従う。要点：

- [ ] Google広告 → スタジオアリス対象アカウントを選択
- [ ] ツールと設定 → 一括操作 → スクリプト → ＋新しいスクリプト
- [ ] `ads-script/daily_export.js.template` の全文を貼り付け
- [ ] 冒頭3定数を置換：
  ```js
  const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1E5YT0jo8l_ABp8VJrVAWd0Qvu_gtBUImSECBtO4Jg7I/edit';
  const SHEET_SEARCH_QUERY = '検索クエリ_raw';
  const SHEET_AD_ASSET = '広告アセット_raw';
  ```
- [ ] 実行 → 認証承認
- [ ] Logger で「取得期間」「検索クエリ書き込み完了」「広告アセット書き込み完了」確認
- [ ] スケジュール設定：毎週月曜 **7:00 JST**（既存14時発火より前・干渉なし）

⚠️ **コード編集後の silent skip 対策**（`reference_ads_script_post_edit_pitfall.md`）:
初回スケジュールは silent skip する既知不具合あり。頻度変更→戻す→手動実行で承認確認しておくこと。

### 2-3. Slack 親メッセージ投稿

- [ ] スタジオアリス既存Slackチャネルに以下を1回だけ投稿：
  ```
  【検索クエリ】週次速報通知
  （週次で下記にスレッド返信されます）
  ```
- [ ] 投稿メッセージのtsを控える（メッセージメニュー「リンクをコピー」の末尾数字。例: `p1785484403404289` → `1785484403.404289`）
- [ ] `config/clients/studioalice.yml` の `slack.channel_id` と `slack.thread_ts` を埋める

### 2-4. Google Drive フォルダ作成

- [ ] スタジオアリス関連の共有ドライブに以下2フォルダを作成：
  - スタジオアリス_SEM週次_検索クエリ
  - スタジオアリス_SEM週次_広告アセット
- [ ] 各フォルダのURL末尾IDを取得し `config/clients/studioalice.yml` の `drive.search_query_folder_id` / `drive.ad_asset_folder_id` に埋める

### 2-5. データ蓄積待ち

- [ ] Ads Script 手動実行（初回承認）後、Sheet の2タブに直近14日分が入っていることを確認
- [ ] 翌週月曜7:00の自動発火が正常に動作することを確認（Loggerで発火ログ確認）

---

## Phase 3（データ蓄積後・別セッション）

### 3-1. ローカル手動実行での動作確認

```bash
/sem-weekly-report client=studioalice
```

- [ ] xlsx 2本がローカル `~/projects/my-project/スタジオアリス/output/` に生成される
- [ ] critical-thinker / customer-advocate の論理・ターゲットレビューが実行される
- [ ] Notion スタジオアリス親（`30ca33d430f6801cb3cfda83a7e4b794`）配下に子ページ2本作成
- [ ] Google Drive の2フォルダに xlsx がアップされる
- [ ] Slack スレッドに速報が投稿される

### 3-2. RemoteTrigger 化

- [ ] `remote-trigger/SETUP.md` に従い、`trigger_prompt.md.template` をスタジオアリス値で置換
- [ ] claude.ai/code/scheduled で新規トリガー作成（cron: `0 0 * * 1`）
- [ ] `config/clients/studioalice.yml` の `remote_trigger.trigger_id` に記入

### 3-3. 配布リハーサルのフィードバック回収

- [ ] 詰まった / 曖昧なポイントを `docs/DISTRIBUTION_LESSONS.md`（新規作成）に追記
- [ ] README.md / OPERATIONS.md の改善点を洗い出し
- [ ] SHERPA以外の運用者に配布可能な状態になったか判定

---

## 既知のリスクと予防

### R1. Sheet が10MB超で silent truncation

- **リスク**: 既存Sheetは既に大容量。`検索クエリ_raw` / `広告アセット_raw` タブを追加するとさらに肥大化
- **予防**: MCP経由の取得は必ず `download_file_content(xlsx)` + `openpyxl` 経路。`read_file_content` は使わない
- **参考**: `reference_google_drive_mcp_truncation.md`

### R2. 既存週次自動化との時間帯干渉

- **リスク**: 既存月曜14時発火の週次レポートが同じSheetを読むタイミングでAds Scriptが書き込むと競合の可能性
- **予防**: Ads Script 7:00 → 既存14時読み込みまで7時間空くため実質干渉なし。ただし手動リカバリで再発火するときは時間帯注意

### R3. Yahoo広告のカバレッジ

- **リスク**: スタジオアリスはYahoo予算も大きいがこのスキルはGoogleのみ
- **予防**: Notion登録時に「本レポートはGoogle広告のみ」と明記。将来Yahoo対応が必要ならスコープ別途検討

### R4. Ads Script silent skip

- **リスク**: コード編集直後の初回スケジュールが silent skip する既知不具合
- **予防**: 設置直後は必ず「頻度変更→戻す→手動実行」で承認確認
- **参考**: `reference_ads_script_post_edit_pitfall.md`

---

## メンテナ

- **主担当**: 中井明香里（nakai.akari@sintech-inc.com）
- **展開元**: SHERPA案件（2026-07〜運用中）
