'use client';
/**
 * 표시 영역 둘레의 벽에 달라붙는 추상 표면 디스크.
 *
 * 그래프의 표면 노드를 대신하는 납작한 디스크로, 개념적 형상일 뿐 실재하는 무언가를
 * 묘사한 것이 아니다. 보이는 개수는 해당 노드의 정규화된 수준과 전역 밀도 파라미터를
 * 따르며, 전역 인스턴스 예산보다 한참 낮은 값으로 제한된다.
 *
 * 이 디스크를 `ParticleField`가 아니라 전용 렌더러가 그리는 까닭은 표면 노드가
 * `renderAsParticles: false`이기 때문이다. 따라서 공유 입자 예산은 전혀 쓰지 않는다.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getEntity } from '@/simulation/entities';
import { getReactionTrace } from '@/simulation/reactionTrace';
import { simulationStore } from '@/store/simulationStore';
import { DAMAGE_CENTER, VESSEL_RADIUS, createSeededRandom } from './sceneLayout';
import { useEngineFrame } from './useEngineFrame';

/** 달라붙는 디스크 인스턴스 수의 절대 상한. */
const MAX_PLATELET_INSTANCES = 48;
const PROTRUSIONS_PER_PLATELET = 3;
const MAX_PROTRUSIONS = MAX_PLATELET_INSTANCES * PROTRUSIONS_PER_PLATELET;

/** 디스크가 관 둘레 방향과 축 방향으로 흩어질 수 있는 범위. */
const ANGLE_SPREAD = 0.85;
const AXIAL_SPREAD = 2.4;

/** 디스크를 벽 바로 안쪽에 앉힌다. */
const WALL_INSET = 0.07;

/** 납작한 디스크의 비율. */
const DISC_THICKNESS = 0.06;

/** 스트라이드: 기준 xyz, 안쪽 방향 법선 xyz, 쿼터니언 xyzw, 크기, 위상. */
const STRIDE = 12;

const SEED = 20_240_517;

const UP = new THREE.Vector3(0, 1, 0);

// 스크래치 객체를 렌더 루프 밖으로 끌어냈다. 루프는 아무것도 할당하지 않는다.
const scratchObject = new THREE.Object3D();
const scratchSpike = new THREE.Object3D();
const scratchNormal = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchCenter = new THREE.Vector3();
const scratchLocalDirection = new THREE.Vector3();
const scratchWorldDirection = new THREE.Vector3();

interface DiscLayout {
  readonly data: Float32Array;
  readonly count: number;
}

function buildDiscLayout(): DiscLayout {
  const random = createSeededRandom(SEED);
  const radius = VESSEL_RADIUS - WALL_INSET;

  interface Draft {
    angle: number;
    axial: number;
    size: number;
    phase: number;
    distance: number;
  }

  const drafts: Draft[] = [];
  for (let index = 0; index < MAX_PLATELET_INSTANCES; index += 1) {
    const angle = (random() * 2 - 1) * ANGLE_SPREAD;
    const axial = (random() * 2 - 1) * AXIAL_SPREAD;
    const size = 0.17 + random() * 0.15;
    const phase = random() * Math.PI * 2;
    // 디스크가 표시 영역에 얼마나 가까이 앉는지로 순위를 매겨, 수준이 올라갈수록
    // 집합이 그 영역에서 바깥쪽으로 자라게 한다.
    const distance = Math.hypot(axial, angle * radius);
    drafts.push({ angle, axial, size, phase, distance });
  }
  drafts.sort((left, right) => left.distance - right.distance);

  const data = new Float32Array(MAX_PLATELET_INSTANCES * STRIDE);
  drafts.forEach((draft, index) => {
    const offset = index * STRIDE;
    const x = DAMAGE_CENTER[0] + draft.axial;
    const y = -radius * Math.cos(draft.angle);
    const z = radius * Math.sin(draft.angle);

    // 벽 위 이 지점에서 축 쪽을 되짚어 가리키는 안쪽 방향 법선.
    scratchNormal.set(0, Math.cos(draft.angle), -Math.sin(draft.angle)).normalize();
    scratchQuaternion.setFromUnitVectors(UP, scratchNormal);

    data[offset] = x;
    data[offset + 1] = y;
    data[offset + 2] = z;
    data[offset + 3] = scratchNormal.x;
    data[offset + 4] = scratchNormal.y;
    data[offset + 5] = scratchNormal.z;
    data[offset + 6] = scratchQuaternion.x;
    data[offset + 7] = scratchQuaternion.y;
    data[offset + 8] = scratchQuaternion.z;
    data[offset + 9] = scratchQuaternion.w;
    data[offset + 10] = draft.size;
    data[offset + 11] = draft.phase;
  });

  return { data, count: MAX_PLATELET_INSTANCES };
}

export function PlateletSurfaces() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const spikeMeshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const spikeMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const activationRef = useRef(0);
  const layout = useMemo(() => buildDiscLayout(), []);
  const definition = getEntity('platelets');

  useEngineFrame((ctx) => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const spikeMesh = spikeMeshRef.current;

    const enabled = ctx.config.enabled.platelets !== false;
    const level = ctx.levels.platelets;
    const density = ctx.config.particleDensity;
    const targetActivation = enabled
      ? ctx.config.vesselDamageSignal * Math.min(1, level * 1.25)
      : 0;
    activationRef.current = ctx.reducedMotion
      ? targetActivation
      : THREE.MathUtils.damp(
          activationRef.current,
          targetActivation,
          2.4,
          ctx.delta,
        );
    const activation = activationRef.current;

    let visible = 0;
    if (enabled && level > 0 && density > 0) {
      const scaled = Math.round(MAX_PLATELET_INSTANCES * level * density);
      visible = Math.min(MAX_PLATELET_INSTANCES, Math.max(2, scaled));
    }

    mesh.visible = visible > 0;
    mesh.count = visible;
    if (spikeMesh) {
      spikeMesh.visible = visible > 0 && activation > 0.04;
      spikeMesh.count = spikeMesh.visible
        ? Math.min(MAX_PROTRUSIONS, visible * PROTRUSIONS_PER_PLATELET)
        : 0;
    }
    if (materialRef.current) {
      materialRef.current.emissiveIntensity = 0.22 + activation * 0.8;
      const inTrace =
        ctx.selectedEntityId === null ||
        getReactionTrace(ctx.selectedEntityId).entityIds.has('platelets');
      materialRef.current.opacity =
        ctx.selectedEntityId === 'platelets' || ctx.hoveredEntityId === 'platelets'
          ? 1
          : inTrace
            ? 0.88
            : 0.12;
    }
    if (spikeMaterialRef.current) {
      spikeMaterialRef.current.opacity = 0.18 + activation * 0.75;
      spikeMaterialRef.current.emissiveIntensity = 0.12 + activation * 0.7;
    }
    if (visible === 0) return;

    const selected = ctx.selectedEntityId === 'platelets';
    const hovered = ctx.hoveredEntityId === 'platelets';
    const selectionBoost = selected ? 1.25 : hovered ? 1.12 : 1;
    const data = layout.data;

    for (let index = 0; index < visible; index += 1) {
      const offset = index * STRIDE;
      const phase = data[offset + 11] ?? 0;
      const wobble = ctx.reducedMotion
        ? 0
        : Math.sin(ctx.elapsed * 1.3 + phase);
      const lift = 0.045 * wobble;

      scratchObject.position.set(
        (data[offset] ?? 0) + (data[offset + 3] ?? 0) * lift,
        (data[offset + 1] ?? 0) + (data[offset + 4] ?? 0) * lift,
        (data[offset + 2] ?? 0) + (data[offset + 5] ?? 0) * lift,
      );
      scratchObject.quaternion.set(
        data[offset + 6] ?? 0,
        data[offset + 7] ?? 0,
        data[offset + 8] ?? 0,
        data[offset + 9] ?? 1,
      );

      const size =
        (data[offset + 10] ?? 0.2) *
        selectionBoost *
        (0.82 + 0.24 * level) *
        (1 + 0.05 * wobble);
      scratchObject.scale.set(
        size * (1 + activation * 0.18),
        DISC_THICKNESS * (1 + activation * 0.75),
        size * (1 - activation * 0.08),
      );
      scratchObject.updateMatrix();
      mesh.setMatrixAt(index, scratchObject.matrix);

      if (spikeMesh && activation > 0.04) {
        scratchCenter.copy(scratchObject.position);
        scratchQuaternion.copy(scratchObject.quaternion);
        for (let spikeIndex = 0; spikeIndex < PROTRUSIONS_PER_PLATELET; spikeIndex += 1) {
          const angle =
            phase +
            (spikeIndex / PROTRUSIONS_PER_PLATELET) * Math.PI * 2 +
            (ctx.reducedMotion ? 0 : 0.08 * wobble);
          scratchLocalDirection.set(Math.cos(angle), 0, Math.sin(angle));
          scratchWorldDirection
            .copy(scratchLocalDirection)
            .applyQuaternion(scratchQuaternion)
            .normalize();
          scratchSpike.position
            .copy(scratchCenter)
            .addScaledVector(scratchWorldDirection, size * 0.92);
          scratchSpike.quaternion.setFromUnitVectors(UP, scratchWorldDirection);
          const length = size * (0.28 + activation * 0.95);
          scratchSpike.scale.set(0.018 + activation * 0.012, length, 0.018 + activation * 0.012);
          scratchSpike.updateMatrix();
          spikeMesh.setMatrixAt(
            index * PROTRUSIONS_PER_PLATELET + spikeIndex,
            scratchSpike.matrix,
          );
        }
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (spikeMesh && spikeMesh.count > 0) spikeMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, layout.count]}
        frustumCulled={false}
        onPointerOver={(event) => {
          event.stopPropagation();
          simulationStore.getState().setHoveredEntity('platelets');
        }}
        onPointerOut={() => simulationStore.getState().setHoveredEntity(null)}
        onClick={(event) => {
          event.stopPropagation();
          simulationStore.getState().openMoleculeExplorer('platelets');
        }}
      >
        <cylinderGeometry args={[1, 1, 1, 18, 1]} />
        <meshStandardMaterial
          ref={materialRef}
          color={definition.color}
          emissive={definition.color}
          emissiveIntensity={0.3}
          roughness={0.4}
          metalness={0.15}
          transparent
          opacity={0.9}
        />
      </instancedMesh>
      <instancedMesh
        ref={spikeMeshRef}
        args={[undefined, undefined, MAX_PROTRUSIONS]}
        frustumCulled={false}
      >
        <coneGeometry args={[1, 1, 7, 1]} />
        <meshStandardMaterial
          ref={spikeMaterialRef}
          color={definition.color}
          emissive={definition.color}
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}
