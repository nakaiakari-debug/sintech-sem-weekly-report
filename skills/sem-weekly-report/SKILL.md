---
name: sem-weekly-report
description: SINTECH SEM週次レポート（検索クエリ+広告アセット）を Google Sheet から生成し、Notionに完成版として登録するスキル。案件別 config を読み込んで動作する。
---

# SEM週次レポート（検索クエリ・広告アセット）

Google広告運用案件の週次データを、Google Sheet「デイリーレポート」から読み込み、SINTECH様式のExcelレポート2本を生成し、Notionに完成版として登録する。**RemoteTrigger自動化のバックアップ・リカバリ用にローカル手動実行も可能**。

## 前提
- 対象案件のconfig（`config/clients/<client_code>.yml`）が埋まっている
- 対象案件のAds Scriptがデイリーレポート Sheet に書き込み済み（`検索クエリ_raw` / `広告アセット_raw`）
- ローカルに `openpyxl` インストール済み（`python3 -m pip install openpyxl`）
- Notion / Google Drive / Slack MCPが接続済み

## 起動条件
ユーザーが以下のいずれかを伝えたとき:
- 「{{CLIENT_NAME}}週次レポート作って」
- 「{{CLIENT_NAME}}週次リカバリして」
- `/sem-weekly-report client=<client_code> [--week-start YYYY-MM-DD --week-end YYYY-MM-DD]`

## ユーザーから確認する情報
プロンプトに記載がなければ AskUserQuestion で確認:
- **対象案件（client_code）**: `config/clients/` 配下のyml名（例: `sherpa`）
- **対象週の基準日**（デフォルト: 今日）→ 基準日を含む週（**月曜〜日曜**）で自動算出
- **生成対象**（検索クエリ / 広告アセット / 両方）→ デフォルト両方
- **Notion登録の要否**（デフォルト: 登録あり）

## 実行手順

### Step 0: config読込 & 対象期間の確定
`config/clients/<client_code>.yml` を読み込み、以下を変数として保持:
- `SHEET_ID`, `SEARCH_QUERY_TAB`, `AD_ASSET_TAB`
- `NOTION_PARENT_ID`, `MTG_NOTES_PARENT_PAGE_ID`
- `SLACK_CHANNEL_ID`, `SLACK_THREAD_TS`
- `DRIVE_SEARCH_QUERY_FOLDER_ID`, `DRIVE_AD_ASSET_FOLDER_ID`
- `OUTPUT_LOCAL_DIR`

基準日から**月曜〜日曜**の週を算出。前週比用に**前週の同曜日範囲**も併せて算出。

### Step 1: Google Sheetからデータ取得
`mcp__claude_ai_Google_Drive__download_file_content(fileId=SHEET_ID, exportMimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")` で xlsx として取得。

⚠️ **`read_file_content` は使わない**（数MB超Sheetの silent truncation対策）。

数MB超xlsxはレスポンスがcontext制限を超え自動的にファイル保存される場合がある。保存パスを起点にする。

### Step 2: タブ抽出（openpyxl）
python3で `SEARCH_QUERY_TAB` / `AD_ASSET_TAB` の2タブをCSV化。

```python
import openpyxl, csv
wb = openpyxl.load_workbook(sheet_xlsx_path, data_only=True, read_only=True)
for tab, out in [(SEARCH_QUERY_TAB, "search.csv"), (AD_ASSET_TAB, "asset.csv")]:
    ws = wb[tab]
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        for row in ws.iter_rows(values_only=True):
            norm = [c.strftime("%Y-%m-%d") if hasattr(c, "strftime") else ("" if c is None else str(c)) for c in row]
            w.writerow(norm)
```

タブ名不一致時は停止して報告。

### Step 3: Excel生成
`skills/sem-weekly-report/scripts/build_search_query_report.py` と `build_creative_asset_report.py` を実行。

```bash
python3 scripts/build_search_query_report.py \
  --input /tmp/<client_code>/search.csv \
  --week-start $WEEK_START --week-end $WEEK_END \
  --prev-start $PREV_START --prev-end $PREV_END \
  --output <OUTPUT_LOCAL_DIR>/検索クエリ/<CLIENT_NAME>_検索クエリ_<WEEK_TAG>.xlsx

python3 scripts/build_creative_asset_report.py \
  --input /tmp/<client_code>/asset.csv \
  --week-start $WEEK_START --week-end $WEEK_END \
  --output <OUTPUT_LOCAL_DIR>/広告アセット/<CLIENT_NAME>_広告アセット_<WEEK_TAG>.xlsx
```

### Step 4: 議事録参照（考察の起点）
`MTG_NOTES_PARENT_PAGE_ID` が設定されていれば、Notion MCPでその配下から直近1ヶ月のMTG議事録を検索。主要論点3つを抽出（決定事項/懸念/次回宿題）。

**この論点との紐付けが所感の必須要素**。単なる数値解釈で終わらせない。参照した議事録タイトル・日付を最終アウトプット末尾に明示。

議事録が無い場合は「該当議事録なし」と明記して数値ベース所感で進める（ユーザーへの一言申告付き）。

### Step 5: レビュー（必須ゲート）
config の `review_gates` に従い順次実行:

1. **critical-thinker**: 数値の論理飛躍・前提の妥当性・所感と推奨アクションの整合性チェック
2. **customer-advocate**: 広告アセット部分の当週傾向がターゲットに刺さるか、上から目線/不安煽り/誇大表現がないか
3. （`legal_compliance: true` の案件のみ）**legal-compliance-checker**: NG表現・業法・景表法チェック

指摘があれば所感/推奨を修正してからStep 6へ。

### Step 6: Notion登録
`notion-output-pro` に委譲。`NOTION_PARENT_ID` 配下に**週次子ページを2本**作成:
- タイトル: `【<CLIENT_NAME>週次】検索クエリ｜YYYY/MM/DD-MM/DD`
- タイトル: `【<CLIENT_NAME>週次】広告アセット｜YYYY/MM/DD-MM/DD`

レイアウト詳細は `notion-templates/search_query_layout.md` / `notion-templates/creative_asset_layout.md` を参照。DB形式・1列レイアウト。**両ページ末尾に参照議事録リンクを明示**。

### Step 7: Google Driveアップロード（任意）
config の `drive.*_folder_id` が設定されていれば、Google Drive MCP `create_file` でアップロード。
アップ後、viewUrl を Notionページのブックマークとして追加。

**⚠️ Drive MCP は base64 パラメータ経由のためファイルサイズ限界あり**。数百KBを超える場合は `rclone` などのCLIツール（設定済み前提）に切り替え。

### Step 8: Slack通知（任意）
config の `slack.channel_id` / `thread_ts` が設定されていれば、Slack MCP `slack_send_message` でスレッド返信投稿:

- CV獲得TOP10（前週比併記）
- COST発生CV0ワースト10（前週比併記）
- 所感1-2行（Step 4の議事録論点と紐付け）

markdownテーブル形式。断定表現禁止。

## Excelレポート仕様

### 検索クエリExcel（7シート）
| # | シート名 | 内容 |
|---|---|---|
| 1 | サマリ | 週次KPI（IMP/CT/CTR/CPC/COST/CV/CVR/CPA）＋ 前週比、AG別小計 |
| 2 | CV獲得TOP20 | 検索語句別 CV降順TOP20 |
| 3 | 費用発生CV0ワースト20 | CV=0 かつ COST発生 の検索語句 COST降順TOP20 |
| 4 | マッチタイプ別 | EXACT/PHRASE/BROADなど別集計 |
| 5 | 広告グループ別 | AG別 集計 |
| 6 | 前週比較 | 検索語句レベルで前週と比較 |
| 7 | raw | 期間フィルタ後の生データ |

### 広告アセットExcel（5シート）
| # | シート名 | 内容 |
|---|---|---|
| 1 | サマリ | performance_label別分布、field_type別（HEADLINE/DESCRIPTION）集計 |
| 2 | HEADLINE_パフォーマンス別 | HEADLINE を BEST/GOOD/LEARNING/NOT_APPLICABLE 別に一覧 |
| 3 | DESCRIPTION_パフォーマンス別 | DESCRIPTION を上記同様一覧 |
| 4 | 広告グループ別 | AG別集計 |
| 5 | raw | 期間フィルタ後の生データ |

### SINTECH様式適用ルール
- Row1: タイトル
- Row2: 期間文字列
- Row3: ヘッダー
- Row4以降: A-J列は`=IFERROR()`式でL列以降を参照。L-P列にraw値保持
- 通貨: 円（cost_microsは÷1,000,000で円換算してからraw列へ）

## トラブルシュート
- **Ads Script書き込み欠損**: `docs/OPERATIONS.md` の該当セクション参照
- **Google Sheet読込サイズオーバー**: 自動的にファイル退避される。パス経由でpythonがパース
- **タブ名不一致**: config の `search_query_tab` / `ad_asset_tab` と実際のSheetタブ名を照合
- **`広告アセット_raw` に日付列がない**: スナップショット扱い（前週比セクションは「N/A」と明記）
- **Notion MCPが削除機能なし**: 旧ページを消したい場合はタイトルに `[旧・要削除]` プレフィックスを付けて代替（ユーザー手動削除）

## 実装ファイル
- `skills/sem-weekly-report/scripts/build_search_query_report.py`
- `skills/sem-weekly-report/scripts/build_creative_asset_report.py`
- `notion-templates/search_query_layout.md`
- `notion-templates/creative_asset_layout.md`
- `docs/OPERATIONS.md`（既知のトラブルシュート集）
