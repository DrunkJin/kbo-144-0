import { useState } from "react";
import type { Player, Team } from "../types.ts";
import type { LeagueTable } from "../sim/leagueTable.ts";
import { wOBA, fip } from "../sim/runEstimator.ts";
import { TeamRating } from "./TeamRating.tsx";
import { posKR, statLine } from "./fmt.ts";

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}

function OrderList({
  title, hint, items, showStats, onReorder,
}: {
  title: string;
  hint: string;
  items: Player[];
  showStats: boolean;
  onReorder: (next: Player[]) => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>{title}</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>{hint}</p>
      <div className="order-list">
        {items.map((p, i) => (
          <div className="order-row" key={p.id}>
            <span className="order-num">{i + 1}</span>
            <span className="order-pos">{posKR(p.primaryPos)}</span>
            <span className="order-name">{p.name} <span className="muted">{p.season}</span></span>
            {showStats && <span className="order-stat muted">{statLine(p)}</span>}
            <span className="order-btns">
              <button className="btn secondary sm" disabled={i === 0} onClick={() => onReorder(move(items, i, i - 1))}>▲</button>
              <button className="btn secondary sm" disabled={i === items.length - 1} onClick={() => onReorder(move(items, i, i + 1))}>▼</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Arrange({
  team, showStats, table, onConfirm,
}: {
  team: Team;
  showStats: boolean;
  table?: LeagueTable;
  onConfirm: (ordered: Team) => void;
}) {
  // Sensible defaults: bat best hitters first, ace first in the rotation.
  const [lineup, setLineup] = useState<Player[]>(
    () => [...team.lineup].sort((a, b) => wOBA(b.bat ?? emptyBat()) - wOBA(a.bat ?? emptyBat())),
  );
  const [rotation, setRotation] = useState<Player[]>(
    () => [...team.rotation].sort((a, b) => fip(a.pit!) - fip(b.pit!)),
  );

  return (
    <div>
      <h1 style={{ fontSize: "1.4rem" }}>라인업 정렬</h1>
      <p className="sub">1번=출루·주루형, 3·4번=장타자처럼 역할에 맞게 배치하면 팀 OVR이 오릅니다.</p>

      {showStats && <TeamRating team={{ ...team, lineup, rotation }} table={table} />}

      <OrderList
        title="타순 (1~9번)"
        hint="1번타자가 가장 많은 타석에 들어섭니다 — 출루·장타 좋은 타자를 위로."
        items={lineup}
        showStats={showStats}
        onReorder={setLineup}
      />
      <OrderList
        title="선발 로테이션 (1~5선발)"
        hint="1선발(에이스)이 가장 많은 이닝을 던집니다."
        items={rotation}
        showStats={showStats}
        onReorder={setRotation}
      />

      <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
        <button className="btn big" onClick={() => onConfirm({ ...team, lineup, rotation })}>
          ⚾ 확정하고 시즌 시작
        </button>
      </div>
    </div>
  );
}

function emptyBat() {
  return { PA: 1, AB: 1, H: 0, d2B: 0, d3B: 0, HR: 0, BB: 0, HBP: 0, SO: 0, SB: 0 };
}
