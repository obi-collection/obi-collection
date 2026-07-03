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
      addedAt: "2026-06-13",    // 任意。コレクション追加日（process_inbox.pyが自動付与、New Arrivals表示に使用）
      genre: "hiphop",          // 任意。下記選択肢から1つ
      focus: 30,                // 任意。カード正方形クロップの横位置%（0=左端〜100=右端、省略時50=中央）。?tune=1モードで調整→merge_focus.pyで反映
      spotifyId: "3kEtdS2pH6hKcMU9Wioob1", // 任意。SpotifyアルバムID（22文字）。?spotify=1モードで登録→merge_spotify.pyで反映。設定するとモーダルに埋め込みプレイヤー表示
      versions: [
        {
          year: 1995,           // 原盤リリース年（MusicBrainz等で確認）
          yearJP: 1996,         // 日本盤リリース年
          catalog: "XXXX-XXXX", // カタログ番号
          image: "https://res.cloudinary.com/dyfylaino/image/upload/f_auto,q_auto,w_600/...", // CloudinaryフルURL（f_auto,q_auto,w_600変換付き）
          note: ""              // 任意メモ
        }
      ]
    }
  ]
};
```

### genre 選択肢

`hiphop` / `r&b` / `souljazz` / `reggae` / `funk` / `rock` / `pop` / `mix` / `japanese` / `other`

- V.A.・O.S.T. エントリには genre を設定しない
- `r&b` と `souljazz` のエントリはアルファベット・年代フィルタから除外され、専用カテゴリボタンに表示される

---

## 重要ルール

### ❌ やってはいけないこと

- `id` フィールドの変更・重複（既存エントリのIDは絶対に変えない）
- `data.js` 以外にコレクションデータを書くこと
- `year` と `yearJP` の混同（year=原盤年、yearJP=日本盤年）
- `image` フィールドへの変換なしURL・public_idのみの記入（`f_auto,q_auto,w_600` 変換付きのCloudinaryフルURLで統一する。process_inbox.pyが自動付与する形式に合わせる）
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

## フロントエンド機能（2026-06-13追加）

- **ディープリンク:** `#album=<id>` でアルバムモーダルを直接開ける（サイト内ナビ用）。X/SNS共有用には静的ページURL（下記）を使う
- **レーベルフィルタ:** カタログ番号プレフィックス（SRCS等）から自動生成。`alphabetSelect` に `label:XXX` 値のoptgroupとして動的追加（5枚以上のレーベルのみ）
- **統計ダッシュボード:** ヘッダーの棒グラフアイコンから表示。年代分布・レーベル上位10・カテゴリ内訳・日米リリース差
- **New Arrivals:** トップページに `addedAt` 降順で最新10件を横スクロール表示。`addedAt` がないエントリ（初期一括登録分607件）は対象外
- **キーボード操作:** アルバムカードはTab移動・Enter/Spaceで開く。モーダルはrole=dialog + フォーカストラップ + 閉じると元のカードにフォーカス復帰
- **アクセシビリティ:** カードに `:focus-visible` のアウトライン
- **モーダル前後ナビ（2026-07-02追加）:** アルバムモーダルに前後ボタン（`#modalPrev`/`#modalNext`）と←→キー操作。表示中のフィルタ結果順に移動（該当しない場合はアーティスト順の全件リストにフォールバック）。hash更新は `replaceState` で履歴を汚さない。統計モーダル表示中は非表示
- **More from this artist（2026-07-02追加）:** モーダル下部に同一アーティスト（`_sortKey` 一致）の他作品をサムネイル表示（w_200変換・年順）。クリックでそのアルバムのモーダルに切替。V.A./O.S.T.は対象外
- **Focus調整モード（2026-07-02追加）:** URLに `?tune=1` を付けると各カードにスライダーが出て、正方形クロップの横位置を調整できる。調整値はlocalStorage（`obi_tune`）に保存され、画面下部パネルの「Export JSON」でコピー → `python3 merge_focus.py tune.json`（または `pbpaste | python3 merge_focus.py -`）で `data.js` のアルバムレベル `focus` フィールドに反映。focus=50（中央）はフィールド削除扱い
- **Spotify埋め込み（2026-07-03追加）:** `spotifyId` があるアルバムはモーダルにSpotify埋め込みプレイヤー（352px・トラックリスト付き）を表示。URLに `?spotify=1` を付けると登録モードになり、モーダル内の貼り付け欄にSpotifyアルバムURL（シェアリンク）をペースト→即プレビュー表示。登録値はlocalStorage（`obi_spotify`）に保存され、「Export JSON」→ `python3 merge_spotify.py spotify.json` で `data.js` に反映。空文字は `spotifyId` 削除扱い。**登録の確定は常に手動**（自動マッチングによる誤登録を避ける設計）
- **Spotify候補提示（2026-07-03追加）:** `python3 fetch_spotify_candidates.py` がSpotify APIで未登録アルバムの候補（上位5件）を検索し `spotify_candidates.js` に書き出す（要 `.env` の `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`）。`?spotify=1` モードで候補がクリック選択でき、各候補に年・曲数・Spotifyで開く確認リンク付き。選択もXX版/Live版などの見極めも人間が行う。V.A./O.S.T.はアルバム名のみで検索。**注意: 開発モードアプリは1日クォータが小さい**（超過すると24hロック。スクリプトはRetry-After>10分で進捗保存して自動終了、再実行でレジューム）
- **統合編集モード（2026-07-04追加）:** URLに `?edit=1` を付けるとFocus調整・Spotify登録・note登録の3モードが同時にONになる（覚えるURLは1つでいい）。下部パネルは統合表示（Focus n · Spotify n · note n）で、Export JSONは `{"focus":{},"spotify":{},"note":{}}` の複合形式 → `python3 merge_all.py edit.json` で一括反映（noteに変更があれば静的ページも再生成）。個別URL（?tune=1/?spotify=1/?note=1）と個別mergeスクリプトも引き続き使える。**モード状態はURLのみで決まり、localStorage等には保存しない**（PC/スマホ間で挙動が食い違わないようにする設計。編集データ自体は各デバイスに溜まり、それぞれExport→mergeでdata.jsに合流させる）
- **note記事登録モード（2026-07-04追加）:** URLに `?note=1` を付けるとモーダルにnote記事URLの貼り付け欄が出る。ワークフローは「Ask AIボタンで記事生成 → noteに投稿 → 記事URLを貼って登録」。登録値はlocalStorage（`obi_note`）→「Export JSON」→ `python3 merge_note.py note.json` で `data.js` の `note_url` に反映（`https://note.com/` 始まりのみ受理、空文字でフィールド削除）。merge_note.pyは静的ページも自動再生成し、note記事リンク（`.note-link`）が `albums/<slug>.html` に載る。`note_url` があるアルバムはモーダルに「note」ボタン表示（既存機能）

---

## SEO・静的ページ（2026-06-13追加）

- `build_static.py` が `data.js` から **アルバム1件＝1静的ページ** (`albums/<slug>.html`) を生成。OGP/Twitterカード（帯画像）・JSON-LD（MusicAlbum）・サーバーレンダリング済み本文を持つ。SPA（index.html）はJS描画でクローラに中身が見えないため、検索流入とSNSプレビューを静的ページが担う
- `slug` 生成規則: `id` を小文字化し `[^a-z0-9]+` を `-` に置換、前後の `-` を除去。**app.js の `albumSlug()`・post_to_x.py の `album_slug()` と必ず一致させること**（共有URLの整合性のため）
- `sitemap.xml`（トップ＋全アルバム）と `robots.txt` も同時生成
- `process_inbox.py` は新規追加のたびに `build_static.build()` を呼び、`albums/`・`sitemap.xml`・`robots.txt` を `data.js` と一緒にコミットする
- **共有リンク:** SPAの「Copy Link」と `post_to_x.py` は静的ページURL（`albums/<slug>.html`）を使う。X等で帯画像プレビュー（OGP）を出すため

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

（現在なし）

## 重複カタログ番号の扱い（仕様・確定済み）

- **PHCR-3036~7（2Pac / All Eyez On Me）:** `id=009` と `id=203` は同一カタログ番号で帯デザインが異なる別バージョン。**意図的に2エントリで管理している。統合・削除しないこと**（2026-06-13 ユーザー確認済み）
- **RR0025CDJ（InI / Deda）:** `id=111` と `id=112` は2枚組CD（2アーティストの作品を収録）を両アーティスト名で引けるよう分けたもの。**意図的な仕様。統合・削除しないこと**（2026-06-13 ユーザー確認済み）

## yearJP・catalog が空のエントリについて（仕様）

`yearJP` や `catalog` が null/空のエントリは、**日本盤が存在しないUS盤**をコレクションに登録しているケースが大半（Jay Dee関連、Gang Starr「No More Mr. Nice Guy」、EPMD「Strictly Business」、KMD「Black Bastards」など）。データ欠落のエラーとして扱わず、補完・修正の対象にしないこと（2026-06-13 ユーザー確認済み）。

---

## よく使うコマンド

```bash
# Claude Code 起動
cd "/Volumes/Extreme SSD/obi-collection" && claude --dangerously-skip-permissions

# data.js 内のアーティスト検索例
grep -n "STATIK" data.js
```

セッション開始時に必ず最初に plan.md を読んでください。
