'use client';
/**
 * 추상 그래프에서 엣지의 회전량을 나타내는 일시적 표식.
 *
 * 엣지마다 `REACTION_SITES`에 정해진 자리에 표식을 배치하며,
 * `reactionActivity[reaction.id]`가 이를 구동한다. 이 값은 그 엣지가 이번 스텝에
 * 얼마나 세게 돌고 있는지를 나타내는 무차원 0–1 값이다.
 *
 * 네 가지 엣지 종류는 색보다 기하 형태로 먼저 구분되므로, 색을 보지 못해도 장면을
 * 읽을 수 있다:
 *   activation  — 팽창하는 열린 고리
 *   binding     — 서로를 향해 모여드는 두 고리
 *   conversion  — 와이어 케이지 안에서 회전하는 속이 찬 팔면체
 *   inhibition  — 교차 막대 표식 뒤에서 수축하는 고리
 */
import { useRef } from 'react';
import * as THREE from 'three';
import { Billboard } from '@react-three/drei';
import { ACTIVITY_EPSILON } from '@/simulation/engine';
import {
  REACTION_DEFINITIONS,
  reactionParticipants,
} from '@/simulation/reactions';
import { getReactionTrace } from '@/simulation/reactionTrace';
import type { ReactionDefinition, ReactionKind } from '@/simulation/types';
import { REACTION_SITES } from './sceneLayout';
import { useEngineFrame } from './useEngineFrame';

const KIND_COLORS: Readonly<Record<ReactionKind, string>> = {
  activation: '#38bdf8',
  binding: '#c084fc',
  conversion: '#2dd4bf',
  inhibition: '#eab308',
};

const ORIGIN: readonly [number, number, number] = [0, 0, 0];

/** 모션 줄이기에서 쓰는 고정 위상. 읽기 쉬운 주기 중간 자세다. */
const STATIC_CYCLE = 0.45;

function ReactionPulse({ reaction }: { reaction: ReactionDefinition }) {
  const site = REACTION_SITES[reaction.id] ?? ORIGIN;
  const color = KIND_COLORS[reaction.kind];

  const rootRef = useRef<THREE.Group>(null);
  const primaryRef = useRef<THREE.Group>(null);
  const secondaryRef = useRef<THREE.Group>(null);
  const primaryMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const secondaryMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const tertiaryMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const stabilizationRef = useRef<THREE.Group>(null);
  const waveRef = useRef<THREE.Group>(null);
  const waveMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const phaseRef = useRef(0);
  const participants = reactionParticipants(reaction);

  useEngineFrame((ctx) => {
    const root = rootRef.current;
    if (root === null) return;

    const activity = ctx.reactionActivity[reaction.id] ?? 0;
    const active = activity > ACTIVITY_EPSILON;
    const inTrace =
      ctx.selectedEntityId !== null &&
      getReactionTrace(ctx.selectedEntityId).reactionIds.has(reaction.id);
    const nearHover =
      ctx.hoveredEntityId === null || participants.includes(ctx.hoveredEntityId);
    const related =
      (ctx.selectedEntityId === null || inTrace) && nearHover;
    root.visible = active || inTrace;
    if (!active && !inTrace) return;

    if (!ctx.reducedMotion) {
      // 바쁜 엣지일수록 주기가 빨라져, 상대적인 회전량이 한눈에 읽힌다.
      phaseRef.current =
        (phaseRef.current + ctx.delta * (0.42 + 1.9 * Math.max(activity, inTrace ? 0.12 : 0))) % 1;
    }

    const primary = primaryRef.current;
    const secondary = secondaryRef.current;
    const primaryMaterial = primaryMaterialRef.current;
    const secondaryMaterial = secondaryMaterialRef.current;
    const tertiaryMaterial = tertiaryMaterialRef.current;
    const stabilization = stabilizationRef.current;
    const wave = waveRef.current;
    const waveMaterial = waveMaterialRef.current;

    const cycle = ctx.reducedMotion ? STATIC_CYCLE : phaseRef.current;
    const opacityBase = related
      ? 0.18 + (inTrace ? 0.2 : 0) + 0.62 * activity
      : 0.035;

    switch (reaction.kind) {
      case 'activation': {
        const scale = 0.55 + 1.2 * cycle;
        if (primary !== null) primary.scale.set(scale, scale, scale);
        if (primaryMaterial !== null) {
          primaryMaterial.opacity = opacityBase * (1 - 0.85 * cycle);
        }
        const coreScale = 1.05 - 0.45 * cycle;
        if (secondary !== null) secondary.scale.set(coreScale, coreScale, coreScale);
        if (secondaryMaterial !== null) {
          secondaryMaterial.opacity = opacityBase * 0.5 * (0.4 + 0.6 * cycle);
        }
        break;
      }
      case 'binding': {
        const gap = 0.6 * (1 - cycle);
        if (primary !== null) primary.position.x = -gap;
        if (secondary !== null) secondary.position.x = gap;
        const merge = 0.35 + 0.65 * cycle;
        if (primaryMaterial !== null) primaryMaterial.opacity = opacityBase * merge;
        if (secondaryMaterial !== null) {
          secondaryMaterial.opacity = opacityBase * merge;
        }
        const stabilized = Math.max(0, Math.min(1, (cycle - 0.58) / 0.3));
        if (stabilization !== null) {
          const stabilizedScale = 0.35 + stabilized * 0.8;
          stabilization.scale.set(
            stabilizedScale,
            stabilizedScale,
            stabilizedScale,
          );
        }
        if (tertiaryMaterial !== null) {
          tertiaryMaterial.opacity = opacityBase * stabilized;
        }
        break;
      }
      case 'conversion': {
        const spin = cycle * Math.PI * 2;
        if (primary !== null) {
          primary.rotation.set(spin * 0.45, spin, 0);
          const scale =
            0.72 + 0.34 * activity + (ctx.reducedMotion ? 0 : 0.1 * Math.sin(spin * 2));
          primary.scale.set(scale, scale, scale);
        }
        if (primaryMaterial !== null) primaryMaterial.opacity = opacityBase * 0.5;
        if (secondaryMaterial !== null) {
          secondaryMaterial.opacity = opacityBase * 0.85;
        }
        if (wave !== null && reaction.id === 'r4-conversion') {
          const waveScale = 0.5 + cycle * 2.3;
          wave.scale.set(waveScale, waveScale, waveScale);
        }
        if (waveMaterial !== null && reaction.id === 'r4-conversion') {
          waveMaterial.opacity = opacityBase * Math.pow(1 - cycle, 1.6);
        }
        break;
      }
      case 'inhibition': {
        const scale = 1.3 - 0.72 * cycle;
        if (primary !== null) primary.scale.set(scale, scale, scale);
        if (primaryMaterial !== null) {
          primaryMaterial.opacity = opacityBase * (0.25 + 0.75 * cycle);
        }
        const crossScale = 0.85 + 0.22 * (1 - cycle);
        if (secondary !== null) secondary.scale.set(crossScale, crossScale, crossScale);
        if (secondaryMaterial !== null) secondaryMaterial.opacity = opacityBase;
        if (tertiaryMaterial !== null) tertiaryMaterial.opacity = opacityBase;
        break;
      }
      default:
        break;
    }
  });

  return (
    <group ref={rootRef} position={[site[0], site[1], site[2]]}>
      {reaction.kind === 'conversion' ? (
        <>
          <group ref={primaryRef}>
            <mesh>
              <octahedronGeometry args={[0.24, 0]} />
              <meshBasicMaterial
                ref={primaryMaterialRef}
                color={color}
                transparent
                opacity={0}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            <mesh>
              <octahedronGeometry args={[0.4, 0]} />
              <meshBasicMaterial
                ref={secondaryMaterialRef}
                color={color}
                wireframe
                transparent
                opacity={0}
                depthWrite={false}
                toneMapped={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </group>
          {reaction.id === 'r4-conversion' ? (
            <Billboard>
              <group ref={waveRef}>
                <mesh>
                  <ringGeometry args={[0.34, 0.39, 48]} />
                  <meshBasicMaterial
                    ref={waveMaterialRef}
                    color="#fb923c"
                    side={THREE.DoubleSide}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              </group>
            </Billboard>
          ) : null}
        </>
      ) : (
        <Billboard>
          {reaction.kind === 'activation' ? (
            <>
              <group ref={primaryRef}>
                <mesh>
                  <ringGeometry args={[0.3, 0.38, 44]} />
                  <meshBasicMaterial
                    ref={primaryMaterialRef}
                    color={color}
                    side={THREE.DoubleSide}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              </group>
              <group ref={secondaryRef}>
                <mesh>
                  <circleGeometry args={[0.13, 24]} />
                  <meshBasicMaterial
                    ref={secondaryMaterialRef}
                    color={color}
                    side={THREE.DoubleSide}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              </group>
            </>
          ) : null}

          {reaction.kind === 'binding' ? (
            <>
              <group ref={primaryRef}>
                <mesh>
                  <torusGeometry args={[0.2, 0.035, 8, 28]} />
                  <meshBasicMaterial
                    ref={primaryMaterialRef}
                    color={color}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              </group>
              <group ref={secondaryRef}>
                <mesh>
                  <torusGeometry args={[0.2, 0.035, 8, 28]} />
                  <meshBasicMaterial
                    ref={secondaryMaterialRef}
                    color={color}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              </group>
              <group ref={stabilizationRef}>
                <mesh>
                  <icosahedronGeometry args={[0.22, 0]} />
                  <meshBasicMaterial
                    ref={tertiaryMaterialRef}
                    color={color}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              </group>
            </>
          ) : null}

          {reaction.kind === 'inhibition' ? (
            <>
              <group ref={primaryRef}>
                <mesh>
                  <ringGeometry args={[0.32, 0.39, 40]} />
                  <meshBasicMaterial
                    ref={primaryMaterialRef}
                    color={color}
                    side={THREE.DoubleSide}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              </group>
              {/* 교차 막대 표식: 감쇠하는 엣지를 색 없이 알려주는 단서. */}
              <group ref={secondaryRef}>
                <mesh rotation={[0, 0, Math.PI / 4]}>
                  <boxGeometry args={[0.58, 0.055, 0.012]} />
                  <meshBasicMaterial
                    ref={secondaryMaterialRef}
                    color={color}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
                <mesh rotation={[0, 0, -Math.PI / 4]}>
                  <boxGeometry args={[0.58, 0.055, 0.012]} />
                  <meshBasicMaterial
                    ref={tertiaryMaterialRef}
                    color={color}
                    transparent
                    opacity={0}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              </group>
            </>
          ) : null}
        </Billboard>
      )}
    </group>
  );
}

export function ReactionPulses() {
  return (
    <group>
      {REACTION_DEFINITIONS.map((reaction) => (
        <ReactionPulse key={reaction.id} reaction={reaction} />
      ))}
    </group>
  );
}
