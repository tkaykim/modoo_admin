'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';

// ── 타입 ────────────────────────────────────────────────────────────────────
interface LeadOrg {
  id: string;
  name: string;
  category: string | null;
  region: string | null;
  assigned_salesman_id: string | null;
  partner_mall_id: string | null;
  status: string | null;
}

interface LeadContact {
  id: string;
  organization_id: string | null;
  name: string | null;
  role_title: string | null;
  is_primary: boolean;
  email: string | null;
  phone: string | null;
  kakao_id: string | null;
  source: string;
  source_detail: string | null;
  status: string;
  consent_status: string;
  consent_source: string | null;
  consent_at: string | null;
  linked_inquiry_id: string | null;
  linked_chatbot_inquiry_id: string | null;
  last_contacted_at: string | null;
  note: string | null;
  meta: Record<string, unknown> | null;
  first_seen_at: string | null;
  organization: LeadOrg | null;
}

interface Salesman {
  id: string;
  display_name: string | null;
  salesman_code: string | null;
  status: string | null;
}

// ── 라벨/색상 ───────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ['new', 'valid', 'contacted', 'responded', 'converted', 'opted_out', 'bounced', 'invalid'] as const;
const STATUS_LABELS: Record<string, string> = {
  new: '신규', valid: '유효', contacted: '연락함', responded: '응답', converted: '전환',
  opted_out: '수신거부', bounced: '반송', invalid: '무효',
};
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700', valid: 'bg-blue-100 text-blue-700', contacted: 'bg-indigo-100 text-indigo-700',
  responded: 'bg-amber-100 text-amber-800', converted: 'bg-green-100 text-green-800',
  opted_out: 'bg-red-100 text-red-700', bounced: 'bg-red-50 text-red-600', invalid: 'bg-gray-100 text-gray-400',
};
const CONSENT_OPTIONS = ['none', 'opt_in', 'existing_customer'] as const;
const CONSENT_LABELS: Record<string, string> = { none: '동의없음', opt_in: '수신동의', existing_customer: '기존관계' };
const SOURCE_LABELS: Record<string, string> = {
  self_inquiry: '자사문의', self_chatbot: '챗봇상담', manual: '수기입력', schoolinfo: '학교알리미', web: '웹수집', referral: '소개',
};
const CATEGORY_OPTIONS = ['학교', '기업', '동호회', '매장', '댄스', '기타'];

export default function LeadsSection() {
  const [contacts, setContacts] = useState<LeadContact[]>([]);
  const [salesmen, setSalesmen] = useState<Salesman[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [consentFilter, setConsentFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const [selected, setSelected] = useState<LeadContact | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/leads');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '불러오기 실패');
      setContacts(json.contacts || []);
      setSalesmen(json.salesmen || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const salesmanName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return null;
      const s = salesmen.find((x) => x.id === id);
      return s ? s.display_name || s.salesman_code || '영업사원' : null;
    },
    [salesmen]
  );

  const summary = useMemo(() => {
    const s = {
      total: contacts.length,
      withEmail: 0,
      withPhone: 0,
      existing: 0,
      converted: 0,
      orgs: new Set<string>(),
    };
    for (const c of contacts) {
      if (c.email) s.withEmail++;
      if (c.phone) s.withPhone++;
      if (c.consent_status === 'existing_customer') s.existing++;
      if (c.status === 'converted') s.converted++;
      if (c.organization_id) s.orgs.add(c.organization_id);
    }
    return { ...s, orgCount: s.orgs.size };
  }, [contacts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (consentFilter && c.consent_status !== consentFilter) return false;
      if (sourceFilter && c.source !== sourceFilter) return false;
      if (categoryFilter && (c.organization?.category ?? '') !== categoryFilter) return false;
      if (term) {
        const hay = [
          c.name, c.email, c.phone, c.kakao_id, c.organization?.name, c.role_title,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [contacts, search, statusFilter, consentFilter, sourceFilter, categoryFilter]);

  // 인라인 빠른 수정 (상태/동의)
  const patchContact = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setSavingId(id);
      try {
        const res = await fetch('/api/admin/leads', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...body }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '수정 실패');
        setContacts((prev) => prev.map((c) => (c.id === id ? (json.data as LeadContact) : c)));
        setSelected((cur) => (cur && cur.id === id ? (json.data as LeadContact) : cur));
        return json.data as LeadContact;
      } catch (e) {
        alert(e instanceof Error ? e.message : '수정 실패');
        return null;
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  const patchOrg = useCallback(async (id: string, body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/leads/organizations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '단체 수정 실패');
    // 로컬 contacts 의 embedded org 갱신
    setContacts((prev) =>
      prev.map((c) =>
        c.organization_id === id && c.organization
          ? { ...c, organization: { ...c.organization, ...(json.data as Partial<LeadOrg>) } }
          : c
      )
    );
    setSelected((cur) =>
      cur && cur.organization_id === id && cur.organization
        ? { ...cur, organization: { ...cur.organization, ...(json.data as Partial<LeadOrg>) } }
        : cur
    );
    return json.data as LeadOrg;
  }, []);

  const deleteContact = useCallback(async (id: string) => {
    if (!confirm('이 리드를 삭제할까요? (원본 문의는 유지됩니다)')) return;
    const res = await fetch(`/api/admin/leads?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || '삭제 실패');
      return;
    }
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setSelected(null);
  }, []);

  // ── 렌더 (hooks 이후) ─────────────────────────────────────────────────────
  if (loading) return <div className="text-gray-500 py-8">불러오는 중...</div>;
  if (error) {
    return (
      <div className="py-8">
        <p className="text-red-600 mb-2">⚠ {error}</p>
        <button onClick={load} className="px-3 py-1.5 text-sm bg-gray-100 rounded-md hover:bg-gray-200">다시 시도</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <SummaryCard label="전체 리드" value={summary.total} />
        <SummaryCard label="단체 수" value={summary.orgCount} />
        <SummaryCard label="이메일 보유" value={summary.withEmail} />
        <SummaryCard label="전화 보유" value={summary.withPhone} />
        <SummaryCard label="기존관계" value={summary.existing} accent="text-green-700" />
        <SummaryCard label="전환" value={summary.converted} accent="text-blue-700" />
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름·단체·전화·이메일 검색"
          className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} placeholder="상태 전체"
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
        <FilterSelect value={consentFilter} onChange={setConsentFilter} placeholder="동의 전체"
          options={CONSENT_OPTIONS.map((s) => ({ value: s, label: CONSENT_LABELS[s] }))} />
        <FilterSelect value={categoryFilter} onChange={setCategoryFilter} placeholder="카테고리 전체"
          options={CATEGORY_OPTIONS.map((s) => ({ value: s, label: s }))} />
        <FilterSelect value={sourceFilter} onChange={setSourceFilter} placeholder="출처 전체"
          options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))} />
        <span className="text-xs text-gray-500 ml-auto">{filtered.length} / {summary.total}건</span>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="text-left font-medium px-3 py-2">담당자 / 단체</th>
              <th className="text-left font-medium px-3 py-2">카테고리</th>
              <th className="text-left font-medium px-3 py-2">연락처</th>
              <th className="text-left font-medium px-3 py-2">출처</th>
              <th className="text-left font-medium px-3 py-2">상태</th>
              <th className="text-left font-medium px-3 py-2">동의</th>
              <th className="text-left font-medium px-3 py-2">수량</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((c) => {
              const qty = (c.meta?.expected_qty ?? c.meta?.quantity) as number | undefined;
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <button onClick={() => setSelected(c)} className="text-left">
                      <div className="font-medium text-gray-900 flex items-center gap-1">
                        {c.name || '(이름없음)'}
                        {c.role_title && <span className="text-[11px] text-gray-400">· {c.role_title}</span>}
                      </div>
                      <div className="text-xs text-gray-500">{c.organization?.name || '—'}</div>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{c.organization?.category || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">
                    <div>{c.phone || '—'}</div>
                    {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{SOURCE_LABELS[c.source] || c.source}</td>
                  <td className="px-3 py-2">
                    <select
                      value={c.status}
                      disabled={savingId === c.id}
                      onChange={(e) => patchContact(c.id, { status: e.target.value })}
                      className={`text-xs rounded-md px-1.5 py-1 border-0 cursor-pointer ${STATUS_COLORS[c.status] || 'bg-gray-100'}`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={c.consent_status}
                      disabled={savingId === c.id}
                      onChange={(e) => patchContact(c.id, { consent_status: e.target.value })}
                      className="text-xs rounded-md px-1.5 py-1 border border-gray-200 cursor-pointer bg-white"
                    >
                      {CONSENT_OPTIONS.map((s) => (
                        <option key={s} value={s}>{CONSENT_LABELS[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{qty ? `${qty}벌` : '—'}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-gray-400">조건에 맞는 리드가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <LeadDetailDrawer
          contact={selected}
          salesmen={salesmen}
          salesmanName={salesmanName}
          onClose={() => setSelected(null)}
          onPatchContact={patchContact}
          onPatchOrg={patchOrg}
          onDelete={deleteContact}
        />
      )}
    </div>
  );
}

// ── 상세 드로어 ─────────────────────────────────────────────────────────────
function LeadDetailDrawer({
  contact, salesmen, salesmanName, onClose, onPatchContact, onPatchOrg, onDelete,
}: {
  contact: LeadContact;
  salesmen: Salesman[];
  salesmanName: (id: string | null | undefined) => string | null;
  onClose: () => void;
  onPatchContact: (id: string, body: Record<string, unknown>) => Promise<LeadContact | null>;
  onPatchOrg: (id: string, body: Record<string, unknown>) => Promise<LeadOrg>;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(contact.name ?? '');
  const [role, setRole] = useState(contact.role_title ?? '');
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const [kakao, setKakao] = useState(contact.kakao_id ?? '');
  const [note, setNote] = useState(contact.note ?? '');
  const [saving, setSaving] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);

  const saveContact = async () => {
    setSaving(true);
    await onPatchContact(contact.id, { name, role_title: role, phone, email, kakao_id: kakao, note });
    setSaving(false);
  };

  const org = contact.organization;
  const meta = contact.meta || {};

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-xl p-5 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{contact.name || '(이름없음)'}</h3>
            <p className="text-xs text-gray-500">
              {SOURCE_LABELS[contact.source] || contact.source}
              {contact.first_seen_at ? ` · ${new Date(contact.first_seen_at).toLocaleDateString('ko-KR')}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* 상태 뱃지 */}
        <div className="flex gap-2">
          <span className={`text-xs px-2 py-1 rounded-md ${STATUS_COLORS[contact.status] || 'bg-gray-100'}`}>
            {STATUS_LABELS[contact.status]}
          </span>
          <span className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600">{CONSENT_LABELS[contact.consent_status]}</span>
          {org?.partner_mall_id && <span className="text-xs px-2 py-1 rounded-md bg-purple-100 text-purple-700">파트너몰 전환</span>}
        </div>

        {/* 연락처 편집 */}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase">담당자</h4>
          <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="직책/역할"><input value={role} onChange={(e) => setRole(e.target.value)} placeholder="결정권자 · 담당자 · 코치…" className={inputCls} /></Field>
          <Field label="전화"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} /></Field>
          <Field label="이메일"><input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
          <Field label="카카오 ID"><input value={kakao} onChange={(e) => setKakao(e.target.value)} className={inputCls} /></Field>
          <Field label="메모"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} /></Field>
          <button onClick={saveContact} disabled={saving}
            className="w-full py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
            {saving ? '저장 중...' : '담당자 정보 저장'}
          </button>
        </section>

        {/* 단체 편집 */}
        {org && (
          <section className="space-y-2 border-t border-gray-100 pt-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase">단체 · {org.name}</h4>
            <Field label="카테고리">
              <select
                defaultValue={org.category ?? ''}
                disabled={orgSaving}
                onChange={async (e) => { setOrgSaving(true); try { await onPatchOrg(org.id, { category: e.target.value || null }); } catch (err) { alert(err instanceof Error ? err.message : '실패'); } finally { setOrgSaving(false); } }}
                className={inputCls}
              >
                <option value="">미분류</option>
                {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="담당 영업사원">
              <select
                defaultValue={org.assigned_salesman_id ?? ''}
                disabled={orgSaving}
                onChange={async (e) => { setOrgSaving(true); try { await onPatchOrg(org.id, { assigned_salesman_id: e.target.value || null }); } catch (err) { alert(err instanceof Error ? err.message : '실패'); } finally { setOrgSaving(false); } }}
                className={inputCls}
              >
                <option value="">미배정</option>
                {salesmen.map((s) => <option key={s.id} value={s.id}>{s.display_name || s.salesman_code}</option>)}
              </select>
            </Field>
            <p className="text-[11px] text-gray-400">현재 담당: {salesmanName(org.assigned_salesman_id) || '미배정'}</p>
          </section>
        )}

        {/* 문의 정보 */}
        {Boolean(meta.expected_qty || meta.quantity || meta.clothing_type || meta.desired_date) && (
          <section className="border-t border-gray-100 pt-4 text-sm text-gray-600 space-y-1">
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">문의 내용</h4>
            {(meta.expected_qty || meta.quantity) ? <div>예상 수량: {String(meta.expected_qty ?? meta.quantity)}벌</div> : null}
            {meta.clothing_type ? <div>품목: {String(meta.clothing_type)}</div> : null}
            {meta.desired_date ? <div>희망일: {String(meta.desired_date)}</div> : null}
            {contact.source_detail ? <div className="text-gray-400 text-xs">“{contact.source_detail}”</div> : null}
          </section>
        )}

        {/* 위험 액션 */}
        <section className="border-t border-gray-100 pt-4 flex gap-2">
          <button
            onClick={() => onPatchContact(contact.id, { status: 'opted_out' })}
            className="flex-1 py-2 text-sm font-medium bg-red-50 text-red-600 rounded-md hover:bg-red-100"
          >
            수신거부 처리
          </button>
          <button
            onClick={() => onDelete(contact.id)}
            className="px-3 py-2 text-sm font-medium bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200"
          >
            삭제
          </button>
        </section>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${accent || 'text-gray-900'}`}>{value}</div>
    </div>
  );
}

function FilterSelect({
  value, onChange, placeholder, options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
