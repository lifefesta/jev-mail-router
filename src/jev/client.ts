/**
 * Jev Client - TypeSafe AI System One API
 * API: POST https://api.typesafe.ai/v1/systemone
 */

import type { JevState, JevResponse, Intent, NextAction, Escalate, ReasonCode } from '../types.js';
import { isValidIntent, isValidNextAction, isValidEscalate, isValidReasonCode } from '../types.js';

export interface JevClientConfig {
  apiKey: string;
  model?: string;
  maxRetries?: number;
}

interface JevApiRequest {
  model: string;
  state: JevState;
  questions: {
    intent: string[];
    next_action: string[];
    escalate: string[];
    reason_code: string[];
  };
}

interface JevApiAnswer {
  value: string;
  probability: number;
}

interface JevApiResponse {
  intent: JevApiAnswer;
  next_action: JevApiAnswer;
  escalate: JevApiAnswer;
  reason_code: string;
}

export class JevClient {
  private apiKey: string;
  private model: string;
  private maxRetries: number;
  private baseUrl = 'https://api.typesafe.ai/v1/systemone';

  constructor(config: JevClientConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'jev-latest';
    this.maxRetries = config.maxRetries || 2;
  }

  async classify(state: JevState): Promise<JevResponse> {
    const request: JevApiRequest = {
      model: this.model,
      state,
      questions: {
        intent: ['product_inquiry', 'inventory', 'shipping', 'return', 'other'],
        next_action: ['clarify', 'recommend', 'checkout_assist', 'escalate', 'close'],
        escalate: ['yes', 'no'],
        reason_code: ['dissatisfied', 'complex', 'policy', 'unclear', 'none']
      }
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(request)
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Jev API error: ${response.status} ${errorText}`);
        }

        const data = await response.json() as JevApiResponse;
        return this.validateAndTransform(data);
      } catch (error) {
        lastError = error as Error;
        
        // 一時的エラーの場合のみリトライ（指数バックオフ）
        if (attempt < this.maxRetries && this.isRetryableError(error)) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
    }

    throw lastError || new Error('Jev API call failed');
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // ネットワークエラーや一時的なサーバーエラー
      return message.includes('fetch') || 
             message.includes('timeout') || 
             message.includes('502') || 
             message.includes('503') || 
             message.includes('504');
    }
    return false;
  }

  private validateAndTransform(data: JevApiResponse): JevResponse {
    // 列挙型の検証
    if (!isValidIntent(data.intent.value)) {
      throw new Error(`Invalid intent value: ${data.intent.value}`);
    }
    if (!isValidNextAction(data.next_action.value)) {
      throw new Error(`Invalid next_action value: ${data.next_action.value}`);
    }
    if (!isValidEscalate(data.escalate.value)) {
      throw new Error(`Invalid escalate value: ${data.escalate.value}`);
    }
    if (!isValidReasonCode(data.reason_code)) {
      throw new Error(`Invalid reason_code value: ${data.reason_code}`);
    }

    return {
      intent: {
        value: data.intent.value as Intent,
        probability: data.intent.probability
      },
      next_action: {
        value: data.next_action.value as NextAction,
        probability: data.next_action.probability
      },
      escalate: {
        value: data.escalate.value as Escalate,
        probability: data.escalate.probability
      },
      reason_code: data.reason_code as ReasonCode
    };
  }
}
