/**
 * Sheets Client - オプショナル実装
 * SHEETS_SPREADSHEET_ID 設定時のみ使用
 * 未設定時はローカル JSON/CSV にフォールバック
 */

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { SheetRow } from '../types.js';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export interface SheetsClientConfig {
  spreadsheetId?: string;
  range?: string;
}

interface AuthConfig {
  serviceAccountJson?: string;
  serviceAccountPath?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export class SheetsClient {
  private spreadsheetId?: string;
  private range: string;
  private fallbackMode: boolean;
  private auth?: OAuth2Client;
  private sheets?: ReturnType<typeof google.sheets>;

  constructor(config: SheetsClientConfig, authConfig?: AuthConfig) {
    this.spreadsheetId = config.spreadsheetId;
    this.range = config.range || 'Sheet1!A1';
    this.fallbackMode = !this.spreadsheetId;
    
    if (!this.fallbackMode && authConfig) {
      this.initAuth(authConfig);
    }
  }

  /**
   * 認証クライアントの初期化
   */
  private initAuth(authConfig: AuthConfig): void {
    try {
      if (authConfig.serviceAccountJson) {
        // サービスアカウント JSON (文字列)
        const credentials = JSON.parse(authConfig.serviceAccountJson);
        this.auth = new google.auth.JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        }) as unknown as OAuth2Client;
      } else if (authConfig.serviceAccountPath) {
        // サービスアカウント JSON (ファイルパス)
        const auth = new google.auth.GoogleAuth({
          keyFile: authConfig.serviceAccountPath,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        this.auth = auth as unknown as OAuth2Client;
      } else if (authConfig.clientId && authConfig.clientSecret && authConfig.refreshToken) {
        // OAuth refresh token
        this.auth = new google.auth.OAuth2(
          authConfig.clientId,
          authConfig.clientSecret
        );
        this.auth.setCredentials({
          refresh_token: authConfig.refreshToken
        });
      } else {
        throw new Error('Invalid auth config. Provide either service account or OAuth credentials.');
      }

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    } catch (error) {
      throw new Error(`Failed to initialize Sheets auth: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 行を追加
   * スプレッドシート未設定時はローカル JSON に書き込み
   */
  async appendRow(row: SheetRow): Promise<void> {
    if (this.fallbackMode) {
      await this.appendToLocalFile(row);
      return;
    }

    if (!this.sheets || !this.spreadsheetId) {
      throw new Error('Sheets client not initialized. Provide auth config or use fallback mode.');
    }

    try {
      const values = [
        [
          row.gmail_id,
          row.thread_id,
          row.received_at,
          row.from,
          row.subject,
          row.snippet,
          row.intent,
          row.intent_p,
          row.next_action,
          row.next_action_p,
          row.escalate,
          row.escalate_p,
          row.reason_code,
          row.status,
          row.model,
          row.processed_at
        ]
      ];

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
        valueInputOption: 'RAW',
        requestBody: {
          values
        }
      });

      console.log(`✓ Row appended to Google Sheets: ${this.spreadsheetId}`);
    } catch (error) {
      throw new Error(`Failed to append to Google Sheets: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * ローカル JSON ファイルに追記
   */
  private async appendToLocalFile(row: SheetRow): Promise<void> {
    const outputDir = join(process.cwd(), 'output');
    const jsonPath = join(outputDir, 'results.json');
    const csvPath = join(outputDir, 'results.csv');

    try {
      const fs = await import('fs/promises');
      await fs.mkdir(outputDir, { recursive: true });

      // JSON 形式
      let rows: SheetRow[] = [];
      try {
        const existing = await fs.readFile(jsonPath, 'utf-8');
        rows = JSON.parse(existing);
      } catch {
        // ファイルが存在しない場合は空配列
      }
      rows.push(row);
      await fs.writeFile(jsonPath, JSON.stringify(rows, null, 2));

      // CSV 形式（ヘッダー付き）
      const header = Object.keys(row).join(',');
      const values = Object.values(row).map(v => 
        typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v)
      ).join(',');
      
      let csvContent = '';
      try {
        csvContent = await fs.readFile(csvPath, 'utf-8');
      } catch {
        // ファイルが存在しない場合はヘッダーを追加
        csvContent = header + '\n';
      }
      csvContent += values + '\n';
      await fs.writeFile(csvPath, csvContent);

      console.log(`✓ Local output saved: ${jsonPath}, ${csvPath}`);
    } catch (error) {
      console.error('Failed to write local output:', error);
      throw error;
    }
  }

  /**
   * 環境変数から認証設定を構築
   */
  static buildAuthConfigFromEnv(): AuthConfig | undefined {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (serviceAccountJson || serviceAccountPath || (clientId && clientSecret && refreshToken)) {
      return {
        serviceAccountJson,
        serviceAccountPath,
        clientId,
        clientSecret,
        refreshToken
      };
    }

    return undefined;
  }

  /**
   * フォールバックモードかどうか
   */
  isFallbackMode(): boolean {
    return this.fallbackMode;
  }
}
