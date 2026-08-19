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

## L9. 広告アセットレポートの合計値は構造的に膨張する（最重要・カイショー PR#1/#2 と同根）

### 症状
`build_creative_asset_report.py` の「field_type別 実績サマリ」の COST / CV / IMP 合計が、アカウントの実績を大きく上回る。

### ASPI（ジム入会者）での実測（2026-08-10〜16）
| 集計元 | COST | CV | IMP |
|---|---|---|---|
| アカウント全体（`customer`） | ¥1,295,946 | 68.98 | 103,098 |
| 検索クエリ（`search_term_view`） | ¥891,124 | 46.15 | 83,225 |
| 広告アセット（`ad_group_ad_asset_view`） | ¥5,554,452 | 310.25 | 367,380 |

アカウント実績に対し **4.29倍**。カイショーで「11倍膨張」と報告された事象と同じ性質で、倍率は RSA に登録されたアセット本数に比例して案件ごとに変わる。

### 原因（スクリプトのバグではない）
`ad_group_ad_asset_view` は「1インプレッション」を、その広告に紐づくアセット本数分の行に重複計上する GAQL 仕様。Google Ads API を直接叩いても同じ値が返るため、集計スクリプト側で合計している限り必ず膨張する。ASPI の当週はユニークアセット228本に対し行数9,778だった。

### 対策
- **絶対値としての合計を出さない。** アセット**間の相対比較**（どの訴求が相対的に効いているか）にのみ使う
- Notion 登録時は赤 callout で「本表の合計は重複計上のため実績値ではない」と必ず明示する
- スクリプト側の恒久対応は、サマリから COST/CV/IMP の合計行を落とすか、`※重複計上` を列見出しに埋め込む方向が望ましい

### 展開時のアクション
新規案件では Phase 3-1 の段階で、Google Ads API か管理画面のアカウント実績と突き合わせて膨張倍率を必ず実測する。倍率を config か案件メモに記録しておくと、以降の読み違いを防げる。

---

## L10. ローカル実行なら Drive API 直アップで L1 を回避できる

### 症状
L1 の通り Drive MCP `create_file` は base64 実効上限があり、1MB 未満でも詰まる実績がある。

### 発見
ローカル手動実行（Phase 3-1 / リカバリ）に限っては、MCP を経由せず **Drive API の resumable upload** を使えば制限を受けない。ASPI では 1,826,617 bytes（検索クエリ）と 1,026,831 bytes（広告アセット）の2本とも一発で成功した。

```python
from googleapiclient.http import MediaFileUpload
media = MediaFileUpload(path, mimetype=XLSX_MIME, resumable=True)
drive.files().create(body={"name": name, "parents": [folder_id]},
                     media_body=media, supportsAllDrives=True).execute()
```

### 限界
RemoteTrigger（Anthropic クラウド実行）からは MCP しか使えないため、**自動発火時の L1 は解消しない**。トリガー側は従来どおり try-except でスキップし、手動アップ運用を継続する。

### 展開時のアクション
「自動発火は Drive スキップ、リカバリ／初回検証はローカルから API 直アップ」を運用の既定にする。

---

## L11. `performance_label` が全件 NOT_APPLICABLE になる案件がある

### 症状
広告アセットレポートの「HEADLINE/DESCRIPTION パフォーマンス別」シートが、BEST/GOOD/LOW の分類を1件も持たない。

### ASPI での実測
NOT_APPLICABLE 6,850行 / PENDING 17行、BEST・GOOD・LOW はゼロ。

### 原因（推定）
ASPI は店舗ごとにキャンペーンと広告グループを細分化しており（当週42AG）、AG 単位の配信ボリュームが Google のアセット評価閾値に届いていないためとみられる。店舗別・エリア別に細かく割る構成の案件では同じ状態になりうる。

### 対策
`notion-templates/creative_asset_layout.md` に既定されている赤 callout（全 NOT_APPLICABLE 時）をそのまま使う。ただし同テンプレは代替として「CV/CPA視点で評価」と書いているが、その CV/CPA が L9 で膨張しているため、**相対比較である旨を併記しないと誤読を招く**。テンプレの追補が必要。

### 展開時のアクション
Phase 3-1 でラベル分布を確認し、全滅している案件は「ラベルベースの入替判断は不可」を所感の固定文言に入れる。

---

## L12. macOS 運用者はシステム python3 が要件未達（3.9 系）

### 症状
macOS 標準の `/usr/bin/python3` は 3.9.6 で、Phase 0-5 の「3.10 以上」を満たさない。`python3 -m pip install openpyxl` も externally-managed で弾かれうる。

### 対策（採用済み）
リポジトリ直下に専用 venv を作り、ローカル実行はそちらを使う（`.gitignore` に `.venv/` があるため汚さない）。

```bash
/opt/homebrew/bin/python3.12 -m venv .venv
./.venv/bin/python -m pip install openpyxl PyYAML
```

SKILL.md / トリガープロンプト内の `python3` は、ローカル実行時に `./.venv/bin/python` と読み替える。RemoteTrigger 側（Linux）は影響を受けない。

### 展開時のアクション
⑫ Windows 付録と並べて **macOS 付録** を設計書に追加する。あわせて、GitHub リポジトリは 2026-08-19 時点で public 設定になっており、Phase 0-1 の「中井さんへ招待依頼」は不要だった（設計書は private 前提の記述のまま）。

---

## サマリ：他運用者への配布時のチェックリスト（追加）

以下を README.md 「新規案件展開手順」に追記:

- [ ] **Sheet サイズ確認**: 既存Sheet使用時は3MB以下か（L2）
- [ ] **xlsx サイズ予測**: raw行数10,000超なら大型化前提でDrive手動アップ運用（L1/L8）
- [ ] **議事録参照**: 案件名の表記揺れを想定した2段検索（L3）
- [ ] **config `scripts_folder_id`**: SHERPA共有 or 個別コピー方針（L7）
- [ ] **トリガー作成**: `/schedule` スキル使用（L6）
- [ ] **Drive fallback**: try-except でSkip仕様（L1）
- [ ] **アセット膨張倍率の実測**: アカウント実績と突合し、合計値を絶対値として使わない（L9）
- [ ] **Drive 直アップ**: ローカル実行／リカバリは Drive API の resumable upload を使う（L10）
- [ ] **ラベル分布確認**: `performance_label` 全滅案件は入替判断を保留と明記（L11）
- [ ] **実行環境**: macOS は専用 venv（Python 3.10+）を用意（L12）

---

## メンテナ

- 発見者: 中井明香里（nakai.akari@sintech-inc.com）
- 発見日: 2026-08-18
- 関連ファイル:
  - `config/clients/studioalice.yml`
  - `docs/setup_studioalice.md`
  - `remote-trigger/trigger_prompt_studioalice.md`
- 次回更新: 2026-08-24 スタジオアリス初回自動発火の結果を追記

### L9〜L12（ASPI（ジム入会者）展開）

- 発見者: 竹谷健志（takeya.kenji@sintech-inc.com）
- 発見日: 2026-08-19
- 関連ファイル:
  - `config/clients/aspi-pg.yml`
  - `remote-trigger/trigger_prompt_aspi-pg.md`
  - `ads-script/daily_export_aspi-pg.js`
- 検証環境: macOS（Darwin 25.5.0）／Python 3.12（専用 venv）
- 突合方法: Google Ads API v25 でアカウント `9338940180` の同期間実績を直接取得し、生成 xlsx と照合
