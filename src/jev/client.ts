/**
 * Jev Client - TypeSafe AI System One API
 * API: POST https://api.typesafe.ai/v1/systemone
 * Docs: https://docs.typesafe.ai/primitives/choice.md
 */

import type { JevState, JevResponse, Intent, NextAction, Escalate, ReasonCode } from '../types.js';
import { isValidIntent, isValidNextAction, isValidEscalate, isValidReasonCode } from '../types.js';

export interface JevClientConfig {
  apiKey: string;
  model?: string;
  maxRetries?: number;
}

interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | null>;
}

interface JevApiRequest {
  model: string;
  state: string | object | null;
  questions: Record<string, ChoiceQuestion>;
}

interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}

interface JevApiResponse {
  model: string;
  answers: Record<string, ChoiceAnswer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
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
        intent: {
          type: 'choice',
          instructions: 'What is the primary intent of this customer email?',
          criteria: {
            product_inquiry: 'Customer is asking about a product, its features, or recommendations',
            inventory: 'Customer is asking about stock availability or when items will be in stock',
            shipping: 'Customer is asking about delivery, shipping status, or tracking',
            return: 'Customer wants to return or exchange a product, or asking about refund',
            other: 'Customer inquiry does not fit into the above categories'
          }
        },
        next_action: {
          type: 'choice',
          instructions: 'What is the best next action to take for this email?',
          criteria: {
            clarify: 'Need more information from the customer before proceeding',
            recommend: 'Can provide product recommendations based on the inquiry',
            checkout_assist: 'Customer needs help completing a purchase',
            escalate: 'Issue requires human support team intervention',
            close: 'Inquiry is resolved or can be closed'
          }
        },
        escalate: {
          type: 'choice',
          instructions: 'Should this email be escalated to a human support agent?',
          criteria: {
            yes: 'This requires human intervention',
            no: 'This can be handled automatically or does not need escalation'
          }
        },
        reason_code: {
          type: 'choice',
          instructions: 'If escalation is needed, what is the primary reason? If no escalation, select none.',
          criteria: {
            dissatisfied: 'Customer is dissatisfied or expressing frustration',
            complex: 'The inquiry is too complex for automated handling',
            policy: 'Requires policy decision or exception handling',
            unclear: 'Customer intent is unclear or ambiguous',
            none: 'No escalation needed'
          }
        }
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
        
        // レスポンス構造の検証
        if (!data.answers || typeof data.answers !== 'object') {
          throw new Error('Invalid Jev API response: missing or invalid answers');
        }
        
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
    const { answers } = data;
    
    // 必須フィールドの検証
    if (!answers.intent || !answers.next_action || !answers.escalate || !answers.reason_code) {
      throw new Error('Invalid Jev API response: missing required answer fields');
    }
    
    // 列挙型の検証
    if (!isValidIntent(answers.intent.choice)) {
      throw new Error(`Invalid intent value: ${answers.intent.choice}`);
    }
    if (!isValidNextAction(answers.next_action.choice)) {
      throw new Error(`Invalid next_action value: ${answers.next_action.choice}`);
    }
    if (!isValidEscalate(answers.escalate.choice)) {
      throw new Error(`Invalid escalate value: ${answers.escalate.choice}`);
    }
    if (!isValidReasonCode(answers.reason_code.choice)) {
      throw new Error(`Invalid reason_code value: ${answers.reason_code.choice}`);
    }

    return {
      intent: {
        value: answers.intent.choice as Intent,
        probability: answers.intent.probabilities[answers.intent.choice] || answers.intent.confidence
      },
      next_action: {
        value: answers.next_action.choice as NextAction,
        probability: answers.next_action.probabilities[answers.next_action.choice] || answers.next_action.confidence
      },
      escalate: {
        value: answers.escalate.choice as Escalate,
        probability: answers.escalate.probabilities[answers.escalate.choice] || answers.escalate.confidence
      },
      reason_code: answers.reason_code.choice as ReasonCode
    };
  }
}
