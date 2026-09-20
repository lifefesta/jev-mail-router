/**
 * Pipeline - メインロジック
 * Gmail → Jev → Sheets → Gmail labels
 */

import { config } from 'dotenv';
import type { EmailData, JevResponse, JevState, SheetRow, ProcessingResult, Status } from './types.js';
import { getStubResponse } from './stub.js';
import { JevClient } from './jev/index.js';
import { GmailClient } from './gmail/index.js';
import { SheetsClient } from './sheets/index.js';

config();

export interface PipelineConfig {
  confidenceThreshold: number;
  useStub: boolean;
  model: string;
  typesafeApiKey?: string;
  gmailUser?: string;
  sheetsSpreadsheetId?: string;
  sheetsRange?: string;
}

export class Pipeline {
  private config: PipelineConfig;
  private jevClient?: JevClient;
  private gmailClient?: GmailClient;
  private sheetsClient: SheetsClient;

  constructor(config?: Partial<PipelineConfig>) {
    this.config = {
      confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.70'),
      useStub: process.env.USE_STUB === 'true',
      model: process.env.JEV_MODEL || 'jev-latest',
      typesafeApiKey: process.env.TYPESAFE_API_KEY,
      gmailUser: process.env.GMAIL_USER,
      sheetsSpreadsheetId: process.env.SHEETS_SPREADSHEET_ID,
      sheetsRange: process.env.SHEETS_RANGE,
      ...config
    };

    // Jev クライアント初期化（stub モードでない場合のみ）
    if (!this.config.useStub && this.config.typesafeApiKey) {
      this.jevClient = new JevClient({
        apiKey: this.config.typesafeApiKey,
        model: this.config.model
      });
    }

    // Gmail クライアント初期化（オプショナル）
    if (this.config.gmailUser) {
      const authConfig = GmailClient.buildAuthConfigFromEnv();
      this.gmailClient = new GmailClient({
        user: this.config.gmailUser,
        limit: parseInt(process.env.LIVE_LIMIT || '5')
      }, authConfig);
    }

    // Sheets クライアント初期化（常に作成、未設定時はフォールバック）
    const authConfig = SheetsClient.buildAuthConfigFromEnv();
    this.sheetsClient = new SheetsClient({
      spreadsheetId: this.config.sheetsSpreadsheetId,
      range: this.config.sheetsRange
    }, authConfig);
  }

  /**
   * メールを処理
   */
  async processEmail(email: EmailData): Promise<ProcessingResult> {
    try {
      // State を構築
      const state: JevState = {
        subject: email.subject,
        snippet: email.snippet,
        from_domain: this.extractDomain(email.from),
        labels: email.labels
      };

      // Jev または stub で判定
      let jevResponse: JevResponse;
      let model: string;

      if (this.config.useStub || !this.jevClient) {
        jevResponse = getStubResponse(state);
        model = 'stub';
        console.log(`[stub] ${email.gmail_id}: ${jevResponse.intent.value} (${jevResponse.intent.probability.toFixed(2)})`);
      } else {
        try {
          jevResponse = await this.jevClient.classify(state);
          model = this.config.model;
          console.log(`[${model}] ${email.gmail_id}: ${jevResponse.intent.value} (${jevResponse.intent.probability.toFixed(2)})`);
        } catch (error) {
          console.warn(`Jev API failed, falling back to stub: ${error}`);
          jevResponse = getStubResponse(state);
          model = 'stub';
        }
      }

      // しきい値判定と補正
      const { correctedResponse, status } = this.applyThreshold(jevResponse);

      // シート行を作成
      const sheetRow: SheetRow = {
        gmail_id: email.gmail_id,
        thread_id: email.thread_id,
        received_at: email.received_at,
        from: email.from,
        subject: email.subject,
        snippet: email.snippet,
        intent: correctedResponse.intent.value,
        intent_p: correctedResponse.intent.probability,
        next_action: correctedResponse.next_action.value,
        next_action_p: correctedResponse.next_action.probability,
        escalate: correctedResponse.escalate.value,
        escalate_p: correctedResponse.escalate.probability,
        reason_code: correctedResponse.reason_code,
        status,
        model,
        processed_at: new Date().toISOString()
      };

      // スプレッドシートに追記
      await this.sheetsClient.appendRow(sheetRow);

      return {
        email,
        jevResponse: correctedResponse,
        sheetRow
      };
    } catch (error) {
      // エラー行を作成
      const sheetRow: SheetRow = {
        gmail_id: email.gmail_id,
        thread_id: email.thread_id,
        received_at: email.received_at,
        from: email.from,
        subject: email.subject,
        snippet: email.snippet,
        intent: '',
        intent_p: 0,
        next_action: '',
        next_action_p: 0,
        escalate: '',
        escalate_p: 0,
        reason_code: '',
        status: 'error',
        model: 'error',
        processed_at: new Date().toISOString()
      };

      await this.sheetsClient.appendRow(sheetRow);

      return {
        email,
        sheetRow,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * しきい値判定と補正
   */
  private applyThreshold(response: JevResponse): {
    correctedResponse: JevResponse;
    status: Status;
  } {
    const threshold = this.config.confidenceThreshold;
    let status: Status = 'done';

    // いずれかの確率がしきい値未満の場合
    const belowThreshold = 
      response.intent.probability < threshold ||
      response.next_action.probability < threshold ||
      response.escalate.probability < threshold;

    if (belowThreshold) {
      status = 'needs_review';
      
      // next_action を clarify に補正
      return {
        correctedResponse: {
          ...response,
          next_action: {
            value: 'clarify',
            probability: response.next_action.probability
          }
        },
        status
      };
    }

    return { correctedResponse: response, status };
  }

  /**
   * ドメインを抽出
   */
  private extractDomain(email: string): string {
    const match = email.match(/@(.+)$/);
    return match ? match[1] : '';
  }

  /**
   * メールを処理してラベルを付与
   */
  async processEmailWithLabels(email: EmailData): Promise<ProcessingResult> {
    const result = await this.processEmail(email);
    
    // Gmail ラベルを付与（Gmail クライアントが有効な場合のみ）
    if (this.gmailClient && !result.error) {
      try {
        const labels: string[] = [];
        
        // intent ラベル
        if (result.sheetRow.intent) {
          labels.push(`jev/intent/${result.sheetRow.intent}`);
        }
        
        // escalate ラベル
        if (result.sheetRow.escalate === 'yes') {
          labels.push('jev/escalate');
        }
        
        // 処理済みラベル
        labels.push('jev-processed');
        
        await this.gmailClient.addLabels(email.gmail_id, labels);
        console.log(`✓ Labels applied: ${labels.join(', ')}`);
      } catch (error) {
        console.warn(`Failed to apply labels: ${error}`);
      }
    }
    
    return result;
  }

  /**
   * Gmail から未処理メールを取得して処理
   */
  async processFromGmail(): Promise<ProcessingResult[]> {
    if (!this.gmailClient) {
      throw new Error('Gmail client not configured. Set GMAIL_USER and auth credentials.');
    }

    const emails = await this.gmailClient.getUnprocessedEmails();
    console.log(`Found ${emails.length} unprocessed emails`);

    const results: ProcessingResult[] = [];
    for (const email of emails) {
      const result = await this.processEmailWithLabels(email);
      results.push(result);
    }

    return results;
  }

  /**
   * バッチ処理
   */
  async processBatch(emails: EmailData[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    
    for (const email of emails) {
      const result = await this.processEmail(email);
      results.push(result);
    }

    return results;
  }

  /**
   * バッチ処理（ラベル付与あり）
   */
  async processBatchWithLabels(emails: EmailData[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    
    for (const email of emails) {
      const result = await this.processEmailWithLabels(email);
      results.push(result);
    }

    return results;
  }

  /**
   * Sheets がフォールバックモードかどうか
   */
  isSheetsLocalMode(): boolean {
    return this.sheetsClient.isFallbackMode();
  }
}

/**
 * CLI エントリポイント
 */
export async function main() {
  const pipeline = new Pipeline();

  console.log('=== Jev Mail Router Pipeline ===');
  console.log(`Model: ${process.env.JEV_MODEL || 'jev-latest'}`);
  console.log(`Use stub: ${process.env.USE_STUB === 'true'}`);
  console.log(`Confidence threshold: ${process.env.CONFIDENCE_THRESHOLD || '0.70'}`);
  console.log(`Sheets mode: ${pipeline.isSheetsLocalMode() ? 'local fallback' : 'Google Sheets'}`);
  console.log('');

  // Fixture を読み込み
  const fixtureEmail = await GmailClient.loadFixture('fixtures/emails/sample-001.json');
  
  console.log('Processing fixture email...');
  const result = await pipeline.processEmail(fixtureEmail);

  console.log('');
  console.log('=== Result ===');
  console.log(`Status: ${result.sheetRow.status}`);
  console.log(`Intent: ${result.sheetRow.intent} (p=${result.sheetRow.intent_p.toFixed(2)})`);
  console.log(`Next action: ${result.sheetRow.next_action} (p=${result.sheetRow.next_action_p.toFixed(2)})`);
  console.log(`Escalate: ${result.sheetRow.escalate} (p=${result.sheetRow.escalate_p.toFixed(2)})`);
  console.log(`Reason: ${result.sheetRow.reason_code}`);
  
  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
}

// CLI として実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Pipeline error:', error);
    process.exit(1);
  });
}
