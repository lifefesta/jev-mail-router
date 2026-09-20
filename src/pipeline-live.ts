/**
 * Live Pipeline - Gmail からメールを取得して処理
 */

import { config } from 'dotenv';
import { Pipeline } from './pipeline.js';

config();

async function main() {
  const pipeline = new Pipeline();

  console.log('=== Jev Mail Router - Live Pipeline ===');
  console.log(`Model: ${process.env.JEV_MODEL || 'jev-latest'}`);
  console.log(`Use stub: ${process.env.USE_STUB === 'true'}`);
  console.log(`Confidence threshold: ${process.env.CONFIDENCE_THRESHOLD || '0.70'}`);
  console.log(`Gmail user: ${process.env.GMAIL_USER || 'not configured'}`);
  console.log(`Limit: ${process.env.LIVE_LIMIT || '5'}`);
  console.log(`Sheets mode: ${pipeline.isSheetsLocalMode() ? 'local fallback' : 'Google Sheets'}`);
  console.log('');

  try {
    const results = await pipeline.processFromGmail();
    
    console.log('');
    console.log('=== Summary ===');
    console.log(`Total processed: ${results.length}`);
    
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;
    const reviewCount = results.filter(r => r.sheetRow.status === 'needs_review').length;
    const escalateCount = results.filter(r => r.sheetRow.escalate === 'yes').length;
    
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Needs review: ${reviewCount}`);
    console.log(`Escalated: ${escalateCount}`);
    
    if (errorCount > 0) {
      console.log('');
      console.log('Errors:');
      results
        .filter(r => r.error)
        .forEach(r => console.log(`  - ${r.email.gmail_id}: ${r.error}`));
    }
  } catch (error) {
    console.error('Pipeline error:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
