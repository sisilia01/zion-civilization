"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const PANEL_W = 2.2;
const PANEL_H = 1.4;
const SEGMENT_COUNT = 14;
const TUNNEL_LENGTH = PANEL_W * SEGMENT_COUNT;
const CORRIDOR_HALF_W = 1.55;
const CORRIDOR_HALF_H = 1.05;

type PanelSegment = {
  group: THREE.Group;
  z: number;
  panels: THREE.MeshStandardMaterial[];
};

function createPanel(): THREE.Group {
  const geo = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x120a06,
    emissive: 0xff8020,
    emissiveIntensity: 0.06,
    roughness: 0.88,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  const edges = new THREE.EdgesGeometry(geo);
  const edgeLines = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0xff9020, transparent: true, opacity: 0.75 })
  );
  const group = new THREE.Group();
  group.add(mesh);
  group.add(edgeLines);
  group.userData.panelMat = mat;
  return group;
}

function addCornerLines(group: THREE.Group) {
  const mat = new THREE.LineBasicMaterial({
    color: 0xff9030,
    transparent: true,
    opacity: 0.15,
  });
  const hw = CORRIDOR_HALF_W;
  const hh = CORRIDOR_HALF_H;
  const z0 = -PANEL_W * 0.5;
  const z1 = PANEL_W * 0.5;
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [-hw, hh],
    [hw, hh],
  ];
  for (const [x, y] of corners) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y, z0),
      new THREE.Vector3(x, y, z1),
    ]);
    group.add(new THREE.Line(geo, mat));
  }
}

function lerpAngle(from: number, to: number, alpha: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * alpha;
}

function getCameraState(t: number, totalLen: number) {
  const loopT = (t * 0.8) % totalLen;
  const x = Math.sin(t * 0.42) * 0.12;
  const y = Math.sin(t * 0.58) * 0.06;
  const angle = Math.sin(t * 0.22) * 0.08 + Math.sin(t * 0.37) * 0.04;
  return { x, y, z: -loopT, angle };
}

function buildSegment(z: number): PanelSegment {
  const group = new THREE.Group();
  const panels: THREE.MeshStandardMaterial[] = [];

  const addSurface = (x: number, y: number, rotY: number, rotX: number) => {
    const panel = createPanel();
    panel.position.set(x, y, 0);
    panel.rotation.set(rotX, rotY, 0);
    const mat = panel.userData.panelMat as THREE.MeshStandardMaterial;
    panels.push(mat);
    group.add(panel);
  };

  addSurface(-CORRIDOR_HALF_W, 0, Math.PI / 2, 0);
  addSurface(CORRIDOR_HALF_W, 0, -Math.PI / 2, 0);
  addSurface(0, -CORRIDOR_HALF_H, 0, -Math.PI / 2);
  addSurface(0, CORRIDOR_HALF_H, 0, Math.PI / 2);
  addCornerLines(group);

  group.position.z = z;
  return { group, z, panels };
}

export function TesseractBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.018);

    const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 80);
    camera.position.set(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 1);
    mount.appendChild(renderer.domElement);

    const pL = new THREE.PointLight(0xffa040, 2.4, 36);
    const pL2 = new THREE.PointLight(0x4080ff, 1.1, 70);
    pL2.position.set(0, 0.6, -28);
    scene.add(pL);
    scene.add(pL2);
    scene.add(new THREE.AmbientLight(0x1a1008, 0.12));

    const tunnelGroup = new THREE.Group();
    scene.add(tunnelGroup);

    const segments: PanelSegment[] = [];
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = buildSegment(-i * PANEL_W);
      tunnelGroup.add(seg.group);
      segments.push(seg);
    }

    const dustCount = 300;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = (Math.random() - 0.5) * CORRIDOR_HALF_W * 1.6;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * CORRIDOR_HALF_H * 1.6;
      dustPos[i * 3 + 2] = -Math.random() * TUNNEL_LENGTH;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xffc060,
      size: 0.06,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const clock = new THREE.Clock();
    let camAngle = 0;

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const recycleSegments = (camZ: number) => {
      for (const seg of segments) {
        while (seg.z > camZ + PANEL_W * 1.5) {
          seg.z -= TUNNEL_LENGTH;
          seg.group.position.z = seg.z;
        }
        while (seg.z < camZ - TUNNEL_LENGTH - PANEL_W * 1.5) {
          seg.z += TUNNEL_LENGTH;
          seg.group.position.z = seg.z;
        }
      }
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const elapsed = clock.getElapsedTime();

      if (!reducedMotion) {
        const state = getCameraState(elapsed, TUNNEL_LENGTH);
        camAngle = lerpAngle(camAngle, state.angle, 0.015);

        camera.position.set(state.x, state.y, state.z);
        camera.lookAt(
          state.x + Math.sin(camAngle) * 2,
          state.y + Math.sin(elapsed * 0.58) * 0.03,
          state.z - Math.cos(camAngle) * 6
        );

        pL.position.set(state.x, state.y + 0.25, state.z - 2.8);

        recycleSegments(state.z);

        for (const seg of segments) {
          const dist = Math.abs(seg.z - state.z);
          const prox = Math.max(0, 1 - dist / 7);
          for (const mat of seg.panels) {
            mat.emissiveIntensity = 0.05 + prox * 0.38;
            mat.emissive.setHex(prox > 0.35 ? 0xffa040 : 0xff7020);
          }
        }

        const dustAttr = dustGeo.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < dustCount; i++) {
          let z = dustAttr.getZ(i) + 0.018;
          if (z > state.z + 2) z -= TUNNEL_LENGTH;
          dustAttr.setZ(i, z);
        }
        dustAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dustGeo.dispose();
      dustMat.dispose();
      tunnelGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
        if (obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) obj.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background: "#000000",
      }}
      aria-hidden
    />
  );
}
