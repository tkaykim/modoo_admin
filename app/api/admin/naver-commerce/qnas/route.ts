import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/require-admin';
import { answerNaverQna } from '@/lib/naver-commerce/qnas';

export const runtime = 'nodejs';

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const questionId = Number(body.questionId);
    const answer = String(body.answer || '').trim();
    if (!Number.isSafeInteger(questionId) || !answer) return NextResponse.json({ error: '문의 번호와 답변을 입력해 주세요.' }, { status: 400 });
    const data = await answerNaverQna(questionId, answer);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '네이버 문의 답변 등록에 실패했습니다.' }, { status: 500 });
  }
}
