import { useMemo, useState } from "react";
import type { Player, Team } from "../types.ts";
import type { LeagueTable } from "../sim/leagueTable.ts";
import { wOBA, fip, type LeagueConstants } from "../sim/runEstimator.ts";
import { rankDistribution } from "../sim/season.ts";
import { TeamRating } from "./TeamRating.tsx";
import { posKR, statLine } from "./fmt.ts";

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}

// 각 타순이 원하는 역할 (사용자 정의 정통 타순 이론)
const LINEUP_ROLES = [
  "출루·주루", "작전·출루", "정확도·주루", "중심·장타", "찬스·장타",
  "한방", "해결사", "수비형", "제2의 1번",
];

function OrderList({
  title, hint, items, showStats, roles, onReorder,
}: {
  title: string;
  hint: string;
  items: Player[];
  showStats: boolean;
  roles?: string[];
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
            {roles && <span className="order-role">{roles[i] ?? ""}</span>}
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
  team, showStats, table, opponents, target, oppBoost, opponentYear, onConfirm,
}: {
  team: Team;
  showStats: boolean;
  table?: LeagueTable;
  opponents: Team[];
  target: LeagueConstants;
  oppBoost: number;
  opponentYear: number;
  onConfirm: (ordered: Team) => void;
}) {
  // Sensible defaults: bat best hitters first, ace first in the rotation.
  const [lineup, setLineup] = useState<Player[]>(
    () => [...team.lineup].sort((a, b) => wOBA(b.bat ?? emptyBat()) - wOBA(a.bat ?? emptyBat())),
  );
  const [rotation, setRotation] = useState<Player[]>(
    () => [...team.rotation].sort((a, b) => fip(a.pit!) - fip(b.pit!)),
  );

  const odds = useMemo(
    () => (showStats
      ? rankDistribution({ ...team, lineup, rotation }, opponents,
          { totalGames: 144, lg: target, table, oppBoost }, 700)
      : null),
    [lineup, rotation, opponents, target, table, oppBoost, showStats, team],
  );
  const top3 = odds ? odds.rankProb[0] + (odds.rankProb[1] ?? 0) + (odds.rankProb[2] ?? 0) : 0;

  return (
    <div>
      <h1 style={{ fontSize: "1.4rem" }}>라인업 정렬</h1>
      <p className="sub">1번=출루·주루형, 3·4번=장타자처럼 역할에 맞게 배치하면 팀 OVR과 우승 확률이 오릅니다.</p>

      {odds && (
        <div className="card odds">
          <div className="muted" style={{ marginBottom: 8 }}>vs {opponentYear} 리그 · 예상 순위 (현재 라인업 기준)</div>
          <div className="odds-row">
            <div><div className="muted">우승</div><b className="perfect">{(odds.rankProb[0] * 100).toFixed(0)}%</b></div>
            <div><div className="muted">3위 이내</div><b>{(top3 * 100).toFixed(0)}%</b></div>
            <div><div className="muted">예상 순위</div><b>{odds.expRank.toFixed(1)}위</b></div>
            <div><div className="muted">예상 승수</div><b>{odds.expWins.toFixed(0)}승</b></div>
          </div>
          <div className="odds-bars">
            {odds.rankProb.map((p, i) => (
              <div className="odds-bar" key={i} title={`${i + 1}위 ${(p * 100).toFixed(0)}%`}>
                <div className="odds-fill" style={{ height: `${Math.max(2, p * 100)}%` }} />
                <span>{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showStats && <TeamRating team={{ ...team, lineup, rotation }} table={table} />}

      <OrderList
        title="타순 (1~9번)"
        hint="각 타순의 역할에 맞는 선수를 배치하세요 — 맞을수록 팀 공격 OVR이 오릅니다."
        items={lineup}
        showStats={showStats}
        roles={LINEUP_ROLES}
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
