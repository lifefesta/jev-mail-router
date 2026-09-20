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
- ✅ **本番 Gmail 連携**: googleapis による実際のメール取得とラベル管理
- ✅ **本番 Sheets 連携**: Google Sheets API による直接書き込み
- ✅ **複数認証方式**: サービスアカウント（推奨）と OAuth リフレッシュトークン
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
# TypeSafe AI API
TYPESAFE_API_KEY=            # TypeSafe API キー（stub モードでは不要）

# Gmail 設定
GMAIL_USER=                  # Gmail アカウント（例: user@example.com）

# Google 認証 - オプション1: サービスアカウント（推奨）
GOOGLE_SERVICE_ACCOUNT_JSON= # サービスアカウント JSON（文字列）
# または
GOOGLE_APPLICATION_CREDENTIALS= # サービスアカウント JSON ファイルパス

# Google 認証 - オプション2: OAuth Refresh Token
GOOGLE_CLIENT_ID=            # OAuth クライアント ID
GOOGLE_CLIENT_SECRET=        # OAuth クライアントシークレット
GOOGLE_REFRESH_TOKEN=        # OAuth リフレッシュトークン

# Google Sheets
SHEETS_SPREADSHEET_ID=       # スプレッドシート ID（未設定時はローカル出力）
SHEETS_RANGE=Sheet1!A1       # 書き込み範囲

# Jev モデル設定
JEV_MODEL=jev-latest         # Jev モデル名
CONFIDENCE_THRESHOLD=0.70    # 信頼度しきい値

# 動作モード
USE_STUB=false               # true で強制的に stub モード

# Live パイプライン設定
LIVE_LIMIT=5                 # Gmail から取得する最大メール数
```

## 本番使用に向けて

### 前提条件

以下の API を Google Cloud Console で有効化する必要があります：

1. **Gmail API**: メールの取得とラベル管理
2. **Google Sheets API**: スプレッドシートへのデータ書き込み

### Google Cloud Console での設定

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成または既存のプロジェクトを選択
3. 「API とサービス」→「ライブラリ」から以下を有効化：
   - Gmail API
   - Google Sheets API

### 認証方法

本実装は 2 つの認証方法をサポートしています：

#### オプション 1: サービスアカウント（推奨）

自動化とヘッドレス実行に最適です。

**手順:**

1. Google Cloud Console で「API とサービス」→「認証情報」
2. 「認証情報を作成」→「サービスアカウント」
3. サービスアカウントを作成し、JSON キーをダウンロード
4. Gmail API を使用する場合、**ドメインワイド委任**が必要：
   - Google Workspace 管理コンソールで設定
   - OAuth スコープを追加：
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/gmail.labels`
5. スプレッドシートをサービスアカウントのメールアドレスと共有（編集権限）

**環境変数:**

```bash
# 方法 A: JSON 文字列として直接指定
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key":"..."}'

# 方法 B: ファイルパスを指定
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

GMAIL_USER=your-email@example.com
```

#### オプション 2: OAuth Refresh Token

個人の Gmail アカウント向け。

**手順:**

1. Google Cloud Console で OAuth 2.0 クライアント ID を作成
2. OAuth 同意画面を設定
3. スコープを追加：
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.labels`
   - `https://www.googleapis.com/auth/spreadsheets`
4. OAuth Playground または独自のフローで refresh token を取得

**環境変数:**

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GMAIL_USER=your-email@gmail.com
```

### TypeSafe Jev API

1. [TypeSafe AI](https://typesafe.ai/) でアカウント作成
2. API キーを取得
3. `.env` に設定：

```bash
TYPESAFE_API_KEY=your-api-key-here
USE_STUB=false
```

### Google Sheets 設定

1. Google Sheets でスプレッドシートを作成
2. 1 行目にヘッダーを追加（推奨）：
   ```
   gmail_id, thread_id, received_at, from, subject, snippet, intent, intent_p, next_action, next_action_p, escalate, escalate_p, reason_code, status, model, processed_at
   ```
3. スプレッドシート ID を取得（URL から）：
   ```
   https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
   ```
4. `.env` に設定：
   ```bash
   SHEETS_SPREADSHEET_ID=your-spreadsheet-id
   SHEETS_RANGE=Sheet1!A2  # ヘッダーがある場合は A2 から
   ```

### 本番接続のテスト

```bash
# 環境変数を設定
cp .env.example .env
# .env を編集して認証情報を入力

# ビルド
npm run build

# Live パイプライン実行（Gmail から最大 5 件取得）
npm run pipeline:live

# 取得件数を変更する場合
LIVE_LIMIT=10 npm run pipeline:live
```

### トラブルシューティング

**Gmail API エラー:**
- サービスアカウントの場合、ドメインワイド委任が正しく設定されているか確認
- OAuth の場合、スコープに `gmail.modify` と `gmail.labels` が含まれているか確認
- `GMAIL_USER` が正しく設定されているか確認

**Sheets API エラー:**
- スプレッドシートがサービスアカウント/OAuth アカウントと共有されているか確認
- `SHEETS_SPREADSHEET_ID` が正しいか確認
- 範囲指定（`SHEETS_RANGE`）が有効か確認

**認証エラー:**
- サービスアカウント JSON が正しく解析できるか確認
- refresh token の有効期限が切れていないか確認
- Google Cloud Console で API が有効化されているか確認

参考: [System One Models and Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)

## テスト

```bash
# すべてのテスト（ビルド + テスト実行）
npm test

# ビルドのみ
npm run build

# パイプライン実行（fixture - オフライン）
npm run pipeline:fixture

# パイプライン実行（live - Gmail から取得）
# 注意: 本番認証設定が必要
npm run pipeline:live
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
