'use client';
/**
 * 종단형 노드에서 자라나는 구조 메시.
 *
 * 가닥 끝점의 고정된 결정론적 집합을 시드 생성기로 한 번 만들어 두고 점진적으로
 * 드러낸다. 보이는 가닥 개수와 재질 불투명도는 둘 다 `signals.fibrinModelSignal`을
 * 따른다. 가닥은 메시가 표시 영역에서 바깥쪽으로 자라도록 정렬되어 있다.
 *
 * 가닥은 추상적인 지지대다. 가상의 그래프에서 엣지의 생성물을 도식화한 것이며 실제
 * 구조를 묘사하지 않는다.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getEntity } from '@/simulation/entities';
import { getReactionTrace } from '@/simulation/reactionTrace';
import { simulationStore } from '@/store/simulationStore';
import { FIBRIN_CENTER, VESSEL_RADIUS, createSeededRandom } from './sceneLayout';
import { useEngineFrame } from './useEngineFrame';

/** 가닥 인스턴스 수의 절대 상한. */
const MAX_STRANDS = 120;

const NODE_COUNT = 34;
const NEIGHBORS_PER_NODE = 4;
const MAX_STRAND_LENGTH = 1.75;

const ANGLE_SPREAD = 0.72;
const AXIAL_SPREAD = 2.05;
const MIN_WALL_DEPTH = 0.05;
const MAX_WALL_DEPTH = 1.25;

const BASE_THICKNESS = 0.019;

/** 스트라이드: 중점 xyz, 쿼터니언 xyzw, 길이. */
const STRIDE = 8;

const SEED = 5_512_907;

const UP = new THREE.Vector3(0, 1, 0);

// 스크래치 인스턴스를 모듈 스코프로 끌어올렸다. 루프는 아무것도 할당하지 않는다.
const scratchObject = new THREE.Object3D();
const scratchStart = new THREE.Vector3();
const scratchEnd = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();

type StrandNode = readonly [number, number, number];

interface StrandDraft {
  readonly from: StrandNode;
  readonly to: StrandNode;
  /** 가닥 중점과 표시 영역 사이의 거리. */
  readonly reveal: number;
}

interface StrandLayout {
  readonly data: Float32Array;
  readonly count: number;
}

function buildStrandLayout(): StrandLayout {
  const random = createSeededRandom(SEED);

  // 첫 노드는 구조 생성 지점에 고정해 반응망이 한 중심에서 바깥으로 자라게 한다.
  const nodes: StrandNode[] = [[...FIBRIN_CENTER]];
  for (let index = 1; index < NODE_COUNT; index += 1) {
    const angle = (random() * 2 - 1) * ANGLE_SPREAD;
    const axial = (random() * 2 - 1) * AXIAL_SPREAD;
    const depth = MIN_WALL_DEPTH + random() * (MAX_WALL_DEPTH - MIN_WALL_DEPTH);
    const radius = VESSEL_RADIUS - depth;
    nodes.push([
      FIBRIN_CENTER[0] + axial,
      -radius * Math.cos(angle),
      radius * Math.sin(angle),
    ]);
  }

  const seen = new Set<string>();
  const drafts: StrandDraft[] = [];

  nodes.forEach((origin, fromIndex) => {
    const ranked: Array<{ index: number; node: StrandNode; distance: number }> = [];

    nodes.forEach((target, toIndex) => {
      if (toIndex === fromIndex) return;
      const distance = Math.hypot(
        target[0] - origin[0],
        target[1] - origin[1],
        target[2] - origin[2],
      );
      if (distance > MAX_STRAND_LENGTH) return;
      ranked.push({ index: toIndex, node: target, distance });
    });
    ranked.sort((left, right) => left.distance - right.distance);

    for (const candidate of ranked.slice(0, NEIGHBORS_PER_NODE)) {
      const low = Math.min(fromIndex, candidate.index);
      const high = Math.max(fromIndex, candidate.index);
      const key = `${low}-${high}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const midX = (origin[0] + candidate.node[0]) / 2;
      const midY = (origin[1] + candidate.node[1]) / 2;
      const midZ = (origin[2] + candidate.node[2]) / 2;
      drafts.push({
        from: origin,
        to: candidate.node,
        reveal: Math.hypot(
          midX - FIBRIN_CENTER[0],
          midY - FIBRIN_CENTER[1],
          midZ - FIBRIN_CENTER[2],
        ),
      });
    }
  });

  // 표시 영역에 가까운 것부터 두어, 메시가 자라면서 바깥쪽으로 채워지게 한다.
  drafts.sort((left, right) => left.reveal - right.reveal);
  const selected = drafts.slice(0, MAX_STRANDS);

  const data = new Float32Array(selected.length * STRIDE);
  selected.forEach((draft, index) => {
    scratchStart.set(draft.from[0], draft.from[1], draft.from[2]);
    scratchEnd.set(draft.to[0], draft.to[1], draft.to[2]);
    scratchDirection.subVectors(scratchEnd, scratchStart);
    const length = scratchDirection.length() || 0.0001;
    scratchDirection.divideScalar(length);
    scratchQuaternion.setFromUnitVectors(UP, scratchDirection);

    const offset = index * STRIDE;
    data[offset] = (draft.from[0] + draft.to[0]) / 2;
    data[offset + 1] = (draft.from[1] + draft.to[1]) / 2;
    data[offset + 2] = (draft.from[2] + draft.to[2]) / 2;
    data[offset + 3] = scratchQuaternion.x;
    data[offset + 4] = scratchQuaternion.y;
    data[offset + 5] = scratchQuaternion.z;
    data[offset + 6] = scratchQuaternion.w;
    data[offset + 7] = length;
  });

  return { data, count: selected.length };
}

export function FibrinNetwork() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const displayedSignalRef = useRef(0);
  const layout = useMemo(() => buildStrandLayout(), []);
  const definition = getEntity('fibrin');

  useEngineFrame((ctx) => {
    const mesh = meshRef.current;
    if (mesh === null) return;

    const enabled = ctx.config.enabled.fibrin !== false;
    const targetSignal = enabled ? ctx.signals.fibrinModelSignal : 0;
    displayedSignalRef.current = ctx.reducedMotion
      ? targetSignal
      : THREE.MathUtils.damp(
          displayedSignalRef.current,
          targetSignal,
          targetSignal >= displayedSignalRef.current ? 1.8 : 1.15,
          ctx.delta,
        );
    const signal = displayedSignalRef.current;
    const exactVisible = layout.count * signal;
    const visible = Math.min(layout.count, Math.ceil(exactVisible));

    mesh.visible = visible > 0;
    mesh.count = visible;

    const material = materialRef.current;
    if (material !== null) {
      const inTrace =
        ctx.selectedEntityId === null ||
        getReactionTrace(ctx.selectedEntityId).entityIds.has('fibrin');
      material.opacity = inTrace ? 0.14 + 0.78 * signal : 0.045;
      material.emissiveIntensity = 0.2 + 0.55 * signal;
    }
    if (visible === 0) return;

    const selected = ctx.selectedEntityId === 'fibrin';
    const hovered = ctx.hoveredEntityId === 'fibrin';
    const shimmer = ctx.reducedMotion ? 0 : Math.sin(ctx.elapsed * 1.6);
    const thickness =
      BASE_THICKNESS *
      (0.85 + 0.55 * signal) *
      (selected ? 1.6 : hovered ? 1.3 : 1) *
      (1 + 0.08 * shimmer);
    const data = layout.data;

    for (let index = 0; index < visible; index += 1) {
      const offset = index * STRIDE;
      scratchObject.position.set(
        data[offset] ?? 0,
        data[offset + 1] ?? 0,
        data[offset + 2] ?? 0,
      );
      scratchObject.quaternion.set(
        data[offset + 3] ?? 0,
        data[offset + 4] ?? 0,
        data[offset + 5] ?? 0,
        data[offset + 6] ?? 1,
      );
      const growth = Math.min(1, Math.max(0.08, exactVisible - index));
      scratchObject.scale.set(
        thickness,
        (data[offset + 7] ?? 0.1) * growth,
        thickness,
      );
      scratchObject.updateMatrix();
      mesh.setMatrixAt(index, scratchObject.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, Math.max(1, layout.count)]}
      frustumCulled={false}
      onPointerOver={(event) => {
        event.stopPropagation();
        simulationStore.getState().setHoveredEntity('fibrin');
      }}
      onPointerOut={() => simulationStore.getState().setHoveredEntity(null)}
      onClick={(event) => {
        event.stopPropagation();
        simulationStore.getState().openMoleculeExplorer('fibrin');
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        ref={materialRef}
        color={definition.color}
        emissive={definition.color}
        emissiveIntensity={0.3}
        roughness={0.5}
        metalness={0.05}
        transparent
        opacity={0.5}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
