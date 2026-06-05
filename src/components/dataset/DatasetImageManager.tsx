"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkUpdateDatasetImageStatus,
  updateDatasetImageScreenType,
  updateDatasetImageStatus,
  type UpdateDatasetImageState,
} from "@/app/dataset-images/actions";
import { Button } from "@/components/ui";

export type DatasetImageListItem = {
  auctionCode: string | null;
  auctionId: string | null;
  createdAt: string;
  createdAtLabel: string;
  fileSizeLabel: string;
  height: number | null;
  id: string;
  imageUrl: string;
  matchId: string | null;
  matchLabel: string | null;
  mimeType: string;
  originalFileName: string | null;
  screenType: string;
  status: string;
  uploadedByNickname: string | null;
  width: number | null;
};

export type DatasetImageExportItem = Pick<
  DatasetImageListItem,
  "auctionId" | "createdAt" | "height" | "id" | "imageUrl" | "matchId" | "originalFileName" | "screenType" | "status" | "width"
>;

const statusOptions = [
  { label: "COLLECTED", value: "COLLECTED" },
  { label: "NEEDS_LABELING", value: "NEEDS_LABELING" },
  { label: "LABELED", value: "LABELED" },
  { label: "EXCLUDED", value: "EXCLUDED" },
];

const screenTypeOptions = [
  { label: "UNKNOWN", value: "UNKNOWN" },
  { label: "SUMMARY_RESULT", value: "SUMMARY_RESULT" },
  { label: "DETAIL_RESULT", value: "DETAIL_RESULT" },
];

export function DatasetImageManager({
  exportImages,
  exportScreenType,
  images,
}: {
  exportImages: DatasetImageExportItem[];
  exportScreenType: string;
  images: DatasetImageListItem[];
}) {
  const [previewImage, setPreviewImage] = useState<DatasetImageListItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const router = useRouter();
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [isBulkPending, startBulkTransition] = useTransition();
  const allSelected = images.length > 0 && selectedIds.length === images.length;
  const selectedIdSet = new Set(selectedIds);

  function handleToggleImage(id: string, checked: boolean) {
    setBulkError(null);
    setBulkSuccess(null);
    setSelectedIds((currentIds) => {
      if (checked) return currentIds.includes(id) ? currentIds : [...currentIds, id];
      return currentIds.filter((currentId) => currentId !== id);
    });
  }

  function handleToggleAll(checked: boolean) {
    setBulkError(null);
    setBulkSuccess(null);
    setSelectedIds(checked ? images.map((image) => image.id) : []);
  }

  function handleBulkStatus(status: "EXCLUDED" | "NEEDS_LABELING") {
    const formData = new FormData();
    selectedIds.forEach((id) => formData.append("datasetImageId", id));
    formData.set("status", status);

    startBulkTransition(async () => {
      setBulkError(null);
      setBulkSuccess(null);
      const result = await bulkUpdateDatasetImageStatus({}, formData);
      if (result.error) {
        setBulkError(result.error);
        return;
      }
      setBulkSuccess(result.success ?? "선택한 이미지 상태를 변경했습니다.");
      setSelectedIds([]);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl shadow-[var(--shadow)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
            <input
              checked={allSelected}
              className="h-4 w-4 rounded border-[var(--border)]"
              onChange={(event) => handleToggleAll(event.target.checked)}
              type="checkbox"
            />
            전체 선택
            <span className="text-xs font-semibold text-[var(--foreground-muted)]">
              {selectedIds.length} / {images.length} 선택
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isBulkPending || selectedIds.length === 0}
              onClick={() => handleBulkStatus("NEEDS_LABELING")}
              size="sm"
              type="button"
              variant="secondary"
            >
              선택 항목 라벨링 필요
            </Button>
            <Button
              disabled={isBulkPending || selectedIds.length === 0}
              onClick={() => handleBulkStatus("EXCLUDED")}
              size="sm"
              type="button"
              variant="danger"
            >
              선택 항목 제외
            </Button>
            <Button
              disabled={exportImages.length === 0}
              onClick={() => downloadJsonManifest(exportImages, exportScreenType)}
              size="sm"
              type="button"
              variant="primary"
            >
              라벨링 목록 JSON 다운로드
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--foreground-muted)]">
          JSON export 대상은 현재 화면 유형 필터의 NEEDS_LABELING 이미지입니다. EXCLUDED 이미지는 export에 포함되지 않습니다.
        </p>
        {bulkError ? <p className="mt-2 text-xs font-semibold text-[var(--danger)]">{bulkError}</p> : null}
        {bulkSuccess ? <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-200">{bulkSuccess}</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {images.map((image) => (
          <DatasetImageCard
            image={image}
            isSelected={selectedIdSet.has(image.id)}
            key={image.id}
            onPreview={() => setPreviewImage(image)}
            onSelectedChange={(checked) => handleToggleImage(image.id, checked)}
          />
        ))}
      </div>

      {previewImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
          role="presentation"
        >
          <div
            className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-2xl shadow-black/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--foreground)]">
                  {previewImage.originalFileName ?? previewImage.id}
                </p>
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  {formatResolution(previewImage)} · {previewImage.mimeType} · {previewImage.fileSizeLabel}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <CopyImageUrlButton imageUrl={previewImage.imageUrl} />
                <Button onClick={() => setPreviewImage(null)} size="sm" type="button" variant="secondary">
                  닫기
                </Button>
              </div>
            </div>
            <div className="grid max-h-[78vh] overflow-auto bg-[var(--page-muted)] lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={previewImage.originalFileName ?? "데이터셋 후보 이미지"}
                  className="mx-auto max-h-[74vh] max-w-full rounded-md object-contain"
                  src={previewImage.imageUrl}
                />
              </div>
              <dl className="space-y-2 border-t border-[var(--border)] bg-[var(--card)] p-4 text-xs lg:border-l lg:border-t-0">
                <ModalMetaItem label="DatasetImage id" value={previewImage.id} />
                <ModalMetaItem label="status" value={previewImage.status} />
                <ModalMetaItem label="screenType" value={previewImage.screenType} />
                <ModalMetaItem label="해상도" value={formatResolution(previewImage)} />
                <ModalMetaItem label="파일 크기" value={previewImage.fileSizeLabel} />
                <ModalMetaItem label="imageUrl" value={previewImage.imageUrl} />
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DatasetImageCard({
  image,
  isSelected,
  onPreview,
  onSelectedChange,
}: {
  image: DatasetImageListItem;
  isSelected: boolean;
  onPreview: () => void;
  onSelectedChange: (checked: boolean) => void;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-xl shadow-[var(--shadow)]">
      <button
        className="block aspect-[16/10] w-full bg-[var(--surface-muted)] transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]"
        onClick={onPreview}
        type="button"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={image.originalFileName ?? "데이터셋 후보 이미지"}
          className="h-full w-full object-cover"
          src={image.imageUrl}
        />
      </button>

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <input
              aria-label={`${image.originalFileName ?? image.id} 선택`}
              checked={isSelected}
              className="mt-1 h-4 w-4 shrink-0 rounded border-[var(--border)]"
              onChange={(event) => onSelectedChange(event.target.checked)}
              type="checkbox"
            />
            <div className="min-w-0">
            <h2 className="truncate text-sm font-black text-[var(--foreground)]">
              {image.originalFileName ?? image.id}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">
              {formatResolution(image)} · {image.mimeType} · {image.fileSizeLabel}
            </p>
            </div>
          </div>
          <StatusPill status={image.status} />
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <MetaItem label="업로드" value={image.createdAtLabel} />
          <MetaItem label="업로더" value={image.uploadedByNickname ?? "-"} />
          <MetaItem label="경매" value={image.auctionCode ?? "-"} />
          <MetaItem label="Match" value={image.matchLabel ?? "-"} />
        </dl>

        <div className="grid gap-2 sm:grid-cols-2">
          <DatasetImageSelect
            action={updateDatasetImageStatus}
            datasetImageId={image.id}
            label="라벨링 상태"
            name="status"
            options={statusOptions}
            value={image.status}
          />
          <DatasetImageSelect
            action={updateDatasetImageScreenType}
            datasetImageId={image.id}
            label="화면 유형"
            name="screenType"
            options={screenTypeOptions}
            value={image.screenType}
          />
        </div>
      </div>
    </article>
  );
}

function DatasetImageSelect({
  action,
  datasetImageId,
  label,
  name,
  options,
  value,
}: {
  action: (previousState: UpdateDatasetImageState, formData: FormData) => Promise<UpdateDatasetImageState>;
  datasetImageId: string;
  label: string;
  name: string;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(nextValue: string) {
    const formData = new FormData();
    formData.set("datasetImageId", datasetImageId);
    formData.set(name, nextValue);

    startTransition(async () => {
      setError(null);
      const result = await action({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="text-xs font-semibold text-[var(--foreground-muted)]">
      {label}
      <select
        className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-xs font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60"
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span className="mt-1 block text-[11px] text-[var(--danger)]">{error}</span> : null}
    </label>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5">
      <dt className="text-[10px] font-semibold text-[var(--foreground-muted)]">{label}</dt>
      <dd className="mt-0.5 truncate font-semibold text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

function ModalMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-[var(--foreground-muted)]">{label}</dt>
      <dd className="mt-1 break-all font-semibold text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

function CopyImageUrlButton({ imageUrl }: { imageUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(imageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button onClick={handleCopy} size="sm" type="button" variant="ghost">
      {copied ? "복사됨" : "URL 복사"}
    </Button>
  );
}

function StatusPill({ status }: { status: string }) {
  const className = {
    COLLECTED: "border-cyan-300/30 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200",
    EXCLUDED: "border-rose-300/30 bg-rose-400/10 text-rose-700 dark:text-rose-200",
    LABELED: "border-emerald-300/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200",
    NEEDS_LABELING: "border-amber-300/30 bg-amber-400/10 text-amber-700 dark:text-amber-200",
  }[status] ?? "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--foreground-muted)]";

  return (
    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${className}`}>
      {status}
    </span>
  );
}

function downloadJsonManifest(images: DatasetImageExportItem[], screenType: string) {
  const manifest = {
    exportedAt: new Date().toISOString(),
    format: "1234-auction-dataset-manifest-v1",
    filters: {
      screenType,
      status: "NEEDS_LABELING",
    },
    images: images.map((image) => ({
      auctionId: image.auctionId,
      createdAt: image.createdAt,
      height: image.height,
      id: image.id,
      imageUrl: image.imageUrl,
      matchId: image.matchId,
      originalFileName: image.originalFileName,
      screenType: image.screenType,
      status: image.status,
      width: image.width,
    })),
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const screenTypeSlug = screenType === "ALL" ? "all" : screenType.toLowerCase();

  link.href = url;
  link.download = `dataset-images-${screenTypeSlug}-needs-labeling.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatResolution(image: Pick<DatasetImageListItem, "height" | "width">) {
  return image.width && image.height ? `${image.width} x ${image.height}` : "해상도 미확인";
}
