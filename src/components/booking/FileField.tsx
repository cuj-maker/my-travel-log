import { FileText, Paperclip, X } from 'lucide-react';
import { getFile } from '@/services/bookingService';
import { ID } from '@/types/models';

export interface FileDraft { keep: ID[]; add: File[] }

/** Attach / remove confirmation files (PDF or image). Saved by the parent on submit. */
export default function FileField({ value, onChange }: { value: FileDraft; onChange: (v: FileDraft) => void }) {
  return (
    <div>
      <label className="field-label">예약 확인서 (PDF · 이미지)</label>
      <ul className="mb-2 space-y-1.5">
        {value.keep.map((id) => {
          const f = getFile(id);
          if (!f) return null;
          return (
            <li key={id} className="flex items-center gap-2 rounded-lg bg-cream px-3 py-2 text-sm">
              <FileText size={14} className="text-olive" />
              <a href={f.dataUrl} download={f.name} className="flex-1 truncate hover:underline">{f.name}</a>
              <button type="button" aria-label="첨부 삭제" onClick={() => onChange({ ...value, keep: value.keep.filter((x) => x !== id) })}><X size={14} /></button>
            </li>
          );
        })}
        {value.add.map((f, i) => (
          <li key={i} className="flex items-center gap-2 rounded-lg bg-olive-light px-3 py-2 text-sm">
            <Paperclip size={14} /><span className="flex-1 truncate">{f.name} <span className="text-xs text-charcoal-mute">(저장 시 첨부)</span></span>
            <button type="button" aria-label="첨부 취소" onClick={() => onChange({ ...value, add: value.add.filter((_, j) => j !== i) })}><X size={14} /></button>
          </li>
        ))}
      </ul>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-beige-dark px-4 py-2 text-xs text-charcoal-soft hover:bg-beige/50">
        <Paperclip size={14} /> 파일 추가
        <input type="file" accept="application/pdf,image/*" multiple className="hidden"
          onChange={(e) => { onChange({ ...value, add: [...value.add, ...Array.from(e.target.files ?? [])] }); e.target.value = ''; }} />
      </label>
    </div>
  );
}
