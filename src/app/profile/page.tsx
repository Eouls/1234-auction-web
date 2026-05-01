import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ProfileSummary } from "@/components/profile/ProfileSummary";
import { Button, PageHeader } from "@/components/ui";
import { dummyProfiles } from "@/constants/dummy-data";

export default function ProfilePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Profile"
        title="내 프로필"
        description="경매 카드에 표시될 라인, 티어, 계정 정보를 확인합니다."
        action={
          <Link href="/profile/edit">
            <Button type="button">프로필 수정</Button>
          </Link>
        }
      />
      <div className="mt-8">
        <ProfileSummary profile={dummyProfiles[0]} />
      </div>
    </AppShell>
  );
}
