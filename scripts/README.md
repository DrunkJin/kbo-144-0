# 실데이터 받기 (Kaggle)

게임 로직보다 **데이터 확보가 80%**. Kaggle CSV가 가장 많고 접근이 쉽습니다 (크롤링 불필요, 이미 정제됨, 1982~ 커버).

## 1. 데이터셋 선택 (하나 고르기)

| 데이터셋 | 범위 | 비고 |
|----------|------|------|
| [KBO Player Dataset (1982-2025)](https://www.kaggle.com/datasets/netsong/kbo-player-dataset-by-regular-season-1982-2025) | 1982–2025 | **가장 최신, 1순위 추천** |
| [Baseball KBO Batting Data (1982-2021)](https://www.kaggle.com/datasets/mattop/baseball-kbo-batting-data-1982-2021) | 타자 1982–2021 | 클래식, 검증됨 |
| [Korean Baseball Pitching Data (1982-2021)](https://www.kaggle.com/datasets/mattop/korean-baseball-pitching-data-1982-2021) | 투수 1982–2021 | 위 타자셋과 짝 |

> ⚠️ 각 데이터셋 페이지의 라이선스/이용약관을 확인하세요. 비상업·팬 프로젝트라도 출처를 명시하는 게 안전합니다 (38-0도 "독립 팬 제작·비제휴" 명시).

## 2. 다운로드 방법

**방법 A — 웹에서 직접 (간단)**
1. 위 링크 접속 → 로그인 → **Download** 버튼
2. 압축 풀어서 CSV들을 `kbo-game/data/raw/` 에 넣기
   - 파일명에 `pitch` 또는 `투수`가 들어가면 투수 데이터로 자동 인식

**방법 B — Kaggle API (자동화)**
```bash
pip install kaggle              # ~/.kaggle/kaggle.json 에 API 토큰 필요
kaggle datasets download -d netsong/kbo-player-dataset-by-regular-season-1982-2025 -p data/raw --unzip
```
> 이 명령은 본인 계정 인증이 필요하므로 직접 실행하셔야 합니다. 세션에서 `! <명령>` 으로 실행하면 결과가 여기로 들어옵니다.

## 3. 인제스트 실행
```bash
cd kbo-game
npm run ingest
```
- CSV 헤더가 스크립트의 `COLUMN_MAP`과 다르면 `scripts/ingest-kaggle.ts`의 매핑만 수정하면 됩니다 (대소문자 무시, 한/영 헤더 둘 다 지원).
- 결과:
  - `data/players.json` — 전체 정규화 데이터 (node 스크립트 전용, 웹 번들 제외)
  - `public/data/index.json` — 시즌 목록 등 초소형 인덱스 (앱 시작 시 즉시 로드)
  - `public/data/league-table.json` — 사전계산된 연도별 리그상수(시대보정)
  - `public/data/seasons/<year>.json` — 시즌별 선수 청크 (필요 연도만 lazy-load)
  - `public/data/prime.json` — 선수별 통산 최고 시즌(전성기 모드 전용, lazy-load)

## 4. 남은 데이터 작업
- **포지션**: 대부분의 스탯 CSV에는 수비 포지션이 없어 타자는 기본 `DH`로 들어갑니다. 포지션 컬럼이나 수비 데이터를 붙여 `inferBatPos()`를 개선해야 라인업 슬롯이 제대로 채워집니다.
- **리그 상수 보정**: 연도별 리그평균 wOBA/FIP를 그 해 팀 집계로 산출해 `runEstimator.ts`의 `DEFAULT_LEAGUE`를 시즌별로 대체 (시대보정).
