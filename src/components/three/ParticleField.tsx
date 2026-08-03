'use client';
/**
 * 추상 그래프의 노드를 나타내는, 자유롭게 떠다니는 입자.
 *
 * 노드마다 InstancedMesh를 하나씩 두고 그 노드의 용량만큼 한 번 할당한 뒤 다시 크기를
 * 바꾸지 않는다. 런타임에 달라지는 것은 `allocateParticles`가 정하는 `.count`뿐이므로
 * 장면이 전역 인스턴스 예산을 넘어설 수 없다. 형상은 각 노드의 `shape` 필드에서 가져온
 * 개념적 대체물이며, 분자 구조를 닮지 않았고 닮게 할 의도도 없다.
 *
 * 위치는 `sceneLayout`의 시드 생성기로 결정론적으로 흩뿌린다. 여기서 플랫폼 내장 난수
 * 소스는 절대 쓰지 않는다.
 *
 * hover는 가까운 상호작용을 미리 보여 주고 click은 같은 store 선택을 고정한다.
 * DOM 컨트롤도 동일한 선택 경로를 유지한다.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { getEntity } from '@/simulation/entities';
import {
  getInteractionNeighbors,
  getReactionTrace,
} from '@/simulation/reactionTrace';
import {
  PARTICLE_CAPACITY,
  PARTICLE_ENTITIES,
  allocateParticles,
  type ParticleAllocation,
} from '@/simulation/particles';
import type { EntityId, EntityShape } from '@/simulation/types';
import { simulationStore } from '@/store/simulationStore';
import { ENTITY_ZONES, createSeededRandom } from './sceneLayout';
import { useEngineFrame } from './useEngineFrame';

/** 스트라이드: 기준 xyz, 드리프트 xyz, 드리프트 위상, 회전 위상, 회전 속도, 크기. */
const STRIDE = 10;

const SEED_BASE = 913_741;
const SEED_STEP = 7919;

/** 현재 선택된 노드의 입자에 추가로 적용하는 배율. */
const SELECTION_SCALE_BOOST = 1.42;

/**
 * 개수는 천천히 변하는 정수다. 초당 몇 번만 다시 계산하면 렌더 루프에서 프레임마다
 * 객체가 생겼다 사라지는 일을 피하면서도, 눈이 따라올 수 있는 것보다 빠르게 슬라이더
 * 변화에 반응한다.
 */
const ALLOCATION_INTERVAL_SECONDS = 0.05;

// 스크래치 인스턴스를 모듈 스코프로 끌어올렸다. 루프는 아무것도 할당하지 않는다.
const scratchObject = new THREE.Object3D();
const scratchDirection = new THREE.Vector3();

interface ParticleLayout {
  readonly id: EntityId;
  readonly capacity: number;
  readonly data: Float32Array;
  readonly driftRate: number;
}

const MOTION_SPEED = {
  precursor: 0.78,
  activated: 1.28,
  cofactor: 0.72,
  complex: 0.88,
  inhibitor: 0.56,
  structural: 0.45,
  surface: 0.5,
} as const;

function buildLayout(id: EntityId, seedIndex: number): ParticleLayout {
  const capacity = PARTICLE_CAPACITY[id] ?? 0;
  const zone = ENTITY_ZONES[id];
  const random = createSeededRandom(SEED_BASE + seedIndex * SEED_STEP);
  const data = new Float32Array(capacity * STRIDE);

  for (let index = 0; index < capacity; index += 1) {
    const offset = index * STRIDE;

    // 노드의 구형 구역 안에 거의 균일하게 흩뿌린다.
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const radius = zone.radius * Math.cbrt(random());
    const sinPhi = Math.sin(phi);

    data[offset] = zone.center[0] + radius * sinPhi * Math.cos(theta);
    data[offset + 1] = zone.center[1] + radius * sinPhi * Math.sin(theta);
    data[offset + 2] = zone.center[2] + radius * Math.cos(phi);

    // 입자마다 드리프트 축을 하나씩 둔다. 구름이 통째로 이동하지 않고 숨 쉬듯 움직인다.
    scratchDirection
      .set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1)
      .normalize();
    const amplitude = 0.07 + random() * 0.16;
    data[offset + 3] = scratchDirection.x * amplitude;
    data[offset + 4] = scratchDirection.y * amplitude;
    data[offset + 5] = scratchDirection.z * amplitude;

    data[offset + 6] = random() * Math.PI * 2;
    data[offset + 7] = random() * Math.PI * 2;
    data[offset + 8] = 0.25 + random() * 0.7;
    data[offset + 9] = 0.78 + random() * 0.45;
  }

  const definition = getEntity(id);
  return {
    id,
    capacity,
    data,
    driftRate: MOTION_SPEED[definition.kind] * (0.88 + (seedIndex % 5) * 0.045),
  };
}

function buildCurrentPositions(
  layouts: readonly ParticleLayout[],
): Partial<Record<EntityId, Float32Array>> {
  const positions: Partial<Record<EntityId, Float32Array>> = {};
  for (const layout of layouts) {
    const current = new Float32Array(layout.capacity * 3);
    for (let index = 0; index < layout.capacity; index += 1) {
      const dataOffset = index * STRIDE;
      const currentOffset = index * 3;
      current[currentOffset] = layout.data[dataOffset] ?? 0;
      current[currentOffset + 1] = layout.data[dataOffset + 1] ?? 0;
      current[currentOffset + 2] = layout.data[dataOffset + 2] ?? 0;
    }
    positions[layout.id] = current;
  }
  return positions;
}

function ParticleGeometry({ shape }: { shape: EntityShape }) {
  switch (shape) {
    case 'sphere':
      return <sphereGeometry args={[0.13, 10, 8]} />;
    case 'box':
      return <boxGeometry args={[0.2, 0.2, 0.2]} />;
    case 'octahedron':
      return <octahedronGeometry args={[0.17, 0]} />;
    case 'tetrahedron':
      return <tetrahedronGeometry args={[0.2, 0]} />;
    case 'icosahedron':
      return <icosahedronGeometry args={[0.17, 0]} />;
    case 'torus':
      return <torusGeometry args={[0.12, 0.05, 6, 14]} />;
    case 'capsule':
      return <capsuleGeometry args={[0.07, 0.17, 3, 8]} />;
    case 'cone':
      return <coneGeometry args={[0.13, 0.25, 7]} />;
    default:
      return <sphereGeometry args={[0.13, 10, 8]} />;
  }
}

export function ParticleField() {
  const viewportWidth = useThree((state) => state.size.width);
  const densityScale = viewportWidth < 640 ? 0.55 : viewportWidth < 960 ? 0.78 : 1;
  const layouts = useMemo(
    () => PARTICLE_ENTITIES.map((id, index) => buildLayout(id, index)),
    [],
  );

  const meshesRef = useRef<Partial<Record<EntityId, THREE.InstancedMesh | null>>>(
    {},
  );
  const materialsRef = useRef<
    Partial<Record<EntityId, THREE.MeshStandardMaterial | null>>
  >({});
  const allocationRef = useRef<ParticleAllocation | null>(null);
  const allocationTimerRef = useRef(Number.POSITIVE_INFINITY);
  const currentPositionsRef = useRef<Partial<Record<EntityId, Float32Array>> | null>(
    null,
  );
  if (currentPositionsRef.current === null) {
    currentPositionsRef.current = buildCurrentPositions(layouts);
  }

  useEngineFrame((ctx) => {
    allocationTimerRef.current += ctx.delta;
    if (
      allocationRef.current === null ||
      allocationTimerRef.current >= ALLOCATION_INTERVAL_SECONDS
    ) {
      allocationTimerRef.current = 0;
      allocationRef.current = allocateParticles(
        ctx.levels,
        ctx.config.particleDensity * densityScale,
        ctx.config.enabled,
      );
    }

    const counts = allocationRef.current.counts;
    const phaseTime = ctx.reducedMotion ? 0 : ctx.elapsed;

    for (const layout of layouts) {
      const mesh = meshesRef.current[layout.id];
      if (!mesh) continue;

      const visible = Math.min(layout.capacity, counts[layout.id] ?? 0);
      mesh.visible = visible > 0;
      mesh.count = visible;

      const level = ctx.levels[layout.id];
      const material = materialsRef.current[layout.id];
      const selected = ctx.selectedEntityId === layout.id;
      const hovered = ctx.hoveredEntityId === layout.id;
      const inTrace =
        ctx.selectedEntityId === null ||
        getReactionTrace(ctx.selectedEntityId).entityIds.has(layout.id);
      const nearHover =
        ctx.hoveredEntityId === null ||
        getInteractionNeighbors(ctx.hoveredEntityId).has(layout.id);
      if (material) {
        material.emissiveIntensity =
          (selected || hovered ? 0.72 : 0.2) +
          0.5 * level * (selected || hovered ? 1.25 : 1);
        material.opacity = selected || hovered ? 1 : inTrace && nearHover ? 0.82 : 0.12;
      }
      if (visible === 0) continue;

      const scaleBase =
        (0.72 + 0.4 * level) *
        (selected ? SELECTION_SCALE_BOOST : hovered ? 1.24 : 1);
      const data = layout.data;
      const current = currentPositionsRef.current?.[layout.id];
      if (!current) continue;

      for (let index = 0; index < visible; index += 1) {
        const offset = index * STRIDE;
        const driftPhase = data[offset + 6] ?? 0;
        const spinPhase = data[offset + 7] ?? 0;
        const spinRate = data[offset + 8] ?? 0.5;
        const sizeJitter = data[offset + 9] ?? 1;

        const wave = Math.sin(phaseTime * layout.driftRate + driftPhase);
        const secondaryWave = Math.sin(
          phaseTime * layout.driftRate * 0.47 + spinPhase,
        );
        const bob = Math.cos(phaseTime * layout.driftRate * 0.71 + spinPhase);
        const targetX =
          (data[offset] ?? 0) +
          (data[offset + 3] ?? 0) * (wave + secondaryWave * 0.32);
        const targetY =
          (data[offset + 1] ?? 0) +
          (data[offset + 4] ?? 0) * (wave - secondaryWave * 0.28) +
          0.04 * bob;
        const targetZ =
          (data[offset + 2] ?? 0) +
          (data[offset + 5] ?? 0) * (wave + secondaryWave * 0.25);
        const currentOffset = index * 3;

        if (ctx.reducedMotion) {
          current[currentOffset] = data[offset] ?? 0;
          current[currentOffset + 1] = data[offset + 1] ?? 0;
          current[currentOffset + 2] = data[offset + 2] ?? 0;
        } else {
          current[currentOffset] = THREE.MathUtils.damp(
            current[currentOffset] ?? targetX,
            targetX,
            7.5,
            ctx.delta,
          );
          current[currentOffset + 1] = THREE.MathUtils.damp(
            current[currentOffset + 1] ?? targetY,
            targetY,
            7.5,
            ctx.delta,
          );
          current[currentOffset + 2] = THREE.MathUtils.damp(
            current[currentOffset + 2] ?? targetZ,
            targetZ,
            7.5,
            ctx.delta,
          );
        }

        scratchObject.position.set(
          current[currentOffset] ?? 0,
          current[currentOffset + 1] ?? 0,
          current[currentOffset + 2] ?? 0,
        );
        // 위상에서 끌어낸 기본 회전 덕분에, 모션 줄이기로 정지한 자세에서도 모든
        // 입자가 같은 방향으로 딱 맞춰지지 않고 제각각으로 남는다.
        scratchObject.rotation.set(
          driftPhase + phaseTime * spinRate * 0.4,
          spinPhase + phaseTime * spinRate,
          driftPhase * 0.6,
        );
        const scale = scaleBase * sizeJitter;
        scratchObject.scale.set(scale, scale, scale);
        scratchObject.updateMatrix();
        mesh.setMatrixAt(index, scratchObject.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      {layouts.map((layout) => {
        const definition = getEntity(layout.id);
        return (
          <instancedMesh
            key={layout.id}
            ref={(mesh) => {
              meshesRef.current[layout.id] = mesh;
            }}
            args={[undefined, undefined, layout.capacity]}
            frustumCulled={false}
            onPointerOver={(event) => {
              event.stopPropagation();
              simulationStore.getState().setHoveredEntity(layout.id);
            }}
            onPointerOut={() => {
              if (simulationStore.getState().hoveredEntityId === layout.id) {
                simulationStore.getState().setHoveredEntity(null);
              }
            }}
            onClick={(event) => {
              event.stopPropagation();
              simulationStore.getState().openMoleculeExplorer(layout.id);
            }}
          >
            <ParticleGeometry shape={definition.shape} />
            <meshStandardMaterial
              ref={(material) => {
                materialsRef.current[layout.id] = material;
              }}
              color={definition.color}
              emissive={definition.color}
              emissiveIntensity={0.3}
              roughness={0.34}
              metalness={0.18}
              transparent
              opacity={0.82}
              depthWrite={false}
            />
          </instancedMesh>
        );
      })}
    </group>
  );
}
