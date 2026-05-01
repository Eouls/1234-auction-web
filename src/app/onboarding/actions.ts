"use server";

import { redirect } from "next/navigation";
import { LolRole, Prisma } from "@/generated/prisma/client";
import { getDiscordProfileFromAuthUser } from "@/lib/auth/onboarding";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export type OnboardingFormState = {
  error?: string;
  fieldErrors?: {
    nickname?: string;
    accounts?: string;
    mainRole?: string;
    subRole?: string;
  };
};

const validRoles = new Set<string>(Object.values(LolRole));

export async function saveOnboarding(
  _previousState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  }

  const nickname = stringValue(formData.get("nickname"));
  const mainRole = stringValue(formData.get("mainRole"));
  const subRole = stringValue(formData.get("subRole"));
  const gameNames = formData.getAll("gameName").map(stringValue);
  const tagLines = formData.getAll("tagLine").map((value) => normalizeTagLine(stringValue(value)));

  const fieldErrors: NonNullable<OnboardingFormState["fieldErrors"]> = {};

  if (!nickname) {
    fieldErrors.nickname = "닉네임을 입력해주세요.";
  } else if (nickname.length < 2) {
    fieldErrors.nickname = "닉네임은 최소 2자 이상이어야 합니다.";
  } else if (nickname.length > 20) {
    fieldErrors.nickname = "닉네임은 최대 20자까지 사용할 수 있습니다.";
  }

  if (!mainRole || !validRoles.has(mainRole)) {
    fieldErrors.mainRole = "주라인을 선택해주세요.";
  }

  if (!subRole || !validRoles.has(subRole)) {
    fieldErrors.subRole = "부라인을 선택해주세요.";
  }

  if (mainRole && subRole && mainRole === subRole) {
    fieldErrors.subRole = "주라인과 부라인은 같을 수 없습니다.";
  }

  const accounts = gameNames
    .map((gameName, index) => ({
      gameName,
      tagLine: tagLines[index] ?? "",
    }))
    .filter((account) => account.gameName || account.tagLine);

  if (accounts.length === 0) {
    fieldErrors.accounts = "롤 계정은 최소 1개 필요합니다.";
  } else if (accounts.some((account) => !account.gameName || !account.tagLine)) {
    fieldErrors.accounts = "gameName과 tagLine을 모두 입력해주세요.";
  } else {
    const accountKeys = accounts.map(
      (account) => `${account.gameName.toLocaleLowerCase()}#${account.tagLine.toLocaleLowerCase()}`,
    );
    if (new Set(accountKeys).size !== accountKeys.length) {
      fieldErrors.accounts = "동일한 롤 계정이 중복 입력되었습니다.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "입력값을 확인해주세요.",
      fieldErrors,
    };
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      authUserId: authUser.id,
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    redirect("/home");
  }

  const duplicatedNickname = await prisma.user.findUnique({
    where: {
      nickname,
    },
    select: {
      id: true,
    },
  });

  if (duplicatedNickname) {
    return {
      error: "이미 존재하는 닉네임입니다.",
      fieldErrors: {
        nickname: "이미 존재하는 닉네임입니다.",
      },
    };
  }

  const discordProfile = getDiscordProfileFromAuthUser(authUser);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          authUserId: authUser.id,
          discordId: discordProfile.discordId,
          discordUsername: discordProfile.discordUsername,
          discordAvatarUrl: discordProfile.discordAvatarUrl,
          nickname,
          mainRole: mainRole as LolRole,
          subRole: subRole as LolRole,
        },
        select: {
          id: true,
        },
      });

      await tx.lolAccount.createMany({
        data: accounts.map((account) => ({
          userId: user.id,
          gameName: account.gameName,
          tagLine: account.tagLine,
        })),
      });

      await tx.userLolStats.create({
        data: {
          userId: user.id,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        error: "이미 사용 중인 닉네임 또는 계정 정보가 있습니다.",
      };
    }

    return {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  redirect("/home");
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTagLine(value: string) {
  return value.startsWith("#") ? value.slice(1).trim() : value;
}
