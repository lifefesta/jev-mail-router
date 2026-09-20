/**
 * Gmail Client - オプショナル実装
 * GMAIL_USER 設定時のみ使用
 * 
 * 注意: この MVP では Gmail API の完全な実装は含まれていません。
 * 実際の使用には Google Cloud Console での OAuth2 設定と
 * googleapis パッケージが必要です。
 */

import type { EmailData } from '../types.js';

export interface GmailClientConfig {
  user: string;
}

export class GmailClient {
  private user: string;

  constructor(config: GmailClientConfig) {
    this.user = config.user;
  }

  /**
   * 未処理メールを取得
   * ラベル jev-processed が付いていないメールを返す
   */
  async getUnprocessedEmails(): Promise<EmailData[]> {
    throw new Error('Gmail API integration not implemented. Use fixture mode or implement OAuth2 authentication.');
  }

  /**
   * メールにラベルを追加
   */
  async addLabels(messageId: string, labels: string[]): Promise<void> {
    throw new Error('Gmail API integration not implemented. Use fixture mode or implement OAuth2 authentication.');
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
