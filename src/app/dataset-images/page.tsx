import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { DatasetImageManager, type DatasetImageListItem } from "@/components/dataset/DatasetImageManager";
import { Card, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type DatasetImagesPageProps = {
  searchParams: Promise<{
    screenType?: string | string[];
    status?: string | string[];
  }>;
};

const statusFilters = ["ALL", "COLLECTED", "NEEDS_LABELING", "LABELED", "EXCLUDED"] as const;
const screenTypeFilters = ["ALL", "SUMMARY_RESULT", "DETAIL_RESULT", "UNKNOWN"] as const;

export const metadata = {
  title: "데이터셋 이미지 관리 | 1234 Auction",
  description: "결과창 자동 분석 학습용 후보 이미지를 확인하고 라벨링 상태를 관리합니다.",
};

export default async function DatasetImagesPage({ searchParams }: DatasetImagesPageProps) {
  const { screenType: rawScreenType, status: rawStatus } = await searchParams;
  const status = parseFilter(rawStatus, statusFilters, "ALL");
  const screenType = parseFilter(rawScreenType, screenTypeFilters, "ALL");
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect("/auth/login");
  }

  const where = {
    ...(status === "ALL" ? { status: { not: "EXCLUDED" } } : { status }),
    ...(screenType === "ALL" ? {} : { screenType }),
  };

  const datasetImages = await prisma.datasetImage.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 120,
    include: {
      auction: {
        select: {
          code: true,
          title: true,
        },
      },
      match: {
        select: {
          gameNumber: true,
          winningSide: true,
        },
      },
      uploadedBy: {
        select: {
          nickname: true,
        },
      },
    },
  });
  const images: DatasetImageListItem[] = datasetImages.map((image) => ({
    auctionCode: image.auction?.code ?? null,
    createdAtLabel: new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(image.createdAt),
    fileSizeLabel: formatFileSize(image.fileSize),
    height: image.height,
    id: image.id,
    imageUrl: image.imageUrl,
    matchLabel: image.match ? `${image.match.gameNumber}경기 · ${image.match.winningSide} 승리` : null,
    mimeType: image.mimeType,
    originalFileName: image.originalFileName,
    screenType: image.screenType,
    status: image.status,
    uploadedByNickname: image.uploadedBy.nickname,
    width: image.width,
  }));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Dataset"
        title="결과창 이미지 데이터셋"
        description="결과 등록 화면에서 수집된 스크린샷 후보를 확인하고, YOLO 학습 전 라벨링 상태와 화면 유형을 정리합니다."
      />

      <Card className="mt-6 p-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <FilterGroup
            currentScreenType={screenType}
            currentStatus={status}
            label="라벨링 상태"
            name="status"
            options={statusFilters}
          />
          <FilterGroup
            currentScreenType={screenType}
            currentStatus={status}
            label="화면 유형"
            name="screenType"
            options={screenTypeFilters}
          />
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--foreground-muted)]">
          기본 “전체” 상태는 제외 처리된 이미지를 숨깁니다. 잘못 업로드된 이미지는 상태를 EXCLUDED로 바꾼 뒤 EXCLUDED 필터에서 확인할 수 있습니다.
        </p>
      </Card>

      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--foreground-muted)]">
          {images.length}개 후보 이미지
        </p>
        <Link
          className="rounded-md border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-sm font-semibold text-[var(--secondary-foreground)] transition hover:bg-[var(--surface-hover)]"
          href="/dataset-images"
        >
          필터 초기화
        </Link>
      </div>

      {images.length ? (
        <div className="mt-4">
          <DatasetImageManager images={images} />
        </div>
      ) : (
        <Card className="mt-4 p-8 text-center">
          <p className="text-sm font-bold text-[var(--foreground)]">조건에 맞는 데이터셋 이미지가 없습니다.</p>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            결과 등록 화면에서 이미지를 업로드하거나 붙여넣은 뒤 데이터셋 후보 저장을 켜면 이곳에 표시됩니다.
          </p>
        </Card>
      )}
    </AppShell>
  );
}

function FilterGroup({
  currentScreenType,
  currentStatus,
  label,
  name,
  options,
}: {
  currentScreenType: string;
  currentStatus: string;
  label: string;
  name: "screenType" | "status";
  options: readonly string[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--foreground-muted)]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isActive = name === "status" ? currentStatus === option : currentScreenType === option;
          const href = buildDatasetFilterHref({
            screenType: name === "screenType" ? option : currentScreenType,
            status: name === "status" ? option : currentStatus,
          });

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-bold transition",
                isActive
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
              )}
              href={href}
              key={option}
            >
              {option === "ALL" ? "전체" : option}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function buildDatasetFilterHref({
  screenType,
  status,
}: {
  screenType: string;
  status: string;
}) {
  const params = new URLSearchParams();
  if (status !== "ALL") params.set("status", status);
  if (screenType !== "ALL") params.set("screenType", screenType);
  const query = params.toString();
  return query ? `/dataset-images?${query}` : "/dataset-images";
}

function parseFilter<T extends readonly string[]>(value: string | string[] | undefined, options: T, fallback: T[number]) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return options.includes(normalized ?? "") ? (normalized as T[number]) : fallback;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
