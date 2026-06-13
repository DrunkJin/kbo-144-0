import { FORMATS } from "../types.ts";
import {
  type GameSettings, type Difficulty, DIFFICULTY_INFO, ERA_PRESETS, rerollsFor,
} from "../settings.ts";

function OptionCard({
  active, title, sub, onClick, accent,
}: {
  active: boolean; title: string; sub?: string; onClick: () => void; accent?: string;
}) {
  return (
    <div
      className={`opt-card ${active ? "active" : ""}`}
      style={active && accent ? { borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}` } : undefined}
      onClick={onClick}
    >
      <div className="opt-title">{title}</div>
      {sub && <div className="opt-sub">{sub}</div>}
    </div>
  );
}

export function Settings({
  seasonMin, seasonMax, settings, onChange, onStart,
}: {
  seasonMin: number;
  seasonMax: number;
  settings: GameSettings;
  onChange: (patch: Partial<GameSettings>) => void;
  onStart: () => void;
}) {
  const s = settings;
  const ratingsForced = s.difficulty === "hard";

  return (
    <div className="settings">
      {/* 로스터 구성 (formation analog) */}
      <h2 className="section-title">로스터 구성</h2>
      <div className="opt-grid">
        {Object.values(FORMATS).map((f) => (
          <OptionCard
            key={f.id}
            active={s.formatId === f.id}
            title={f.label.split("—")[0].trim()}
            sub={f.label.split("—")[1]?.trim()}
            accent="var(--accent)"
            onClick={() => onChange({ formatId: f.id })}
          />
        ))}
      </div>

      {/* 난이도 */}
      <h2 className="section-title">난이도</h2>
      <div className="opt-grid cols-3">
        {(Object.keys(DIFFICULTY_INFO) as Difficulty[]).map((d) => (
          <OptionCard
            key={d}
            active={s.difficulty === d}
            title={DIFFICULTY_INFO[d].label}
            sub={DIFFICULTY_INFO[d].desc}
            accent={d === "hard" ? "var(--gold)" : "var(--accent)"}
            onClick={() => onChange({ difficulty: d })}
          />
        ))}
      </div>

      {/* 스탯 표시 */}
      <h2 className="section-title">스탯 표시</h2>
      <div className="opt-grid">
        <OptionCard
          active={!ratingsForced && s.showRatings}
          title="ON"
          sub="선수 스탯 표시"
          accent="var(--accent)"
          onClick={() => onChange({ showRatings: true })}
        />
        <OptionCard
          active={ratingsForced || !s.showRatings}
          title="OFF"
          sub="블라인드 모드 — 감으로 승부"
          accent="var(--accent2)"
          onClick={() => onChange({ showRatings: false })}
        />
      </div>
      {ratingsForced && <p className="hint danger">하드 난이도에서는 스탯이 항상 숨겨집니다</p>}

      {/* 드래프트 모드 */}
      <h2 className="section-title">드래프트 모드</h2>
      <div className="opt-grid">
        <OptionCard
          active={s.draftMode === "squad"}
          title="스쿼드 우선"
          sub="구단을 뽑고, 아무 선수나 골라 포지션 배치"
          accent="var(--accent)"
          onClick={() => onChange({ draftMode: "squad" })}
        />
        <OptionCard
          active={s.draftMode === "position"}
          title="포지션 우선"
          sub="슬롯을 먼저 정하고, 휠을 돌려 채우기"
          accent="var(--accent)"
          onClick={() => onChange({ draftMode: "position" })}
        />
      </div>

      {/* 선수 스탯 기준 */}
      <h2 className="section-title">선수 스탯 기준</h2>
      <div className="opt-grid">
        <OptionCard
          active={s.ratingBasis === "season"}
          title="해당 시즌"
          sub="뽑은 그 시즌 그대로의 성적"
          accent="var(--accent)"
          onClick={() => onChange({ ratingBasis: "season" })}
        />
        <OptionCard
          active={s.ratingBasis === "prime"}
          title="전성기 모드"
          sub="모든 선수를 통산 최고 시즌 성적으로"
          accent="var(--accent2)"
          onClick={() => onChange({ ratingBasis: "prime" })}
        />
      </div>

      {/* 시즌 진행 방식 */}
      <h2 className="section-title">시즌 진행 방식</h2>
      <div className="opt-grid">
        <OptionCard
          active={s.seasonMode === "manager"}
          title="감독 모드"
          sub="시리즈별 진행 · 전략 토큰으로 승부 개입"
          accent="var(--accent)"
          onClick={() => onChange({ seasonMode: "manager" })}
        />
        <OptionCard
          active={s.seasonMode === "instant"}
          title="즉시 시뮬"
          sub="144경기를 한 번에 시뮬"
          accent="var(--accent2)"
          onClick={() => onChange({ seasonMode: "instant" })}
        />
      </div>

      {/* 상대 리그 */}
      <h2 className="section-title">상대 리그</h2>
      <div className="opt-grid">
        <OptionCard
          active={s.opponentMode === "random"}
          title="랜덤 시즌"
          sub="시대 범위 안에서 무작위 연도의 팀들과 대결"
          accent="var(--accent)"
          onClick={() => onChange({ opponentMode: "random" })}
        />
        <OptionCard
          active={s.opponentMode === "fixed"}
          title="연도 지정"
          sub="내가 고른 연도의 팀들과 대결"
          accent="var(--accent2)"
          onClick={() => onChange({ opponentMode: "fixed" })}
        />
      </div>
      {s.opponentMode === "fixed" && (
        <div className="year-range card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">상대 연도</span>
            <span style={{ fontWeight: 800 }}>{s.opponentYear}</span>
          </div>
          <label className="rng">
            <input
              type="range" min={seasonMin} max={seasonMax} value={s.opponentYear}
              onChange={(e) => onChange({ opponentYear: +e.target.value })}
            />
          </label>
        </div>
      )}

      {/* 시대 (년도 범위) */}
      <h2 className="section-title">시대</h2>
      <div className="opt-grid cols-4">
        {ERA_PRESETS.map((e) => (
          <OptionCard
            key={e.label}
            active={s.yearMin === e.from && s.yearMax === seasonMax}
            title={e.label}
            accent="var(--accent)"
            onClick={() => onChange({ yearMin: e.from, yearMax: seasonMax })}
          />
        ))}
      </div>
      <div className="year-range card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="muted">시작 {s.yearMin}</span>
          <span className="muted">끝 {s.yearMax}</span>
        </div>
        <label className="rng">
          시작 연도
          <input
            type="range" min={seasonMin} max={seasonMax} value={s.yearMin}
            onChange={(e) => onChange({ yearMin: Math.min(+e.target.value, s.yearMax) })}
          />
        </label>
        <label className="rng">
          끝 연도
          <input
            type="range" min={seasonMin} max={seasonMax} value={s.yearMax}
            onChange={(e) => onChange({ yearMax: Math.max(+e.target.value, s.yearMin) })}
          />
        </label>
      </div>

      <div className="row" style={{ justifyContent: "center", marginTop: 28 }}>
        <button className="btn big" onClick={onStart}>
          🎬 드래프트 시작 · 리롤 {rerollsFor(s.difficulty)}회
        </button>
      </div>
    </div>
  );
}
