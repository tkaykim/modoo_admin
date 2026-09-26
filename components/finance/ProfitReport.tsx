"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  summarizeEntries,
  type FinanceOverview,
  type FinanceEntry,
} from "@/lib/finance-overview";
const won = (n: number) => Math.round(n).toLocaleString("ko-KR");
const sources = {
  order: "현재 주문",
  legacy: "과거 간이주문",
  erp: "ERP 복원",
};
const cell = (v: unknown) =>
  '"' +
  String(v ?? "")
    .replace(/^[=+@-]/, "'$&")
    .replaceAll('"', '""') +
  '"';
export default function ProfitReport() {
  const [data, setData] = useState<FinanceOverview | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [estimates, setEstimates] = useState(true),
    [tab, setTab] = useState("profit");
  const [source, setSource] = useState("all"),
    [search, setSearch] = useState(""),
    [onlyMissing, setOnlyMissing] = useState(false),
    [page, setPage] = useState(0),
    [open, setOpen] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/finance/overview", {
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "조회 실패");
      setData(d);
      const months = [
        ...d.entries.map((e: FinanceEntry) => e.date.slice(0, 7)),
        ...d.bankMonths.map((m: { month: string }) => m.month),
      ]
        .filter(Boolean)
        .sort();
      setFrom((v) => v || months[0] || "");
      setTo((v) => v || months.at(-1) || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
      setData(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const entries = useMemo(
    () =>
      (data?.entries || []).filter(
        (e) =>
          e.date.slice(0, 7) >= from &&
          e.date.slice(0, 7) <= to &&
          (source === "all" || e.source === source),
      ),
    [data, from, to, source],
  );
  const total = summarizeEntries(entries, estimates);
  const monthly = useMemo(() => {
    const groups = new Map<string, FinanceEntry[]>();
    for (const e of entries) {
      const m = e.date.slice(0, 7);
      groups.set(m, [...(groups.get(m) || []), e]);
    }
    return [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, rows]) => ({
        month,
        ...summarizeEntries(rows, estimates),
      }));
  }, [entries, estimates]);
  const visible = entries.filter(
    (e) =>
      (!onlyMissing || e.missing.length > 0) &&
      (!search ||
        `${e.title} ${e.id}`.toLowerCase().includes(search.toLowerCase())),
  );
  const bank = (data?.bankMonths || []).filter(
    (m) => m.month >= from && m.month <= to,
  );
  const cash = bank.reduce(
    (s, m) => ({
      deposit: s.deposit + m.deposit,
      withdrawal: s.withdrawal + m.withdrawal,
      count: s.count + m.count,
      allocated: s.allocated + m.allocated,
    }),
    { deposit: 0, withdrawal: 0, count: 0, allocated: 0 },
  );
  const max = Math.max(1, ...monthly.flatMap((m) => [m.revenue, m.cost])),
    safePage = Math.min(page, Math.max(0, Math.ceil(visible.length / 40) - 1));
  function exportCsv() {
    const rows =
      tab === "cash"
        ? [
            ["월", "입금", "출금", "현금 증감", "거래수", "연결수"],
            ...bank.map((m) => [
              m.month,
              m.deposit,
              m.withdrawal,
              m.deposit - m.withdrawal,
              m.count,
              m.allocated,
            ]),
          ]
        : [
            [
              "거래",
              "출처",
              "기준일",
              "거래명",
              "수량",
              "등록 매출",
              "추정 매출",
              "등록 비용",
              "비용 보완",
              "VAT 가정",
              "비교 매출",
              "비교 비용",
              "중복 제외",
              "미확인",
              "근거",
            ],
            ...visible.map((e) => [
              e.id,
              sources[e.source],
              e.date,
              e.title,
              e.quantity,
              e.recordedRevenue,
              e.estimatedRevenue,
              e.recordedCost,
              e.costSupplement,
              e.vatSupplement,
              estimates ? e.revenue : e.recordedRevenue,
              estimates ? e.cost : e.recordedCost,
              e.duplicate ? "제외" : "",
              e.missing.join("; "),
              e.basis.join("; "),
            ]),
          ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `modoo-${tab}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <p className="text-sm text-amber-800">
            모두의 유니폼 · 슈퍼관리자 전용
          </p>
          <h1 className="mt-1 text-2xl font-bold">통합 매출·손익</h1>
          <p className="mt-2 text-sm text-gray-600">
            현재 주문과 과거 간이주문을 함께 봅니다.
            <br />
            근거가 있는 추정치를 보완하고, 남은 미확인 항목을 표시합니다.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link
            className="text-blue-700 underline"
            href="/finance/reconciliation"
          >
            원본 증빙
          </Link>
          <Link
            className="text-blue-700 underline"
            href="/finance/profit/registered"
          >
            기존 원장 손익
          </Link>
          <button disabled={loading} onClick={load}>
            새로고침
          </button>
        </div>
      </header>
      <div
        className="flex gap-1 rounded-xl bg-gray-100 p-1"
        role="tablist"
        aria-label="재무 보기"
      >
        {[
          ["profit", "매출·비용·잠정 손익"],
          ["cash", "실제 계좌 입출금"],
        ].map(([k, v]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-lg p-3 text-sm font-semibold ${tab === k ? "bg-white shadow-sm" : "text-gray-600"}`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
        <label className="text-sm">
          시작 월{" "}
          <input
            aria-label="시작 월"
            type="month"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
            className="rounded border p-2"
          />
        </label>
        <label className="text-sm">
          종료 월{" "}
          <input
            aria-label="종료 월"
            type="month"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
            className="rounded border p-2"
          />
        </label>
        {tab === "profit" && (
          <>
            <select
              aria-label="거래 출처"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setPage(0);
              }}
              className="rounded border p-2 text-sm"
            >
              <option value="all">모든 거래</option>
              {Object.entries(sources).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={estimates}
                onChange={(e) => setEstimates(e.target.checked)}
              />
              추정 보완 포함
            </label>
          </>
        )}
        <button
          disabled={!data || loading}
          onClick={exportCsv}
          className="ml-auto rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          CSV 내려받기
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-4 text-red-800">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="p-8 text-center text-gray-500">
          주문·과거 거래·계좌 내역을 모으고 있습니다.
        </p>
      )}
      {!loading && data && from > to && (
        <p role="alert" className="text-red-700">
          시작 월이 종료 월보다 늦습니다.
        </p>
      )}
      {!loading &&
        data &&
        from <= to &&
        (tab === "cash" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="계좌 입금" value={won(cash.deposit) + "원"} />
              <Metric label="계좌 출금" value={won(cash.withdrawal) + "원"} />
              <Metric
                label="현금 증감"
                value={won(cash.deposit - cash.withdrawal) + "원"}
              />
            </div>
            <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
              은행 거래일 기준입니다.
              <br />
              계좌의 전체 입출금에는 자금 이동·환급·미분류 거래가 포함되므로
              매출·사업비용과 같지 않습니다.
              <br />
              자료 범위: {data.bankRange.from} ~ {data.bankRange.to} · 선택 기간{" "}
              {cash.count}건 중 근거 연결 {cash.allocated}건.
            </p>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["월", "입금", "출금", "현금 증감", "거래", "미연결"].map(
                      (h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap p-3 text-right"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {bank.map((m) => (
                    <tr key={m.month} className="border-t">
                      <td className="p-3">{m.month}</td>
                      {[
                        m.deposit,
                        m.withdrawal,
                        m.deposit - m.withdrawal,
                        m.count,
                        m.count - m.allocated,
                      ].map((v, i) => (
                        <td
                          key={i}
                          className="whitespace-nowrap p-3 text-right tabular-nums"
                        >
                          {won(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!bank.length && (
                <p className="p-6 text-gray-500">
                  선택 기간의 은행 자료가 없습니다.
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label={estimates ? "매출 · 확인·추정 합계" : "매출 · 등록액"}
                value={won(total.revenue) + "원"}
              />
              <Metric
                label={estimates ? "비용 · 추정 보완 포함" : "비용 · 등록액"}
                value={won(total.cost) + "원"}
              />
              <Metric label="잠정 차이" value={won(total.profit) + "원"} />
              <Metric
                label={
                  total.unknownRevenue
                    ? "매출 파악 거래의 잠정 마진"
                    : "잠정 마진율"
                }
                value={
                  total.comparableMargin === null
                    ? "—"
                    : total.comparableMargin.toFixed(1) + "%"
                }
              />
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <p>
                {total.count}건 집계 · 미확인 항목이 있는 거래{" "}
                {total.incomplete}건 · 추정 금액이 있는 거래 {total.estimated}
                건.
              </p>
              <p className="mt-1">
                {estimates
                  ? "의류·인쇄·공장 공급가에 VAT 10%를 가정하고, 미기록 인쇄·배송비와 연결 ERP 금액을 보완했습니다."
                  : "등록액만 표시합니다. 기존 원장에도 과거 백필 추정과 VAT 기준 혼합이 남아 있습니다."}
                <br />
                인쇄방법이 없으면 DTF, 치수가 없으면 해당 공장 단가표 중앙값을
                가정합니다.
                <br />이 추정과 원가 누락이 남아 있어 마진은 확정 수익률이
                아닙니다.
                <br />
                과거 거래는 작업 시작 월, 현재 주문은 결제월 기준입니다.
                <br />
                결제수수료·광고비·일반 운영비는 포함하지 않습니다.
              </p>
              {total.unknownRevenue > 0 && (
                <p className="mt-2 font-semibold">
                  매출이 없거나 일부만 연결된 {total.unknownRevenue}건이
                  있습니다.
                  <br />위 마진율은 이 거래들을 제외한 {total.comparableCount}건
                  기준입니다.
                  <br />
                  제외된 거래의 비용 {won(total.unknownRevenueCost)}원은 전체
                  비용과 잠정 차이에 계속 포함됩니다.
                </p>
              )}
            </div>
            <section className="rounded-xl border bg-white p-4">
              <h2 className="font-semibold">월별 매출·비용 추이</h2>
              <div className="mt-4 space-y-3">
                {monthly.map((m) => (
                  <div
                    key={m.month}
                    className="grid grid-cols-[64px_1fr] gap-3 text-xs"
                  >
                    <span className="pt-1 text-gray-600">{m.month}</span>
                    <div className="space-y-1">
                      <div
                        title={`매출 ${won(m.revenue)}원`}
                        className="h-3 rounded-r bg-amber-500"
                        style={{ width: `${(100 * m.revenue) / max}%` }}
                      />
                      <div
                        title={`비용 ${won(m.cost)}원`}
                        className="h-3 rounded-r bg-slate-400"
                        style={{
                          width: `${(100 * Math.max(0, m.cost)) / max}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-500">
                주황: 매출 · 회색: 비용 · 아래 표에서 금액을 확인할 수 있습니다.
              </p>
            </section>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      "월",
                      "거래",
                      "매출",
                      "비용",
                      "잠정 차이",
                      "잠정 마진",
                      "미확인",
                    ].map((h) => (
                      <th key={h} className="whitespace-nowrap p-3 text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthly.map((m) => (
                    <tr key={m.month} className="border-t">
                      <td className="p-3">{m.month}</td>
                      {[m.count, m.revenue, m.cost, m.profit].map((v, i) => (
                        <td
                          key={i}
                          className="whitespace-nowrap p-3 text-right tabular-nums"
                        >
                          {won(v)}
                        </td>
                      ))}
                      <td className="p-3 text-right">
                        {m.comparableMargin === null
                          ? "—"
                          : m.comparableMargin.toFixed(1) + "%"}
                        {m.unknownRevenue > 0 && (
                          <span className="block whitespace-nowrap text-xs text-amber-800">
                            매출 미확인 {m.unknownRevenue}건 제외
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">{m.incomplete}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="rounded-xl border bg-white">
              <div className="flex flex-wrap items-center gap-3 border-b p-4">
                <h2 className="font-semibold">거래별 내역과 남은 확인 사항</h2>
                <input
                  aria-label="거래 검색"
                  placeholder="거래명·주문번호 검색"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  className="min-w-0 rounded border p-2 text-sm"
                />
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={onlyMissing}
                    onChange={(e) => {
                      setOnlyMissing(e.target.checked);
                      setPage(0);
                    }}
                  />{" "}
                  미확인 항목만
                </label>
                <span className="ml-auto text-sm text-gray-500">
                  {visible.length}건
                </span>
              </div>
              <div className="divide-y">
                {visible.slice(safePage * 40, safePage * 40 + 40).map((e) => (
                  <article
                    key={e.id}
                    className={`p-4 ${e.duplicate ? "opacity-60" : ""}`}
                  >
                    <button
                      aria-expanded={open === e.id}
                      onClick={() => setOpen(open === e.id ? "" : e.id)}
                      className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-500">
                          {e.date} · {sources[e.source]} ·{" "}
                          {e.quantity ? `${won(e.quantity)}벌` : "수량 미확인"}
                          {e.duplicate ? " · 합계 제외" : ""}
                        </div>
                        <div className="mt-1 break-words font-medium">
                          {e.title}
                        </div>
                        <div className="mt-1 text-xs text-amber-800">
                          {e.missing.length
                            ? `미확인 ${e.missing.length}항목`
                            : e.estimatedCost || e.estimatedRevenue
                              ? "추정 포함"
                              : "등록 근거 있음"}
                        </div>
                      </div>
                      <div className="text-right text-sm tabular-nums">
                        <div>
                          매출{" "}
                          {e.revenue === null
                            ? "미확인"
                            : won(estimates ? e.revenue : e.recordedRevenue) +
                              "원"}
                        </div>
                        <div className="text-gray-600">
                          비용 {won(estimates ? e.cost : e.recordedCost)}원
                        </div>
                      </div>
                    </button>
                    {open === e.id && (
                      <div className="mt-4 space-y-3 border-t pt-3 text-sm">
                        <Link
                          href={e.link}
                          className="break-all text-blue-700 underline"
                        >
                          {e.id} · 원본 보기
                        </Link>
                        <p>
                          등록 비용 {won(e.recordedCost)}원 / 비용 보완{" "}
                          {won(e.costSupplement)}원 / VAT 가정{" "}
                          {won(e.vatSupplement)}원.
                        </p>
                        {e.missing.length > 0 && (
                          <ul className="list-disc space-y-1 pl-5 text-rose-800">
                            {e.missing.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        )}
                        <ul className="list-disc space-y-1 pl-5 text-gray-600">
                          {e.basis.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <div className="flex items-center justify-between border-t p-4 text-sm">
                <button
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                  className="disabled:opacity-30"
                >
                  이전
                </button>
                <span>
                  {safePage + 1} / {Math.max(1, Math.ceil(visible.length / 40))}
                </span>
                <button
                  disabled={(safePage + 1) * 40 >= visible.length}
                  onClick={() => setPage(safePage + 1)}
                  className="disabled:opacity-30"
                >
                  다음
                </button>
              </div>
            </section>
          </>
        ))}
      {data && (
        <p className="text-xs text-gray-500">
          조회 시각:{" "}
          {new Date(data.generatedAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}{" "}
          · 추정은 보고서 계산에 적용되며 기존 주문·발주·원가 원장을 덮어쓰지
          않습니다.
        </p>
      )}
    </main>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs text-gray-600">{label}</p>
      <p className="mt-2 break-words text-xl font-bold tabular-nums md:text-2xl">
        {value}
      </p>
    </div>
  );
}
