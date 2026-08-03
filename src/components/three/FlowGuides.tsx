'use client';

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getReaction, reactionParticipants } from '@/simulation/reactions';
import { getReactionTrace } from '@/simulation/reactionTrace';
import type { EntityId } from '@/simulation/types';
import { ENTITY_ZONES } from './sceneLayout';
import { useEngineFrame } from './useEngineFrame';

interface FlowLink {
  readonly reactionId: string;
  readonly from: EntityId;
  readonly to: EntityId;
}

const FLOW_LINKS: readonly FlowLink[] = [
  { reactionId: 'r1-activation', from: 'factorIX', to: 'factorIXa' },
  { reactionId: 'r1-activation', from: 'platelets', to: 'factorIXa' },
  { reactionId: 'r2-binding', from: 'factorIXa', to: 'tenaseComplex' },
  { reactionId: 'r2-binding', from: 'factorVIIIa', to: 'tenaseComplex' },
  { reactionId: 'r2-binding', from: 'platelets', to: 'tenaseComplex' },
  { reactionId: 'r3-conversion', from: 'tenaseComplex', to: 'factorXa' },
  { reactionId: 'r3-conversion', from: 'factorX', to: 'factorXa' },
  { reactionId: 'r4-conversion', from: 'factorXa', to: 'thrombin' },
  { reactionId: 'r4-conversion', from: 'prothrombin', to: 'thrombin' },
  { reactionId: 'r5-conversion', from: 'thrombin', to: 'fibrin' },
  { reactionId: 'r5-conversion', from: 'fibrinogen', to: 'fibrin' },
  { reactionId: 'i1-inhibition', from: 'tfpi', to: 'factorXa' },
  { reactionId: 'i2-inhibition', from: 'antithrombin', to: 'thrombin' },
];

const FLOW_COLORS = {
  activation: '#38bdf8',
  binding: '#c084fc',
  conversion: '#2dd4bf',
  inhibition: '#eab308',
} as const;

const UP = new THREE.Vector3(0, 1, 0);

function FlowPath({ link }: { readonly link: FlowLink }) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const markerMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const markerRef = useRef<THREE.Group>(null);
  const travelRef = useRef(0);
  const reaction = getReaction(link.reactionId);
  const participants = useMemo(
    () => new Set(reactionParticipants(reaction)),
    [reaction],
  );
  const geometry = useMemo(() => {
    const start = new THREE.Vector3(...ENTITY_ZONES[link.from].center);
    const end = new THREE.Vector3(...ENTITY_ZONES[link.to].center);
    const direction = end.clone().sub(start);
    const length = Math.max(0.1, direction.length());
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      UP,
      direction.normalize(),
    );
    return {
      length,
      midpoint: midpoint.toArray() as [number, number, number],
      quaternion: quaternion.toArray() as [number, number, number, number],
    };
  }, [link.from, link.to]);
  const color = FLOW_COLORS[reaction.kind];

  useEngineFrame((ctx) => {
    const activity = ctx.reactionActivity[link.reactionId] ?? 0;
    const active = Math.min(1, activity * 2.2);
    const inTrace =
      ctx.selectedEntityId === null ||
      getReactionTrace(ctx.selectedEntityId).reactionIds.has(link.reactionId);
    const nearHover =
      ctx.hoveredEntityId === null || participants.has(ctx.hoveredEntityId);
    const related = inTrace && nearHover;
    const traceBoost = ctx.selectedEntityId !== null && inTrace ? 0.25 : 0;
    const baseOpacity = related ? 0.07 + traceBoost : 0.012;
    if (materialRef.current) {
      materialRef.current.opacity = baseOpacity + active * (related ? 0.68 : 0.03);
      materialRef.current.emissiveIntensity = related
        ? 0.12 + traceBoost + active * 1.15
        : 0.03;
    }
    if (markerMaterialRef.current) {
      markerMaterialRef.current.opacity = related
        ? 0.14 + traceBoost + active * 0.72
        : 0.02;
    }
    if (markerRef.current && reaction.kind !== 'inhibition') {
      if (!ctx.reducedMotion) {
        travelRef.current =
          (travelRef.current + ctx.delta * (0.18 + active * 0.72)) % 1;
      }
      markerRef.current.position.y =
        -geometry.length * 0.38 + geometry.length * 0.76 * travelRef.current;
    }
  });

  return (
    <group position={geometry.midpoint} quaternion={geometry.quaternion}>
      <mesh>
        <cylinderGeometry args={[0.016, 0.016, geometry.length, 6, 1]} />
        <meshStandardMaterial ref={materialRef} color={color} emissive={color} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      {reaction.kind === 'inhibition' ? (
        <group ref={markerRef} position={[0, geometry.length * 0.36, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.34, 0.055, 0.055]} />
            <meshBasicMaterial ref={markerMaterialRef} color={color} transparent opacity={0.3} depthWrite={false} />
          </mesh>
        </group>
      ) : (
        <group ref={markerRef} position={[0, geometry.length * 0.38, 0]}>
          <mesh>
            <coneGeometry args={[0.09, 0.24, 7]} />
            <meshBasicMaterial ref={markerMaterialRef} color={color} transparent opacity={0.3} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function FlowGuides() {
  return (
    <group>
      {FLOW_LINKS.map((link) => (
        <FlowPath key={`${link.reactionId}-${link.from}-${link.to}`} link={link} />
      ))}
    </group>
  );
}
