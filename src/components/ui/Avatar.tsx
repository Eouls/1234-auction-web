import { cn } from "@/lib/cn";

type AvatarProps = {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-xl",
  xl: "h-24 w-24 text-3xl",
};

export function Avatar({ name, size = "md", className }: AvatarProps) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div
      aria-label={`${name} 프로필 이미지`}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-cyan-300/30 bg-gradient-to-br from-slate-700 to-cyan-950 font-bold text-cyan-100",
        sizes[size],
        className,
      )}
    >
      {initial}
    </div>
  );
}
