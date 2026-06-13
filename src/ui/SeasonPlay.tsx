import { useMemo, useRef, useState } from "react";
import type { Team } from "../types.ts";
import type { LeagueConstants, LeagueLookup } from "../sim/runEstimator.ts";
import {
  teamProbs, simSeries, leagueGamesPerPair, simulateOpponentRoundRobin, buildStandings,
  type OpponentResult, type LeagueResult,
} from "../sim/season.ts";
import { mulberry32 } from "../sim/rng.ts";
import { TACTICS, tacticUsesFor } from "../tactics.ts";

const clamp = (p: number) => Math.min(0.999, Math.max(0.001, p));

export function SeasonPlay({
  myTeam, opponents, target, table, seed, difficulty, oppBoost = 0, totalGames = 144, onFinish,
}: {
  myTeam: Team;
  opponents: Team[];
  target: LeagueConstants;
  table: LeagueLookup;
  seed: number;
  difficulty: "easy" | "normal" | "hard";
  oppBoost?: number;
  totalGames?: number;
  onFinish: (result: LeagueResult) => void;
}) {
  const { me, opps } = useMemo(() => teamProbs(myTeam, opponents, target, table, oppBoost), [myTeam, opponents, target, table, oppBoost]);
  const gamesPerPair = leagueGamesPerPair(opponents.length, totalGames);
  const rngRef = useRef<() => number>();
  if (!rngRef.current) rngRef.current = mulberry32(seed);

  const [idx, setIdx] = useState(0);
  const [myVs, setMyVs] = useState<OpponentResult[]>([]);
  const [uses, setUses] = useState<Record<string, number>>(() => tacticUsesFor(difficulty));
  const [nextDelta, setNextDelta] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [last, setLast] = useState<{ name: string; wins: number; losses: number } | null>(null);

  const totalW = myVs.reduce((s, v) => s + v.wins, 0);
  const totalL = myVs.reduce((s, v) => s + v.losses, 0);
  const done = idx >= opps.length;
  const cur = done ? null : opps[idx];

  const tactic = chosen ? TACTICS.find((t) => t.id === chosen) : null;
  const effProb = cur ? clamp(cur.prob + nextDelta + (tactic?.thisDelta ?? 0)) : 0;

  function playSeries() {
    if (!cur) return;
    const r = simSeries(effProb, gamesPerPair, rngRef.current!);
    const result: OpponentResult = { name: cur.name, wins: r.wins, losses: r.losses, winProbPerGame: effProb };
    const newVs = [...myVs, result];
    setMyVs(newVs);
    setLast({ name: cur.name, wins: r.wins, losses: r.losses });
    if (tactic) setUses((u) => ({ ...u, [tactic.id]: u[tactic.id] - 1 }));
    setNextDelta(tactic?.nextDelta ?? 0);
    setChosen(null);
    setIdx((i) => i + 1);
  }

  function finish() {
    const oppRR = simulateOpponentRoundRobin(opps, gamesPerPair, rngRef.current!);
    const { standings, myRank } = buildStandings(myVs, oppRR);
    const wins = totalW;
    const losses = totalL;
    const games = wins + losses;
    onFinish({
      wins, losses, games,
      winPct: games ? wins / games : 0,
      perfect: losses === 0,
      myRsPerGame: me.rsPerGame, myRaPerGame: me.raPerGame, myPythagWinPct: me.pythagWinPct,
      vs: myVs, standings, myRank, gamesPerPair,
    });
  }

  return (
    <div>
      <div className="card" style={{ textAlign: "center" }}>
        <div className="muted">시즌 진행</div>
        <div style={{ fontSize: "2rem", fontWeight: 900 }}>
          {totalW}<span className="muted">–</span>{totalL}
          {totalL === 0 && totalW > 0 && <span className="perfect"> 🔥 무패행진</span>}
        </div>
        <div className="muted">시리즈 {Math.min(idx, opps.length)}/{opps.length} · 상대당 {gamesPerPair}경기</div>
      </div>

      {last && (
        <p className="hint">
          최근: <b>{last.name}</b> 상대 {last.wins}승 {last.losses}패
          {last.losses === 0 ? " — 스윕! 🧹" : ""}
        </p>
      )}

      {!done && cur && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            다음 시리즈 — vs <span className="season">{cur.name}</span> ({gamesPerPair}경기)
          </h2>
          {nextDelta !== 0 && (
            <p className="muted">
              지난 시리즈 여파 — {nextDelta > 0 ? "🔋 재정비로 컨디션 상승" : "💨 피로 누적으로 컨디션 하락"}
            </p>
          )}

          <div className="tactics">
            <button className={`tactic ${chosen === null ? "active" : ""}`} onClick={() => setChosen(null)}>
              <div className="t-icon">—</div>
              <div className="t-label">전략 없음</div>
              <div className="t-desc">기본 운영</div>
            </button>
            {TACTICS.map((t) => {
              const left = uses[t.id] ?? 0;
              const disabled = left <= 0;
              return (
                <button
                  key={t.id}
                  className={`tactic ${chosen === t.id ? "active" : ""} ${disabled ? "disabled" : ""}`}
                  disabled={disabled}
                  onClick={() => setChosen(t.id)}
                >
                  <div className="t-icon">{t.icon}</div>
                  <div className="t-label">{t.label} <span className="muted">×{left}</span></div>
                  <div className="t-desc">{t.desc}</div>
                </button>
              );
            })}
          </div>

          <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
            <button className="btn big" onClick={playSeries}>▶ 시리즈 진행</button>
          </div>
        </div>
      )}

      {done && (
        <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
          <button className="btn big" onClick={finish}>📊 시즌 결과 보기</button>
        </div>
      )}
    </div>
  );
}
