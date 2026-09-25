import test from 'node:test';
import assert from 'node:assert/strict';
import {redactShippingCosts} from './shipping-cost-access';
test('carrier cost keys are removed recursively without hiding tracking or fare type',()=>{
 const input={fare_ty:'010',delivery_fee:100,qty:2,data:[{dlvFare:100,slipNo:'test',extraCharge:10,fareTy:'010'}]};
 assert.deepEqual(redactShippingCosts(input,'admin'),{fare_ty:'010',qty:2,data:[{slipNo:'test',fareTy:'010'}]});
 assert.equal(redactShippingCosts(input,'super_admin'),input);
});
