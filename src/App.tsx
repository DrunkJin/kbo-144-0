import { useEffect, useMemo, useState } from "react";
import { FORMATS, type Player, type Team } from "./types.ts";
import {
  newDraft, placePlayer, eligibleSlots, canDraft, isComplete, draftToTeam,
  type DraftState, type WheelSegment,
} from "./draft/draft.ts";
import {
  loadMeta, loadSeason, loadSeasonRange, loadPrimeIndex,
  buildWheelSegments, buildLeagueForYear, resolvePrime, type PrimeIndex,
} from "./data/load.ts";
import { simulateLeague, type LeagueResult } from "./sim/season.ts";
import { mulberry32, hashSeed } from "./sim/rng.ts";
import { wOBA, fip, DEFAULT_LEAGUE, type LeagueConstants } from "./sim/runEstimator.ts";
import type { LeagueTable } from "./sim/leagueTable.ts";
import {
  type GameSettings, defaultSettings, rerollsFor, ratingsVisible,
} from "./settings.ts";
import { DraftBoard } from "./ui/DraftBoard.tsx";
import { Results } from "./ui/Results.tsx";
import { Settings } from "./ui/Settings.tsx";
import { SeasonPlay } from "./ui/SeasonPlay.tsx";
import { Arrange } from "./ui/Arrange.tsx";
import { TeamRating } from "./ui/TeamRating.tsx";
import { playerOVR } from "./sim/ratings.ts";
import { statLine, slotLabel, posKR, playerKind, playerKey } from "./ui/fmt.ts";

type Phase = "loading" | "settings" | "draft" | "arrange" | "season" | "result";

interface SeasonSetup {
  myTeam: ReturnType<typeof draftToTeam>;
  opponents: ReturnType<typeof buildLeagueForYear>;
  target: LeagueConstants;
  year: number;
  seed: number;
}

export function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [seasons, setSeasons] = useState<number[]>([]);
  const [leagueTable, setLeagueTable] = useState<LeagueTable>({});
  const [players, setPlayers] = useState<Player[]>([]); // loaded year range
  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [primeIndex, setPrimeIndex] = useState<PrimeIndex>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<GameSettings | null>(null);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [landed, setLanded] = useState<WheelSegment | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [pending, setPending] = useState<Player | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [rerolls, setRerolls] = useState(0);

  const [result, setResult] = useState<LeagueResult | null>(null);
  const [oppYear, setOppYear] = useState(0);
  const [seasonSetup, setSeasonSetup] = useState<SeasonSetup | null>(null);
  const [arrangeTeam, setArrangeTeam] = useState<Team | null>(null);

  useEffect(() => {
    loadMeta()
      .then(({ index, table }) => {
        setSeasons(index.seasons);
        setLeagueTable(table);
        setSettings(defaultSettings(index.minSeason, index.maxSeason));
        setPhase("settings");
      })
      .catch((e) => setError(String(e)));
  }, []);

  const showStats = settings ? ratingsVisible(settings) : true;
  const draftedKeys = useMemo(() => new Set((draft?.picks ?? []).map(playerKey)), [draft]);

  function resolve(p: Player): Player {
    return settings?.ratingBasis === "prime" ? resolvePrime(p, primeIndex) : p;
  }

  async function start() {
    if (!settings) return;
    setBusy(true);
    try {
      const range = await loadSeasonRange(settings.yearMin, settings.yearMax, seasons);
      if (settings.ratingBasis === "prime") setPrimeIndex(await loadPrimeIndex());
      setPlayers(range);
      setSegments(buildWheelSegments(range));
      setDraft(newDraft(FORMATS[settings.formatId]));
      setRerolls(rerollsFor(settings.difficulty));
      setLanded(null);
      setPending(null);
      setSelectedSlot(null);
      setResult(null);
      setPhase("draft");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function doSpin() {
    if (segments.length === 0) return;
    setSpinning(true);
    setLanded(null);
    const rng = mulberry32(hashSeed((draft?.picks.length ?? 0) + ":" + Math.floor(performance.now())));
    let ticks = 0;
    const id = setInterval(() => {
      setLanded(segments[Math.floor(rng() * segments.length)]);
      if (++ticks > 8) {
        clearInterval(id);
        setSpinning(false);
      }
    }, 60);
  }

  function reroll() {
    if (rerolls <= 0) return;
    setRerolls((r) => r - 1);
    doSpin();
  }

  function pick(player: Player) {
    if (!draft) return;
    if (draftedKeys.has(playerKey(player))) return; // already drafted this person
    if (settings?.draftMode === "position") {
      if (!selectedSlot) return;
      const slot = draft.format.slots.find((s) => s.key === selectedSlot);
      if (!slot || !player.eligiblePos.includes(slot.pos)) return;
      place(player, selectedSlot);
      return;
    }
    if (!canDraft(draft, player)) return;
    const slots = eligibleSlots(draft, player);
    if (slots.length === 1) place(player, slots[0].key);
    else setPending(player);
  }

  function place(player: Player, slotKey: string) {
    if (!draft) return;
    setDraft(placePlayer(draft, player, slotKey));
    setPending(null);
    setLanded(null);
    setSelectedSlot(null);
  }

  function toArrange() {
    if (!draft) return;
    setArrangeTeam(draftToTeam(draft, "내 드림팀"));
    setPhase("arrange");
  }

  async function startSeason(myTeam: Team) {
    if (!draft || !settings) return;
    setBusy(true);
    try {
    const rng = mulberry32(hashSeed(draft.picks.map((p) => p.id).join("|")));
    let year: number;
    let opponents: ReturnType<typeof buildLeagueForYear>;
    if (settings.opponentMode === "fixed") {
      year = settings.opponentYear;
      opponents = buildLeagueForYear(await loadSeason(year), year);
    } else {
      const yearsInRange = seasons.filter((y) => y >= settings.yearMin && y <= settings.yearMax);
      year = yearsInRange[0];
      opponents = [];
      for (let i = 0; i < 60; i++) {
        year = yearsInRange[Math.floor(rng() * yearsInRange.length)];
        opponents = buildLeagueForYear(players, year); // already loaded (in range)
        if (opponents.length >= 4) break;
      }
    }
    const seed = hashSeed(draft.picks.map((p) => p.id).join("|") + ":" + year);
    const target = leagueTable[year] ?? DEFAULT_LEAGUE;
    setOppYear(year);

    if (settings.seasonMode === "manager") {
      setSeasonSetup({ myTeam, opponents, target, year, seed });
      setPhase("season");
    } else {
      setResult(simulateLeague(myTeam, opponents, { totalGames: 144, seed, lg: target, table: leagueTable }));
      setPhase("result");
    }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <div className="app"><h1>로드 실패</h1><p className="muted">{error}</p><p className="muted">npm run ingest 를 먼저 실행했는지 확인하세요.</p></div>;
  }
  if (phase === "loading" || !settings) return <div className="app"><h1>불러오는 중…</h1></div>;

  const positionMode = settings.draftMode === "position";
  const selSlotObj = draft?.format.slots.find((s) => s.key === selectedSlot);

  // how many players on the landed club can actually be drafted right now
  const landedDraftable = landed && draft && !spinning
    ? landed.players.map(resolve).filter((p) => {
        if (draftedKeys.has(playerKey(p))) return false;
        if (positionMode) return selSlotObj ? p.eligiblePos.includes(selSlotObj.pos) : false;
        return canDraft(draft, p);
      }).length
    : 0;

  // If the landed club still has a pickable player, you MUST pick (or reroll) —
  // the main wheel is locked so re-spinning can't be a free reroll.
  const mustResolveLanded = !!landed && !spinning && landedDraftable > 0;
  const canSpin = !spinning && draft != null && !isComplete(draft)
    && !mustResolveLanded && (!positionMode || !!selectedSlot);

  return (
    <div className="app">
      {busy && <div className="busy-overlay">데이터 불러오는 중…</div>}
      <h1>1<span className="num">44</span>-0</h1>
      <p className="sub">KBO 역대 올타임 드래프트 · {seasons[0]}~{seasons[seasons.length - 1]} ({seasons.length}시즌)</p>

      {phase === "settings" && (
        <Settings
          seasonMin={seasons[0]}
          seasonMax={seasons[seasons.length - 1]}
          settings={settings}
          onChange={(patch) => setSettings({ ...settings, ...patch })}
          onStart={start}
        />
      )}

      {phase === "draft" && draft && (
        <div>
          <div className="wheel-area card">
            <div className="row" style={{ justifyContent: "center", alignItems: "center" }}>
              <button className="btn big" onClick={doSpin} disabled={!canSpin}>
                🎡 {spinning ? "돌리는 중…" : "휠 돌리기"}
              </button>
              {rerolls > 0 && landed && !spinning && (
                <button className="btn secondary" onClick={reroll}>🔄 리롤 ({rerolls})</button>
              )}
            </div>

            {positionMode && !selectedSlot && (
              <p className="hint">아래 로스터에서 채울 슬롯을 먼저 선택하세요</p>
            )}
            {positionMode && selSlotObj && (
              <p className="hint">선택한 슬롯: <b>{slotLabel(selSlotObj.key, selSlotObj.pos)}</b></p>
            )}

            {landed && (
              <div className="landed">
                <span className="season">{landed.season}</span> {landed.team}
              </div>
            )}
            {isComplete(draft) && (
              <div style={{ marginTop: 12 }}>
                <p className="muted">
                  로스터 완성! {settings.opponentMode === "fixed"
                    ? `${settings.opponentYear} 시즌 리그`
                    : `${settings.yearMin}~${settings.yearMax} 사이 랜덤 연도 리그`}와 144경기를 치릅니다.
                </p>
                <button className="btn big" onClick={toArrange}>⚾ 라인업 정렬 →</button>
              </div>
            )}
          </div>

          {landed && !spinning && (
            <div>
              <h2 className="section-title">{landed.season} {landed.team} — 선수 선택</h2>
              <PlayerGrid
                segment={landed}
                resolve={resolve}
                showStats={showStats}
                table={leagueTable}
                eligibleFor={positionMode && selSlotObj ? selSlotObj.pos : null}
                draftableCheck={(p) =>
                  !draftedKeys.has(playerKey(p)) && (positionMode ? true : canDraft(draft, p))}
                drafted={(p) => draftedKeys.has(playerKey(p))}
                onPick={pick}
              />
            </div>
          )}

          <h2 className="section-title">
            내 로스터 ({draft.picks.length}/{draft.format.slots.length})
            {positionMode && <span className="muted" style={{ fontSize: "0.85rem", fontWeight: 400 }}> · 슬롯을 눌러 선택</span>}
          </h2>
          {showStats && <TeamRating team={draftToTeam(draft, "내 드림팀")} table={leagueTable} />}
          <DraftBoard
            draft={draft}
            selectedKey={selectedSlot}
            onSelectSlot={positionMode ? (k) => { setSelectedSlot(k); setLanded(null); } : undefined}
          />

          {pending && (
            <div className="modal-overlay" onClick={() => setPending(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3 style={{ marginTop: 0 }}>
                  {pending.name} <span className="muted">({pending.season} {pending.team})</span>
                </h3>
                <p className="muted">어느 슬롯에 넣을까요?</p>
                <div className="slot-choices">
                  {eligibleSlots(draft, pending).map((sl) => (
                    <button key={sl.key} className="btn secondary" onClick={() => place(pending, sl.key)}>
                      {slotLabel(sl.key, sl.pos)}
                    </button>
                  ))}
                </div>
                <button className="btn secondary" style={{ marginTop: 14 }} onClick={() => setPending(null)}>취소</button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "arrange" && arrangeTeam && (
        <Arrange team={arrangeTeam} showStats={showStats} onConfirm={startSeason} />
      )}

      {phase === "season" && seasonSetup && (
        <SeasonPlay
          myTeam={seasonSetup.myTeam}
          opponents={seasonSetup.opponents}
          target={seasonSetup.target}
          table={leagueTable}
          seed={seasonSetup.seed}
          difficulty={settings.difficulty}
          onFinish={(r) => { setResult(r); setPhase("result"); }}
        />
      )}

      {phase === "result" && result && (
        <Results result={result} opponentYear={oppYear} onRestart={() => { setSeasonSetup(null); setArrangeTeam(null); setPhase("settings"); }} />
      )}
    </div>
  );
}

function score(p: Player): number {
  if (p.bat && p.bat.PA > 0) return wOBA(p.bat);
  if (p.pit && p.pit.IP > 0) return 1 - fip(p.pit) / 10;
  return 0;
}

function PlayerGrid({
  segment, resolve, showStats, table, eligibleFor, draftableCheck, drafted, onPick,
}: {
  segment: WheelSegment;
  resolve: (p: Player) => Player;
  showStats: boolean;
  table: import("./sim/leagueTable.ts").LeagueTable;
  eligibleFor: Player["primaryPos"] | null;
  draftableCheck: (p: Player) => boolean;
  drafted: (p: Player) => boolean;
  onPick: (p: Player) => void;
}) {
  const list = segment.players
    .map(resolve)
    .filter((p) => (eligibleFor ? p.eligiblePos.includes(eligibleFor) : true))
    .sort((a, b) => score(b) - score(a));

  if (eligibleFor && list.length === 0) {
    return <p className="hint danger">이 구단엔 해당 포지션 선수가 없습니다 — 휠을 다시 돌리거나 리롤하세요.</p>;
  }

  return (
    <div className="players">
      {list.map((p) => {
        const ok = draftableCheck(p);
        const kind = playerKind(p);
        return (
          <button
            key={p.id}
            className={`player kind-${kind} rarity-${showStats ? (p.rarity ?? "common") : "common"} ${ok ? "" : "disabled"}`}
            onClick={() => onPick(p)}
            disabled={!ok}
          >
            <div className="name">
              {p.name}
              {showStats && <span className={`ovr-badge ${kind}`}>{playerOVR(p, table)}</span>}
            </div>
            <div className="badges">
              <span className={`pos-badge ${kind}`}>{posKR(p.primaryPos)}</span>
              {p.primeSeason && <span className="prime-badge">전성기 {p.primeSeason}</span>}
              {drafted(p) && <span className="drafted-badge">✓ 선택됨</span>}
            </div>
            {showStats && <div className="stat">{statLine(p)}</div>}
            {showStats && <div className="meta">WAR {p.war ?? "—"}</div>}
          </button>
        );
      })}
    </div>
  );
}
