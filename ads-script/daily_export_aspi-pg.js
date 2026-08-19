/**
 * SINTECH SEM週次レポート - Google Ads Script (デイリー書き出し)
 *
 * 動作: 毎週月曜 07:00-07:30 JST に実行し、直近14日分（先々週月〜先週日）の
 *       検索クエリ / 広告アセット データを対象Google Sheetに書き出す。
 *
 * 使い方:
 * 1. Google広告 → ツールと設定 → 一括操作 → スクリプト → 新規作成
 * 2. このファイル全文をコピペ
 * 3. 下記 REPLACE_WITH_* を案件の値に置換
 * 4. 「承認」→「今すぐ実行」で初回発火・書き込み確認
 * 5. 「スケジュール」で毎週月曜7:00-7:30 JST に設定
 *
 * ⚠️ タイムゾーンバグ修正版:
 *   旧バージョンでは today.getDay() がAds Scriptサーバ時間（UTC）基準の
 *   曜日を返すため、月曜7:22JST=日曜22:22UTC で曜日誤判定を起こし、
 *   書き出し期間が意図の1週間前にズレるバグがあった。
 *   このバージョンは Utilities.formatDate('JST', 'u') で JST 基準の
 *   ISO曜日（1=Mon..7=Sun）を取得することで解消済み。
 */

const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1Y9XgQFG9zXfySGhNbYVQl2PwSEcPwQUg6vWFpATJSPA/edit';
const SHEET_SEARCH_QUERY = '検索クエリ_raw';   // 例: '検索クエリ_raw'
const SHEET_AD_ASSET = '広告アセット_raw';           // 例: '広告アセット_raw'

function main() {
  Logger.log('=== 開始 ===');
  Logger.log('アカウント名: ' + AdsApp.currentAccount().getName());
  Logger.log('アカウントID: ' + AdsApp.currentAccount().getCustomerId());

  const range = getLast2WeeksRange();
  Logger.log('取得期間: ' + range.from + ' ～ ' + range.to);

  let ss;
  try {
    ss = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
    Logger.log('Spreadsheet OK: ' + ss.getName());
  } catch (e) {
    Logger.log('★ Spreadsheetを開けません: ' + e);
    return;
  }

  exportSearchQueries(ss, range);
  exportAdAssets(ss, range);
  Logger.log('=== 完了 ===');
}

function getLast2WeeksRange() {
  const now = new Date();
  // JST基準の曜日 (1=Mon..7=Sun) をロケール非依存で取得
  const dowIso = parseInt(Utilities.formatDate(now, 'JST', 'u'), 10);
  const daysToLastSunday = dowIso === 7 ? 7 : dowIso;
  const to = new Date(now.getTime() - daysToLastSunday * 86400000);
  const from = new Date(to.getTime() - 13 * 86400000);
  const fmt = (d) => Utilities.formatDate(d, 'JST', 'yyyy-MM-dd');
  return { from: fmt(from), to: fmt(to) };
}

function exportSearchQueries(ss, range) {
  const sheet = getOrCreateSheet(ss, SHEET_SEARCH_QUERY);
  const query = `
    SELECT segments.date, campaign.name, ad_group.name,
           search_term_view.search_term, segments.search_term_match_type,
           metrics.impressions, metrics.clicks, metrics.ctr,
           metrics.average_cpc, metrics.cost_micros,
           metrics.conversions, metrics.conversions_from_interactions_rate,
           metrics.cost_per_conversion
    FROM search_term_view
    WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'
    ORDER BY segments.date, campaign.name, metrics.cost_micros DESC
  `;
  try {
    AdsApp.report(query).exportToSheet(sheet);
    Logger.log('検索クエリ書き込み完了（プレビュー時は実書き込みなし）');
  } catch (e) {
    Logger.log('★ 検索クエリでエラー: ' + e);
  }
}

function exportAdAssets(ss, range) {
  const sheet = getOrCreateSheet(ss, SHEET_AD_ASSET);
  const query = `
    SELECT segments.date, campaign.name, ad_group.name,
           asset.text_asset.text,
           ad_group_ad_asset_view.field_type,
           ad_group_ad_asset_view.performance_label,
           metrics.impressions, metrics.clicks, metrics.ctr,
           metrics.average_cpc, metrics.cost_micros,
           metrics.conversions, metrics.conversions_from_interactions_rate,
           metrics.cost_per_conversion
    FROM ad_group_ad_asset_view
    WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'
      AND ad_group_ad_asset_view.field_type IN ('HEADLINE', 'DESCRIPTION')
    ORDER BY segments.date, campaign.name, ad_group_ad_asset_view.field_type, metrics.cost_micros DESC
  `;
  try {
    AdsApp.report(query).exportToSheet(sheet);
    Logger.log('広告アセット書き込み完了（プレビュー時は実書き込みなし）');
  } catch (e) {
    Logger.log('★ 広告アセットでエラー: ' + e);
  }
}

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (sheet) sheet.clearContents();
  else sheet = ss.insertSheet(name);
  return sheet;
}
