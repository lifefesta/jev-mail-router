/**
 * Gmail Client - オプショナル実装
 * GMAIL_USER 設定時のみ使用
 */

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { EmailData } from '../types.js';

export interface GmailClientConfig {
  user: string;
  limit?: number;
}

interface AuthConfig {
  serviceAccountJson?: string;
  serviceAccountPath?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export class GmailClient {
  private user: string;
  private limit: number;
  private auth?: OAuth2Client;
  private gmail?: ReturnType<typeof google.gmail>;

  constructor(config: GmailClientConfig, authConfig?: AuthConfig) {
    this.user = config.user;
    this.limit = config.limit || 10;
    
    if (authConfig) {
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
          scopes: [
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.labels'
          ],
          subject: this.user
        }) as unknown as OAuth2Client;
      } else if (authConfig.serviceAccountPath) {
        // サービスアカウント JSON (ファイルパス)
        const auth = new google.auth.GoogleAuth({
          keyFile: authConfig.serviceAccountPath,
          scopes: [
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.labels'
          ],
          clientOptions: {
            subject: this.user
          }
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

      this.gmail = google.gmail({ version: 'v1', auth: this.auth });
    } catch (error) {
      throw new Error(`Failed to initialize Gmail auth: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 未処理メールを取得
   * ラベル jev-processed が付いていないメールを返す
   */
  async getUnprocessedEmails(): Promise<EmailData[]> {
    if (!this.gmail) {
      throw new Error('Gmail client not initialized. Provide auth config.');
    }

    try {
      // ラベル ID を取得（jev-processed）
      const labelsResponse = await this.gmail.users.labels.list({ userId: 'me' });
      const processedLabel = labelsResponse.data.labels?.find(
        l => l.name === 'jev-processed'
      );

      // クエリを構築
      let query = 'in:inbox';
      if (processedLabel) {
        query += ` -label:${processedLabel.id}`;
      }

      // メッセージ一覧を取得
      const listResponse = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: this.limit
      });

      const messages = listResponse.data.messages || [];
      if (messages.length === 0) {
        return [];
      }

      // 各メッセージの詳細を取得
      const emails: EmailData[] = [];
      for (const message of messages) {
        if (!message.id) continue;

        const detailResponse = await this.gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date']
        });

        const msg = detailResponse.data;
        const headers = msg.payload?.headers || [];
        
        const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
        const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
        const date = headers.find(h => h.name?.toLowerCase() === 'date')?.value || new Date().toISOString();
        
        emails.push({
          gmail_id: msg.id || '',
          thread_id: msg.threadId || '',
          received_at: new Date(date).toISOString(),
          from,
          subject,
          snippet: msg.snippet || '',
          labels: msg.labelIds || []
        });
      }

      return emails;
    } catch (error) {
      throw new Error(`Failed to fetch emails: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * メールにラベルを追加
   */
  async addLabels(messageId: string, labels: string[]): Promise<void> {
    if (!this.gmail) {
      throw new Error('Gmail client not initialized. Provide auth config.');
    }

    try {
      // すべてのラベルを取得
      const labelsResponse = await this.gmail.users.labels.list({ userId: 'me' });
      const existingLabels = labelsResponse.data.labels || [];
      
      // 必要なラベル ID を取得または作成
      const labelIds: string[] = [];
      for (const labelName of labels) {
        let label = existingLabels.find(l => l.name === labelName);
        
        if (!label) {
          // ラベルを作成
          const createResponse = await this.gmail.users.labels.create({
            userId: 'me',
            requestBody: {
              name: labelName,
              labelListVisibility: 'labelShow',
              messageListVisibility: 'show'
            }
          });
          label = createResponse.data;
        }
        
        if (label.id) {
          labelIds.push(label.id);
        }
      }

      // ラベルを適用
      if (labelIds.length > 0) {
        await this.gmail.users.messages.modify({
          userId: 'me',
          id: messageId,
          requestBody: {
            addLabelIds: labelIds
          }
        });
      }
    } catch (error) {
      throw new Error(`Failed to add labels: ${error instanceof Error ? error.message : String(error)}`);
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
   * fixture データの読み込み（開発用）
   */
  static async loadFixture(path: string): Promise<EmailData> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    return JSON.parse(content) as EmailData;
  }

  /**
   * 複数の fixture を読み込み（開発用）
   */
  static async loadFixtures(paths: string[]): Promise<EmailData[]> {
    return Promise.all(paths.map(path => GmailClient.loadFixture(path)));
  }
}
