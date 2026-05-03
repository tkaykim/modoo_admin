import type { InvoiceItem } from '@/types/types';

/** 거래명세표에 표시하는 공급자(발행처) 고정 정보 */
export const INVOICE_SUPPLIER = {
  registrationNo: '118-08-15095',
  tradeName: '피스코프',
  representative: '김현준',
  openingDate: '2021년 02월 01일',
  businessAddress: '서울특별시 마포구 새터산4길 2, b1층 2호',
  officeAddress: '서울특별시 마포구 성지3길 55, 4층',
  businessType: '소매업',
  businessItem: '전자상거래',
} as const;

export interface InvoiceEmailParams {
  invoiceNumber: string;
  date: string;
  includeVat: boolean;
  items: InvoiceItem[];
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  recipientOrg: string | null;
  recipientName: string | null;
  memo: string | null;
  /** 이메일: cid:… / PDF·미리보기: data:image/png;base64,… */
  companySealImageSrc?: string | null;
}

const MIN_TABLE_ROWS = 14;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCurrency(value: number): string {
  return value.toLocaleString('ko-KR');
}

/** 행별 세액(표시용). 합계는 API와 동일한 totalVat에 맞춤. */
function lineVatAmounts(items: InvoiceItem[], includeVat: boolean, totalVat: number): number[] {
  if (!includeVat || items.length === 0) {
    return items.map(() => 0);
  }
  const rounded = items.map((it) => Math.round(it.amount * 0.1));
  const sumRounded = rounded.reduce((a, b) => a + b, 0);
  const diff = totalVat - sumRounded;
  if (items.length > 0 && diff !== 0) {
    rounded[items.length - 1] += diff;
  }
  return rounded;
}

function cell(style: string, content: string): string {
  return `<td style="${style}">${content}</td>`;
}

function th(style: string, content: string): string {
  return `<th style="${style}">${content}</th>`;
}

/**
 * 이메일·PDF 공통 본문 (인라인 스타일만 사용)
 */
export function renderTransactionStatementHtml(params: InvoiceEmailParams): string {
  const {
    invoiceNumber,
    date,
    includeVat,
    items,
    subtotal,
    vatAmount,
    totalAmount,
    recipientOrg,
    recipientName,
    memo,
    companySealImageSrc,
  } = params;

  const customerParts = [recipientOrg, recipientName].filter((x): x is string => Boolean(x?.trim()));
  const customerLine = customerParts.length ? customerParts.map(escapeHtml).join(' ') : '—';
  const vatLine = lineVatAmounts(items, includeVat, vatAmount);

  const border = 'border:1px solid #222;';
  const cellBase = `${border}padding:4px 6px;font-size:11px;color:#111;vertical-align:middle;`;
  const headCell = `${border}padding:4px 4px;font-size:10px;font-weight:700;text-align:center;background:#f3f4f6;color:#111;`;
  const right = 'text-align:right;';
  const center = 'text-align:center;';

  const itemRowsHtml = items
    .map((item, i) => {
      const m = escapeHtml((item.month ?? '').trim());
      const d = escapeHtml((item.day ?? '').trim());
      const name = escapeHtml(item.name);
      const spec = escapeHtml((item.spec ?? '').trim());
      const qty = String(item.quantity);
      const unit = formatCurrency(item.unit_price);
      const supply = formatCurrency(item.amount);
      const vatCell = includeVat ? `${formatCurrency(vatLine[i])}` : '—';
      const rowRemarks = escapeHtml((item.remarks ?? '').trim());
      return `<tr>
        ${cell(`${cellBase}${center}`, m || '')}
        ${cell(`${cellBase}${center}`, d || '')}
        ${cell(`${cellBase}`, name)}
        ${cell(`${cellBase}`, spec)}
        ${cell(`${cellBase}${right}`, qty)}
        ${cell(`${cellBase}${right}`, unit)}
        ${cell(`${cellBase}${right}`, supply)}
        ${cell(`${cellBase}${right}`, vatCell)}
        ${cell(`${cellBase}`, rowRemarks)}
      </tr>`;
    })
    .join('');

  const fillerCount = Math.max(0, MIN_TABLE_ROWS - items.length);
  const fillerRows = Array.from({ length: fillerCount }, () => {
    const empty = cell(`${cellBase}`, '&nbsp;');
    return `<tr>${empty.repeat(9)}</tr>`;
  }).join('');

  const totalSupplyDisplay = includeVat ? formatCurrency(subtotal) : formatCurrency(totalAmount);
  const totalVatDisplay = includeVat ? formatCurrency(vatAmount) : '—';
  const grandLabel = '총 합계금액';

  const memoBlock = memo?.trim()
    ? `<div style="margin-top:10px;padding:8px;border:1px solid #ccc;font-size:11px;"><strong>비고(전체)</strong><br/>${escapeHtml(memo.trim()).replace(/\n/g, '<br/>')}</div>`
    : '';

  const sealOverlay =
    companySealImageSrc && companySealImageSrc.length > 0
      ? `<img src="${companySealImageSrc}" alt="" width="60" height="60" style="position:absolute;top:4px;right:4px;width:60px;height:60px;object-fit:contain;opacity:0.85;pointer-events:none;" />`
      : '';

  const lbl = `${border}padding:3px 5px;font-size:10px;font-weight:700;background:#fafafa;white-space:nowrap;`;
  const val = `${border}padding:3px 5px;font-size:10px;`;

  const parsedDate = (() => {
    const m = date.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (m) return { y: m[1], m: m[2], d: m[3] };
    return null;
  })();
  const dateDisplay = parsedDate
    ? `${parsedDate.y}년 ${parsedDate.m}월 ${parsedDate.d}일`
    : escapeHtml(date);

  return `
<table role="presentation" style="width:100%;max-width:720px;border-collapse:collapse;margin:0 auto;${border}">
  <!-- 제목 -->
  <tr>
    <td style="${border}padding:6px 8px;width:15%;vertical-align:middle;">
      <div style="font-size:10px;font-weight:700;text-align:center;">No. ${escapeHtml(invoiceNumber)}</div>
    </td>
    <td colspan="7" style="${border}padding:10px 4px;text-align:center;">
      <div style="font-size:22px;font-weight:800;letter-spacing:0.4em;">거 래 명 세 표</div>
    </td>
  </tr>
  <!-- 상단 정보: 좌측(날짜·귀하) + 우측(공급자) -->
  <tr>
    <td colspan="3" style="${border}width:42%;vertical-align:top;padding:0;">
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        <tr><td style="${border}padding:8px;font-size:11px;text-align:center;">${dateDisplay}</td></tr>
        <tr><td style="${border}padding:8px;font-size:12px;text-align:center;font-weight:700;">${customerLine} 귀하</td></tr>
        <tr><td style="${border}padding:10px 8px;font-size:11px;text-align:center;">아래와 같이 계산합니다.</td></tr>
      </table>
    </td>
    <td colspan="5" style="${border}vertical-align:top;padding:0;position:relative;">
      <div style="font-size:10px;font-weight:700;padding:4px 6px;background:#f3f4f6;border-bottom:1px solid #222;text-align:center;letter-spacing:0.3em;">공 급 자</div>
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="${lbl}width:22%;">등록번호</td>
          <td colspan="3" style="${val}">${escapeHtml(INVOICE_SUPPLIER.registrationNo)}</td>
        </tr>
        <tr>
          <td style="${lbl}">상 호</td>
          <td style="${val}width:28%;">${escapeHtml(INVOICE_SUPPLIER.tradeName)}</td>
          <td style="${lbl}width:16%;">성 명</td>
          <td style="${val}">${escapeHtml(INVOICE_SUPPLIER.representative)}</td>
        </tr>
        <tr>
          <td style="${lbl}">사업장<br/>주 소</td>
          <td colspan="3" style="${val}">${escapeHtml(INVOICE_SUPPLIER.businessAddress)}</td>
        </tr>
        <tr>
          <td style="${lbl}">업 태</td>
          <td style="${val}">${escapeHtml(INVOICE_SUPPLIER.businessType)}</td>
          <td style="${lbl}">종 목</td>
          <td style="${val}">${escapeHtml(INVOICE_SUPPLIER.businessItem)}</td>
        </tr>
      </table>
      ${sealOverlay}
    </td>
  </tr>
  <!-- 합계금액 -->
  <tr>
    <td colspan="2" style="${border}padding:5px 8px;font-size:11px;font-weight:700;background:#f9fafb;text-align:center;white-space:nowrap;">합계<br/>금액</td>
    <td colspan="6" style="${border}padding:5px 8px;font-size:13px;font-weight:700;text-align:left;">
      원정(₩ ${formatCurrency(totalAmount)} )${includeVat ? `<span style="font-size:10px;font-weight:400;color:#555;margin-left:8px;">공급가액 ${formatCurrency(subtotal)} + 세액 ${formatCurrency(vatAmount)}</span>` : ''}
    </td>
  </tr>
  <!-- 본표 -->
  <tr>
    <td colspan="8" style="padding:0;border:none;">
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            ${th(headCell + center + 'width:28px;', '월')}
            ${th(headCell + center + 'width:28px;', '일')}
            ${th(headCell, '품 목')}
            ${th(headCell + 'width:60px;', '규격')}
            ${th(headCell + center + 'width:40px;', '수량')}
            ${th(headCell + right + 'width:70px;', '단 가')}
            ${th(headCell + right + 'width:80px;', '공급가액')}
            ${th(headCell + right + 'width:65px;', '세액')}
            ${th(headCell + 'width:55px;', '비고')}
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml}
          ${fillerRows}
          <tr>
            <td colspan="6" style="${border}padding:5px 8px;font-size:10px;font-weight:700;text-align:center;background:#f9fafb;">계</td>
            ${cell(`${cellBase}${right};font-weight:700;background:#f9fafb;`, totalSupplyDisplay)}
            ${cell(`${cellBase}${right};font-weight:700;background:#f9fafb;`, totalVatDisplay)}
            ${cell(`${cellBase};background:#f9fafb;`, '&nbsp;')}
          </tr>
        </tbody>
      </table>
    </td>
  </tr>
</table>
${memoBlock}
<p style="margin:12px 0 0;font-size:10px;color:#6b7280;text-align:center;">본 거래명세서는 모두의 유니폼(피스코프)에서 발송되었습니다.</p>
`;
}

export function generateInvoiceEmailHtml(params: InvoiceEmailParams): string {
  const inner = renderTransactionStatementHtml(params);
  return `<div style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;background:#fff;padding:16px;">${inner}</div>`;
}

/** Puppeteer 등으로 PDF 출력할 때 사용하는 완전한 HTML 문서 */
export function generateInvoicePdfDocumentHtml(params: InvoiceEmailParams): string {
  const body = renderTransactionStatementHtml(params);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>거래명세표 ${escapeHtml(params.invoiceNumber)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body {
      margin: 0;
      font-family: 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table, td, th { font-family: 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

export function generateInvoiceEmailText(params: InvoiceEmailParams): string {
  const {
    invoiceNumber,
    date,
    includeVat,
    items,
    subtotal,
    vatAmount,
    totalAmount,
    recipientOrg,
    recipientName,
    memo,
  } = params;

  const recipientLines = [recipientOrg, recipientName].filter(Boolean).join(' / ');
  const vatLine = lineVatAmounts(items, includeVat, vatAmount);

  const lines = [
    '===== 거래명세표 =====',
    `발급 No.: ${invoiceNumber}`,
    `발행일: ${date}`,
    `거래처: ${recipientLines || '—'}`,
    '',
    '[공급자]',
    `등록번호: ${INVOICE_SUPPLIER.registrationNo}`,
    `상호(법인명): ${INVOICE_SUPPLIER.tradeName}`,
    `성명(대표자): ${INVOICE_SUPPLIER.representative}`,
    `개업연월: ${INVOICE_SUPPLIER.openingDate}`,
    `사업장 주소: ${INVOICE_SUPPLIER.businessAddress}`,
    `사무실: ${INVOICE_SUPPLIER.officeAddress}`,
    `업태: ${INVOICE_SUPPLIER.businessType}`,
    `종목: ${INVOICE_SUPPLIER.businessItem}`,
    '',
    ...(includeVat ? ['[VAT 포함]', ''] : ['[VAT 미포함]', '']),
    '[품목]',
    '월 | 일 | 품목 | 규격 | 수량 | 단가 | 공급가액 | 세액 | 비고',
    ...items.map((item, i) => {
      const parts = [
        item.month?.trim() || '',
        item.day?.trim() || '',
        item.name,
        item.spec?.trim() || '',
        String(item.quantity),
        `${formatCurrency(item.unit_price)}원`,
        `${formatCurrency(item.amount)}원`,
        includeVat ? `${formatCurrency(vatLine[i])}원` : '—',
        item.remarks?.trim() || '',
      ];
      return parts.join(' | ');
    }),
    '',
    ...(includeVat
      ? [
          `공급가액 합계: ${formatCurrency(subtotal)}원`,
          `세액 합계: ${formatCurrency(vatAmount)}원`,
        ]
      : []),
    `총 합계금액: ${formatCurrency(totalAmount)}원`,
  ];

  if (memo) {
    lines.push('', '[비고(전체)]', memo);
  }

  lines.push('', '---', '본 거래명세서는 모두의 유니폼(피스코프)에서 발송되었습니다.');

  return lines.join('\n');
}
