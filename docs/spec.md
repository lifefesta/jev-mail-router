# Jev Mail Router — 開発仕様 v0.3（凍結）

## 1. 目的

接客メールを非同期にルーティングする。Gmail で受信したメールを Jev（TypeSafe AI System One / `jev-latest`）に渡し、型付きの確率付き判断を得て、結果を Google スプレッドシートに記録し、必要なら Gmail ラベルを付与する。

リアルタイム音声接客は対象外。将来その線に伸ばすための「短い分岐」契約だけ先に固める。

## 2. ゴール / 非ゴール

### ゴール

- `state`（プログラム状態）と事前定義の `questions` を Jev に送り、確率付き構造化判断を得る
- 結果をスプシ 1 行 = 1 メールで追記できる
- escalate 判定時に有人向けラベルを付けられる
- OSS として公開できる（秘密・実メールなしで fixture E2E が通る）

### 非ゴール

- チャット／音声の同時進行 UX
- LLM による返信文生成（本仕様の範囲外。必要なら別エピック）
- Jev に商品や文面を新規生成させること
- p95 ≤ 500ms の必須保証（非同期のため努力目標に落とす）

## 3. システム分担

| 役割 | 担当 |
|------|------|
| メール取得・ラベル | Gmail API |
| 短い判断（intent / next_action / escalate） | Jev `POST https://api.typesafe.ai/v1/systemone` model `jev-latest` |
| 監査ログ・運用一覧 | Google スプレッドシート |
| API 未設定時 | `stub.ts` 決定論フォールバック |

## 4. questions スキーマ（初版）

コード側で列挙型として定義する。Jev の出力はパース後にこの型へマッピングする。型崩れはバグ。

1. `intent` — `product_inquiry` | `inventory` | `shipping` | `return` | `other`
2. `next_action` — `clarify` | `recommend` | `checkout_assist` | `escalate` | `close`
3. `escalate` — `yes` | `no`
4. `reason_code` — `dissatisfied` | `complex` | `policy` | `unclear` | `none`（escalate=no のときは `none`）

各回答に確率 / 信頼度を保持する。しきい値未満は自動の recommend / escalate を行わず `clarify`（または status=needs_review）へ落とす。しきい値の仮置き: **0.70**（運用で変更可）。

## 5. state に入れてよいもの

- 件名、スニペット（または本文要約。fixture では匿名テキスト）
- From ドメイン（個人名は本番でもログ最小。OSS fixture では必ず匿名）
- 既存ラベル一覧
- 運用ポリシー制約の短い箇条書き（任意）

入れないもの: パスワード、支払い情報、API キー、実在の個人を特定できる住所・電話。

## 6. スプレッドシート列定義

1 行 = 1 メール。

| 列 | 意味 |
|----|------|
| gmail_id | メッセージ ID |
| thread_id | スレッド ID |
| received_at | 受信日時（ISO 8601） |
| from | 差出人（本番は必要最小、公開禁止） |
| subject | 件名 |
| snippet | 抜粋 |
| intent | 判定 |
| intent_p | 確率 |
| next_action | 判定 |
| next_action_p | 確率 |
| escalate | yes/no |
| escalate_p | 確率 |
| reason_code | 理由コード |
| status | pending / done / error / needs_review |
| model | `jev-latest` または `stub` |
| processed_at | 処理日時 |

## 7. 処理フロー

1. 受信トレイから未処理メールを取得（初版: 受信トレイ全部。処理済みはラベル `jev-processed` で除外）
2. state を組み立て
3. Jev 呼び出し（失敗・未設定時は stub）
4. しきい値判定 → 必要なら next_action を clarify / needs_review に補正
5. スプシへ追記
6. Gmail ラベル付与: `jev/intent/<value>`、escalate=yes なら `jev/escalate`、最後に `jev-processed`

呼び出しはメールあたり原則 1 回。リトライは一時障害のみ（最大 2 回、指数バックオフ）。

## 8. OSS / セキュリティ境界

### 公開してよい

- ハーネス、questions スキーマ、列定義、本仕様
- `fixtures/` の匿名サンプル
- README 手順、決定論 stub
- `.env.example`

### リポジトリに入れない

- TypeSafe API キー、Gmail / Sheets トークン
- 実メール本文・氏名・住所
- 本番スプシ ID（環境変数へ）

### CI

- fixture + stub のみで E2E
- 実 Gmail / 実 Jev はローカルまたは手動の optional 経路

ライセンス: **MIT**

## 9. リポジトリ構成

```
/
  README.md
  LICENSE
  .env.example
  .gitignore
  docs/spec.md
  fixtures/emails/
  src/
    jev/
    gmail/
    sheets/
    pipeline.ts
    stub.ts
  tests/
```

実装順: stub + fixture → Jev client → Gmail → Sheets

## 10. 受け入れ条件

1. `fixtures/` のみで `pipeline` が status=done まで通る（model=stub 可）
2. `.env` 未設定でもクラッシュせず stub に落ちる
3. questions の値が列挙型外なら error 行になり、不正ラベルを付けない
4. intent_p / next_action_p / escalate_p のいずれかが 0.70 未満なら needs_review または clarify
5. 実シークレットが git status に現れない（`.gitignore` 済み）
6. README だけで第三者が fixture 経路を再現できる

## 11. 環境変数（`.env.example`）

```
TYPESAFE_API_KEY=
GMAIL_USER=          # 対象アカウント識別子（接続済みコネクタ側の想定）
SHEETS_SPREADSHEET_ID=
SHEETS_RANGE=Sheet1!A1
JEV_MODEL=jev-latest
CONFIDENCE_THRESHOLD=0.70
USE_STUB=false
```

## 12. 参照

- 一次ソース: https://typesafe.ai/blog/introducing-system-one-models-and-jev
- API: `POST https://api.typesafe.ai/v1/systemone` / `jev-latest`
- 価格目安（公開情報）: 入力 $0.042 / 1M tok、出力無料
- レイテンシ目安（リアルタイム文脈）: 70–500ms（本 MVP では非機能の努力目標）

## 13. 未決・後続

- 本番しきい値のチューニング
- 返信文生成（LLM）エピック
- リアルタイム接客への拡張
- Cardinality が大きい商品候補スコアリング（メール MVP では未使用）
