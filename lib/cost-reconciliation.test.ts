import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeLegacyCash, type CashAllocation } from './cost-reconciliation';
const row = (direction: CashAllocation['direction'], amount_gross: number, is_estimate=false): CashAllocation => ({case_key:'case',transaction_key:'tx',direction,amount_gross,is_estimate,reason:'test'});
test('refund is not duplicated as a production cost', () => {
  assert.deepEqual(summarizeLegacyCash([row('receipt',100000),row('refund',3000)]),{receipt:100000,cost:0,refund:3000,estimatedCost:0,cashDifference:97000});
});
test('estimated split remains visible within observed outflows', () => {
  const value=summarizeLegacyCash([row('receipt',200000),row('cost',150000,true)]);
  assert.equal(value.estimatedCost,150000);assert.equal(value.cost,150000);assert.equal(value.cashDifference,50000);
});
test('missing costs are not a final profit or margin', () => {
  assert.equal('margin' in summarizeLegacyCash([row('receipt',1000)]),false);
});
test('invalid values fail instead of hiding missing cash', () => {
  for(const value of [NaN,Infinity,0,-1])assert.throws(()=>summarizeLegacyCash([row('cost',value)]));
});
