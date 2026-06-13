import type { LeagueResult } from "../sim/season.ts";
import { ShareCard } from "./ShareCard.tsx";

export function Results({
  result, opponentYear, onRestart,
}: {
  result: LeagueResult;
  teamName?: string;
  opponentYear: number;
  onRestart: () => void;
}) {
  return (
    <div>
      <div className={`bigrecord ${result.perfect ? "perfect" : ""}`}>
        {result.wins}–{result.losses}
      </div>
      <p className="sub" style={{ textAlign: "center" }}>
        {result.perfect ? "🏆 퍼펙트 시즌 달성! 144-0!" : `승률 ${(result.winPct * 100).toFixed(1)}%`}
        {" · "}vs {opponentYear} 시즌 리그 · <b>{result.myRank}위 / {result.standings.length}팀</b>
      </p>

      <div className="row" style={{ justifyContent: "center", margin: "8px 0 20px" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <div className="muted">득점/경기</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>{result.myRsPerGame.toFixed(2)}</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div className="muted">실점/경기</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>{result.myRaPerGame.toFixed(2)}</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div className="muted">피타고리안 승률</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>{(result.myPythagWinPct * 100).toFixed(1)}%</div>
        </div>
      </div>

      <h2 className="section-title">리그 순위</h2>
      <table className="vs-table">
        <thead>
          <tr><th>순위</th><th>팀</th><th>승</th><th>패</th><th>승률</th></tr>
        </thead>
        <tbody>
          {result.standings.map((t, i) => (
            <tr key={t.name} className={t.isMe ? "me-row" : ""}>
              <td>{i + 1}</td>
              <td>{t.isMe ? `★ ${t.name}` : t.name}</td>
              <td>{t.wins}</td>
              <td>{t.losses}</td>
              <td>{t.winPct.toFixed(3).replace(/^0/, "")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="section-title">공유 카드</h2>
      <ShareCard result={result} year={opponentYear} />

      <details style={{ marginTop: 20 }}>
        <summary className="muted" style={{ cursor: "pointer" }}>상대별 전적 보기</summary>
        <table className="vs-table">
          <tbody>
            {result.vs.map((o) => (
              <tr key={o.name}>
                <td>{o.name}</td>
                <td>{o.wins}–{o.losses}</td>
                <td>
                  <div className="bar"><div style={{ width: `${o.winProbPerGame * 100}%` }} /></div>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>{(o.winProbPerGame * 100).toFixed(1)}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <div className="row" style={{ justifyContent: "center", marginTop: 24 }}>
        <button className="btn big" onClick={onRestart}>다시 도전</button>
      </div>
    </div>
  );
}
