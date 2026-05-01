"use client";

import { useActionState, useState } from "react";
import { updateProfile, type ProfileEditFormState } from "@/app/profile/edit/actions";
import { Avatar, Button, Card, Input, SectionTitle, Textarea } from "@/components/ui";
import { LOL_ROLE_LABELS } from "@/constants/lol";
import type { LolRole } from "@/types/auction";

const roles = Object.entries(LOL_ROLE_LABELS) as Array<[LolRole, string]>;
const initialState: ProfileEditFormState = {};

type ProfileEditFormProps = {
  profile: {
    nickname: string;
    bio: string | null;
    mainRole: LolRole;
    subRole: LolRole;
    imageUrl: string | null;
    lolAccounts: Array<{
      id: string;
      gameName: string;
      tagLine: string;
    }>;
  };
};

type AccountInput = {
  id: string;
  gameName: string;
  tagLine: string;
};

export function ProfileEditForm({ profile }: ProfileEditFormProps) {
  const [state, formAction, isPending] = useActionState(updateProfile, initialState);
  const [accounts, setAccounts] = useState<AccountInput[]>(
    profile.lolAccounts.length
      ? profile.lolAccounts
      : [{ id: "new-0", gameName: "", tagLine: "" }],
  );

  function updateAccount(id: string, field: "gameName" | "tagLine", value: string) {
    setAccounts((currentAccounts) =>
      currentAccounts.map((account) =>
        account.id === id ? { ...account, [field]: value } : account,
      ),
    );
  }

  function addAccount() {
    setAccounts((currentAccounts) => [
      ...currentAccounts,
      { id: `new-${Date.now()}-${currentAccounts.length}`, gameName: "", tagLine: "" },
    ]);
  }

  function removeAccount(id: string) {
    setAccounts((currentAccounts) =>
      currentAccounts.length === 1
        ? currentAccounts
        : currentAccounts.filter((account) => account.id !== id),
    );
  }

  return (
    <form action={formAction} className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card className="p-6">
        <SectionTitle title="수정 정보" />
        <div className="grid gap-5">
          <Field label="닉네임" error={state.fieldErrors?.nickname}>
            <Input defaultValue={profile.nickname} maxLength={20} minLength={2} name="nickname" />
          </Field>
          <Field label="프로필 이미지" error={state.fieldErrors?.image}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar name={profile.nickname} size="lg" src={profile.imageUrl} />
              <div className="flex flex-1 flex-wrap gap-3">
                <Input
                  accept=".jpg,.jpeg,.png,.webp,.gif"
                  className="max-w-md pt-2"
                  name="profileImage"
                  type="file"
                />
                <Button
                  disabled={isPending}
                  name="resetImage"
                  type="submit"
                  value="true"
                  variant="secondary"
                >
                  디스코드 이미지로 되돌리기
                </Button>
              </div>
            </div>
          </Field>
          <Field label="롤 계정" error={state.fieldErrors?.accounts}>
            <div className="space-y-3">
              {accounts.map((account) => (
                <div key={account.id} className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
                  <Input
                    name="gameName"
                    onChange={(event) => updateAccount(account.id, "gameName", event.target.value)}
                    placeholder="gameName"
                    value={account.gameName}
                  />
                  <Input
                    name="tagLine"
                    onChange={(event) => updateAccount(account.id, "tagLine", event.target.value)}
                    placeholder="tagLine"
                    value={account.tagLine}
                  />
                  <Button
                    disabled={accounts.length === 1 || isPending}
                    onClick={() => removeAccount(account.id)}
                    type="button"
                    variant="ghost"
                  >
                    삭제
                  </Button>
                </div>
              ))}
            </div>
            <Button className="mt-3" disabled={isPending} onClick={addAccount} type="button" variant="secondary">
              롤 계정 추가
            </Button>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <RoleSelect
              defaultValue={profile.mainRole}
              error={state.fieldErrors?.mainRole}
              label="주라인"
              name="mainRole"
            />
            <RoleSelect
              defaultValue={profile.subRole}
              error={state.fieldErrors?.subRole}
              label="부라인"
              name="subRole"
            />
          </div>
          <Field label="자기소개" error={state.fieldErrors?.bio}>
            <Textarea defaultValue={profile.bio ?? ""} maxLength={300} name="bio" placeholder="최대 300자" />
          </Field>
          {state.error ? (
            <p className="rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {state.error}
            </p>
          ) : null}
          <Button disabled={isPending} type="submit" className="w-fit">
            {isPending ? "저장 중..." : "저장"}
          </Button>
        </div>
      </Card>
      <Card className="h-fit p-6">
        <SectionTitle title="안내 조건" />
        <ul className="space-y-3 text-sm leading-6 text-slate-300">
          <li>닉네임은 중복 사용할 수 없습니다.</li>
          <li>자기소개는 최대 300자까지 입력할 수 있습니다.</li>
          <li>프로필 이미지는 jpg, png, webp, gif 형식만 허용합니다.</li>
          <li>프로필 이미지는 최대 2MB로 제한합니다.</li>
          <li>롤 계정은 최소 1개 필요합니다.</li>
          <li>주라인과 부라인은 같은 값을 선택할 수 없습니다.</li>
        </ul>
      </Card>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-300">
      {label}
      <div className="mt-2">{children}</div>
      {error ? <span className="mt-2 block text-xs text-rose-300">{error}</span> : null}
    </label>
  );
}

function RoleSelect({
  label,
  name,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  defaultValue: LolRole;
  error?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-300">
      {label}
      <select
        className="mt-2 h-11 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100"
        defaultValue={defaultValue}
        name={name}
      >
        {roles.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      {error ? <span className="mt-2 block text-xs text-rose-300">{error}</span> : null}
    </label>
  );
}
