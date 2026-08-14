# sintech-sem-weekly-report

**SINTECH SEM週次レポート自動化プラグイン**（社内限定）

Google広告運用案件の週次データを、`Ads Script → Google Sheet → Python でxlsx生成 → Notion登録 → Slack速報` のパイプラインで完全自動化。案件別 `config/clients/<client_code>.yml` を用意するだけで新規案件展開可能。

- **配布形式**: Claude Code プラグイン
- **配布範囲**: SINTECH社内のみ（private）
- **参考実装**: SHERPA案件（`config/clients/sherpa.yml`）

---

## 目次
- [ディレクトリ構成](#ディレクトリ構成)
- [パイプライン全体像](#パイプライン全体像)
- [新規案件の展開手順](#新規案件の展開手順)
- [ローカル手動実行（リカバリ用）](#ローカル手動実行リカバリ用)
- [トラブル発生時](#トラブル発生時)
- [運用ルール](#運用ルール)

---

## ディレクトリ構成

```
sintech-sem-weekly-report/
├── .claude-plugin/plugin.json         # Claude Code プラグインマニフェスト
├── skills/sem-weekly-report/
│   ├── SKILL.md                       # スキル本体（ローカル実行用）
│   └── scripts/
│       ├── build_search_query_report.py
│       └── build_creative_asset_report.py
├── ads-script/
│   ├── daily_export.js.template       # Google Ads Script（TZ修正済み）
│   └── SETUP.md                       # Ads Script設置手順
├── remote-trigger/
│   ├── trigger_prompt.md.template     # RemoteTriggerプロンプト
│   └── SETUP.md                       # RemoteTrigger作成手順
├── notion-templates/
│   ├── search_query_layout.md         # Notion登録レイアウト仕様
│   └── creative_asset_layout.md
├── config/
│   ├── config.example.yml             # 案件別設定テンプレ
│   └── clients/
│       └── sherpa.yml                 # SHERPA参考設定
├── docs/OPERATIONS.md                 # 既知のトラブル集
├── README.md
└── LICENSE
```

---

## パイプライン全体像

```
[毎週月曜]
  07:00-07:30 JST  Google広告 Ads Script
                    ↓ GAQL クエリ実行
                    ↓ 14日分（先々週月〜先週日）を書き出し
  ─────────────  Google Sheet (デイリーレポート)
                    ↓ 「検索クエリ_raw」「広告アセット_raw」タブ更新
  09:00 JST        RemoteTrigger（claude.ai/code/scheduled）
                    ↓ download_file_content(xlsx) でSheet取得
                    ↓ Python2本でxlsx生成（SINTECH様式）
                    ↓ critical-thinker + customer-advocate レビュー
                    ↓ Notion MCP で完成版ページ2本作成
                    ↓ Google Drive にxlsxアップ
                    ↓ Slack MCP でスレッド返信通知
  09:05-09:15 JST  Slack速報が届く（始業前に完了）
```

---

## 新規案件の展開手順

### 前提
- 対象クライアント用のGoogle広告アカウント（管理者権限）
- 対象クライアント用のGoogle Sheet（デイリーレポート、Ads Scriptからの書き込み権限あり）
- Notion に案件親ページ（子ページ作成権限あり）
- Slack に通知用チャンネル
- Google Drive にxlsxアップロード先のフォルダ2つ
- 運用担当者の claude.ai アカウントに Google-Drive / Notion / Slack MCPコネクタが接続済み

### Step 1: 案件configファイル作成
```bash
cp config/config.example.yml config/clients/<client_code>.yml
```

`<client_code>` は英小文字・ハイフンの案件slug（例: `sherpa`, `abc-corp`）。

以下の値を埋める（`REPLACE_WITH_` を差し替え）:

| Key | 取得元 |
|---|---|
| `client.name` | 案件表示名 |
| `client.code` | slug |
| `data_source.sheet_id` | デイリーレポートSheetのURL末尾ID |
| `notion.parent_page_id` | Notion案件親ページID（URL末尾） |
| `notion.mtg_notes_parent_page_id` | 議事録DBの親ページID（考察参照用、オプション） |
| `slack.channel_id` | Slackチャネル "詳細を表示" → チャネルID（`C0XXXX`） |
| `slack.thread_ts` | Slack親メッセージのタイムスタンプ（後述） |
| `slack.connector_uuid` | 該当運用者アカウントに紐づくSlack MCP コネクタUUID |
| `drive.search_query_folder_id` | 検索クエリxlsxアップ先フォルダ |
| `drive.ad_asset_folder_id` | 広告アセットxlsxアップ先フォルダ |
| `output.local_dir` | ローカル出力ディレクトリ |

### Step 2: Ads Script 設置
`ads-script/SETUP.md` の手順に従い、`daily_export.js.template` を対象案件のGoogle広告アカウントに設置。
初回実行で承認 + シートに14日分書き込みが入ることを確認。

### Step 3: Slack親メッセージ作成
Slackチャネルに以下を1回だけ手動投稿:
```
【検索クエリ】週次速報通知
（週次で下記にスレッド返信されます）
```

投稿後、そのメッセージの ts（例: `1785484403.404289`）を控えて `config/clients/<client_code>.yml` の `slack.thread_ts` に記入。

### Step 4: RemoteTrigger 作成
`remote-trigger/SETUP.md` の手順に従い、`trigger_prompt.md.template` を case固有値で置換して、claude.ai/code/scheduled で新規トリガーを作成。

作成後、`config/clients/<client_code>.yml` の `remote_trigger.trigger_id` にIDを記入（例: `trig_01RcYezhUP5JD8CRtx4WCYt5`）。

### Step 5: 初回動作確認
翌週月曜9:00 JST 以降にチェック:
- [ ] Sheet に14日分のデータあり（Ads Script発火成功）
- [ ] Notion に週次子ページ2本作成
- [ ] Google Drive にxlsx 2本アップロード
- [ ] Slack に速報がスレッド返信投稿
- [ ] 議事録参照が所感に反映されている

失敗時は `docs/OPERATIONS.md` のリカバリ手順を参照。

---

## ローカル手動実行（リカバリ用）

RemoteTriggerが失敗した週の再生成や、任意期間の再生成に使う。

### 前提
- ローカルPythonに `openpyxl` インストール済み
- Google-Drive / Notion / Slack MCP がローカル Claude Code から利用可能

### 実行
Claude Code CLI で:
```
/sem-weekly-report client=<client_code>
```
または
```
「<CLIENT_NAME>週次レポート作って」
```

対話的に対象週を確認され、Step 1〜8を完走してNotion登録・Slack通知まで完了する。

明示的な期間指定も可:
```
/sem-weekly-report client=sherpa --week-start 2026-08-03 --week-end 2026-08-09
```

---

## トラブル発生時

`docs/OPERATIONS.md` に **8つの既知トラブル** と復旧手順をまとめている。特に頻出:

1. **Ads Scriptのタイムゾーンバグ** → このリポジトリのテンプレは修正済み。旧版から移行時は必ず差し替え
2. **Ads Scriptコード編集後の silent skip** → 頻度変更→戻す→手動実行で承認再取得
3. **Google Drive MCP の silent truncation** → `read_file_content` は使わない、必ず `download_file_content(xlsx)` + openpyxl
4. **Notion / Slack MCP に削除機能がない** → `[旧・要削除]` プレフィックス + 訂正投稿で対処

---

## 運用ルール

### 考察は必ず議事録参照から
週次レポートの所感・推奨アクションは、対応案件の直近1ヶ月のMTG議事録を先読みして、論点との紐付けで書く。数値解釈だけの一般論は禁止。詳細は `docs/OPERATIONS.md#7`。

### レビューゲート必須
- **critical-thinker**: 論理飛躍・数値整合性
- **customer-advocate**: ターゲット観点でのクリエイティブ評価
- （入稿変更を伴う推奨のみ）**legal-compliance-checker**: 業法・景表法

### 連休週の扱い
お盆・GW等を含む週は、前週比の悪化を「連休補正: 施策判断は保留」と明記。詳細は `docs/OPERATIONS.md#8`。

### Notion / Slack 訂正時
- Notion: 旧ページのタイトルに `[旧・要削除]` プレフィックス + 冒頭赤 callout
- Slack: 訂正投稿を同スレッドに追加、`⚠️ 前投稿は無視してください` から始める

---

## メンテナ

- **主担当**: 中井明香里（nakai.akari@sintech-inc.com）
- **参考実装**: SHERPA案件（2026-07〜運用開始）

## ライセンス
SINTECH社内限定利用。詳細は `LICENSE`。
