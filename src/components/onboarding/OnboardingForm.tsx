"use client";

import { useActionState, useState } from "react";
import { Button, Card, Input, SectionTitle } from "@/components/ui";
import { LOL_ROLE_LABELS } from "@/constants/lol";
import type { LolRole } from "@/types/auction";
import { saveOnboarding, type OnboardingFormState } from "@/app/onboarding/actions";

const roles = Object.entries(LOL_ROLE_LABELS) as Array<[LolRole, string]>;
const initialState: OnboardingFormState = {};

type AccountInput = {
  id: number;
  gameName: string;
  tagLine: string;
};

export function OnboardingForm() {
  const [state, formAction, isPending] = useActionState(saveOnboarding, initialState);
  const [accounts, setAccounts] = useState<AccountInput[]>([{ id: 1, gameName: "", tagLine: "" }]);

  function updateAccount(id: number, field: "gameName" | "tagLine", value: string) {
    setAccounts((currentAccounts) =>
      currentAccounts.map((account) =>
        account.id === id ? { ...account, [field]: value } : account,
      ),
    );
  }

  function addAccount() {
    setAccounts((currentAccounts) => [
      ...currentAccounts,
      { id: Math.max(...currentAccounts.map((account) => account.id)) + 1, gameName: "", tagLine: "" },
    ]);
  }

  function removeAccount(id: number) {
    setAccounts((currentAccounts) =>
      currentAccounts.length === 1
        ? currentAccounts
        : currentAccounts.filter((account) => account.id !== id),
    );
  }

  return (
    <Card className="mt-8 p-6">
      <form action={formAction} className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle title="기본 정보" />
          <label className="text-sm font-semibold text-slate-300">
            닉네임
            <Input className="mt-2" maxLength={20} minLength={2} name="nickname" placeholder="예: 청월" />
          </label>
          {state.fieldErrors?.nickname ? (
            <p className="mt-2 text-xs text-rose-300">{state.fieldErrors.nickname}</p>
          ) : null}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <RoleSelect error={state.fieldErrors?.mainRole} label="주라인" name="mainRole" defaultValue="MID" />
            <RoleSelect error={state.fieldErrors?.subRole} label="부라인" name="subRole" defaultValue="ADC" />
          </div>
          <p className="mt-3 text-xs text-amber-200">주라인과 부라인은 같은 값을 선택할 수 없습니다.</p>
        </section>
        <section>
          <SectionTitle title="롤 계정" description="최소 1개 이상의 롤 계정 정보가 필요합니다." />
          <div className="space-y-3">
            {accounts.map((account, index) => (
              <div key={account.id} className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
                <Input
                  name="gameName"
                  onChange={(event) => updateAccount(account.id, "gameName", event.target.value)}
                  placeholder="gameName 예: 울트라맨"
                  value={account.gameName}
                />
                <Input
                  name="tagLine"
                  onChange={(event) => updateAccount(account.id, "tagLine", event.target.value)}
                  placeholder="tagLine 예: KR1"
                  value={account.tagLine}
                />
                <Button
                  disabled={accounts.length === 1}
                  onClick={() => removeAccount(account.id)}
                  type="button"
                  variant="ghost"
                >
                  삭제
                </Button>
                {index === 0 ? null : <div className="hidden" />}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">표시 예시: 울트라맨 #KR1</p>
          {state.fieldErrors?.accounts ? (
            <p className="mt-2 text-xs text-rose-300">{state.fieldErrors.accounts}</p>
          ) : null}
          {state.error ? (
            <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {state.error}
            </p>
          ) : null}
          <div className="mt-4 flex gap-3">
            <Button disabled={isPending} onClick={addAccount} type="button" variant="secondary">
              계정 추가
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "저장 중..." : "저장"}
            </Button>
          </div>
        </section>
      </form>
    </Card>
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
        className="mt-2 h-11 w-full rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-cyan-300/70"
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
