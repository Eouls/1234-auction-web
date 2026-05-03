export function ChampionIconPlaceholder({
  imageUrl,
  name,
}: {
  imageUrl?: string | null;
  name: string;
}) {
  return (
    <div className="flex w-14 flex-col items-center gap-1">
      <div className="grid h-10 w-10 overflow-hidden rounded-md border border-white/10 bg-slate-950">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${name} 챔피언 초상화`}
            className="h-full w-full object-cover"
            loading="lazy"
            src={imageUrl}
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-[10px] font-semibold text-slate-300">
            {name.slice(0, 3)}
          </span>
        )}
      </div>
      <span className="max-w-full truncate text-center text-[10px] font-medium text-slate-400">{name}</span>
    </div>
  );
}
