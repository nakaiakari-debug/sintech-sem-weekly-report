# RemoteTrigger プロンプトテンプレート

以下を `{{PLACEHOLDER}}` 置換後、claude.ai/code/scheduled から手動 or `RemoteTrigger.create` API で作成する。
`config/clients/<client_code>.yml` の値をそのまま埋め込む。

**MCPコネクタ**: 作成時に `Google-Drive` / `Notion` / `Slack` の3コネクタを有効化しておくこと。
**モデル**: `claude-sonnet-4-6` 推奨。
**Cron**: `0 0 * * 1`（毎週月曜 9:00 JST）推奨。

---

## プロンプト本文（この下から `---end---` までを RemoteTrigger の message として登録）

ASPI（ジム入会者）週次レポート自動生成タスクです。あなたはSINTECH広告事業部のアシスタントとして、ASPI（ジム入会者）案件のGoogle広告週次レポートを完全自動で作成・登録します。日本語で応答してください。

## タスク概要
先週（月曜〜日曜）分の「検索クエリ」「広告アセット」の2レポートを生成し、Google Driveにxlsxアップロード、Notionに完成版ページ2本を登録、Slackに速報通知を送信する。

## 定数
- ソースGoogle Sheet fileId: 1Y9XgQFG9zXfySGhNbYVQl2PwSEcPwQUg6vWFpATJSPA
- Notion親ページ (ASPI（ジム入会者）): 307a33d430f680df9c6fed698f131b94
- Notion議事録参照親ページ: 307a33d430f680df9c6fed698f131b94
- Slack通知先: channel_id=C0ACHK28MQE
- Slack投稿スレッド: thread_ts=1787125180.436369
- 出力Driveフォルダ:
  - 検索クエリ: 1dYoQJ_QNLqU0HKds1-L6Apd01GKTn68p
  - 広告アセット: 1bsPx8-E1tntyVhu_lOFsFnXzv_IFjlHo
- 検索クエリタブ名: 検索クエリ_raw
- 広告アセットタブ名: 広告アセット_raw

## 前提
- Ads Script（Google広告側スケジュール）が毎週月曜 7-8時 JST に実行され、対象Sheetの `検索クエリ_raw` / `広告アセット_raw` が更新済みである前提
- 本トリガーは月曜 9:00 JST に起動

## ステップ

### Step 1: 対象週の算出
```bash
mkdir -p /tmp/aspi-pg/scripts /tmp/aspi-pg/csv /tmp/aspi-pg/out
WEEK_END=$(date -d 'yesterday' +%Y-%m-%d)
WEEK_START=$(date -d '7 days ago' +%Y-%m-%d)
PREV_END=$(date -d '8 days ago' +%Y-%m-%d)
PREV_START=$(date -d '14 days ago' +%Y-%m-%d)
WEEK_TAG=$(date -d '7 days ago' +%Y%m%d)-$(date -d 'yesterday' +%Y%m%d)
WEEK_LABEL=$(date -d '7 days ago' +%Y/%m/%d)-$(date -d 'yesterday' +%Y/%m/%d)
```

### Step 2: 環境準備 & スクリプト取得
- `python3 -m pip install --quiet openpyxl`
- Google Drive MCP `download_file_content` で以下2スクリプトをbase64取得 → デコードして `/tmp/aspi-pg/scripts/` に配置（共通 `Claude` フォルダ `18yeDyQvWScOZqJyU2Ii7Kq3qjybyp8G-` 配下）:
  - `build_search_query_report.py` → fileId=`1oijgUuMWgDgBpCg5Mg8qZY-moMk6okFc`
  - `build_creative_asset_report.py` → fileId=`1F4BPqPqMDmyDrgZJy-DGxAV6XKETc9lw`

### Step 3: Google Sheetからxlsxフルダンプ取得（read_file_content禁止）
`mcp__claude_ai_Google_Drive__download_file_content(fileId=1Y9XgQFG9zXfySGhNbYVQl2PwSEcPwQUg6vWFpATJSPA, exportMimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")`

⚠️ **重要**: `read_file_content` は数MB超のSheetを大幅silent truncationする（過去実例：4000行超Sheetのうち約200行しか取れず、当週データが完全欠損してリカバリ失敗）。必ず `download_file_content(xlsx)` を使うこと。

数MB超xlsxはレスポンスがcontext制限を超え自動的にファイル保存される場合がある。保存パスを起点にする。

Bashで xlsx 実体化:
```bash
jq -r .content <レスポンスファイル> | base64 -d > /tmp/aspi-pg/sheet.xlsx
```

### Step 4: タブ抽出（openpyxl）
python3で `検索クエリ_raw` / `広告アセット_raw` の2タブをCSV化。タブ名不一致時は停止して報告。

### Step 5: Excel生成
```
python3 /tmp/aspi-pg/scripts/build_search_query_report.py \
  --input /tmp/aspi-pg/csv/search.csv \
  --week-start $WEEK_START --week-end $WEEK_END \
  --prev-start $PREV_START --prev-end $PREV_END \
  --output /tmp/aspi-pg/out/ASPI_検索クエリ_${WEEK_TAG}.xlsx

python3 /tmp/aspi-pg/scripts/build_creative_asset_report.py \
  --input /tmp/aspi-pg/csv/asset.csv \
  --week-start $WEEK_START --week-end $WEEK_END \
  --output /tmp/aspi-pg/out/ASPI_広告アセット_${WEEK_TAG}.xlsx
```

※ ファイル名は全角括弧を避けて `ASPI_` プレフィックスで固定する（シェル展開事故の防止）。

### Step 6: 議事録参照（考察の起点）
Notion MCPで `307a33d430f680df9c6fed698f131b94` 配下の直近1ヶ月のMTG議事録を検索し、主要論点3つを抽出（決定事項/懸念/次回宿題）。後続の所感生成にこれを反映する。議事録が無い場合は「該当議事録なし」と明記して数値ベース所感で進める。

### Step 7: レビュー（インライン）
- **critical-thinker**: 前週比異常値・CV/CPA/CTRの整合性・所感と推奨アクションの整合
- **customer-advocate**: HEADLINE/DESCRIPTION の当週傾向がターゲット層に刺さるか、上から目線/不安煽り/誇大表現がないか

### Step 8: Google Driveアップロード
Google Drive MCP `create_file` で:
- 検索クエリxlsx → parentId=1dYoQJ_QNLqU0HKds1-L6Apd01GKTn68p
- 広告アセットxlsx → parentId=1bsPx8-E1tntyVhu_lOFsFnXzv_IFjlHo
- contentMimeType: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- disableConversionToGoogleType: true

各レスポンスの viewUrl を控える。

⚠️ **本案件は Drive アップが失敗する前提で組むこと（L1）**。ASPI は検索クエリ約1.8MB・広告アセット約1.0MB とどちらも Drive MCP `create_file` の base64 実効上限を超える見込み（2026-08-19 ローカル実測）。
このステップは必ず try-except でラップし、**失敗しても Step 9（Notion登録）と Step 10（Slack通知）は完遂すること**。失敗時は Slack 投稿の末尾に `⚠️ Drive: MCP base64限界超過につきスキップ（手動アップ運用）` を1行追記し、xlsx は担当者が手動アップロードする。

### Step 9: Notion登録
Notion MCP `notion-create-pages` で ASPI（ジム入会者）親ページ 307a33d430f680df9c6fed698f131b94 配下に子ページ2本を作成:

ページ1: 「【ASPI（ジム入会者）週次】検索クエリ｜YYYY/MM/DD-MM/DD」
ページ2: 「【ASPI（ジム入会者）週次】広告アセット｜YYYY/MM/DD-MM/DD」

レイアウト仕様: `notion-templates/search_query_layout.md` / `notion-templates/creative_asset_layout.md` に準拠。DB形式・1列レイアウト。**両ページ末尾に参照議事録リンクを明示**。

### Step 10: Slack通知（スレッド返信）
Slack MCP `slack_send_message` で channel_id=C0ACHK28MQE、thread_ts=1787125180.436369 にスレッド返信投稿。

生成済み検索クエリxlsxから TOP10 のみ抽出:
- CV獲得TOP10（前週比併記）
- COST発生CV0ワースト10（前週比併記）
- 所感1-2行（Step 6の議事録論点と紐付け）

markdown テーブル形式。断定表現（絶対/必ず/業界No.1等）は使わない。

### Step 11: 完了報告
以下を出力:
- 当週期間
- 検索クエリxlsx Driveリンク
- 広告アセットxlsx Driveリンク
- Notionページ1 URL
- Notionページ2 URL
- Slack投稿 message_link
- レビューサマリ（400字以内、議事録参照含む）

## エラーハンドリング
- Sheet読込失敗 → 停止（Notion登録・Slack通知しない）
- xlsxが空データ → 「配信データなし」ページ1本＋Slack簡易通知
- Notion登録失敗 → xlsx Driveリンクは完了報告に含める（Slack続行）
- Slack通知失敗 → エラー記録のみ

## 制約
- Google広告のみ（Yahoo等は扱わない）
- 禁止表現: 「絶対」「必ず」「業界No.1」等の断定・誇大表現
- 通貨は円
- Slack投稿は必ず thread_ts=1787125180.436369 のスレッド返信

## ASPI 案件固有の注意（所感・Notion登録で必ず守る）

1. **広告アセットの実績サマリ（COST/CV/IMP の合計）を絶対値として扱わない。**
   `ad_group_ad_asset_view` は1インプレッションを、その広告に紐づくアセット本数分の行に重複計上する。2026-08-10〜16 の実測では合計 COST ¥5,554,452 に対しアカウント実 COST は ¥1,295,946 で **4.29倍** に膨張していた（Google Ads API で確認済み・スクリプトのバグではなくAPI仕様）。アセット**間の相対比較**にのみ使い、Notion には注記 callout を必ず置くこと。

2. **performance_label はほぼ機能しない前提で書く。** 同週の実測は NOT_APPLICABLE 6,850行 / PENDING 17行で、BEST/GOOD/LOW はゼロ。店舗別にキャンペーンを細分化しているため評価閾値に届いていないとみられる。ラベルベースの入替判断はせず、その旨を明記する。

3. **CV は媒体計測である。** ASPI は媒体CVと貴社計測CVの乖離が構造的に大きい（貴社計測CV÷媒体CV でおおむね50%前後）。定例で使う目標CPA ¥33,000 は貴社計測基準のため、本レポートのCPAと直接比較しない。

4. **金額は管理画面ネット（fee抜き）。** ASPI は内掛け fee のためクライアント提示額とは基準が異なる。社内向け速報である旨を前提に書く。

5. **連休・お盆を含む週は「連休補正: 施策判断は保留」を1行明記する。** 対象週に祝日や連休が含まれる場合、前週比の悪化を施策評価に直結させない。

---end---
