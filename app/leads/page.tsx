import LeadsWorkspace from '@/components/leads/LeadsWorkspace';

export default function LeadsPage() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">리드 관리</h2>
        <p className="text-sm text-gray-500">잠재 단체·담당자 DB. 자사 문의 인바운드부터 수집·아웃리치까지 관리합니다.</p>
      </div>
      <LeadsWorkspace />
    </div>
  );
}
