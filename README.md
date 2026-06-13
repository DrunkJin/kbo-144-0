# 144-0 — KBO 올타임 드래프트

KBO 역대 모든 시즌(1982~2025)에서 드림 로스터를 드래프트하고 144경기를 시뮬레이션해 무패 시즌(144-0)에 도전하는 무료 웹 게임. [38-0.app](https://38-0.app)에서 영감.

휠 돌리기 → 선수 드래프트 → 라인업 정렬 → 감독 모드 시즌 진행 → 결과/공유 카드.

## 개발
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 생성
npm run preview  # 빌드 결과 미리보기
```
Node 22.6+ 필요 (TS를 `--experimental-strip-types`로 직접 실행).

## 데이터
- 원본: Kaggle KBO 데이터셋 (1982~2025). `data/raw/`에 CSV를 넣고 `npm run ingest`.
- 인제스트가 웹용 청크를 `public/data/`에 생성: `index.json`, `league-table.json`(시대보정 상수), `seasons/<연도>.json`(시즌별), `prime.json`(전성기 모드용).
- 초기 로드는 인덱스+상수(~7KB)만, 선수 데이터는 연도 범위별 lazy-load.
- ⚠️ KBO 기록은 독립 팬 프로젝트 용도. 특정 리그·구단과 무관하며 데이터 출처를 존중합니다.

## 배포
정적 사이트 — `npm run build`의 `dist/`만 올리면 됩니다.
- **Vercel/Netlify**: 이 GitHub 저장소를 import → 빌드 명령 `npm run build`, 퍼블리시 디렉터리 `dist` (Vercel은 자동 감지). push할 때마다 자동 재배포.

## 구조
- `src/sim/` — 시뮬레이션 엔진(득점/실점 추정, 시대보정, 리그 시뮬, OVR 레이팅)
- `src/draft/` — 드래프트(휠/슬롯/포지션)
- `src/data/` — 청크 로더
- `src/ui/` — React 컴포넌트
- `scripts/` — 데이터 인제스트/검증
- `DESIGN.md` — 설계 문서

생성: [Claude Code](https://claude.com/claude-code)
