import type { Team } from "../types.ts";
import type { LeagueLookup } from "../sim/runEstimator.ts";
import { teamRatings } from "../sim/ratings.ts";

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rating">
      <div className="rating-head">
        <span>{label}</span>
        <span className="rating-val" style={{ color }}>{value}</span>
      </div>
      <div className="bar"><div style={{ width: `${value}%`, background: color }} /></div>
    </div>
  );
}

export function TeamRating({ team, table }: { team: Team; table?: LeagueLookup }) {
  const r = teamRatings(team, table);
  return (
    <div className="card team-rating">
      <Bar label="공격" value={r.offense} color="var(--accent)" />
      <Bar label="수비/투수" value={r.defense} color="var(--accent2)" />
      <Bar label="종합" value={r.overall} color="var(--gold)" />
    </div>
  );
}
