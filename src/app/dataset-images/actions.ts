"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const datasetImageStatuses = new Set(["COLLECTED", "NEEDS_LABELING", "LABELED", "EXCLUDED"]);
const datasetImageScreenTypes = new Set(["UNKNOWN", "SUMMARY_RESULT", "DETAIL_RESULT"]);

export type UpdateDatasetImageState = {
  error?: string;
  success?: string;
};

export async function updateDatasetImageStatus(
  _previousState: UpdateDatasetImageState,
  formData: FormData,
): Promise<UpdateDatasetImageState> {
  const id = stringValue(formData.get("datasetImageId"));
  const status = stringValue(formData.get("status"));
  const currentUser = await getCurrentUser();

  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  if (!id || !datasetImageStatuses.has(status)) return { error: "변경할 상태 값이 올바르지 않습니다." };

  await prisma.datasetImage.update({
    where: { id },
    data: { status },
  });

  revalidatePath("/dataset-images");
  return { success: "라벨링 상태를 변경했습니다." };
}

export async function updateDatasetImageScreenType(
  _previousState: UpdateDatasetImageState,
  formData: FormData,
): Promise<UpdateDatasetImageState> {
  const id = stringValue(formData.get("datasetImageId"));
  const screenType = stringValue(formData.get("screenType"));
  const currentUser = await getCurrentUser();

  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  if (!id || !datasetImageScreenTypes.has(screenType)) return { error: "변경할 화면 유형이 올바르지 않습니다." };

  await prisma.datasetImage.update({
    where: { id },
    data: { screenType },
  });

  revalidatePath("/dataset-images");
  return { success: "화면 유형을 변경했습니다." };
}

export async function bulkUpdateDatasetImageStatus(
  _previousState: UpdateDatasetImageState,
  formData: FormData,
): Promise<UpdateDatasetImageState> {
  const ids = formData
    .getAll("datasetImageId")
    .map((value) => stringValue(value))
    .filter(Boolean);
  const status = stringValue(formData.get("status"));
  const currentUser = await getCurrentUser();

  if (!currentUser) return { error: "로그인 세션이 없습니다. 다시 로그인해주세요." };
  if (ids.length === 0) return { error: "상태를 변경할 이미지를 선택해주세요." };
  if (!datasetImageStatuses.has(status)) return { error: "변경할 상태 값이 올바르지 않습니다." };

  await prisma.datasetImage.updateMany({
    where: { id: { in: ids } },
    data: { status },
  });

  revalidatePath("/dataset-images");
  return { success: `${ids.length}개 이미지 상태를 변경했습니다.` };
}

async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  return prisma.user.findUnique({
    where: { authUserId: authUser.id },
    select: { id: true },
  });
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
