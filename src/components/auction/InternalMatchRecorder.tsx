"use client";

import {
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  analyzeInternalMatchScreenshot,
  saveInternalMatchDraft,
  type InternalMatchDraft,
  type InternalMatchPlayerDraft,
} from "@/app/auctions/[code]/result/actions";
import { Button, Card, Input, SectionTitle } from "@/components/ui";

type InternalMatchRecorderProps = {
  auctionCode: string;
  auctionId: string;
};

const allowedScreenshotTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxScreenshotSize = 5 * 1024 * 1024;

export function InternalMatchRecorder({ auctionCode, auctionId }: InternalMatchRecorderProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<InternalMatchDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteMessage, setPasteMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<File | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isAnalyzing, startAnalyzeTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();

  const userOptionsById = useMemo(
    () => new Map((draft?.userOptions ?? []).map((option) => [option.id, option])),
    [draft?.userOptions],
  );
  const championOptionsById = useMemo(
    () => new Map((draft?.championOptions ?? []).map((option) => [option.id, option])),
    [draft?.championOptions],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleSelectedImage(file: File, source: "file" | "paste") {
    setError(null);
    setPasteMessage(null);
    setSuccess(null);

    if (!allowedScreenshotTypes.has(file.type)) {
      setSelectedScreenshot(null);
      setPreviewUrl(null);
      setError("jpg, jpeg, png, webp 이미지만 등록할 수 있습니다.");
      return;
    }

    if (file.size > maxScreenshotSize) {
      setSelectedScreenshot(null);
      setPreviewUrl(null);
      setError("스크린샷은 최대 5MB까지 등록할 수 있습니다.");
      return;
    }

    setSelectedScreenshot(file);
    setDraft(null);
    setPreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return URL.createObjectURL(file);
    });
    setPasteMessage(source === "paste" ? "클립보드 이미지를 등록했습니다. 분석을 시작할 수 있습니다." : null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    handleSelectedImage(file, "file");
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const imageFile = getImageFileFromClipboard(event.clipboardData);

    if (!imageFile) {
      setPasteMessage("클립보드에 이미지가 없습니다.");
      return;
    }

    event.preventDefault();
    handleSelectedImage(imageFile, "paste");
  }

  function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPasteMessage(null);
    setSuccess(null);
    if (!selectedScreenshot) {
      setError("분석할 스크린샷을 업로드하거나 붙여넣어주세요.");
      return;
    }

    const formData = new FormData();
    formData.set("auctionId", auctionId);
    formData.set("auctionCode", auctionCode);
    formData.set("screenshot", selectedScreenshot);

    startAnalyzeTransition(async () => {
      const result = await analyzeInternalMatchScreenshot(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.draft) {
        setDraft(result.draft);
        setSuccess(result.success ?? "분석 초안을 만들었습니다.");
      }
    });
  }

  function handleWinningSideChange(winningSide: "TEAM_1" | "TEAM_2") {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      winningSide,
      teams: currentDraft.teams.map((team) => ({
        ...team,
        players: team.players.map((player) => ({
          ...player,
          win: player.side === winningSide,
        })),
      })),
    }));
  }

  function handlePlayerChange(draftId: string, patch: Partial<InternalMatchPlayerDraft>) {
    updateDraft((currentDraft) => ({
      ...currentDraft,
      teams: currentDraft.teams.map((team) => ({
        ...team,
        players: team.players.map((player) => (player.draftId === draftId ? { ...player, ...patch } : player)),
      })),
    }));
  }

  function handleUserChange(player: InternalMatchPlayerDraft, userId: string) {
    const userOption = userOptionsById.get(userId);
    handlePlayerChange(player.draftId, {
      auctionTeamId: userOption?.auctionTeamId ?? player.auctionTeamId,
      userId: userId || null,
    });
  }

  function handleChampionChange(player: InternalMatchPlayerDraft, championId: string) {
    const champion = championOptionsById.get(championId);
    handlePlayerChange(player.draftId, {
      championId: champion?.id ?? null,
      championImageUrl: champion?.imageUrl ?? null,
      championName: champion?.name ?? null,
    });
  }

  function handleGameNumberChange(value: string) {
    const gameNumber = Number(value);
    updateDraft((currentDraft) => ({
      ...currentDraft,
      gameNumber: Number.isInteger(gameNumber) && gameNumber > 0 ? gameNumber : currentDraft.gameNumber,
    }));
  }

  function handleSave() {
    if (!draft) return;
    setError(null);
    setSuccess(null);

    startSaveTransition(async () => {
      const result = await saveInternalMatchDraft(draft);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(result.success ?? "내전 기록을 저장했습니다.");
      setDraft(null);
      setSelectedScreenshot(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  function updateDraft(updater: (currentDraft: InternalMatchDraft) => InternalMatchDraft) {
    setDraft((currentDraft) => (currentDraft ? updater(currentDraft) : currentDraft));
  }

  return (
    <Card className="mt-8 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <SectionTitle
            title="내전 기록 등록"
            description="결과 캡처 이미지를 업로드하거나 붙여넣으면 자동 분석 초안을 만들고, 확인 후 저장합니다."
          />
        </div>
        <form className="flex flex-col gap-2 sm:items-end" onSubmit={handleAnalyze}>
          <Input
            accept="image/jpeg,image/png,image/webp"
            className="h-10 max-w-sm text-xs file:mr-3 file:rounded file:border-0 file:bg-[var(--card-muted)] file:px-2 file:py-1 file:text-xs file:font-semibold file:text-[var(--foreground)]"
            disabled={isAnalyzing}
            onChange={handleFileChange}
            ref={fileInputRef}
            name="screenshot"
            type="file"
          />
          <Button disabled={isAnalyzing || !selectedScreenshot} type="submit" variant="secondary">
            {isAnalyzing ? "분석 중..." : "스크린샷 분석"}
          </Button>
        </form>
      </div>

      <div
        className="mt-4 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] p-4 outline-none transition focus:border-[var(--foreground)] focus:bg-[var(--card)]"
        onPaste={handlePaste}
        role="button"
        tabIndex={0}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">이미지를 선택하거나 Ctrl+V / Cmd+V로 붙여넣으세요.</p>
            <p className="mt-1 text-xs leading-5 text-[var(--foreground-muted)]">
              Windows 캡처 도구나 macOS 스크린샷을 파일로 저장하지 않고 바로 등록할 수 있습니다. PNG, JPG, WEBP · 최대 5MB
            </p>
          </div>
          {selectedScreenshot ? (
            <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs font-semibold text-[var(--foreground)]">
              {selectedScreenshot.name || "붙여넣은 이미지"}
            </span>
          ) : null}
        </div>
        {previewUrl && !draft ? (
          <div className="mt-4 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="분석할 내전 결과 스크린샷 미리보기" className="max-h-72 w-full object-contain" src={previewUrl} />
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}
      {pasteMessage ? (
        <p className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground-muted)]">
          {pasteMessage}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {success}
        </p>
      ) : null}

      {draft ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-3">
            {previewUrl ? (
              <div className="overflow-hidden rounded-md border border-white/10 bg-slate-950/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="분석한 내전 결과 스크린샷" className="max-h-72 w-full object-contain" src={previewUrl} />
              </div>
            ) : null}
            <div className="rounded-md border border-white/10 bg-slate-950/50 p-3">
              <label className="mb-3 block text-xs font-semibold text-slate-300">
                경기 번호
                <Input
                  className="mt-2 h-9 text-xs"
                  min={1}
                  onChange={(event) => handleGameNumberChange(event.target.value)}
                  type="number"
                  value={draft.gameNumber}
                />
              </label>
              <label className="text-xs font-semibold text-slate-300">
                승리 팀
                <select
                  className="mt-2 h-9 w-full rounded-md border border-white/10 bg-slate-950/70 px-2 text-sm text-slate-100 outline-none"
                  onChange={(event) => handleWinningSideChange(event.target.value as "TEAM_1" | "TEAM_2")}
                  value={draft.winningSide}
                >
                  <option value="TEAM_1">TEAM_1 승리</option>
                  <option value="TEAM_2">TEAM_2 승리</option>
                </select>
              </label>
              <p className="mt-2 text-xs text-slate-500">
                감지 결과: {draft.screenResult === "UNKNOWN" ? "확인 필요" : draft.screenResult}
              </p>
            </div>
            {draft.warnings.length ? (
              <div className="space-y-1 rounded-md border border-amber-300/20 bg-amber-400/10 p-3">
                {draft.warnings.map((warning) => (
                  <p className="text-xs text-amber-100" key={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            {draft.teams.map((team) => (
              <div className="rounded-md border border-white/10 bg-slate-950/40 p-3" key={team.side}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-white">
                    {team.side} · {team.teamName}
                  </h3>
                  <span className="rounded border border-white/10 px-2 py-1 text-xs text-slate-300">
                    {team.side === draft.winningSide ? "승리" : "패배"}
                  </span>
                </div>
                <div className="space-y-2">
                  {team.players.map((player) => (
                    <PlayerDraftRow
                      championOptions={draft.championOptions}
                      key={player.draftId}
                      onChampionChange={(championId) => handleChampionChange(player, championId)}
                      onChange={(patch) => handlePlayerChange(player.draftId, patch)}
                      onUserChange={(userId) => handleUserChange(player, userId)}
                      player={player}
                      userOptions={draft.userOptions}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="flex justify-end gap-2">
              <Button disabled={isSaving} onClick={() => setDraft(null)} type="button" variant="ghost">
                취소
              </Button>
              <Button disabled={isSaving} onClick={handleSave} type="button">
                {isSaving ? "저장 중..." : "내전 기록 저장"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function PlayerDraftRow({
  championOptions,
  onChampionChange,
  onChange,
  onUserChange,
  player,
  userOptions,
}: {
  championOptions: InternalMatchDraft["championOptions"];
  onChampionChange: (championId: string) => void;
  onChange: (patch: Partial<InternalMatchPlayerDraft>) => void;
  onUserChange: (userId: string) => void;
  player: InternalMatchPlayerDraft;
  userOptions: InternalMatchDraft["userOptions"];
}) {
  return (
    <div className="grid gap-2 rounded-md border border-white/10 bg-slate-950/50 p-2 lg:grid-cols-[minmax(120px,1.1fr)_minmax(120px,1fr)_64px_64px_64px_92px]">
      <Input
        className="h-9 text-xs"
        onChange={(event) => onChange({ rawPlayerName: event.target.value })}
        placeholder="인식 이름"
        value={player.rawPlayerName ?? ""}
      />
      <select
        className="h-9 rounded-md border border-white/10 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none"
        onChange={(event) => onUserChange(event.target.value)}
        value={player.userId ?? ""}
      >
        <option value="">사이트 유저 선택</option>
        {userOptions.map((option) => (
          <option key={option.optionKey} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <KdaInput label="K" onChange={(kills) => onChange({ kills })} value={player.kills} />
      <KdaInput label="D" onChange={(deaths) => onChange({ deaths })} value={player.deaths} />
      <KdaInput label="A" onChange={(assists) => onChange({ assists })} value={player.assists} />
      <select
        className="h-9 rounded-md border border-white/10 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none"
        onChange={(event) => onChange({ side: event.target.value as "TEAM_1" | "TEAM_2" })}
        value={player.side}
      >
        <option value="TEAM_1">TEAM_1</option>
        <option value="TEAM_2">TEAM_2</option>
      </select>
      <select
        className="h-9 rounded-md border border-white/10 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none lg:col-span-2"
        onChange={(event) => onChampionChange(event.target.value)}
        value={player.championId ?? ""}
      >
        <option value="">챔피언 선택</option>
        {championOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.englishName && option.englishName !== option.name ? `${option.name} (${option.englishName})` : option.name}
          </option>
        ))}
      </select>
      <select
        className="h-9 rounded-md border border-white/10 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none lg:col-span-2"
        onChange={(event) => onChange({ win: event.target.value === "true" })}
        value={String(player.win)}
      >
        <option value="true">승</option>
        <option value="false">패</option>
      </select>
      <p className="text-xs text-slate-500 lg:col-span-2">
        OCR 이름: {player.rawPlayerName || "-"}
        {player.matchedUserNickname ? ` · 매칭 유저: ${player.matchedUserNickname}` : ""}
        {player.matchedLolAccountName ? ` · 롤 계정: ${player.matchedLolAccountName}` : ""}
        {player.championName ? ` · 챔피언: ${player.championName}` : " · 챔피언 미선택"}
      </p>
    </div>
  );
}

function KdaInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number | null) => void;
  value: number | null;
}) {
  return (
    <Input
      className="h-9 text-xs"
      min={0}
      onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      placeholder={label}
      type="number"
      value={value ?? ""}
    />
  );
}

function getImageFileFromClipboard(clipboardData: DataTransfer) {
  const items = Array.from(clipboardData.items ?? []);
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  const file = imageItem?.getAsFile() ?? Array.from(clipboardData.files).find((clipboardFile) => clipboardFile.type.startsWith("image/"));

  if (!file) return null;

  const extension = getImageExtension(file.type);
  return new File([file], `pasted-match-result-${Date.now()}.${extension}`, {
    type: file.type,
  });
}

function getImageExtension(type: string) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  return "png";
}
