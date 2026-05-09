'use client';

import { Suspense, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Html, OrbitControls, useGLTF, useProgress } from "@react-three/drei";
import type { Group } from "three";

type RobotSceneProps = {
  className?: string;
};

const ROBOT_URL = "https://modelviewer.dev/shared-assets/models/RobotExpressive.glb";

function RobotModel({ onReady }: { onReady: () => void }) {
  const gltf = useGLTF(ROBOT_URL);
  const group = useMemo(() => gltf.scene.clone(), [gltf.scene]);
  const groupRef = useRef<Group | null>(null);

  useEffect(() => {
    group.traverse((child) => {
      const mesh = child as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean };
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    startTransition(() => onReady());
  }, [group, onReady]);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = -0.25 + Math.sin(state.clock.elapsedTime * 0.55) * 0.1;
    groupRef.current.position.y = -1.12 + Math.sin(state.clock.elapsedTime * 1.05) * 0.05;
  });

  return (
    <group ref={groupRef}>
      <primitive object={group} position={[0, -1.12, 0]} scale={1.5} />
    </group>
  );
}

function Loader() {
  const { progress } = useProgress();

  return (
    <Html center>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-18 w-18 animate-pulse rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.96),rgba(219,234,254,0.82),rgba(255,255,255,0.18))] shadow-[0_18px_40px_rgba(148,163,184,0.25)]" />
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
          Loading robot {Math.round(progress)}%
        </div>
      </div>
    </Html>
  );
}

export default function RobotScene({ className }: RobotSceneProps) {
  const [ready, setReady] = useState(false);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="pointer-events-none absolute inset-x-[10%] top-[10%] h-44 rounded-full bg-[radial-gradient(circle,rgba(226,232,240,0.95),rgba(255,255,255,0))] blur-3xl" />
      <div className="pointer-events-none absolute bottom-[10%] right-[18%] h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(191,219,254,0.65),rgba(255,255,255,0))] blur-2xl" />
      <div className={`absolute inset-0 transition-all duration-700 ${ready ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}>
        <Canvas
          dpr={[1, 1.25]}
          camera={{ position: [0, 0.2, 4.4], fov: 32 }}
          frameloop="always"
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          shadows
        >
          <ambientLight intensity={1.2} />
          <directionalLight position={[2.4, 3.6, 2.6]} intensity={1.55} castShadow />
          <directionalLight position={[-2.2, 1.3, -1.2]} intensity={0.45} />
          <Suspense fallback={<Loader />}>
            <RobotModel onReady={() => setReady(true)} />
            <ContactShadows position={[0, -1.78, 0]} opacity={0.28} scale={5.4} blur={2.6} far={2.8} />
            <OrbitControls
              enablePan={false}
              enableZoom={false}
              minPolarAngle={Math.PI / 2.25}
              maxPolarAngle={Math.PI / 1.9}
              minAzimuthAngle={-0.45}
              maxAzimuthAngle={0.45}
              autoRotate
              autoRotateSpeed={0.45}
            />
            <Environment preset="city" />
          </Suspense>
        </Canvas>
      </div>
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
          ready ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="absolute inset-x-[16%] top-[18%] h-56 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.98),rgba(226,232,240,0.78),rgba(255,255,255,0))] blur-2xl" />
        <div className="absolute inset-x-[32%] top-[28%] h-52 rounded-full border border-slate-200/70 bg-white/35 shadow-[0_20px_50px_rgba(226,232,240,0.45)] backdrop-blur-sm" />
      </div>
    </div>
  );
}

useGLTF.preload(ROBOT_URL);

