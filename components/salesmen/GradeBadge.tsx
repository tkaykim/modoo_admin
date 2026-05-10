import type { GradeLevel } from '@/lib/salesmen';

const PALETTE: Record<GradeLevel, string> = {
  LV0: 'bg-slate-100 text-slate-700',
  LV1: 'bg-emerald-100 text-emerald-700',
  LV2: 'bg-emerald-100 text-emerald-800',
  LV3: 'bg-cyan-100 text-cyan-700',
  LV4: 'bg-cyan-100 text-cyan-800',
  LV5: 'bg-blue-100 text-blue-700',
  LV6: 'bg-blue-100 text-blue-800',
  LV7: 'bg-violet-100 text-violet-700',
  LV8: 'bg-violet-100 text-violet-800',
  LV9: 'bg-amber-100 text-amber-800',
  LV10: 'bg-yellow-100 text-yellow-900 font-semibold',
};

export default function GradeBadge({ grade, label }: { grade: string; label?: string }) {
  const cls = PALETTE[grade as GradeLevel] ?? 'bg-gray-100 text-gray-700';
  const text = label ?? grade.replace('LV', 'Lv.');
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${cls}`}>
      {text}
    </span>
  );
}
