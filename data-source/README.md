# 時間割データの更新管理

`timetable.sha256` は、最後に取り込んだExcelファイルのSHA-256です。
GitHub Actionsが指定URLのファイルと比較し、変更があったときだけデータを更新します。

このフォルダにExcel本体を置く必要はありません。
