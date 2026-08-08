# 時間割データの更新管理

`timetable.sha256` は、最後に取り込んだExcelファイルのSHA-256です。
GitHub Actionsが指定URLのファイルと比較し、変更があったときだけデータを更新します。

このフォルダにExcel本体を置く必要はありません。

Boxの `/s/` 共有リンクは閲覧ページのHTMLを返すため、取得スクリプトは同じ共有IDの
`/shared/static/` ダウンロードURLを優先して使用します。共有リンク側では、リンクを
知っている全員に対してファイルの閲覧とダウンロードを許可してください。

確認間隔はGitHub ActionsのRepository variable `TIMETABLE_CHECK_INTERVAL_HOURS` で設定します。
Excelの変更が取り込まれると、`src/data/update-history.json` に更新履歴が自動追加されます。