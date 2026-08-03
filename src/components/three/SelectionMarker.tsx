'use client';
/**
 * 현재 선택된 노드의 구역을 감싸는 후광.
 *
 * 선택 상태는 결코 색에 의존하지 않도록 세 가지 방식으로 동시에 표현된다. 후광 고리
 * 자체, 그 둘레의 방사형 눈금 네 개, 그리고 `ParticleField`에서 해당 노드의 입자에
 * 적용되는 배율 증가다. DOM 인스펙터는 같은 선택 상태를 텍스트로 전달한다.
 */
import { useRef } from 'react';
import * as THREE from 'three';
import { Billboard } from '@react-three/drei';
import { getEntity } from '@/simulation/entities';
import { useSimulationStore } from '@/store/simulationStore';
import { ENTITY_ZONES } from './sceneLayout';
import { useEngineFrame } from './useEngineFrame';

/** 후광이 관 벽 안쪽에 넉넉히 들어오도록 유지한다. */
const MAX_RING_RADIUS = 1.4;

const TICK_ANGLES: readonly number[] = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

export function SelectionMarker() {
  const selectedEntityId = useSimulationStore((state) => state.selectedEntityId);

  const pulseRef = useRef<THREE.Group>(null);
  const ticksRef = useRef<THREE.Group>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const innerMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  useEngineFrame((ctx) => {
    const selected = ctx.selectedEntityId;
    if (selected === null) return;

    const level = ctx.levels[selected];
    const wave = ctx.reducedMotion ? 0 : Math.sin(ctx.elapsed * 1.7);

    const pulse = pulseRef.current;
    if (pulse !== null) {
      const scale = 1 + 0.045 * wave;
      pulse.scale.set(scale, scale, scale);
    }

    const ticks = ticksRef.current;
    if (ticks !== null) {
      ticks.rotation.z = ctx.reducedMotion ? 0 : ctx.elapsed * 0.35;
    }

    const opacity = 0.34 + 0.46 * level;
    const ringMaterial = ringMaterialRef.current;
    if (ringMaterial !== null) ringMaterial.opacity = opacity;
    const innerMaterial = innerMaterialRef.current;
    if (innerMaterial !== null) innerMaterial.opacity = opacity * 0.55;
  });

  if (selectedEntityId === null) return null;

  const zone = ENTITY_ZONES[selectedEntityId];
  const definition = getEntity(selectedEntityId);
  const ringRadius = Math.min(zone.radius * 1.3, MAX_RING_RADIUS);

  return (
    <group position={[zone.center[0], zone.center[1], zone.center[2]]}>
      <Billboard>
        <group ref={pulseRef}>
          {/* 속이 찬 바깥쪽 후광. */}
          <mesh>
            <ringGeometry args={[ringRadius, ringRadius + 0.045, 64]} />
            <meshBasicMaterial
              ref={ringMaterialRef}
              color={definition.color}
              side={THREE.DoubleSide}
              transparent
              opacity={0.5}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* 각진 안쪽 고리: 형태가 다른 두 번째 단서. */}
          <mesh>
            <torusGeometry args={[ringRadius * 0.78, 0.018, 5, 10]} />
            <meshBasicMaterial
              ref={innerMaterialRef}
              color={definition.color}
              transparent
              opacity={0.3}
              depthWrite={false}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* 방사형 눈금 네 개 — 색을 전혀 인지하지 못해도 읽을 수 있다. */}
          <group ref={ticksRef}>
            {TICK_ANGLES.map((angle) => (
              <mesh
                key={angle}
                position={[
                  Math.cos(angle) * (ringRadius + 0.16),
                  Math.sin(angle) * (ringRadius + 0.16),
                  0,
                ]}
                rotation={[0, 0, angle]}
              >
                <boxGeometry args={[0.19, 0.032, 0.012]} />
                <meshBasicMaterial
                  color={definition.color}
                  transparent
                  opacity={0.7}
                  depthWrite={false}
                  toneMapped={false}
                  blending={THREE.AdditiveBlending}
                />
              </mesh>
            ))}
          </group>
        </group>
      </Billboard>
    </group>
  );
}
