'use client';

import { useState } from 'react';

export default function InviteForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch('/api/admin/salesmen/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          display_name: name.trim() || null,
          phone: phone.trim() || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || '초대 실패');
      }
      setDone(`${payload.email}로 초대 메일이 발송되었습니다.`);
      setEmail('');
      setName('');
      setPhone('');
      setTimeout(onSuccess, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : '초대 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs text-gray-600">
        신규 사용자에게 초대 메일을 보내고 동시에 영업사원 프로필을 생성합니다. 초대 수락 후
        modoo_salesman 앱에 접근할 수 있습니다.
      </p>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">이메일 *</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@modoo.kr"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">전화</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-800">
          {error}
        </div>
      )}
      {done && (
        <div className="bg-green-50 border border-green-200 rounded-md p-2 text-xs text-green-800">
          {done}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-md disabled:opacity-50"
        >
          {submitting ? '발송 중...' : '초대 메일 발송'}
        </button>
      </div>
    </form>
  );
}
