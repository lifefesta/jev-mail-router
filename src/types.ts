/**
 * Jev Mail Router - Type Definitions
 * 仕様書 docs/spec.md §4 に基づく列挙型定義
 */

// 問い合わせ意図
export const IntentValues = ['product_inquiry', 'inventory', 'shipping', 'return', 'other'] as const;
export type Intent = typeof IntentValues[number];

// 次アクション
export const NextActionValues = ['clarify', 'recommend', 'checkout_assist', 'escalate', 'close'] as const;
export type NextAction = typeof NextActionValues[number];

// エスカレーション
export const EscalateValues = ['yes', 'no'] as const;
export type Escalate = typeof EscalateValues[number];

// 理由コード (escalate=no のときは none)
export const ReasonCodeValues = ['dissatisfied', 'complex', 'policy', 'unclear', 'none'] as const;
export type ReasonCode = typeof ReasonCodeValues[number];

// ステータス
export type Status = 'pending' | 'done' | 'error' | 'needs_review';

// 確率付き回答
export interface ProbabilisticAnswer<T> {
  value: T;
  probability: number;
}

// Jev 問い合わせの state
export interface JevState {
  subject: string;
  snippet: string;
  from_domain?: string;
  labels?: string[];
  policy_constraints?: string[];
}

// Jev API レスポンス
export interface JevResponse {
  intent: ProbabilisticAnswer<Intent>;
  next_action: ProbabilisticAnswer<NextAction>;
  escalate: ProbabilisticAnswer<Escalate>;
  reason_code: ReasonCode;
}

// Gmail メールデータ
export interface EmailData {
  gmail_id: string;
  thread_id: string;
  received_at: string;
  from: string;
  subject: string;
  snippet: string;
  labels?: string[];
}

// スプレッドシート行
export interface SheetRow {
  gmail_id: string;
  thread_id: string;
  received_at: string;
  from: string;
  subject: string;
  snippet: string;
  intent: Intent | '';
  intent_p: number;
  next_action: NextAction | '';
  next_action_p: number;
  escalate: Escalate | '';
  escalate_p: number;
  reason_code: ReasonCode | '';
  status: Status;
  model: string;
  processed_at: string;
}

// 処理結果
export interface ProcessingResult {
  email: EmailData;
  jevResponse?: JevResponse;
  sheetRow: SheetRow;
  error?: string;
}

// 型ガード
export function isValidIntent(value: string): value is Intent {
  return IntentValues.includes(value as Intent);
}

export function isValidNextAction(value: string): value is NextAction {
  return NextActionValues.includes(value as NextAction);
}

export function isValidEscalate(value: string): value is Escalate {
  return EscalateValues.includes(value as Escalate);
}

export function isValidReasonCode(value: string): value is ReasonCode {
  return ReasonCodeValues.includes(value as ReasonCode);
}
