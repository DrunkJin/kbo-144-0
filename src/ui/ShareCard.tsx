import { useEffect, useRef, useState } from "react";
import type { LeagueResult } from "../sim/season.ts";

const W = 1080;
const H = 1350;
const KR_FONT = '"Malgun Gothic", system-ui, sans-serif';

function draw(ctx: CanvasRenderingContext2D, r: LeagueResult, year: number) {
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, W, H);

  // header
  ctx.textAlign = "center";
  ctx.fillStyle = "#e8e8f0";
  ctx.font = `900 96px ${KR_FONT}`;
  ctx.fillText("1", W / 2 - 92, 150);
  ctx.fillStyle = "#4ade80";
  ctx.fillText("44", W / 2 + 8, 150);
  ctx.fillStyle = "#e8e8f0";
  ctx.fillText("-0", W / 2 + 120, 150);
  ctx.fillStyle = "#8a8aa0";
  ctx.font = `400 34px ${KR_FONT}`;
  ctx.fillText("KBO 올타임 드래프트", W / 2, 205);

  // record
  ctx.fillStyle = r.perfect ? "#fbbf24" : "#e8e8f0";
  ctx.font = `900 200px ${KR_FONT}`;
  ctx.fillText(`${r.wins}–${r.losses}`, W / 2, 430);

  if (r.perfect) {
    ctx.fillStyle = "#fbbf24";
    ctx.font = `800 56px ${KR_FONT}`;
    ctx.fillText("🏆 PERFECT SEASON", W / 2, 510);
  } else {
    ctx.fillStyle = "#8a8aa0";
    ctx.font = `500 40px ${KR_FONT}`;
    ctx.fillText(`승률 ${(r.winPct * 100).toFixed(1)}%`, W / 2, 505);
  }
  ctx.fillStyle = "#38bdf8";
  ctx.font = `600 40px ${KR_FONT}`;
  ctx.fillText(`vs ${year} 시즌 리그 · ${r.myRank}위 / ${r.standings.length}팀`, W / 2, 575);

  // stat strip
  const stats: [string, string][] = [
    ["득점/경기", r.myRsPerGame.toFixed(2)],
    ["실점/경기", r.myRaPerGame.toFixed(2)],
    ["피타고리안", `${(r.myPythagWinPct * 100).toFixed(0)}%`],
  ];
  const sw = 300;
  const x0 = W / 2 - sw;
  stats.forEach(([label, val], i) => {
    const cx = x0 + i * sw;
    ctx.fillStyle = "#8a8aa0";
    ctx.font = `400 30px ${KR_FONT}`;
    ctx.fillText(label, cx, 660);
    ctx.fillStyle = "#e8e8f0";
    ctx.font = `800 54px ${KR_FONT}`;
    ctx.fillText(val, cx, 720);
  });

  // standings
  ctx.textAlign = "left";
  ctx.fillStyle = "#e8e8f0";
  ctx.font = `700 40px ${KR_FONT}`;
  ctx.fillText("리그 순위", 90, 810);

  const rows = r.standings.slice(0, 10);
  const top = 850;
  const rowH = 46;
  rows.forEach((t, i) => {
    const y = top + i * rowH;
    if (t.isMe) {
      ctx.fillStyle = "rgba(74,222,128,0.16)";
      ctx.fillRect(70, y - 2, W - 140, rowH - 6);
    }
    ctx.fillStyle = t.isMe ? "#4ade80" : "#c8c8d8";
    ctx.font = `${t.isMe ? 700 : 400} 34px ${KR_FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(`${i + 1}. ${t.name}`, 100, y + 30);
    ctx.textAlign = "right";
    ctx.fillText(`${t.wins}–${t.losses}`, W - 100, y + 30);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#8a8aa0";
  ctx.font = `400 30px ${KR_FONT}`;
  ctx.fillText("144-0 · KBO All-Time Draft", W / 2, H - 40);
}

export function ShareCard({ result, year }: { result: LeagueResult; year: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (ctx) draw(ctx, result, year);
  }, [result, year]);

  function withBlob(cb: (blob: Blob) => void) {
    canvasRef.current?.toBlob((b) => b && cb(b), "image/png");
  }

  function download() {
    withBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `144-0_${result.wins}-${result.losses}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("이미지를 저장했습니다");
    });
  }

  async function share() {
    withBlob(async (blob) => {
      const file = new File([blob], "144-0.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: "144-0", text: `${result.wins}-${result.losses} · ${result.myRank}위` });
          setMsg("공유했습니다");
        } catch { /* user cancelled */ }
      } else {
        download();
      }
    });
  }

  async function copy() {
    withBlob(async (blob) => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setMsg("클립보드에 복사했습니다");
      } catch {
        setMsg("이 브라우저는 복사를 지원하지 않습니다 — 저장을 이용하세요");
      }
    });
  }

  return (
    <div className="share">
      <canvas ref={canvasRef} width={W} height={H} className="share-canvas" />
      <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
        <button className="btn" onClick={download}>💾 이미지 저장</button>
        <button className="btn secondary" onClick={share}>📤 공유</button>
        <button className="btn secondary" onClick={copy}>📋 복사</button>
      </div>
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}
