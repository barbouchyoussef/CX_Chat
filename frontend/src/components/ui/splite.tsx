'use client';

import { Suspense, lazy } from "react";

const Spline = lazy(() => import("@splinetool/react-spline"));

interface SplineSceneProps {
  scene: string;
  className?: string;
}

function SplineLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-18 w-18 animate-pulse rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.96),rgba(219,234,254,0.82),rgba(255,255,255,0.18))] shadow-[0_18px_40px_rgba(148,163,184,0.25)]" />
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">Loading robot</div>
      </div>
    </div>
  );
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense fallback={<SplineLoader />}>
      <Spline scene={scene} className={className} />
    </Suspense>
  );
}

