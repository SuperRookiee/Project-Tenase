'use client';
/**
 * 추상 네트워크가 놓이는 양식화된 용기.
 *
 * 아래쪽 벽에 표시 영역이 있는 개념적인 양끝 열린 관이며, 해부 구조를 묘사한 것이
 * 아니라 무대 장치다. 표시 영역은 추상적인 손상 신호에 반응하는데, 이 신호는 보는
 * 사람이 조절하는 무차원 0–1 파라미터일 뿐 무언가를 측정한 값이 아니다.
 *
 * 표시 영역은 색만으로 식별되는 일이 없도록 중복된 단서 세 가지를 갖는다. 채워진
 * 패치, 뚜렷한 고리 윤곽선, 그리고 와이어프레임 돔이다.
 */
import { useRef } from 'react';
import * as THREE from 'three';
import { DAMAGE_CENTER, VESSEL_LENGTH, VESSEL_RADIUS } from './sceneLayout';
import { useEngineFrame } from './useEngineFrame';

/** 관을 따라 놓인 옅은 테는 눈이 깊이를 가늠할 기준이 되어 준다. */
const GUIDE_RING_OFFSETS: readonly number[] = [-5.4, -2.7, 0, 2.7, 5.4];

/** z-파이팅이 생기지 않도록 표시 영역을 벽 안쪽으로 아주 조금 당긴다. */
const PATCH_INSET = 0.03;

const PATCH_POSITION: readonly [number, number, number] = [
  DAMAGE_CENTER[0],
  DAMAGE_CENTER[1] + PATCH_INSET,
  DAMAGE_CENTER[2],
];

export function VesselEnvironment() {
  const patchRef = useRef<THREE.Group>(null);
  const patchMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const outlineMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const wireMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const lumenMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  useEngineFrame((ctx) => {
    const damageSignal = ctx.config.vesselDamageSignal;
    const networkActivity = ctx.signals.networkActivity;

    // 모션 줄이기에서는 위상을 중간에 고정해 패치가 계속 읽히게 한다.
    const pulse = ctx.reducedMotion
      ? 0.5
      : 0.5 + 0.5 * Math.sin(ctx.elapsed * 2.1);

    const patch = patchRef.current;
    if (patch !== null) {
      const scale = 0.62 + 0.46 * damageSignal + 0.06 * pulse * damageSignal;
      patch.scale.set(scale, scale, scale);
    }

    const patchMaterial = patchMaterialRef.current;
    if (patchMaterial !== null) {
      patchMaterial.emissiveIntensity = 0.12 + damageSignal * (0.9 + 0.6 * pulse);
      patchMaterial.opacity = 0.1 + 0.55 * damageSignal;
    }

    const outlineMaterial = outlineMaterialRef.current;
    if (outlineMaterial !== null) {
      outlineMaterial.opacity = 0.22 + 0.68 * damageSignal;
    }

    const wireMaterial = wireMaterialRef.current;
    if (wireMaterial !== null) {
      wireMaterial.opacity = 0.08 + 0.42 * damageSignal;
    }

    const lumenMaterial = lumenMaterialRef.current;
    if (lumenMaterial !== null) {
      lumenMaterial.opacity = 0.03 + 0.1 * networkActivity;
    }
  });

  return (
    <group>
      {/* 바깥쪽 벽: 양끝이 열려 있고 양면이며 거의 보이지 않는다. */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry
          args={[VESSEL_RADIUS, VESSEL_RADIUS, VESSEL_LENGTH, 64, 1, true]}
        />
        <meshStandardMaterial
          color="#1a2235"
          emissive="#2dd4bf"
          emissiveIntensity={0.06}
          roughness={0.45}
          metalness={0.12}
          side={THREE.DoubleSide}
          transparent
          opacity={0.13}
          depthWrite={false}
        />
      </mesh>

      {/* 안쪽 광채: 네트워크 활동도에 따라 밝아지는 가산 혼합 껍질. */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry
          args={[
            VESSEL_RADIUS * 0.965,
            VESSEL_RADIUS * 0.965,
            VESSEL_LENGTH * 0.99,
            48,
            1,
            true,
          ]}
        />
        <meshBasicMaterial
          ref={lumenMaterialRef}
          color="#2dd4bf"
          side={THREE.BackSide}
          transparent
          opacity={0.05}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 끝단 테두리와 안내용 테. */}
      {GUIDE_RING_OFFSETS.map((offset) => (
        <mesh
          key={`guide-${offset}`}
          position={[offset, 0, 0]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <torusGeometry args={[VESSEL_RADIUS, 0.012, 6, 64]} />
          <meshBasicMaterial
            color="#35446a"
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
      ))}
      {[-VESSEL_LENGTH / 2, VESSEL_LENGTH / 2].map((offset) => (
        <mesh
          key={`rim-${offset}`}
          position={[offset, 0, 0]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <torusGeometry args={[VESSEL_RADIUS, 0.03, 8, 72]} />
          <meshBasicMaterial
            color="#2dd4bf"
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/*
        표시 영역. 로컬 +Z가 관 내부를 향하므로 기본 카메라에서 패치가 읽히고, 모든
        조각이 양면이라 반투명한 벽 바깥에서도 읽힌다.
      */}
      <group position={PATCH_POSITION} rotation={[-Math.PI / 2, 0, 0]}>
        <group ref={patchRef}>
          <mesh>
            <circleGeometry args={[1.05, 44]} />
            <meshStandardMaterial
              ref={patchMaterialRef}
              color="#fb923c"
              emissive="#fb923c"
              emissiveIntensity={0.4}
              roughness={0.6}
              metalness={0}
              side={THREE.DoubleSide}
              transparent
              opacity={0.35}
              depthWrite={false}
            />
          </mesh>

          {/* 색이 아닌 단서 1: 패치를 두르는 뚜렷한 윤곽 고리. */}
          <mesh position={[0, 0, 0.012]}>
            <ringGeometry args={[1.08, 1.2, 56]} />
            <meshBasicMaterial
              ref={outlineMaterialRef}
              color="#f8fafc"
              side={THREE.DoubleSide}
              transparent
              opacity={0.5}
              depthWrite={false}
            />
          </mesh>

          {/* 색이 아닌 단서 2: 패치 위로 솟아오른 와이어프레임 돔. */}
          <mesh position={[0, 0, 0.34]} scale={[1, 1, 0.5]}>
            <icosahedronGeometry args={[0.92, 1]} />
            <meshBasicMaterial
              ref={wireMaterialRef}
              color="#f8fafc"
              wireframe
              transparent
              opacity={0.28}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}
