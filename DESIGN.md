# DESIGN.md — 現行デザインルール分析

> 対象ファイル: `index.html`（インラインCSS）

---

## 1. カラーパレット

| 変数名 | 値 | 用途 |
|---|---|---|
| `--gold-primary` | `#FFD700` | メインアクセント（ボーダー・テキスト・アクティブ状態） |
| `--gold-dark` | `#B8860B` | スクロールバーhover・暗いゴールド補色 |
| `--gold-muted` | `#D4AF37` | ボタン背景・リストhoverボーダー |
| `--black` | `#0A0A0A` | 最暗部・インプット背景 |
| `--dark-gray` | `#1A1A1A` | ヘッダー・モーダル背景グラデ起点・リストカード背景 |
| `--medium-gray` | `#2A2A2A` | グラデ終点・リストhover背景 |
| `--light-gray` | `#404040` | ボーダー・区切り線 |
| `--lighter-gray` | `#505050` | （定義のみ、現在直接使用なし） |
| `--silver` | `#808080` | 二次テキスト・非アクティブUI |
| `--light-silver` | `#A9A9A9` | モーダル閉じるボタンhover |
| `--charcoal` | `#333333` | ボディ背景グラデ終点 |
| `--white` | `#F5F5F5` | 本文テキスト |
| `--off-white` | `#E8E8E8` | アルバムタイトル・詳細テキスト |

**背景:** `linear-gradient(135deg, #0A0A0A 0%, #333333 100%)` / `background-attachment: fixed`

---

## 2. タイポグラフィ

| 変数名 | フォント | 用途 |
|---|---|---|
| `--font-title` | `'Bebas Neue', 'Anton', sans-serif` | サイトタイトル（h1） |
| `--font-heading` | `'Oswald', sans-serif` (400/500/700) | セクション見出し・ラベル・ボタン・コントロール |
| `--font-body` | `'Roboto Condensed', sans-serif` (400/700) | 本文・インプット・詳細テキスト |

- サイトタイトル: `2.5rem`、`letter-spacing: 3px`、ゴールド＋テキストシャドウ（銀→黒）
- アーティスト名: `1.1rem`、`font-weight: 700`、uppercase、`letter-spacing: 1px`
- モーダルh2: `2rem`、uppercase、`letter-spacing: 2px`
- `line-height: 1.6`（body）

---

## 3. スペーシング

| 変数名 | 値 |
|---|---|
| `--spacing-xs` | `0.5rem` |
| `--spacing-sm` | `1rem` |
| `--spacing-md` | `1.5rem` |
| `--spacing-lg` | `2rem` |
| `--spacing-xl` | `3rem` |

- ヘッダー padding: `0.75rem 1rem 0.5rem`（コンパクト優先）
- メインコンテンツ: `padding: 0 1.5rem`, `margin: 1.5rem auto 3rem`
- max-width: `1400px`

---

## 4. シャドウ

| 変数名 | 値 |
|---|---|
| `--shadow-sm` | `0 2px 4px rgba(0,0,0,0.3)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.5)` |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.7)` |
| `--shadow-gold` | `0 0 20px rgba(255,215,0,0.2)` |
| `--shadow-gold-strong` | `0 0 30px rgba(255,215,0,0.4)` |

---

## 5. カード・グリッドレイアウト

### グリッドビュー（デフォルト）
- `grid-template-columns: repeat(auto-fill, minmax(100px, 1fr))`
- `gap: 0.35rem`（非常に密）
- カード背景: `transparent`、ボーダー: なし
- 画像: 正方形（padding-top: 100% トリック）、`object-fit: cover`
- `border-radius: 4px`
- **hoverエフェクト: なし**

### モバイルビュー
- `grid-template-columns: repeat(3, 1fr)`

### リストビュー
- `grid-template-columns: 1fr`、`gap: 0.4rem`
- カード: 横並び flex、背景 `--dark-gray`、ボーダー `1px solid --light-gray`
- サムネイル: `90px × 90px`
- hover: `border-color: --gold-muted`、背景 `--medium-gray`
- アーティスト名（金）＋タイトル＋メタ情報が右側に表示

---

## 6. ヘッダー・ナビゲーション

- `position: sticky; top: 0; z-index: 1000`
- 背景: `linear-gradient(180deg, #1A1A1A → #2A2A2A)`
- 下ボーダー: `2px solid #FFD700`
- コントロール（セレクト・ボタン・検索）は極めてコンパクト（padding ~0.35rem）
- 全コントロールに `border-radius: 3px`
- アクティブ状態: ゴールド背景＋黒テキスト
- フォーカス: `box-shadow: 0 0 8px rgba(255,215,0,0.3)`
- アルファベットインデックスバー: sticky（ヘッダー直下）、ゴールドボーダーの小ボタン群

---

## 7. モーダル

- overlay: `rgba(0,0,0,0.92)` + `backdrop-filter: blur(5px)`
- コンテンツ: `max-width: 900px`、`border: 3px solid #FFD700`、`border-radius: 12px`
- 背景: `linear-gradient(135deg, --dark-gray → --medium-gray)`
- アニメーション: `translateY(-50px) → 0`、`opacity 0→1`、`0.3s ease`
- アルバム画像: `border: 3px solid --gold-primary`、`max-height: 45vh`
- アクションボタン: 2カラムグリッド、Apple Music/YouTube=ゴールド塗り、他=ゴールドアウトライン

---

## 8. スクロールバー

- track: `--black`
- thumb: `--gold-primary`（hover: `--gold-dark`）
- width: `12px`、`border-radius: 6px`

---

## 9. アニメーション・トランジション

- `transition: all 0.2s ease`（ほぼ全UI要素）
- サイトタイトルのディスクアイコン: `spin 4s linear infinite`
- モーダルslide-in: `0.3s ease`
- ボタンhover: `transform: translateY(-1px)` または `translateY(-2px)`
- モーダル閉じるボタンhover: `rotate(90deg)`

---

## 10. レスポンシブ（~480px）

- ヘッダータイトル: `1.5rem`
- コントロールバー: 縦並び
- 全タップターゲット: `min-height: 44px`
- グリッド: `repeat(3, 1fr)` 固定

---

## デザインの総括・特徴

- **テーマ:** ダーク・ゴールド基調のヒップホップ/レコードコレクション系
- **密度優先:** グリッドは極小gapで最大枚数を表示する「壁埋め」スタイル
- **コンパクトUI:** コントロール類はすべて最小限のpaddingで圧縮
- **hoverエフェクト:** グリッドカードには皆無、リストカードのみ軽微な色変化
- **余白:** 最小限。広い余白よりも情報密度を重視した設計
- **統一感:** ゴールド・黒・グレーの3色系で一貫している
