import { AppShell } from "@/components/layout/AppShell";
import { Button, Card, Input, PageHeader, SectionTitle } from "@/components/ui";

const sampleParticipants = ["청월", "정글교과서", "탑의품격", "서폿장인", "원딜생존기"];

export default function AuctionCreatePage() {
  const teamCount = 3;
  const membersPerTeam = 5;
  const neededCount = teamCount * membersPerTeam;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Create Auction"
        title="경매 생성"
        description="경매 설정과 참가자 명단을 구성하는 화면입니다. 실제 방 생성 API는 추후 연결합니다."
      />
      <div className="mt-8 grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="p-6">
          <SectionTitle title="1단계: 경매 설정" />
          <div className="grid gap-4">
            <Field label="경매 제목"><Input defaultValue="금요일 1234 내전 경매" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="총 팀 수"><Input type="number" defaultValue={teamCount} /></Field>
              <Field label="팀당 인원 수"><Input type="number" defaultValue={membersPerTeam} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="경매 시간(초)"><Input type="number" defaultValue={30} /></Field>
              <Field label="입찰 추가 시간(초)"><Input type="number" defaultValue={10} /></Field>
            </div>
            <Field label="경매 시작 포인트"><Input type="number" defaultValue={1000} /></Field>
          </div>
        </Card>
        <Card className="p-6">
          <SectionTitle title="2단계: 참가자 추가" description={`총 ${neededCount}명이 필요합니다. 현재 ${sampleParticipants.length}명이 추가되었습니다.`} />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input placeholder="닉네임 입력" />
            <Button type="button" variant="secondary">참가자 추가</Button>
          </div>
          <div className="mt-5 grid gap-2 md:grid-cols-2">
            {sampleParticipants.map((name, index) => (
              <div key={name} className="flex items-center justify-between rounded-md border border-white/10 bg-slate-950/60 px-3 py-3 text-sm">
                <span className="font-semibold text-slate-100">{index + 1}. {name}</span>
                <span className="text-slate-500">등록됨</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-400">필요 인원 = 총 팀 수 * 팀당 인원 수</p>
            <Button type="button">생성하기</Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-300">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}
