"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Float } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

export type ClassIconVariant = "elite" | "middle" | "poor";

const SILVER = { color: "#a0a0b0", metalness: 0.95, roughness: 0.05 };

function createCoinZTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = "#3a3a48";
  ctx.font = "bold 168px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Z", 128, 138);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.strokeText("Z", 128, 138);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function Coin() {
  const groupRef = useRef<THREE.Group>(null);
  const flipPhase = useRef(0);
  const zMap = useMemo(() => createCoinZTexture(), []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.55;
    flipPhase.current += delta;
    const t = flipPhase.current;
    const flip = Math.max(0, Math.sin(t * 0.9)) ** 2;
    groupRef.current.position.y = flip * 0.35;
    groupRef.current.rotation.x = flip * Math.PI * 0.85;
  });

  return (
    <group ref={groupRef} scale={0.72}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1, 1, 0.15, 64]} />
        <meshStandardMaterial {...SILVER} />
      </mesh>
      <mesh position={[0, 0, 0.078]}>
        <planeGeometry args={[0.95, 0.95]} />
        <meshStandardMaterial
          map={zMap}
          transparent
          opacity={0.95}
          metalness={0.85}
          roughness={0.12}
          color="#888898"
        />
      </mesh>
      <mesh position={[0, 0, -0.078]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.95, 0.95]} />
        <meshStandardMaterial
          map={zMap}
          transparent
          opacity={0.95}
          metalness={0.85}
          roughness={0.12}
          color="#888898"
        />
      </mesh>
    </group>
  );
}

function CoinCanvas() {
  return (
    <Canvas
      style={{ width: 160, height: 160 }}
      camera={{ position: [0, 2, 4], fov: 45 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} intensity={1.5} color="#ffffff" />
      <pointLight position={[-3, -2, -3]} intensity={0.5} color="#0088ff" />
      <spotLight position={[0, 8, 0]} intensity={1} angle={0.3} />
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      <Float speed={1.5} rotationIntensity={0.3} floatIntensity={0.3}>
        <Coin />
      </Float>
      <ContactShadows opacity={0.4} blur={2} />
    </Canvas>
  );
}

function EliteDiamond() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += 0.008;
    groupRef.current.rotation.x += 0.003;
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <octahedronGeometry args={[1.2, 0]} />
        <meshStandardMaterial color="#d4a017" metalness={1.0} roughness={0.0} />
      </mesh>
      <mesh>
        <octahedronGeometry args={[1.2, 0]} />
        <meshStandardMaterial color="#ffdd44" wireframe transparent opacity={0.2} />
      </mesh>
    </group>
  );
}

function Hammer() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.z = Math.sin(t * 2) * 0.4;
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <cylinderGeometry args={[0.08, 0.1, 2.0, 12]} />
        <meshStandardMaterial color="#5c3d1e" metalness={0} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.9, 0.55, 0.55]} />
        <meshStandardMaterial color="#4a4a4a" metalness={0.8} roughness={0.4} />
      </mesh>
    </group>
  );
}

function EliteCanvas() {
  return (
    <Canvas
      style={{ width: 160, height: 160 }}
      camera={{ position: [0, 0, 4], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 3, 3]} color="#ffdd44" intensity={2} />
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      <Float speed={1.5} floatIntensity={0.4}>
        <EliteDiamond />
      </Float>
    </Canvas>
  );
}

function PoorCanvas() {
  return (
    <Canvas
      style={{ width: 160, height: 160 }}
      camera={{ position: [1.5, 0.5, 4], fov: 45 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.4} />
      <pointLight position={[2, 3, 2]} color="#aabbcc" intensity={2} />
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      <Float speed={1.5} floatIntensity={0.4}>
        <Hammer />
      </Float>
    </Canvas>
  );
}

export function ClassIcon3D({ variant }: { variant: ClassIconVariant }) {
  if (variant === "middle") {
    return (
      <div className="classIcon3DWrap" aria-hidden>
        <CoinCanvas />
      </div>
    );
  }

  if (variant === "elite") {
    return (
      <div className="classIcon3DWrap" aria-hidden>
        <EliteCanvas />
      </div>
    );
  }

  return (
    <div className="classIcon3DWrap" aria-hidden>
      <PoorCanvas />
    </div>
  );
}

export default ClassIcon3D;
