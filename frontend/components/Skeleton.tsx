const block = "rounded bg-surface-2 motion-safe:animate-pulse";

function RowSkeleton({ thumbs }: { thumbs: boolean }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
      {thumbs && (
        <div className="hidden shrink-0 gap-1.5 sm:flex">
          {[0, 1, 2].map((i) => <div key={i} className={`size-16 ${block}`} />)}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className={`h-4 w-2/5 ${block}`} />
        <div className={`h-3 w-1/4 ${block}`} />
      </div>
      <div className="hidden w-80 shrink-0 grid-cols-4 gap-2 xl:grid">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`h-9 ${block}`} />)}
      </div>
    </div>
  );
}

function CardSkeleton({ square }: { square: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
      <div className={`w-full ${square ? "aspect-square" : "aspect-video"} ${block}`} />
      <div className={`h-4 w-3/4 ${block}`} />
      <div className={`h-3 w-1/2 ${block}`} />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className={`h-8 ${block}`} />)}
      </div>
    </div>
  );
}

/** Placeholder shaped like the list it stands in for; the view's own status line announces the loading. */
export function ListSkeleton({ variant, count = 6, className = "" }: {
  variant: "rows" | "thumb-rows" | "cards" | "square-cards";
  count?: number;
  className?: string;
}) {
  const layout = {
    "cards": "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
    "square-cards": "grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4",
    "rows": "flex flex-col gap-3",
    "thumb-rows": "flex flex-col gap-3",
  }[variant];
  const cards = variant === "cards" || variant === "square-cards";
  return (
    <div aria-hidden="true" className={`${layout} ${className}`}>
      {Array.from({ length: count }, (_, i) =>
        cards ? <CardSkeleton key={i} square={variant === "square-cards"} /> : <RowSkeleton key={i} thumbs={variant === "thumb-rows"} />)}
    </div>
  );
}
