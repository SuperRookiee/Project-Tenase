'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { VESSEL_LENGTH, VESSEL_RADIUS, createSeededRandom } from './sceneLayout';
import { useEngineFrame } from './useEngineFrame';

const MAX_CURRENT_PARTICLES = 72;
const STRIDE = 5;
const SEED = 8_121_144;
const scratchObject = new THREE.Object3D();

function buildCurrentLayout(): Float32Array {
  const random = createSeededRandom(SEED);
  const data = new Float32Array(MAX_CURRENT_PARTICLES * STRIDE);
  for (let index = 0; index < MAX_CURRENT_PARTICLES; index += 1) {
    const offset = index * STRIDE;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * VESSEL_RADIUS * 0.78;
    data[offset] = random();
    data[offset + 1] = Math.cos(angle) * radius;
    data[offset + 2] = Math.sin(angle) * radius;
    data[offset + 3] = 0.035 + random() * 0.045;
    data[offset + 4] = 0.6 + random() * 0.9;
  }
  return data;
}

export function VesselCurrent() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const data = useMemo(() => buildCurrentLayout(), []);

  useEngineFrame((ctx) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const density = ctx.config.particleDensity;
    const visible = Math.min(
      MAX_CURRENT_PARTICLES,
      Math.max(12, Math.round(MAX_CURRENT_PARTICLES * density)),
    );
    mesh.count = visible;

    if (materialRef.current) {
      materialRef.current.opacity = 0.06 + ctx.signals.networkActivity * 0.12;
    }

    for (let index = 0; index < visible; index += 1) {
      const offset = index * STRIDE;
      const base = data[offset] ?? 0;
      const speed = data[offset + 4] ?? 1;
      const progress = ctx.reducedMotion
        ? base
        : (base + ctx.elapsed * 0.025 * speed) % 1;
      scratchObject.position.set(
        -VESSEL_LENGTH / 2 + progress * VESSEL_LENGTH,
        data[offset + 1] ?? 0,
        data[offset + 2] ?? 0,
      );
      const size = data[offset + 3] ?? 0.05;
      scratchObject.scale.set(size * 2.8, size, size);
      scratchObject.updateMatrix();
      mesh.setMatrixAt(index, scratchObject.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_CURRENT_PARTICLES]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 5, 4]} />
      <meshBasicMaterial
        ref={materialRef}
        color="#93c5fd"
        transparent
        opacity={0.08}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
