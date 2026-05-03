type SectionTitleProps = {
  title: string;
  description?: string;
};

export function SectionTitle({ title, description }: SectionTitleProps) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
      {description ? <p className="mt-1 text-sm text-[var(--foreground-muted)]">{description}</p> : null}
    </div>
  );
}
