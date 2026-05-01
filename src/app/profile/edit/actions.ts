"use server";

import { redirect } from "next/navigation";
import { LolRole, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export type ProfileEditFormState = {
  error?: string;
  fieldErrors?: {
    nickname?: string;
    bio?: string;
    accounts?: string;
    mainRole?: string;
    subRole?: string;
    image?: string;
  };
};

const validRoles = new Set<string>(Object.values(LolRole));
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxImageSize = 2 * 1024 * 1024;
const profileImagesBucket = "profile-images";

export async function updateProfile(
  _previousState: ProfileEditFormState,
  formData: FormData,
): Promise<ProfileEditFormState> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    console.error("[profile-image-upload] Missing Supabase auth user in profile update action.");
    return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  }

  const user = await prisma.user.findUnique({
    where: {
      authUserId: authUser.id,
    },
    select: {
      id: true,
      customProfileImageUrl: true,
    },
  });

  if (!user) {
    return { error: "사용자 정보를 찾을 수 없습니다. 온보딩을 먼저 완료해주세요." };
  }

  const nickname = stringValue(formData.get("nickname"));
  const bio = stringValue(formData.get("bio"));
  const mainRole = stringValue(formData.get("mainRole"));
  const subRole = stringValue(formData.get("subRole"));
  const resetImage = formData.get("resetImage") === "true";
  const image = formData.get("profileImage");
  const gameNames = formData.getAll("gameName").map(stringValue);
  const tagLines = formData.getAll("tagLine").map((value) => normalizeTagLine(stringValue(value)));

  const fieldErrors: NonNullable<ProfileEditFormState["fieldErrors"]> = {};

  if (!nickname) {
    fieldErrors.nickname = "닉네임을 입력해주세요.";
  } else if (nickname.length < 2) {
    fieldErrors.nickname = "닉네임은 최소 2자 이상이어야 합니다.";
  } else if (nickname.length > 20) {
    fieldErrors.nickname = "닉네임은 최대 20자까지 사용할 수 있습니다.";
  }

  if (bio.length > 300) {
    fieldErrors.bio = "자기소개는 최대 300자까지 입력할 수 있습니다.";
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

  const imageFile = image instanceof File && image.size > 0 ? image : null;

  if (imageFile && !resetImage) {
    if (!allowedImageTypes.has(imageFile.type)) {
      fieldErrors.image = "jpg, png, webp, gif 이미지만 업로드할 수 있습니다.";
    } else if (imageFile.size > maxImageSize) {
      fieldErrors.image = "프로필 이미지는 최대 2MB까지 업로드할 수 있습니다.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "입력값을 확인해주세요.",
      fieldErrors,
    };
  }

  const duplicatedNickname = await prisma.user.findFirst({
    where: {
      nickname,
      id: {
        not: user.id,
      },
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

  let customProfileImageUrl: string | null | undefined;

  if (resetImage) {
    const deleteResult = await removeExistingProfileImage(supabase, user.customProfileImageUrl);

    if (!deleteResult.ok) {
      return {
        error: "기존 프로필 이미지 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.",
        fieldErrors: {
          image: "기존 프로필 이미지 삭제에 실패했습니다.",
        },
      };
    }

    customProfileImageUrl = null;
  } else if (imageFile) {
    const extension = imageFile.name.split(".").pop()?.toLowerCase() ?? "png";
    const safeExtension = extension === "jpeg" ? "jpg" : extension;
    const path = `${user.id}/${Date.now()}.${safeExtension}`;
    console.log("[profile-image-upload] Starting upload", {
      authUserId: authUser.id,
      appUserId: user.id,
      bucket: profileImagesBucket,
      path,
      contentType: imageFile.type,
      size: imageFile.size,
    });
    const { error: uploadError } = await supabase.storage
      .from(profileImagesBucket)
      .upload(path, imageFile, {
        contentType: imageFile.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[profile-image-upload] Upload failed", {
        message: uploadError.message,
        statusCode: getErrorProperty(uploadError, "statusCode"),
        name: getErrorProperty(uploadError, "name"),
        error: uploadError,
      });

      return {
        error: "이미지 업로드에 실패했습니다. profile-images bucket 설정을 확인해주세요.",
        fieldErrors: {
          image: "이미지 업로드에 실패했습니다.",
        },
      };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(profileImagesBucket).getPublicUrl(path);

    const deleteResult = await removeExistingProfileImage(supabase, user.customProfileImageUrl);

    if (!deleteResult.ok) {
      await removeUploadedProfileImage(supabase, path);

      return {
        error: "기존 프로필 이미지 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.",
        fieldErrors: {
          image: "기존 프로필 이미지 삭제에 실패했습니다.",
        },
      };
    }

    customProfileImageUrl = publicUrl;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          nickname,
          bio: bio || null,
          mainRole: mainRole as LolRole,
          subRole: subRole as LolRole,
          ...(customProfileImageUrl !== undefined ? { customProfileImageUrl } : {}),
        },
      });

      await tx.lolAccount.deleteMany({
        where: {
          userId: user.id,
        },
      });

      await tx.lolAccount.createMany({
        data: accounts.map((account) => ({
          userId: user.id,
          gameName: account.gameName,
          tagLine: account.tagLine,
        })),
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

  redirect("/profile");
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTagLine(value: string) {
  return value.startsWith("#") ? value.slice(1).trim() : value;
}

function getErrorProperty(error: unknown, key: string) {
  if (error && typeof error === "object" && key in error) {
    return (error as Record<string, unknown>)[key];
  }

  return undefined;
}

function getProfileImagePath(publicUrl: string | null) {
  if (!publicUrl) {
    return null;
  }

  try {
    const url = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${profileImagesBucket}/`;
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    const encodedPath = url.pathname.slice(markerIndex + marker.length);
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

async function removeExistingProfileImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  publicUrl: string | null,
) {
  const path = getProfileImagePath(publicUrl);

  if (!path) {
    return { ok: true };
  }

  const { error } = await supabase.storage.from(profileImagesBucket).remove([path]);

  if (error) {
    console.error("[profile-image-delete] Existing image delete failed", {
      message: error.message,
      statusCode: getErrorProperty(error, "statusCode"),
      name: getErrorProperty(error, "name"),
      bucket: profileImagesBucket,
      path,
      error,
    });

    return { ok: false };
  }

  console.log("[profile-image-delete] Existing image deleted", {
    bucket: profileImagesBucket,
    path,
  });

  return { ok: true };
}

async function removeUploadedProfileImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
) {
  const { error } = await supabase.storage.from(profileImagesBucket).remove([path]);

  if (error) {
    console.error("[profile-image-delete] Uploaded image cleanup failed", {
      message: error.message,
      statusCode: getErrorProperty(error, "statusCode"),
      name: getErrorProperty(error, "name"),
      bucket: profileImagesBucket,
      path,
      error,
    });
  }
}
