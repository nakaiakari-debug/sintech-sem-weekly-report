# Notionレイアウト: 広告アセット週次レポート

`notion-output-pro` エージェントに渡すレイアウト仕様。DB形式・1列レイアウト。

## ページタイトル
`【<CLIENT_NAME>週次】広告アセット｜YYYY/MM/DD-MM/DD`

## ページ構造（上から順に）

### 1. 冒頭：アセットサマリ callout（青、📊）
```
【<CLIENT_NAME>広告アセット週次】<期間>
HEADLINE: <件数> / DESCRIPTION: <件数>
performance_label分布:
  BEST: <n> / GOOD: <n> / LEARNING: <n> / NOT_APPLICABLE: <n>
field_type別 CV・CPA:
  HEADLINE: CV <n> / CPA ¥<n>
  DESCRIPTION: CV <n> / CPA ¥<n>
```

### 2. 議事録参照 callout（黄、📝）
検索クエリレポートと同構造。

### 3. データ状態注意 callout（該当時のみ）
- 全 `NOT_APPLICABLE` の場合 → 赤 callout `⚠️ 全アセットがperformance_label未判定のため、ラベルベースの入替判断は不可。CV/CPA視点で評価。`
- 日付列（segments.date）がない場合 → 赤 callout `⚠️ 広告アセット_raw に segments.date 列が未追加のためスナップショット扱い。前週比セクションはN/A。`
- RSA重複カウント注記 → 灰 callout `※ 同一テキストが複数広告グループで使われる場合は重複カウントされる。個別アセット単位の集計。`

### 4. Excel Driveリンク（bookmark）

### 5. レビュー callout（黄、⚠️）
critical-thinker ＋ customer-advocate 指摘＋対応。

### 6. トグル群
- 🔽 **HEADLINE パフォーマンス別**（先頭30行）: table block、`No / パフォーマンス / 広告グループ / アセット / IMP / CT / CTR / COST / CV / CVR / CPA`
- 🔽 **DESCRIPTION パフォーマンス別**（先頭30行）: 同上構造
- 🔽 **広告グループ別**: table block、`広告グループ / アセット数 / IMP / CT / COST / CV / CTR / CVR / CPA`

### 7. 所感 & 推奨アクション（見出し2）

**所感の観点**:
- **HEADLINE の傾向**: CV上位に共通する訴求要素（例: 「歩合」「未経験×独立」「オーナー」等）
- **DESCRIPTION の傾向**: CV上位に共通するメッセージング（機能訴求 vs 感情訴求など）
- **パフォーマンスラベルの偏り**: LEARNING/NOT_APPLICABLE が多いなら評価不能・入替判断保留
- **議事録論点との紐付け**: LP改修・LINE連携・オフラインCV等のイニシアチブに、当週のアセット傾向が示唆するもの

**推奨アクションの型**:
- **入替候補**: 低CV/高COSTのアセット → 差し替え案（訴求文言案付き）
- **拡張候補**: 高CV/低CPAのアセット → 同軸で追加アセット案
- **A/Bテスト提案**: 拮抗しているアセット群 → テスト設計

### 8. ページ末尾：フッター（グレーcallout）
```
自動生成: <YYYY-MM-DD> (JST) | 対象: Google広告のみ
参照議事録: <議事録タイトル>（<日付>）<議事録URL>
```

## 色・アイコン規約
検索クエリレポートと共通。
