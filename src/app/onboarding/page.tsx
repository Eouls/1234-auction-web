import { AppShell } from "@/components/layout/AppShell";
import { Button, Card, Input, PageHeader, SectionTitle } from "@/components/ui";
import { LOL_ROLE_LABELS } from "@/constants/lol";
import type { LolRole } from "@/types/auction";

const roles = Object.entries(LOL_ROLE_LABELS) as Array<[LolRole, string]>;

export default function OnboardingPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Onboarding"
        title="추가 정보를 입력해주세요"
        description="디스코드 로그인 후 최초 1회 입력할 프로필 정보입니다. 실제 저장 로직은 추후 Supabase와 연결합니다."
      />
      <Card className="mt-8 p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <SectionTitle title="기본 정보" />
            <label className="text-sm font-semibold text-slate-300">닉네임</label>
            <Input className="mt-2" placeholder="예: 청월" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <RoleSelect label="주라인" defaultValue="MID" />
              <RoleSelect label="부라인" defaultValue="ADC" />
            </div>
            <p className="mt-3 text-xs text-amber-200">주라인과 부라인은 같은 값을 선택할 수 없습니다.</p>
          </section>
          <section>
            <SectionTitle title="롤 계정" description="최소 1개 이상의 롤 계정 정보가 필요합니다." />
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <Input placeholder="gameName 예: 울트라맨" />
              <Input placeholder="tagLine 예: KR1" />
            </div>
            <p className="mt-2 text-xs text-slate-500">표시 예시: 울트라맨 #KR1</p>
            <div className="mt-4 flex gap-3">
              <Button type="button" variant="secondary">계정 추가</Button>
              <Button type="button">저장</Button>
            </div>
          </section>
        </div>
      </Card>
    </AppShell>
  );
}

function RoleSelect({ label, defaultValue }: { label: string; defaultValue: LolRole }) {
  return (
    <label className="block text-sm font-semibold text-slate-300">
      {label}
      <select
        className="mt-2 h-11 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-cyan-300/70"
        defaultValue={defaultValue}
      >
        {roles.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
