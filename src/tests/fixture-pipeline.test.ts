/**
 * Fixture + Stub E2E Test
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { Pipeline } from '../pipeline.js';
import { GmailClient } from '../gmail/index.js';

test('fixture + stub pipeline E2E', async () => {
  // Stub モード強制
  const pipeline = new Pipeline({
    useStub: true,
    confidenceThreshold: 0.70
  });

  // Fixture を読み込み
  const email = await GmailClient.loadFixture('fixtures/emails/sample-001.json');
  
  assert.strictEqual(email.gmail_id, 'fixture-001');
  assert.strictEqual(email.subject, '注文した商品の配送状況を知りたい');

  // パイプライン実行
  const result = await pipeline.processEmail(email);

  // 結果検証
  assert.ok(result.sheetRow, 'Sheet row should be created');
  assert.strictEqual(result.sheetRow.status, 'done', 'Status should be done');
  assert.strictEqual(result.sheetRow.model, 'stub', 'Model should be stub');
  
  // 配送問い合わせなので shipping になるはず
  assert.strictEqual(result.sheetRow.intent, 'shipping', 'Intent should be shipping');
  assert.ok(result.sheetRow.intent_p >= 0.70, 'Intent probability should be >= 0.70');
  
  // Stub の決定論的挙動確認
  assert.strictEqual(result.sheetRow.next_action, 'clarify', 'Next action should be clarify');
  assert.strictEqual(result.sheetRow.escalate, 'no', 'Escalate should be no');
  assert.strictEqual(result.sheetRow.reason_code, 'none', 'Reason code should be none');

  console.log('✓ Fixture + stub E2E test passed');
});

test('threshold enforcement', async () => {
  const pipeline = new Pipeline({
    useStub: true,
    confidenceThreshold: 0.99  // 非常に高いしきい値
  });

  const email = await GmailClient.loadFixture('fixtures/emails/sample-001.json');
  const result = await pipeline.processEmail(email);

  // しきい値を超えないため needs_review になるはず
  assert.strictEqual(result.sheetRow.status, 'needs_review', 'Status should be needs_review when below threshold');
  assert.strictEqual(result.sheetRow.next_action, 'clarify', 'Next action should be corrected to clarify');

  console.log('✓ Threshold enforcement test passed');
});

test('type validation', async () => {
  const { isValidIntent, isValidNextAction, isValidEscalate } = await import('../types.js');
  
  assert.strictEqual(isValidIntent('shipping'), true);
  assert.strictEqual(isValidIntent('invalid'), false);
  
  assert.strictEqual(isValidNextAction('clarify'), true);
  assert.strictEqual(isValidNextAction('invalid'), false);
  
  assert.strictEqual(isValidEscalate('yes'), true);
  assert.strictEqual(isValidEscalate('maybe'), false);

  console.log('✓ Type validation test passed');
});

test('stub deterministic behavior', async () => {
  const { getStubResponse } = await import('../stub.js');
  
  // 配送関連
  const shipping = getStubResponse({ subject: '配送', snippet: 'いつ届きますか' });
  assert.strictEqual(shipping.intent.value, 'shipping');
  
  // 返品関連
  const returnCase = getStubResponse({ subject: '返品したい', snippet: 'サイズが合いません' });
  assert.strictEqual(returnCase.intent.value, 'return');
  assert.strictEqual(returnCase.escalate.value, 'yes');
  
  // 在庫関連
  const inventory = getStubResponse({ subject: '在庫確認', snippet: '在庫ありますか' });
  assert.strictEqual(inventory.intent.value, 'inventory');

  console.log('✓ Stub deterministic behavior test passed');
});

test('local sheets fallback', async () => {
  const { SheetsClient } = await import('../sheets/index.js');
  
  const client = new SheetsClient({});
  assert.strictEqual(client.isFallbackMode(), true, 'Should be in fallback mode without spreadsheet ID');
  
  const clientWithId = new SheetsClient({ spreadsheetId: 'test-id' });
  assert.strictEqual(clientWithId.isFallbackMode(), false, 'Should not be in fallback mode with spreadsheet ID');

  console.log('✓ Local sheets fallback test passed');
});
