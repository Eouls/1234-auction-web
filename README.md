# 1234 Auction

League of Legends 내전을 조금 더 편하게 준비하기 위한 팀 경매 웹 서비스입니다.

Discord 로그인으로 빠르게 들어오고, 방장이 경매방을 만든 뒤 참가자를 등록하면 팀장들이 포인트를 사용해 참가자를 입찰합니다. 경매 중에는 참가자의 롤 계정, 개인/2인 랭크 기준 현재 티어와 최고 티어, 현재 시즌 모스트 챔피언, 낙찰가 통계 등을 참고할 수 있습니다.

기존 내전 경매 사이트를 쓰면서 느꼈던 불편함을 줄이고, 친구나 디스코드 서버 단위에서 빠르게 팀을 짤 수 있도록 만든 개인 프로젝트입니다.

## 주요 기능

### 계정과 프로필

- Discord OAuth 로그인
- 온보딩 및 프로필 설정
- 프로필 이미지 업로드, 삭제, Discord 프로필 이미지 사용
- 롤 계정 여러 개 등록 및 순서 유지
- Riot API 기반 개인/2인 랭크 현재 티어 조회
- OP.GG 기반 개인/2인 랭크 전체 시즌 최고 티어 조회
- 여러 롤 계정 등록 시 개인/2인 랭크 기준으로 가장 높은 현재 티어와 최고 티어 집계
- 여러 롤 계정의 현재 시즌 모스트 챔피언 플레이 수 합산 후 TOP 3 저장
- Data Dragon 기반 챔피언 초상화 표시

### 경매방

- 경매방 생성, 방 코드로 참가
- 방장이 참가자를 사전 등록하고, 등록된 참가자만 입장 가능
- 방장은 참가자가 아니어도 경매방 운영 가능
- 팀장 설정 및 해제
- 팀장 입장 확인 후 경매 시작
- 팀별 시작 포인트 수정
- 참가자 랜덤 경매 순서 저장
- 실시간 입찰, 직접 입찰, 입찰 로그
- 입찰 추가시간과 기본 경매시간 상한 처리
- 0초 이후 grace period로 마지막 입찰 지연 보정
- 10초 카운트다운 효과음과 종료 효과음
- 같은 팀 연속 입찰 방지
- 팀 정원 제한
- 유찰자 재경매
- 남은 슬롯이 한 팀으로 확정되는 경우 자동 배정
- 팀별 남은 포인트, 팀원, 낙찰가 표시
- Supabase Realtime 기반 입찰/라운드 전환/팀 상태 실시간 갱신

### 채팅

- 전체 채팅
- 팀 채팅
- 채팅 optimistic UI
- 한글 IME 입력 중 Enter 중복 전송 방지
- 경매방 입장 시스템 메시지
- Supabase Realtime 기반 채팅 반영

### 결과와 기록

- 경매 결과 화면
- 팀별 최종 구성, 팀장, 낙찰가, 잔여 포인트 표시
- 결과 요약 복사
- 낙찰 기록 저장
- 유저별 평균 낙찰가, 직전 낙찰가 저장 및 경매 대상 카드에 표시
- 롤 사용자 설정 내전 결과 스크린샷 OCR 분석 초안 생성
- OCR 결과를 사용자가 확인/수정한 뒤 내전 기록 저장
- 내전 기록 중복 저장 방지를 위한 경기 번호와 fingerprint 처리

### UI

- 라이트/다크 모드
- 테마 선택 localStorage 저장
- 뉴트럴 그레이 기반 색상 시스템
- 경매 진행 화면 compact 레이아웃

## 기술 스택

- **Framework**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS 4, CSS Variables 기반 라이트/다크 테마
- **Database**: PostgreSQL
- **ORM**: Prisma 7
- **Auth / Realtime / Storage**: Supabase
- **External APIs**: Riot API, Riot Data Dragon
- **OP.GG 연동**: HTML parsing, Playwright, playwright-core, @sparticuz/chromium
- **OCR / Image Processing**: tesseract.js, sharp
- **Runtime / Deploy 고려**: Vercel serverless 환경에서 Chromium 실행을 위해 @sparticuz/chromium 사용

## 프로젝트 구조

```txt
src/
  app/
    auth/                 # Discord OAuth callback/login
    auctions/
      [code]/             # 경매방, 경매 액션, 결과 화면
      create/             # 경매 생성
      join/               # 방 코드 참가
    home/                 # 홈
    my-auctions/          # 내 경매 목록
    onboarding/           # 온보딩
    profile/              # 프로필, 전적 새로고침
  components/
    auction/              # 경매방, 팀 패널, 채팅, 참가자 목록, 내전 기록 UI
    auth/                 # 로그인/로그아웃
    layout/               # 공통 레이아웃, 테마 토글
    onboarding/           # 온보딩 폼
    profile/              # 프로필 표시/수정
    ui/                   # 공통 UI 컴포넌트
  lib/
    auction/              # 경매 코드 등 경매 유틸
    auth/                 # 온보딩/인증 관련 유틸
    match-records/        # 내전 스크린샷 OCR 분석
    opgg/                 # OP.GG 조회 및 Playwright 최고티어 조회
    riot/                 # Riot API, Data Dragon, 티어 비교
    supabase/             # Supabase client/server/middleware
    prisma.ts             # Prisma client
  generated/
    prisma/               # Prisma generated client
prisma/
  schema.prisma
  migrations/
public/
  sounds/                 # 카운트다운 효과음
scripts/
  seed.ts
```

## 데이터 모델 요약

주요 Prisma 모델은 다음과 같습니다.

- `User`: Discord 계정과 서비스 프로필
- `LolAccount`: 사용자가 등록한 롤 계정
- `UserLolStats`: 현재 티어, 최고 티어, 모스트 챔피언
- `Auction`: 경매방
- `AuctionTeam`: 경매 팀과 팀장, 남은 포인트
- `AuctionParticipant`: 경매 참가자, 상태, 낙찰 팀/가격
- `AuctionBid`: 입찰 로그
- `ChatMessage`: 전체/팀 채팅
- `UserAuctionStats`: 유저별 평균/최근 낙찰가 통계
- `AuctionSoldRecord`: 중복 방지용 낙찰 기록
- `InternalMatch`, `InternalMatchPlayer`: 내전 결과 기록

## 로컬 실행

### 1. 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.local`에 필요한 값을 설정합니다. 실제 값은 README나 GitHub에 올리지 않습니다.

```env
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
RIOT_API_KEY=
ENABLE_OPGG_PLAYWRIGHT=true
```

Supabase Discord OAuth 설정, Storage bucket, Realtime publication, RLS 정책은 Supabase Dashboard에서 별도로 설정해야 합니다.

### 3. DB 준비

```bash
npx prisma migrate dev
npx prisma generate
```

필요하면 seed를 실행합니다.

```bash
npm run db:seed
```

### 4. 개발 서버

```bash
npm run dev
```

기본 주소는 [http://localhost:3000](http://localhost:3000) 입니다.

## 주요 명령어

```bash
npm run dev      # 개발 서버
npm run build    # Prisma generate + Next production build
npm run start    # production 서버
npm run lint     # ESLint
npm run db:seed  # seed 실행
```

## 외부 연동 메모

### Riot API

현재 티어 조회는 Riot API를 사용합니다. 서비스 기준 티어는 개인/2인 랭크(`RANKED_SOLO_5x5`)만 사용하며, 자유 랭크는 currentTier 계산에서 제외합니다.

### OP.GG

OP.GG는 보조 데이터 소스로 사용합니다.

- 최고 티어는 OP.GG의 개인/2인 랭크 시즌 기록을 기준으로 파싱합니다.
- Vercel serverless 환경에서는 `playwright-core`와 `@sparticuz/chromium` 조합으로 전체 시즌 펼침 조회를 시도합니다.
- 모스트 챔피언은 현재 시즌 챔피언 페이지를 파싱하고, 여러 롤 계정의 게임 수를 합산합니다.
- OP.GG 조회 실패가 Riot API 현재 티어 저장 실패로 이어지지 않도록 부분 성공 방식으로 처리합니다.

### Supabase Realtime

경매방 실시간 갱신을 위해 주요 테이블의 Realtime publication이 필요합니다.

- `Auction`
- `AuctionBid`
- `AuctionParticipant`
- `AuctionTeam`
- `ChatMessage`

환경에 따라 RLS/SELECT 정책도 함께 확인해야 합니다.

## 배포 메모

- `npm run build`는 `prisma generate && next build`를 실행합니다.
- Vercel에서 OP.GG Playwright 조회를 사용하려면 `@sparticuz/chromium`이 serverless bundle에 포함되어야 합니다.
- `next.config.ts`에서 `serverExternalPackages`와 `outputFileTracingIncludes`를 설정해 Chromium 실행 파일을 포함합니다.
- Server Action 파일 업로드 제한은 내전 스크린샷 OCR을 위해 `6mb`로 설정되어 있습니다.

## 주의사항

- `.env`, `.env.local` 같은 실제 환경변수 파일은 커밋하지 않습니다.
- Riot API Key, Supabase key, DB URL은 코드나 README에 직접 넣지 않습니다.
- OP.GG 파싱은 공개 페이지 구조에 의존하므로, OP.GG HTML 구조가 바뀌면 파서 수정이 필요할 수 있습니다.

