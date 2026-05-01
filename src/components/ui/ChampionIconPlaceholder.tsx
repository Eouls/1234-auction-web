export function ChampionIconPlaceholder({ name }: { name: string }) {
  return (
    <div className="grid h-10 w-10 place-items-center rounded-md border border-white/10 bg-slate-950 text-[10px] font-semibold text-slate-300">
      {name.slice(0, 3)}
    </div>
  );
}
