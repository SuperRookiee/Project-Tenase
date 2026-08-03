'use client';

import { useEffect, useMemo, useRef, type ComponentRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { getReactionTrace } from '@/simulation/reactionTrace';
import type { EntityId } from '@/simulation/types';
import type { CameraStoryTarget } from '@/store/simulationStore';
import { DAMAGE_CENTER, ENTITY_ZONES } from './sceneLayout';

const STORY_SEQUENCE: readonly EntityId[] = [
  'platelets',
  'factorIXa',
  'tenaseComplex',
  'factorXa',
  'thrombin',
  'fibrin',
];
const SEGMENT_SECONDS = 3.6;
const CAMERA_OFFSET = new THREE.Vector3(0.15, 1.75, 4.8);

interface CinematicCameraProps {
  readonly target: CameraStoryTarget;
  readonly controlsRef: RefObject<ComponentRef<typeof OrbitControls> | null>;
}

function storyEntities(target: Exclude<CameraStoryTarget, null>): readonly EntityId[] {
  if (target === 'full') return STORY_SEQUENCE;
  const trace = getReactionTrace(target);
  const sequence = STORY_SEQUENCE.filter((id) => trace.entityIds.has(id));
  return sequence.includes(target) ? sequence : [...sequence, target];
}

export function CinematicCamera({ target, controlsRef }: CinematicCameraProps) {
  const elapsedRef = useRef(0);
  const focusRef = useRef(new THREE.Vector3());
  const desiredCameraRef = useRef(new THREE.Vector3());

  const waypoints = useMemo(() => {
    if (target === null) return [];
    const damage = new THREE.Vector3(...DAMAGE_CENTER);
    return [
      damage,
      ...storyEntities(target).map(
        (id) => new THREE.Vector3(...ENTITY_ZONES[id].center),
      ),
    ];
  }, [target]);

  useEffect(() => {
    elapsedRef.current = 0;
  }, [target]);

  useFrame(({ camera }, delta) => {
    if (target === null || waypoints.length === 0) return;
    elapsedRef.current += Math.min(delta, 0.1);

    const progress = elapsedRef.current / SEGMENT_SECONDS;
    const fromIndex = Math.floor(progress) % waypoints.length;
    const toIndex = (fromIndex + 1) % waypoints.length;
    const rawT = progress - Math.floor(progress);
    const easedT = rawT * rawT * (3 - 2 * rawT);

    focusRef.current.lerpVectors(
      waypoints[fromIndex] ?? waypoints[0],
      waypoints[toIndex] ?? waypoints[0],
      easedT,
    );
    desiredCameraRef.current.copy(focusRef.current).add(CAMERA_OFFSET);

    const cameraBlend = 1 - Math.exp(-delta * 1.35);
    camera.position.lerp(desiredCameraRef.current, cameraBlend);
    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerp(focusRef.current, cameraBlend);
      controls.update();
    } else {
      camera.lookAt(focusRef.current);
    }
  });

  return null;
}
