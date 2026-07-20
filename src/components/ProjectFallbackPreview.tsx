import { memo } from "react";

type ProjectFallbackPreviewProps = {
  colors?: string[];
  theme: string;
  element: string;
  language?: "zh" | "en";
};

const DEFAULT_COLORS = ["#F8F1E4", "#8F1D21", "#D6A23A", "#315B52", "#25211E"];

function buildColorCells(colors: string[], seedText: string): string[] {
  const seed = Array.from(seedText).reduce((total, character) => total + (character.codePointAt(0) ?? 0), 0);
  return Array.from({ length: 120 }, (_, index) => {
    const x = index % 12;
    const y = Math.floor(index / 12);
    const mirroredX = Math.min(x, 11 - x);
    const distance = Math.abs(mirroredX - 2.5) + Math.abs(y - 4.5);
    return colors[(Math.floor(distance) + seed + (x * y) % 3) % colors.length];
  });
}

export const ProjectFallbackPreview = memo(function ProjectFallbackPreview({
  colors = DEFAULT_COLORS,
  theme,
  element,
  language = "zh",
}: ProjectFallbackPreviewProps) {
  const palette = colors.length > 0 ? colors : DEFAULT_COLORS;
  const cells = buildColorCells(palette, `${theme}:${element}`);
  const label = language === "en" ? "Legacy palette preview" : "历史项目配色预览";

  return (
    <div
      role="img"
      aria-label={`${theme} ${element} ${label}`}
      className="relative h-full w-full overflow-hidden bg-stone-100"
    >
      <div
        className="grid h-full w-full opacity-90"
        style={{
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          gridTemplateRows: "repeat(10, minmax(0, 1fr))",
        }}
      >
        {cells.map((color, index) => (
          <span key={`${index}-${color}`} className="border border-white/40" style={{ backgroundColor: color }} />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/55 to-transparent px-3 pb-3 pt-10 text-white">
        <p className="truncate text-sm font-semibold">{theme} · {element}</p>
        <p className="mt-0.5 text-[11px] text-white/80">{label}</p>
      </div>
    </div>
  );
});
