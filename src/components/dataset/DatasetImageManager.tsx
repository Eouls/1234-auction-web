"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateDatasetImageScreenType,
  updateDatasetImageStatus,
  type UpdateDatasetImageState,
} from "@/app/dataset-images/actions";
import { Button } from "@/components/ui";

export type DatasetImageListItem = {
  auctionCode: string | null;
  createdAtLabel: string;
  fileSizeLabel: string;
  height: number | null;
  id: string;
  imageUrl: string;
  matchLabel: string | null;
  mimeType: string;
  originalFileName: string | null;
  screenType: string;
  status: string;
  uploadedByNickname: string | null;
  width: number | null;
};

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

export function DatasetImageManager({ images }: { images: DatasetImageListItem[] }) {
  const [previewImage, setPreviewImage] = useState<DatasetImageListItem | null>(null);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {images.map((image) => (
          <DatasetImageCard image={image} key={image.id} onPreview={() => setPreviewImage(image)} />
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
              <Button onClick={() => setPreviewImage(null)} size="sm" type="button" variant="secondary">
                닫기
              </Button>
            </div>
            <div className="max-h-[78vh] overflow-auto bg-[var(--page-muted)] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={previewImage.originalFileName ?? "데이터셋 후보 이미지"}
                className="mx-auto max-h-[74vh] max-w-full rounded-md object-contain"
                src={previewImage.imageUrl}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DatasetImageCard({
  image,
  onPreview,
}: {
  image: DatasetImageListItem;
  onPreview: () => void;
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
          <div className="min-w-0">
            <h2 className="truncate text-sm font-black text-[var(--foreground)]">
              {image.originalFileName ?? image.id}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">
              {formatResolution(image)} · {image.mimeType} · {image.fileSizeLabel}
            </p>
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

function formatResolution(image: Pick<DatasetImageListItem, "height" | "width">) {
  return image.width && image.height ? `${image.width} x ${image.height}` : "해상도 미확인";
}
