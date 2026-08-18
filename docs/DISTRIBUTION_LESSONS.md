# 配布リハーサル発見事項（スタジオアリス展開・2026-08-18）

SHERPA以外の案件展開で判明した技術制約・設計改善点・運用注意点をまとめる。他運用者展開前に読むこと。

**リハーサル対象**: スタジオアリス（こども写真館領域）
**リハーサル日**: 2026-08-18
**担当**: 中井明香里
**参考**: `config/clients/studioalice.yml` / `docs/setup_studioalice.md`

---

## L1. Drive MCP `create_file` base64 実効上限（最重要）

### 症状
`build_search_query_report.py` / `build_creative_asset_report.py` が生成する xlsx が1MB超だと、Drive MCP `create_file` の base64 パラメータで実効上限にヒットしてアップ失敗する。

### スタジオアリスでの実例
- 検索クエリxlsx: 3.2MB（base64 換算 4.3MB） → **失敗**
- 広告アセットxlsx: 0.75MB（base64 換算 1.0MB） → **失敗**

### 対策（採用済み）
**トリガープロンプトの Step 8 を try-except でラップ**。Drive失敗時は Notion + Slack だけ完遂する仕様に変更。Slack通知末尾に `⚠️ Drive: MCP base64限界超過につきスキップ` を追記、中井さんが手動アップする運用に切替。

### 根本対応（将来）
- (a) 案件のscripts保管 Drive に `rclone` / `gcloud storage` / gdrive CLI をトリガー環境に配置
- (b) `notion-templates/*_layout.md` を軽量化して xlsx 生成しない設計へ（例: 集計サマリだけ Notion に置く、raw xlsx はローカル保管）
- (c) MCP側の base64 上限緩和を Anthropic に要望

### 展開時のアクション
新規案件展開時、xlsx 生成規模が SHERPA と同等以下なら成功する可能性あり。**必ずローカル手動実行で xlsx サイズを確認**してから RemoteTrigger 化する。

---

## L2. 大規模 Sheet の MCP export 失敗 → 専用Sheet分離

### 症状
Ads Script が既存の大規模共有Sheet（例: `【New社内】スタジオアリス_こども写真館` 3.1MB / 多数タブ）に書き込む設定にすると、Google Drive MCP `download_file_content(xlsx)` が「File too large for export」でエラー。トリガーが Sheet 取得段階で即死する。

### 対策（採用済み）
**SEM週次専用の新規Sheetを作成**（`スタジオアリス_SEM週次_raw` `1dM3Hj63nJV5Ssqnalh1SDAic7gXeyXvt29Ilhp4e_bI`、720KB）。Ads Script の `SPREADSHEET_URL` を新Sheet に差し替え。既存 Sheet の他タブは影響なし。

### 展開時のアクション
**Phase 2-1（Sheet準備）で「既存Sheetにタブ追加」を選ぶ前に、既存Sheetのサイズを確認**。3MB超なら専用Sheet分離を推奨。`docs/setup_<client_code>.md` のSheet準備セクションに「既存 or 新規」の判定フローチャートを追記すべき。

### 副次発見
新規Sheet作成時、Ads Script側コード編集を伴う（`SPREADSHEET_URL` 差し替え）ため、**silent skip 対策手順（頻度変更→戻す→手動実行）を再度実施**する必要がある。README.md にも明記推奨。

---

## L3. 議事録参照は2段構えが必要

### 症状
Notion MCP `notion-query-meeting-notes`（title正確マッチ）だけだと、Circleback議事録のタイトル表記揺れや接頭辞（`★調整可能★` `【スタジオアリス】` 等）でヒット漏れが発生する。

### スタジオアリスでの実例
- 「スタジオアリス」で検索 → 該当議事録2本ヒット
- 「アリス」だけで検索 → `★調整可能★` プレフィックス付き議事録がヒットせず

### 対策
議事録参照ステップを **2段階** にする:
1. **1段目**: `notion-query-meeting-notes` で案件名完全一致
2. **2段目（フォールバック）**: `notion-search` の AI モードでフルテキスト検索し、直近1ヶ月の議事録を追加取得

### 展開時のアクション
- `SKILL.md` の Step 4 を2段構えに書き換え
- トリガープロンプトテンプレの Step 6 も同様に更新

---

## L4. 前週比較シートのソート順は保証されない

### 症状
`build_search_query_report.py` の「前週比較」シートは `cost + prev_cost` 降順でソートしているが、当週CV降順ソートも欲しい場面がある（Notion転記時など）。

### 対策（推奨）
`build_search_query_report.py` の `sheet_week_diff` 関数のソート順を「当週COST + 当週CV」の両ソート版を出せるように追加、あるいは Notion レポートのTOP10抽出時に読み込み側でソートし直す実装を Notion レイアウトテンプレに明記。

### 展開時のアクション
現状は Notion 集計側で当週CV降順ソートを毎回入れることで運用中。将来的にはスクリプト側で対応するのが根本策。

---

## L5. `mtg_notes_data_source_id`（collection URL）を config 化

### 症状
現状 `mtg_notes_parent_page_id` は案件親ページと同一 ID を指定しているが、実際の議事録は案件親配下の Circleback データベース（`collection://<uuid>`）に集約されている。パスが直感的でない。

### 対策（推奨）
`config/clients/<client>.yml` に以下を追加検討:
```yaml
notion:
  parent_page_id: "XXX"                          # 案件親ページ
  mtg_notes_parent_page_id: "XXX"                # 議事録の親（通常は案件親と同じ）
  mtg_notes_data_source_id: "collection://YYY"  # 議事録DBのcollection URL（string_contains用）
```

これで議事録検索が明示的になる。

### 展開時のアクション
`config.example.yml` テンプレに追加フィールドを反映。既存案件の後方互換を保つため null デフォルト可能に。

---

## L6. `CronCreate` はセッションローカル、RemoteTrigger は `/schedule`

### 症状
Claude Code の `CronCreate` ツールは**セッションローカルスケジューラ**（Claude起動中のみ、最大7日）で、Anthropicクラウド発火の RemoteTrigger とは別物。混同するとトリガー作成失敗 or 短命に終わる。

### 対策（採用済み）
RemoteTrigger作成は **`/schedule` スキル**（`Skill` ツール経由で呼ぶ）を使う。CronCreate は使わない。

### 展開時のアクション
- `SETUP.md` / README.md に「トリガー作成は `/schedule` 使う」と明示
- `docs/OPERATIONS.md` にも注記追加
- SHERPA用トリガー (`trig_01RcYezhUP5JD8CRtx4WCYt5`) と同一環境ID (`env_01UYq54dZDW4PuwLiY3aQJjd`) で作成されているので、同運用者アカウントで作れば同環境になる

---

## L7. スクリプト共有 vs 案件別コピー

### 症状
Studio Alice トリガーは SHERPA 案件と同じ `build_search_query_report.py` / `build_creative_asset_report.py` fileId を参照している（`1oijgUuMWgDgBpCg5Mg8qZY-moMk6okFc` / `1F4BPqPqMDmyDrgZJy-DGxAV6XKETc9lw`）。

### メリット
- スクリプトのバグ修正・機能追加が全案件に自動反映
- 新規案件のセットアップが簡易化

### デメリット
- SHERPA の運用者アカウント（中井さん）が離職・アカウント削除するとStudio Alice も動かなくなる
- スクリプト権限が中井さん個人アカウント配下

### 対策（推奨）
配布戦略に応じて選択:
- **A案（現状）**: 単一運用者・小規模なら共有OK
- **B案（規模拡大時）**: 各案件の `scripts_folder_id` に個別コピー配置。config テンプレの `scripts_folder_id` を必須化
- **C案（本命）**: scripts を GitHub Actions 経由で Google Drive に自動デプロイし、fileId をリポジトリ管理

現状はA案で運用、B/C案は展開規模の拡大に応じて移行。

---

## L8. xlsx サイズは案件のGoogle広告データ規模に比例

### 症状
スタジオアリスの検索クエリ raw は 67,706行 / 9.4MB（CSV換算）と SHERPA の10倍規模。xlsx 生成時の 検索クエリ Excel が3.2MB になる主因。

### 対策（推奨）
- 大規模案件では xlsx の「raw」シートを削減（必要ならCSVリンクだけ Notion に貼る運用）
- または前週分だけ含めて2週分を含めない
- `build_search_query_report.py` に `--exclude-raw` オプション追加検討

### 展開時のアクション
新規案件展開時、CSV 行数が10,000超えるなら xlsx サイズ肥大化を予期する。ローカル手動実行で確認してから RemoteTrigger 化する。

---

## サマリ：他運用者への配布時のチェックリスト（追加）

以下を README.md 「新規案件展開手順」に追記:

- [ ] **Sheet サイズ確認**: 既存Sheet使用時は3MB以下か（L2）
- [ ] **xlsx サイズ予測**: raw行数10,000超なら大型化前提でDrive手動アップ運用（L1/L8）
- [ ] **議事録参照**: 案件名の表記揺れを想定した2段検索（L3）
- [ ] **config `scripts_folder_id`**: SHERPA共有 or 個別コピー方針（L7）
- [ ] **トリガー作成**: `/schedule` スキル使用（L6）
- [ ] **Drive fallback**: try-except でSkip仕様（L1）

---

## メンテナ

- 発見者: 中井明香里（nakai.akari@sintech-inc.com）
- 発見日: 2026-08-18
- 関連ファイル:
  - `config/clients/studioalice.yml`
  - `docs/setup_studioalice.md`
  - `remote-trigger/trigger_prompt_studioalice.md`
- 次回更新: 2026-08-24 スタジオアリス初回自動発火の結果を追記
