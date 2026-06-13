import type { DraftState } from "../draft/draft.ts";
import { slotLabel } from "./fmt.ts";

export function DraftBoard({
  draft, selectedKey, onSelectSlot,
}: {
  draft: DraftState;
  selectedKey?: string | null;
  onSelectSlot?: (key: string) => void;
}) {
  return (
    <div className="card">
      <div className="board">
        {draft.format.slots.map((slot) => {
          const p = draft.filled[slot.key];
          const selectable = !!onSelectSlot && !p;
          const selected = selectedKey === slot.key;
          return (
            <div
              key={slot.key}
              className={`slot ${p ? "filled" : ""} ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}`}
              onClick={selectable ? () => onSelectSlot!(slot.key) : undefined}
            >
              <div className="pos">{slotLabel(slot.key, slot.pos)}</div>
              {p ? (
                <>
                  <div className="pname">{p.name}</div>
                  <div className="psub">{p.season} {p.team}</div>
                </>
              ) : (
                <div className="psub">{selectable ? "선택 →" : "비어있음"}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
