# OBI Collection Site — Plan

## プロジェクト概要
日本盤ヒップホップCDの帯（OBI）コレクションサイト。
GitHub Pagesでホスティング、画像はCloudinary経由で配信。

- **サイト:** https://obi-collection.github.io/obi-collection/
- **リポジトリ:** obi-collection/obi-collection
- **Cloudinaryアカウント:** dyfylaino
- **ローカルパス:** /Volumes/Extreme SSD/obi-collection/

## 技術スタック
- フロントエンド: HTML / CSS / JavaScript (GitHub Pages)
- データ: `data.js` 内の `COLLECTION_DATA` → `albums[]`
- 画像配信: Cloudinary
- 自動化: launchd + Python (`watch_inbox.py`, `process_inbox.py`)

## データ構造
```js
COLLECTION_DATA = {
  albums: [
    {
      id: "",
      artist: "",       // カテゴリ表示に使用。コンピは "Various Artists"、サントラは "O.S.T."
      artist_sort: "",  // ソート・フィルタ用（省略可）
      album: "",
      versions: [
        {
          year: "",     // 原盤リリース年
          yearJP: "",   // 日本盤リリース年
          catalog: "",  // カタログ番号
          image: "",    // Cloudinary URL
          note: ""
        }
      ]
    }
  ]
}
```

---

## 既知の課題・TODO

### 🔴 未解決（優先度高）

#### 1. PHCR-3036~7（All Eyez On Me）画像表示問題
- 異なるOBIを持つ重複バージョンのうち、片方の画像が正常表示されない
- **次のアクション:** Cloudinary URL・`versions[]` 構造を確認して修正

### 🟢 完了済み

- `data.js` へのデータ分離（index.htmlから独立）
- `artist_sort` フィールドの追加（17箇所の `getSortName()` 対応済み）
- 自動化パイプライン構築（launchd + `watch_inbox.py` / `process_inbox.py`）
- Various Artists / O.S.T. カテゴリロジック整備
- `_slug()` のnullセーフ対応
- データ修正多数（RUN D.M.C.表記統一、yearJP修正など）
- STATIK SELEKTAH "The Balancing Act" 重複エントリ整理（`id=ss01` の1件に統合済み）
- X（Twitter）自動投稿の実装（`post_to_x.py` + `posted.json` による重複防止、launchd連携）

---

## データ修正ルール（重要）

| ケース | 対応 |
|---|---|
| コンピレーション | `artist: "Various Artists"` |
| サントラ | `artist: "O.S.T."` |
| 表示名とソート名が異なる場合 | `artist_sort` フィールドを追加 |
| `_slug()` で artist が null になりうる場合 | nullセーフフォールバック必須 |

---

## Claude Code 起動コマンド

```bash
cd "/Volumes/Extreme SSD/obi-collection" && claude --dangerously-skip-permissions
```

**セッション開始時に必ずこのファイルを読み込むこと。**

---

## トラブル履歴

### 2026-04-16 VICP-61634~35 二重追加
- 原因：process_inbox.py が2回実行された（Claude Codeの誤判断で再配置を指示してしまった）
- 対策：処理後はinboxが空になっているか確認してから再配置する

---

## 今後の展望

### マルチエージェント自動化
- タスクを細かく分解し、役割ごとに専門エージェントを配置する構成を検討
- X自動投稿では「投稿文生成（Claude API）→投稿実行→投稿済み管理」の3段構成が候補
- 既存のlaunchd + Pythonパイプラインに乗っける形で実装予定
