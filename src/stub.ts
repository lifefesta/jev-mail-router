/**
 * Stub - 決定論的フォールバック
 * API キー未設定時や USE_STUB=true の場合に使用
 */

import type { JevState, JevResponse } from './types.js';

/**
 * 決定論的スタブ判定
 * 件名とスニペットからパターンマッチングで判定
 */
export function getStubResponse(state: JevState): JevResponse {
  const text = `${state.subject} ${state.snippet}`.toLowerCase();

  // 配送・shipping パターン
  if (text.includes('配送') || text.includes('届') || text.includes('shipping') || text.includes('delivery')) {
    return {
      intent: { value: 'shipping', probability: 0.95 },
      next_action: { value: 'clarify', probability: 0.90 },
      escalate: { value: 'no', probability: 0.98 },
      reason_code: 'none'
    };
  }

  // 在庫・inventory パターン
  if (text.includes('在庫') || text.includes('入荷') || text.includes('stock') || text.includes('inventory')) {
    return {
      intent: { value: 'inventory', probability: 0.92 },
      next_action: { value: 'clarify', probability: 0.88 },
      escalate: { value: 'no', probability: 0.95 },
      reason_code: 'none'
    };
  }

  // 返品・return パターン
  if (text.includes('返品') || text.includes('返金') || text.includes('return') || text.includes('refund')) {
    return {
      intent: { value: 'return', probability: 0.93 },
      next_action: { value: 'escalate', probability: 0.85 },
      escalate: { value: 'yes', probability: 0.87 },
      reason_code: 'policy'
    };
  }

  // 商品問い合わせ・product_inquiry パターン
  if (text.includes('商品') || text.includes('製品') || text.includes('product') || text.includes('おすすめ') || text.includes('recommend')) {
    return {
      intent: { value: 'product_inquiry', probability: 0.89 },
      next_action: { value: 'recommend', probability: 0.82 },
      escalate: { value: 'no', probability: 0.96 },
      reason_code: 'none'
    };
  }

  // デフォルト: その他
  return {
    intent: { value: 'other', probability: 0.75 },
    next_action: { value: 'clarify', probability: 0.80 },
    escalate: { value: 'no', probability: 0.85 },
    reason_code: 'none'
  };
}
