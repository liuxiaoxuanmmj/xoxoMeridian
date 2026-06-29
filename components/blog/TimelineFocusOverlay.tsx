export type TimelineFocusSegment = {
  id: string;
  userId: string;
  lane: 0 | 1;
  topPx: number;
  heightPx: number;
};

export function TimelineFocusOverlay({
  segments,
}: {
  segments: TimelineFocusSegment[];
}) {
  return (
    <div
      aria-hidden="true"
      data-testid="timeline-focus-overlay"
      className="pointer-events-none absolute inset-0 z-10"
    >
      {segments.map((segment) => (
        <div
          key={segment.id}
          data-focus-user={segment.userId}
          style={{
            top: `${segment.topPx}px`,
            height: `${segment.heightPx}px`,
          }}
          className={`absolute w-2 rounded-full ${
            segment.lane === 0 ? "left-[calc(50%-10px)] bg-sky-200/70" : "left-[calc(50%+4px)] bg-emerald-200/70"
          }`}
        />
      ))}
    </div>
  );
}
