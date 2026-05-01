import { AppShell } from "@/components/layout/AppShell";
import { Button, Card, Input, PageHeader, SectionTitle, Textarea } from "@/components/ui";
import { LOL_ROLE_LABELS } from "@/constants/lol";
import { dummyProfiles } from "@/constants/dummy-data";

const profile = dummyProfiles[0];

export default function ProfileEditPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Profile"
        title="프로필 수정"
        description="업로드와 저장은 아직 연결하지 않은 UI 상태입니다."
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <SectionTitle title="수정 정보" />
          <div className="grid gap-5">
            <Field label="닉네임">
              <Input defaultValue={profile.nickname} />
            </Field>
            <Field label="프로필 이미지">
              <div className="flex flex-wrap gap-3">
                <Input type="file" accept=".jpg,.jpeg,.png,.webp,.gif" className="max-w-md pt-2" />
                <Button type="button" variant="secondary">디스코드 이미지로 되돌리기</Button>
              </div>
            </Field>
            <Field label="롤 계정">
              <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
                <Input defaultValue={profile.lolAccounts[0]?.gameName} />
                <Input defaultValue={profile.lolAccounts[0]?.tagLine} />
                <Button type="button" variant="secondary">계정 추가</Button>
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <RoleSelect label="주라인" defaultValue={profile.mainRole} />
              <RoleSelect label="부라인" defaultValue={profile.subRole} />
            </div>
            <Field label="자기소개">
              <Textarea defaultValue={profile.bio} />
            </Field>
            <Button type="button" className="w-fit">저장</Button>
          </div>
        </Card>
        <Card className="h-fit p-6">
          <SectionTitle title="안내 조건" />
          <ul className="space-y-3 text-sm leading-6 text-slate-300">
            <li>닉네임은 중복 사용할 수 없습니다.</li>
            <li>프로필 이미지는 jpg, png, webp, gif 형식을 허용할 예정입니다.</li>
            <li>프로필 이미지는 최대 2MB로 제한할 예정입니다.</li>
            <li>롤 계정은 최소 1개 필요합니다.</li>
          </ul>
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

function RoleSelect({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <label className="block text-sm font-semibold text-slate-300">
      {label}
      <select className="mt-2 h-11 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100" defaultValue={defaultValue}>
        {Object.entries(LOL_ROLE_LABELS).map(([value, text]) => (
          <option key={value} value={value}>{text}</option>
        ))}
      </select>
    </label>
  );
}
