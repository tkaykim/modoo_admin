import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPhone, formatPhone, sanitizePhoneInput } from './phone';

test('실제 사고 사례를 그대로 잡아낸다', () => {
  // 이규희님 주문(ORD-20260811-DUB7CB) — 한 자리 누락
  const missing = checkPhone('0104931766');
  assert.equal(missing.blocking, true);
  assert.match(missing.message ?? '', /빠진/);

  // 한 자리 더 입력
  const extra = checkPhone('010754444342');
  assert.equal(extra.blocking, true);
  assert.match(extra.message ?? '', /더 입력/);

  // 국가번호를 붙여 입력 — 조용히 교정되고 통과해야 한다
  const intl = checkPhone('821044024301');
  assert.equal(intl.digits, '01044024301');
  assert.equal(intl.blocking, false);
  assert.equal(intl.severity, 'ok');
});

test('정상 휴대폰 번호는 통과하고 문구를 띄우지 않는다', () => {
  const ok = checkPhone('01049317660');
  assert.equal(ok.severity, 'ok');
  assert.equal(ok.message, null);
  assert.equal(ok.blocking, false);
  assert.equal(ok.formatted, '010-4931-7660');
});

test('유선·대표번호는 안내만 하고 막지 않는다', () => {
  for (const value of ['0212345678', '0311234567', '07012345678', '15881234']) {
    const result = checkPhone(value);
    assert.equal(result.blocking, false, `${value} 는 차단하면 안 된다`);
    assert.equal(result.severity, 'notice', `${value} 는 안내여야 한다`);
  }
});

test('폐지된 01X 대역은 경고만 한다', () => {
  const legacy = checkPhone('01856239944');
  assert.equal(legacy.severity, 'warn');
  assert.equal(legacy.blocking, false);
});

test('빈 값은 문구 없이 제출만 막는다', () => {
  const empty = checkPhone('');
  assert.equal(empty.blocking, true);
  assert.equal(empty.message, null);
});

test('알 수 없는 형식은 막는다', () => {
  assert.equal(checkPhone('12345').blocking, true);
  assert.equal(checkPhone('99999999999').blocking, true);
});

test('입력 정리는 숫자만 남기고 국가번호를 교정한다', () => {
  assert.equal(sanitizePhoneInput('010-4931-7660'), '01049317660');
  assert.equal(sanitizePhoneInput('+82 10 4402 4301'), '01044024301');
  assert.equal(sanitizePhoneInput('010 4931 7660 '), '01049317660');
});

test('입력 도중에도 하이픈이 자릿수를 드러낸다', () => {
  assert.equal(formatPhone('010'), '010');
  assert.equal(formatPhone('0104931'), '010-4931');
  // 한 자리 빠진 상태가 마지막 칸에서 눈에 보여야 한다
  assert.equal(formatPhone('0104931766'), '010-493-1766');
  assert.equal(formatPhone('0212345678'), '02-1234-5678');
});
