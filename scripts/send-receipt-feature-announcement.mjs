// 영수증 기능 완성 안내 메일 발송 (modoo_admin Gmail 전송 = lib/gmail 과 동일 transport).
import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv(new URL('../.env.local', import.meta.url));
const user = env.GMAIL_USER;
const pass = env.GMAIL_APP_PASSWORD;
if (!user || !pass) { console.error('Gmail env missing'); process.exit(1); }

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user, pass },
});

const html = `
<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1f2937;line-height:1.7;">
  <div style="background:#1e3a5f;color:#fff;padding:18px 22px;border-radius:8px 8px 0 0;">
    <h2 style="margin:0;font-size:18px;">모두의 유니폼 · 영수증 발급 기능 안내</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;font-size:14px;">
    <p style="margin:0 0 16px;">안녕하세요.<br>
    모두관리(modoo_admin)에 <strong>주문 영수증 발급·전송 기능</strong>이 추가되어 안내드립니다.</p>

    <p style="margin:0 0 6px;font-weight:700;color:#111;">■ 어디서 쓰나요</p>
    <p style="margin:0 0 16px;">모두관리 → 주문 상세 → <strong>‘결제 정보’ 카드</strong> 안에 버튼이 있습니다.<br>
    결제가 <strong>완료된 주문</strong>에서만 영수증 버튼이 보입니다.<br>
    결제수단에 따라 버튼이 자동으로 달라집니다.</p>

    <p style="margin:0 0 6px;font-weight:700;color:#111;">■ ① 토스(카드·간편결제)로 결제한 주문</p>
    <p style="margin:0 0 4px;"><strong>‘토스 영수증 보기’</strong> — 토스 공식 매출전표(영수증)를 새 창으로 엽니다.</p>
    <p style="margin:0 0 16px;"><strong>‘고객에게 영수증 전송’</strong> — 그 토스 영수증 링크를 주문 고객의 이메일로 보냅니다.</p>

    <p style="margin:0 0 6px;font-weight:700;color:#111;">■ ② 계좌이체·입금확인으로 결제완료한 주문</p>
    <p style="margin:0 0 4px;"><strong>‘영수증 발행/전송’</strong> — 우리 자체 양식의 영수증을 만듭니다.</p>
    <p style="margin:0 0 4px;">버튼을 누르면 영수증 작성 화면이 열리고, 주문 정보(받는 분·품목·금액·결제수단)가 자동으로 채워집니다.</p>
    <p style="margin:0 0 4px;">내용을 확인·수정한 뒤 <strong>‘발송하기’</strong>를 누르면 됩니다.</p>
    <p style="margin:0 0 16px;">‘위 금액을 정히 영수하였음을 확인합니다’ 문구와 회사 도장이 찍힌 PDF가 고객 이메일로 발송됩니다.</p>

    <p style="margin:0 0 6px;font-weight:700;color:#111;">■ 참고</p>
    <p style="margin:0 0 4px;">받는 사람 이메일은 작성 화면에서 수정할 수 있습니다.</p>
    <p style="margin:0 0 4px;">자동으로 채워지는 금액은 주문 품목가 기준이라, 배송비 등 차이가 있으면 발송 전에 수정해 주세요.</p>
    <p style="margin:0 0 16px;">이 자체 영수증은 <strong>입금·결제 확인용</strong>이며, 세무 증빙용 국세청 현금영수증과는 별개입니다.<br>
    세금계산서·현금영수증·거래명세서가 필요하면 기존 <strong>‘명세서/계산서 발행’</strong> 버튼을 그대로 사용하시면 됩니다.</p>

    <p style="margin:0 0 4px;">실제 주문 화면에서 토스 영수증 조회·전송, 자체 영수증 발송까지 테스트를 마친 상태입니다.</p>
    <p style="margin:0;">문의사항 있으시면 회신 주세요.<br>감사합니다.</p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
    <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">본 메일은 모두의 유니폼에서 발송되었습니다.</p>
  </div>
</div>`;

const text = [
  '안녕하세요.',
  '모두관리(modoo_admin)에 주문 영수증 발급·전송 기능이 추가되어 안내드립니다.',
  '',
  '■ 어디서 쓰나요',
  '모두관리 → 주문 상세 → ‘결제 정보’ 카드 안에 버튼이 있습니다.',
  '결제가 완료된 주문에서만 영수증 버튼이 보입니다.',
  '결제수단에 따라 버튼이 자동으로 달라집니다.',
  '',
  '■ ① 토스(카드·간편결제)로 결제한 주문',
  '‘토스 영수증 보기’ — 토스 공식 매출전표(영수증)를 새 창으로 엽니다.',
  '‘고객에게 영수증 전송’ — 그 토스 영수증 링크를 주문 고객의 이메일로 보냅니다.',
  '',
  '■ ② 계좌이체·입금확인으로 결제완료한 주문',
  '‘영수증 발행/전송’ — 우리 자체 양식의 영수증을 만듭니다.',
  '버튼을 누르면 영수증 작성 화면이 열리고, 주문 정보가 자동으로 채워집니다.',
  '내용을 확인·수정한 뒤 ‘발송하기’를 누르면 됩니다.',
  '‘위 금액을 정히 영수하였음을 확인합니다’ 문구와 회사 도장이 찍힌 PDF가 고객 이메일로 발송됩니다.',
  '',
  '■ 참고',
  '받는 사람 이메일은 작성 화면에서 수정할 수 있습니다.',
  '자동으로 채워지는 금액은 주문 품목가 기준이라, 배송비 등 차이가 있으면 발송 전에 수정해 주세요.',
  '이 자체 영수증은 입금·결제 확인용이며, 세무 증빙용 국세청 현금영수증과는 별개입니다.',
  '세금계산서·현금영수증·거래명세서가 필요하면 기존 ‘명세서/계산서 발행’ 버튼을 사용하시면 됩니다.',
  '',
  '실제 주문 화면에서 토스 영수증 조회·전송, 자체 영수증 발송까지 테스트를 마친 상태입니다.',
  '문의사항 있으시면 회신 주세요.',
  '감사합니다.',
].join('\n');

const info = await transporter.sendMail({
  from: `"모두의 유니폼" <${user}>`,
  to: 'modoo.contact@gmail.com, ttehdgustt@naver.com',
  subject: '[모두의 유니폼] 주문 영수증 발급 기능 완성 안내',
  text,
  html,
});

console.log(JSON.stringify({ ok: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }));
