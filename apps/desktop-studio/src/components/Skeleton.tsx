interface SkeletonLineProps {
  width?: "full" | "medium" | "short";
  className?: string;
}

export function SkeletonLine({ width = "full", className = "" }: SkeletonLineProps) {
  return <div className={`skeleton skeleton-line ${width !== "full" ? width : ""} ${className}`} aria-hidden="true" />;
}

export function SkeletonBlock({ height = 48, className = "" }: { height?: number; className?: string }) {
  return <div className={`skeleton skeleton-block ${className}`} style={{ height }} aria-hidden="true" />;
}

export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div role="status" aria-label="Loading content">
      <span className="sr-only">Loading...</span>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine key={i} width={i === lines - 1 ? "short" : "full"} />
      ))}
    </div>
  );
}
