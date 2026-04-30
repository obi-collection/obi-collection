# OBI Collection Project — Claude Code Instructions

## プロジェクト概要

日本盤ヒップホップCDのOBI（帯）コレクションサイト。

- **サイトURL:** https://obi-collection.github.io/obi-collection/
- **リポジトリ:** obi-collection/obi-collection
- **ホスティング:** GitHub Pages
- **画像配信:** Cloudinary（account: dyfylaino）
- **自動化パイプライン:** launchd + Python（`watch_inbox.py`, `process_inbox.py`）

---

## データ構造

コレクションデータは `data.js` 内の `COLLECTION_DATA` に定義されている（`index.html` ではない）。

## フロントエンド構成

- `index.html`: HTML構造と外部CSS/JSの読み込みのみ
- `style.css`: サイト全体のスタイル
- `app.js`: 検索、フィルター、並び替え、カード描画、モーダル、画像ビューアなどのアプリ挙動
- `data.js`: コレクションデータ。自動追加スクリプトはこのファイルを更新する

表示機能を変更する場合は主に `app.js` と `style.css` を編集し、コレクションデータ追加・修正は `data.js` に限定する。

```javascript
const COLLECTION_DATA = {
  albums: [
    {
      id: "unique-id",          // 必須・一意・変更禁止
      artist: "ARTIST NAME",    // カテゴリ表示に使用
      artist_sort: "Sort Name", // 任意。表示名とソート名が異なる場合のみ設定
      album: "Album Title",
      genre: "hiphop",          // 任意。下記選択肢から1つ
      versions: [
        {
          year: 1995,           // 原盤リリース年（MusicBrainz等で確認）
          yearJP: 1996,         // 日本盤リリース年
          catalog: "XXXX-XXXX", // カタログ番号
          image: "cloudinary_public_id",
          note: ""              // 任意メモ
        }
      ]
    }
  ]
};
```

### genre 選択肢

`hiphop` / `r&b` / `souljazz` / `reggae` / `funk` / `rock` / `pop` / `mix` / `other`

- V.A.・O.S.T. エントリには genre を設定しない
- `r&b` と `souljazz` のエントリはアルファベット・年代フィルタから除外され、専用カテゴリボタンに表示される

---

## 重要ルール

### ❌ やってはいけないこと

- `id` フィールドの変更・重複（既存エントリのIDは絶対に変えない）
- `data.js` 以外にコレクションデータを書くこと
- `year` と `yearJP` の混同（year=原盤年、yearJP=日本盤年）
- `image` フィールドへのフルURLの記入（Cloudinary public_idのみ記入する）
- コンパイル盤に個人名アーティストを設定すること（必ず `"V.A."` を使用）
- `artist` に `"Various Artists"` を使用すること（`"V.A."` に統一）

### ✅ 必ず守ること

- **コンパイル盤:** `artist: "V.A."`
- **サウンドトラック:** `artist: "O.S.T."`
- **artist_sortパターン:** 表示名とソート/フィルタ名を分けたい場合のみ `artist_sort` を追加。`getSortName()` は `artist_sort || artist` で動作する
- **year確認:** 新規追加時は MusicBrainz で原盤リリース年を確認する
- **重複チェック:** 新規追加前に同一カタログ番号が存在しないか確認する

---

## アーティスト名の表記統一（確定済み）

| 表記 | 備考 |
|------|------|
| `RUN D.M.C.` | 全エントリで統一済み |
| `Intelligent Hoodlum` | Saga Of A Hoodlum の正しいアーティスト名 |

---

## 修正済みデータ（参考）

| カタログ番号 | フィールド | 値 |
|-------------|-----------|-----|
| VICP-61634~35 | yearJP | 2001 |
| UICY-20376 | yearJP | 2012 |

---

## artist_sort の使いどころ

表示名とソート/フィルタ名を分けたいケース（例）:

```javascript
{
  artist: "JOHN LEGEND & THE ROOTS",
  artist_sort: "The Roots",  // フィルタ・ソートはThe Rootsで行いたい場合
  ...
}
```

`getSortName()` のすべての呼び出し箇所（17箇所）が `artist_sort || artist` パターンに対応済み。

---

## カテゴリボタン仕様

index.html のフィルタボタンに以下の特殊カテゴリがある：

| ボタンラベル | value | 表示条件 |
|------------|-------|---------|
| V.A. | `compilation` | `artist === "V.A."` |
| O.S.T. | `soundtrack` | `artist === "O.S.T."` |
| R&B | `r&b` | `genre === "r&b"` |
| Soul & Jazz | `souljazz` | `genre === "souljazz"` |

`r&b` と `souljazz` のエントリはアルファベット・数字・年代フィルタから除外される。

---

## extract_tracklist() 仕様

`process_inbox.py` の `extract_tracklist()` が返すトラックリスト配列の形式：

- 各要素は `"1. Track Name"` 形式（番号 + ピリオド + スペース + タイトル）
- 複数ディスクがある場合、ディスク区切りを配列に挿入する
  - 例: `"[BONUS CD]"` / `"[DISC 2: BONUS DISC]"` など
  - 区切り行自体に番号はつけない
  - 各ディスクのトラック番号は1番から採番する
- ローマ数字の曲番号は算用数字に変換する
- 画像に記載されている情報のみ抽出（学習データ・推測で補完しない）

---

## Discogs 検索仕様

新規エントリ追加時の原盤年確認に使用：

- **通常アーティスト:** アーティスト名 + アルバム名で検索
- **V.A.（コンパイル盤）:** アルバム名のみで検索
- **O.S.T.（サウンドトラック）:** アルバム名のみで検索

---

## SNS自動投稿（X/Twitter）— 実装予定

### 投稿フォーマット

```
[アーティスト名] / [アルバム名]
[yearJP]年 日本盤
[カタログ番号]

[作品についての一言コメント（日本語・1文）]
※OBIについてのコメントは不要
※ハッシュタグ不要
```

### 注意事項

- X API のセットアップは未完了
- 投稿頻度: 未決定（バックログが大量にあるため複数投稿/日を検討中）
- X はツイートを自動翻訳するため日本語投稿で問題なし

---

## 既知の問題

- **PHCR-3036~7（All Eyez On Me）:** 別OBIの重複版で画像表示の問題が未解決

---

## よく使うコマンド

```bash
# Claude Code 起動
cd "/Volumes/Extreme SSD/obi-collection" && claude --dangerously-skip-permissions

# data.js 内のアーティスト検索例
grep -n "STATIK" data.js
```

セッション開始時に必ず最初に plan.md を読んでください。
