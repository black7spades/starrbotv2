import { useState } from "react";
import Icon from "./Icon";

/**
 * Editor for a plain list of strings — the welcome phrase pool.
 *
 * Without this the Playground could only show that an array existed; adding,
 * editing and deleting entries meant using the slash commands. The same pool is
 * editable from either place.
 */
export default function StringListField({
  label,
  description,
  value,
  onChange,
  placeholder,
  maxLength = 500,
  hint,
}: {
  label: string;
  description?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxLength?: number;
  hint?: React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [editingAt, setEditingAt] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const items = Array.isArray(value) ? value : [];

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (items.some((i) => i.trim() === trimmed)) {
      setDraft("");
      return;
    }
    onChange([...items, trimmed]);
    setDraft("");
  };

  const commitEdit = () => {
    if (editingAt === null) return;
    const trimmed = editDraft.trim();
    if (trimmed) {
      const next = [...items];
      next[editingAt] = trimmed;
      onChange(next);
    }
    setEditingAt(null);
    setEditDraft("");
  };

  return (
    <div>
      <span className="label">{label}</span>
      {description && <p className="text-[11px] mb-1.5 text-ink-faint">{description}</p>}

      <ul className="space-y-1.5 mb-2">
        {items.length === 0 && (
          <li className="text-xs text-ink-faint">Empty — nobody would be greeted.</li>
        )}
        {items.map((item, i) => (
          <li key={`${i}-${item.slice(0, 12)}`} className="glass flex items-start gap-2 px-2.5 py-2">
            <span className="text-[10px] display mt-0.5 shrink-0 text-ink-faint">{i + 1}</span>

            {editingAt === i ? (
              <input
                className="field !py-1 flex-1"
                value={editDraft}
                maxLength={maxLength}
                autoFocus
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setEditingAt(null);
                }}
                onBlur={commitEdit}
              />
            ) : (
              <span className="flex-1 text-sm break-words text-ink">{item}</span>
            )}

            <button
              className="btn-ghost !px-1.5 !py-1 shrink-0"
              aria-label={`Edit phrase ${i + 1}`}
              onClick={() => {
                setEditingAt(i);
                setEditDraft(item);
              }}
            >
              <Icon name="key" size={13} />
            </button>
            <button
              className="btn-ghost !px-1.5 !py-1 shrink-0"
              aria-label={`Delete phrase ${i + 1}`}
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            >
              <Icon name="trash" size={13} />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-1.5">
        <input
          className="field"
          value={draft}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button className="btn-secondary shrink-0" onClick={add} disabled={!draft.trim()}>
          <Icon name="plus" size={14} />
          Add
        </button>
      </div>

      {hint && <div className="text-[11px] mt-1.5 text-ink-faint">{hint}</div>}
    </div>
  );
}
