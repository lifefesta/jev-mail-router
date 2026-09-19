# jev-mail-router

非同期カスタマーサポートメールルーター：Gmail → TypeSafe AI Jev (System One) → Google Sheets → Gmail ラベル

リアルタイム音声接客は対象外。LLM による返信文生成は含まれません。

## 仕様

仕様の正本: [`docs/spec.md`](docs/spec.md)

## クイックスタート（fixture + stub）

API キーなしで動作確認できます：

```bash
# 環境設定（stub モード）
cp .env.example .env
# USE_STUB=false を true に変更（またはそのまま、未設定なら自動的に stub）

# 依存関係インストール
npm install

# ビルド＆テスト
npm test

# パイプライン実行（fixture）
npm run pipeline
```

結果は `output/results.json` と `output/results.csv` に出力されます。

## 機能

- ✅ **Fixture + Stub モード**: API キーなしでフル機能テスト可
- ✅ **型安全な Questions スキーマ**: `intent`, `next_action`, `escalate`, `reason_code`
- ✅ **信頼度しきい値**: 0.70 未満は `needs_review` / `clarify` に自動補正
- ✅ **ローカルフォールバック**: Google Sheets 未設定時は JSON/CSV 出力
- ✅ **決定論的スタブ**: 配送・在庫・返品・商品問い合わせをパターンマッチ
- ✅ **OSS セーフ**: シークレット・実メール・PII なし

## プロジェクト構成

```
/
├── docs/
│   └── spec.md              # 仕様書（凍結版）
├── fixtures/
│   └── emails/
│       └── sample-001.json  # 匿名フィクスチャ
├── src/
│   ├── types.ts             # 型定義
│   ├── stub.ts              # 決定論フォールバック
│   ├── jev/                 # Jev クライアント
│   ├── gmail/               # Gmail クライアント（オプショナル）
│   ├── sheets/              # Sheets クライアント（オプショナル）
│   ├── pipeline.ts          # メインロジック
│   └── tests/               # テスト
├── .env.example             # 環境変数テンプレート
├── .gitignore               # .env, secrets 除外
└── README.md                # このファイル
```

## 環境変数

`.env.example` を `.env` にコピーして設定：

```bash
TYPESAFE_API_KEY=            # TypeSafe API キー（stub モードでは不要）
GMAIL_USER=                  # Gmail アカウント（現時点では未実装）
SHEETS_SPREADSHEET_ID=       # スプレッドシート ID（未設定時はローカル出力）
SHEETS_RANGE=Sheet1!A1       # 書き込み範囲
JEV_MODEL=jev-latest         # Jev モデル名
CONFIDENCE_THRESHOLD=0.70    # 信頼度しきい値
USE_STUB=false               # true で強制的に stub モード
```

## 本番使用に向けて

このリポジトリは **OSS MVP** です。実際の Gmail / Google Sheets 連携には追加実装が必要です：

### Gmail API 連携

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. Gmail API を有効化
3. OAuth2 認証情報を作成
4. `googleapis` パッケージを追加: `npm install googleapis`
5. `src/gmail/client.ts` に認証と API 呼び出しを実装

### Google Sheets API 連携

1. Google Cloud Console で Sheets API を有効化
2. OAuth2 または Service Account 認証を設定
3. `src/sheets/client.ts` に実装を追加

### TypeSafe Jev API

1. [TypeSafe AI](https://typesafe.ai/) でアカウント作成
2. API キーを取得
3. `.env` に `TYPESAFE_API_KEY` を設定
4. `USE_STUB=false` に変更

参考: [System One Models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

## テスト

```bash
# すべてのテスト
npm test

# ビルドのみ
npm run build

# パイプライン実行（fixture）
npm run pipeline
```

テストは Node.js 組み込みの `node:test` を使用しています。

## セキュリティとプライバシー

### リポジトリに含めないもの

- ❌ TypeSafe API キー、Gmail / Sheets トークン
- ❌ 実際のメール本文、氏名、住所、PII
- ❌ 本番スプレッドシート ID

### 公開してよいもの

- ✅ スキーマ定義、questions 列挙型
- ✅ 匿名化された fixtures
- ✅ Stub ロジック、ハーネスコード
- ✅ `.env.example`（値なし）

`.gitignore` により `.env` は自動的に除外されます。

## 受け入れ条件

- ✅ `fixtures/` のみで E2E テストが通る（model=stub）
- ✅ `.env` 未設定でもクラッシュせず stub に自動フォールバック
- ✅ Questions の値が列挙型外なら error 行になる
- ✅ 確率 < 0.70 で needs_review または clarify
- ✅ 実シークレットが git status に現れない
- ✅ README だけで第三者が fixture 経路を再現可能

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照

## 貢献

Issue、PR を歓迎します。実装前に仕様書 `docs/spec.md` を確認してください。

---

**注意**: このプロジェクトは async メールルーティングの MVP です。リアルタイム音声や LLM 返信生成は別エピックで検討します。
