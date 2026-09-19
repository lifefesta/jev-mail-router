/**
 * Sheets Client - オプショナル実装
 * SHEETS_SPREADSHEET_ID 設定時のみ使用
 * 未設定時はローカル JSON/CSV にフォールバック
 */

import type { SheetRow } from '../types.js';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export interface SheetsClientConfig {
  spreadsheetId?: string;
  range?: string;
}

export class SheetsClient {
  private spreadsheetId?: string;
  private range: string;
  private fallbackMode: boolean;

  constructor(config: SheetsClientConfig) {
    this.spreadsheetId = config.spreadsheetId;
    this.range = config.range || 'Sheet1!A1';
    this.fallbackMode = !this.spreadsheetId;
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

    throw new Error('Google Sheets API integration not implemented. Use fallback mode or implement OAuth2 authentication.');
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
   * フォールバックモードかどうか
   */
  isFallbackMode(): boolean {
    return this.fallbackMode;
  }
}
