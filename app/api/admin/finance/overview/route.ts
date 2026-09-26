import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { isSuperAdmin } from "@/lib/auth-helpers";
import { loadFinanceData } from "@/lib/finance-overview-data";
import { buildFinanceOverview } from "@/lib/finance-overview";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isSuperAdmin(profile?.role))
    return NextResponse.json(
      { error: "슈퍼관리자만 조회할 수 있습니다." },
      { status: 403 },
    );
  try {
    return NextResponse.json(buildFinanceOverview(await loadFinanceData(db)), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error(
      "finance overview failed",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      {
        error:
          "재무 자료를 모두 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
