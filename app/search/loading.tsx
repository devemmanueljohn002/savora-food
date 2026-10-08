import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="section container" aria-busy="true" aria-label="Loading search results">
      <Skeleton style={{ height: 44, width: "min(420px, 80%)" }} />
      <div style={{ marginTop: 12 }}>
        <Skeleton style={{ height: 18, width: "min(300px, 60%)" }} />
      </div>
      <div className="grid" style={{ marginTop: 24 }}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="card">
            <Skeleton style={{ height: 175, borderRadius: 0 }} />
            <div className="card-body" style={{ display: "grid", gap: 8 }}>
              <Skeleton style={{ height: 18 }} />
              <Skeleton style={{ height: 14, width: "60%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
