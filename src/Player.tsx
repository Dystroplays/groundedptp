import { lazy, Suspense } from "react";
const Mux = lazy(() => import("@mux/mux-player-react"));
export default function Player(props: any) {
  return (
    <Suspense
      fallback={
        <div className="video-placeholder" role="status">
          Loading your video…
        </div>
      }
    >
      <Mux {...props} />
    </Suspense>
  );
}
