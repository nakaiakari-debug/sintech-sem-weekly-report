# RemoteTrigger プロンプト（スタジオアリス版・確定）

- 案件: スタジオアリス
- Cron: `0 0 * * 1`（毎週月曜 9:00 JST）
- Model: `claude-sonnet-4-6`
- MCP: Google-Drive / Notion / Slack

---

## プロンプト本文（この下から `---end---` までを RemoteTrigger の message として登録）

スタジオアリス週次レポート自動生成タスクです。あなたはSINTECH広告事業部のアシスタントとして、スタジオアリス案件のGoogle広告週次レポートを完全自動で作成・登録します。日本語で応答してください。

## タスク概要
先週（月曜〜日曜）分の「検索クエリ」「広告アセット」の2レポートを生成し、Google Driveにxlsxアップロード、Notionに完成版ページ2本を登録、Slackに速報通知を送信する。

## 定数
- ソースGoogle Sheet fileId: 1dM3Hj63nJV5Ssqnalh1SDAic7gXeyXvt29Ilhp4e_bI
- Notion親ページ (スタジオアリス): 30ca33d430f6801cb3cfda83a7e4b794
- Notion議事録参照親ページ: 30ca33d430f6801cb3cfda83a7e4b794
- Slack通知先: channel_id=C0ACKMP7EAW
- Slack投稿スレッド: thread_ts=1787040238.624799
- 出力Driveフォルダ:
  - 検索クエリ: 10XhBSSO66SqHH7nydyFuloWRH7_CKejB
  - 広告アセット: 1GYIm7aVGIreRtc3dHMzZ0emhJ8Hijfdg
- 検索クエリタブ名: 検索クエリ_raw
- 広告アセットタブ名: 広告アセット_raw

## 前提
- Ads Script（Google広告側スケジュール）が毎週月曜 7-8時 JST に実行され、対象Sheetの `検索クエリ_raw` / `広告アセット_raw` が更新済みである前提
- 本トリガーは月曜 9:00 JST に起動

## ステップ

### Step 1: 対象週の算出
```bash
mkdir -p /tmp/studioalice/scripts /tmp/studioalice/csv /tmp/studioalice/out
WEEK_END=$(date -d 'yesterday' +%Y-%m-%d)
WEEK_START=$(date -d '7 days ago' +%Y-%m-%d)
PREV_END=$(date -d '8 days ago' +%Y-%m-%d)
PREV_START=$(date -d '14 days ago' +%Y-%m-%d)
WEEK_TAG=$(date -d '7 days ago' +%Y%m%d)-$(date -d 'yesterday' +%Y%m%d)
WEEK_LABEL=$(date -d '7 days ago' +%Y/%m/%d)-$(date -d 'yesterday' +%Y/%m/%d)
```

### Step 2: 環境準備 & スクリプト取得
- `python3 -m pip install --quiet openpyxl`
- Google Drive MCP `download_file_content` で以下2スクリプトをbase64取得 → デコードして `/tmp/studioalice/scripts/` に配置:
  - `build_search_query_report.py`: fileId `1oijgUuMWgDgBpCg5Mg8qZY-moMk6okFc`（SHERPA案件アップロード分を流用、共有ドライブ `14ziu2E5qruOs6hFcdka4iaaDKLcEdLMj` 配下）
  - `build_creative_asset_report.py`: fileId `1F4BPqPqMDmyDrgZJy-DGxAV6XKETc9lw`（同上）

取得例:
```bash
# scripts_dir に配置
python3 -c "import base64,sys; open('/tmp/studioalice/scripts/build_search_query_report.py','wb').write(base64.b64decode(sys.stdin.read()))" < <(jq -r .content <レスポンスファイル>)
```

### Step 3: Google Sheetからxlsxフルダンプ取得（read_file_content禁止）
`mcp__claude_ai_Google_Drive__download_file_content(fileId=1dM3Hj63nJV5Ssqnalh1SDAic7gXeyXvt29Ilhp4e_bI, exportMimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")`

⚠️ **重要**: `read_file_content` は数MB超のSheetを大幅silent truncationする（過去実例：4000行超Sheetのうち約200行しか取れず、当週データが完全欠損してリカバリ失敗）。必ず `download_file_content(xlsx)` を使うこと。

数MB超xlsxはレスポンスがcontext制限を超え自動的にファイル保存される場合がある。保存パスを起点にする。

Bashで xlsx 実体化:
```bash
jq -r .content <レスポンスファイル> | base64 -d > /tmp/studioalice/sheet.xlsx
```

### Step 4: タブ抽出（openpyxl）
python3で `検索クエリ_raw` / `広告アセット_raw` の2タブをCSV化。タブ名不一致時は停止して報告。

### Step 5: Excel生成
```
python3 /tmp/studioalice/scripts/build_search_query_report.py \
  --input /tmp/studioalice/csv/search.csv \
  --week-start $WEEK_START --week-end $WEEK_END \
  --prev-start $PREV_START --prev-end $PREV_END \
  --output /tmp/studioalice/out/スタジオアリス_検索クエリ_${WEEK_TAG}.xlsx

python3 /tmp/studioalice/scripts/build_creative_asset_report.py \
  --input /tmp/studioalice/csv/asset.csv \
  --week-start $WEEK_START --week-end $WEEK_END \
  --output /tmp/studioalice/out/スタジオアリス_広告アセット_${WEEK_TAG}.xlsx
```

### Step 6: 議事録参照（考察の起点）
Notion MCPで `30ca33d430f6801cb3cfda83a7e4b794` 配下の直近1ヶ月のMTG議事録を検索し、主要論点3つを抽出（決定事項/懸念/次回宿題）。後続の所感生成にこれを反映する。議事録が無い場合は「該当議事録なし」と明記して数値ベース所感で進める。

### Step 7: レビュー（インライン）
- **critical-thinker**: 前週比異常値・CV/CPA/CTRの整合性・所感と推奨アクションの整合
- **customer-advocate**: HEADLINE/DESCRIPTION の当週傾向がターゲット層に刺さるか、上から目線/不安煽り/誇大表現がないか

### Step 8: Google Driveアップロード（try-except でラップ・失敗時はskip）

Google Drive MCP `create_file` で以下2本をアップロードする。**MCP base64サイズ上限や一時的なエラーで失敗した場合は、ログのみ残して次のStepに進む**（Notion登録・Slack通知は必ず完遂させる）。

```
try:
    resp_search = create_file(
        parentId="10XhBSSO66SqHH7nydyFuloWRH7_CKejB",
        contentMimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disableConversionToGoogleType=True,
        content=<検索クエリxlsxのbase64>,
        name="スタジオアリス_検索クエリ_${WEEK_TAG}.xlsx"
    )
    drive_search_url = resp_search.viewUrl
    drive_ok_search = True
except Exception as e:
    drive_search_url = None
    drive_ok_search = False
    drive_err_search = str(e)  # ログ保持のみ、続行

try:
    resp_asset = create_file(
        parentId="1GYIm7aVGIreRtc3dHMzZ0emhJ8Hijfdg",
        contentMimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        disableConversionToGoogleType=True,
        content=<広告アセットxlsxのbase64>,
        name="スタジオアリス_広告アセット_${WEEK_TAG}.xlsx"
    )
    drive_asset_url = resp_asset.viewUrl
    drive_ok_asset = True
except Exception as e:
    drive_asset_url = None
    drive_ok_asset = False
    drive_err_asset = str(e)

drive_all_ok = drive_ok_search and drive_ok_asset
```

- 両方成功: 後続で使う `drive_note = "📁 Drive: xlsx 2本アップ済（<viewUrl1> / <viewUrl2>）"`
- 片方または両方失敗: `drive_note = "⚠️ Drive: MCP base64限界超過につきスキップ。ローカルxlsxは中井さんが手動アップお願いします"`
  - この場合、ローカルの `/tmp/studioalice/out/*.xlsx` パスも完了報告に含める

### Step 9: Notion登録
Notion MCP `notion-create-pages` でスタジオアリス親ページ 30ca33d430f6801cb3cfda83a7e4b794 配下に子ページ2本を作成:

ページ1: 「【スタジオアリス週次】検索クエリ｜YYYY/MM/DD-MM/DD」
ページ2: 「【スタジオアリス週次】広告アセット｜YYYY/MM/DD-MM/DD」

レイアウト仕様: `notion-templates/search_query_layout.md` / `notion-templates/creative_asset_layout.md` に準拠。DB形式・1列レイアウト。**両ページ末尾に参照議事録リンクを明示**。

**Drive失敗時のみ**: 各Notionページの冒頭に callout ブロックを差し込む。
```
⚠️ Drive: MCP base64限界超過につきスキップ。ローカルxlsxは中井さんが手動アップお願いします
  ローカルパス:
  - /tmp/studioalice/out/スタジオアリス_検索クエリ_${WEEK_TAG}.xlsx
  - /tmp/studioalice/out/スタジオアリス_広告アセット_${WEEK_TAG}.xlsx
```

### Step 10: Slack通知（スレッド返信）
Slack MCP `slack_send_message` で channel_id=C0ACKMP7EAW、thread_ts=1787040238.624799 にスレッド返信投稿。

生成済み検索クエリxlsxから TOP10 のみ抽出:
- CV獲得TOP10（前週比併記）
- COST発生CV0ワースト10（前週比併記）
- 所感1-2行（Step 6の議事録論点と紐付け）

markdown テーブル形式。断定表現（絶対/必ず/業界No.1等）は使わない。

**通知本文の末尾に必ず `drive_note` を1行追記する**:
- 成功時: `📁 Drive: xlsx 2本アップ済（<viewUrl1> / <viewUrl2>）`
- 失敗時: `⚠️ Drive: MCP base64限界超過につきスキップ。ローカルxlsxは中井さんが手動アップお願いします`

### Step 11: 完了報告
以下を出力:
- 当週期間
- 検索クエリxlsx Driveリンク（失敗時は「skip」＋ローカルパス）
- 広告アセットxlsx Driveリンク（失敗時は「skip」＋ローカルパス）
- Notionページ1 URL
- Notionページ2 URL
- Slack投稿 message_link
- レビューサマリ（400字以内、議事録参照含む）
- `drive_note`（成否ステータス1行）

## エラーハンドリング
- Sheet読込失敗 → 停止（Notion登録・Slack通知しない）
- xlsxが空データ → 「配信データなし」ページ1本＋Slack簡易通知
- **Driveアップ失敗 → skip して Notion登録・Slack通知は続行**（本仕様で明示済み）
- Notion登録失敗 → xlsx Driveリンクは完了報告に含める（Slack続行）
- Slack通知失敗 → エラー記録のみ

## 制約
- Google広告のみ（Yahoo等は扱わない）
- 禁止表現: 「絶対」「必ず」「業界No.1」等の断定・誇大表現
- 通貨は円
- Slack投稿は必ず thread_ts=1787040238.624799 のスレッド返信

---end---
