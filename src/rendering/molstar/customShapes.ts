import { OrderedSet } from 'molstar/lib/mol-data/int';
import { Mesh } from 'molstar/lib/mol-geo/geometry/mesh/mesh';
import { MeshBuilder } from 'molstar/lib/mol-geo/geometry/mesh/mesh-builder';
import { addCylinder } from 'molstar/lib/mol-geo/geometry/mesh/builder/cylinder';
import { addSphere } from 'molstar/lib/mol-geo/geometry/mesh/builder/sphere';
import { Mat4, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { Shape, ShapeGroup } from 'molstar/lib/mol-model/shape';
import { ShapeRepresentation } from 'molstar/lib/mol-repr/shape/representation';
import type { Representation } from 'molstar/lib/mol-repr/representation';
import { Color } from 'molstar/lib/mol-util/color';
import { MarkerAction } from 'molstar/lib/mol-util/marker-action';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { ENTITY_DEFINITIONS } from '@/simulation/entities';
import type { EntityId } from '@/simulation/types';
import { structureRegistry } from '@/molecules/StructureRegistry';
import type { SimulationRendererFrame } from '@/rendering/types';

interface VesselShapeData {
  readonly kind: 'vessel';
}

export interface ConceptualShapeData {
  readonly kind: 'conceptual-entities';
  readonly entityIds: readonly EntityId[];
}

function vesselShape(_ctx: unknown, data: VesselShapeData) {
  const builder = MeshBuilder.createState(512, 256);
  builder.currentGroup = 0;
  addCylinder(builder, Vec3.create(-58, 0, 0), Vec3.create(58, 0, 0), 1, {
    radiusTop: 34,
    radiusBottom: 34,
    radialSegments: 48,
    topCap: false,
    bottomCap: false,
  });
  builder.currentGroup = 1;
  addCylinder(builder, Vec3.create(-9, 0, 0), Vec3.create(9, 0, 0), 1, {
    radiusTop: 34.35,
    radiusBottom: 34.35,
    radialSegments: 48,
    topCap: false,
    bottomCap: false,
  });
  const mesh = MeshBuilder.getMesh(builder);
  return Shape.create(
    '관 경계',
    data,
    mesh,
    (group) => Color(group === 1 ? 0xf9735b : 0x164e63),
    () => 1,
    (group) => (group === 1 ? '추상 손상 영역' : '관 경계'),
  );
}

function conceptualEntityShape(_ctx: unknown, data: ConceptualShapeData) {
  const builder = MeshBuilder.createState(1024, 256);
  const count = data.entityIds.length;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const lane = index % 3;
    const x = (lane - 1) * 28;
    const center = Vec3.create(x, Math.cos(angle) * 23, Math.sin(angle) * 23);
    builder.currentGroup = index;
    addSphere(builder, center, 2.4 + (index % 2) * 0.45, 2);
  }
  const mesh = MeshBuilder.getMesh(builder);
  return Shape.create(
    '엔티티 개념 대체 표시',
    data,
    mesh,
    (group) => {
      const id = data.entityIds[group];
      const definition = ENTITY_DEFINITIONS.find((item) => item.id === id);
      return Color(Number.parseInt(definition?.color.slice(1) ?? '64748b', 16));
    },
    () => 1,
    (group) => {
      const id = data.entityIds[group];
      return id ? `${structureRegistry.resolve(id).displayName} — 개념 대체 표시` : '개념 대체 표시';
    },
  );
}

export interface MolStarCustomShapeHandle {
  readonly representation: Representation.Any;
  updateFrame(frame: SimulationRendererFrame): void;
  select(entityId: EntityId | null): void;
  entityFromLoci(loci: unknown): EntityId | null;
  dispose(): void;
}

export async function addSimulationCustomShapes(
  plugin: PluginContext,
): Promise<MolStarCustomShapeHandle> {
  const vesselRepresentation = ShapeRepresentation(vesselShape, Mesh.Utils);
  await plugin.runTask(
    vesselRepresentation.createOrUpdate(
      { alpha: 0.13, doubleSided: true, transparentBackfaces: 'on', quality: 'low' },
      { kind: 'vessel' },
    ),
  );

  const fallbackIds: readonly EntityId[] = ENTITY_DEFINITIONS.map((item) => item.id).filter(
    (id) => id !== 'factorIXa',
  );
  const conceptualRepresentation = ShapeRepresentation(conceptualEntityShape, Mesh.Utils);
  const conceptualData: ConceptualShapeData = {
    kind: 'conceptual-entities',
    entityIds: fallbackIds,
  };
  await plugin.runTask(
    conceptualRepresentation.createOrUpdate(
      { alpha: 0.82, quality: 'low', emissive: 0.12 },
      conceptualData,
    ),
  );

  plugin.canvas3d?.add(vesselRepresentation);
  plugin.canvas3d?.add(conceptualRepresentation);

  let selectedIndex: number | null = null;
  const transform = Mat4.identity();
  const rotation = Mat4.identity();
  const translation = Mat4.identity();
  const scale = Mat4.identity();
  const flowAxis = Vec3.create(1, 0, 0);
  const offset = Vec3.zero();
  const getLoci = (index: number) => {
    const all = conceptualRepresentation.getAllLoci();
    const shapeLoci = all.find((item) => item.kind === 'shape-loci');
    if (!shapeLoci || shapeLoci.kind !== 'shape-loci') return null;
    return ShapeGroup.Loci(shapeLoci.shape, [
      { ids: OrderedSet.ofSingleton(index), instance: 0 },
    ]);
  };

  return {
    representation: conceptualRepresentation,
    updateFrame(frame) {
      // 모델 시간에 맞춰 fallback 입자 무리가 관 안을 천천히 공전하고 호흡한다.
      // 모션 줄이기에서는 시간 위상을 고정하되 수준 기반 강조는 유지한다.
      const phase = frame.reducedMotion ? 0.75 : frame.time;
      const activity = Math.min(Math.max(frame.signals.networkActivity, 0), 1);
      const breathing = 1 + Math.sin(phase * 2.2) * (0.06 + activity * 0.06);

      Mat4.fromRotation(rotation, phase * (0.55 + activity * 0.35), flowAxis);
      Mat4.fromUniformScaling(scale, breathing);
      Mat4.mul(transform, rotation, scale);
      Vec3.set(offset, Math.sin(phase * 0.9) * (4 + activity * 3), 0, 0);
      Mat4.fromTranslation(translation, offset);
      Mat4.mul(transform, translation, transform);

      conceptualRepresentation.setState({
        transform,
        alphaFactor: 0.72 + activity * 0.28,
      });
    },
    select(entityId) {
      if (selectedIndex !== null) {
        const oldLoci = getLoci(selectedIndex);
        if (oldLoci) conceptualRepresentation.mark(oldLoci, MarkerAction.Deselect);
      }
      selectedIndex = entityId === null ? null : fallbackIds.indexOf(entityId);
      if (selectedIndex !== null && selectedIndex >= 0) {
        const loci = getLoci(selectedIndex);
        if (loci) {
          conceptualRepresentation.mark(loci, MarkerAction.Select);
          plugin.managers.camera.focusLoci(loci, { durationMs: 180, extraRadius: 8 });
        }
      } else {
        selectedIndex = null;
      }
      plugin.canvas3d?.requestDraw();
    },
    entityFromLoci(loci) {
      if (!ShapeGroup.isLoci(loci)) return null;
      const source = loci.shape.sourceData;
      if (
        typeof source !== 'object' ||
        source === null ||
        !('kind' in source) ||
        source.kind !== 'conceptual-entities'
      ) {
        return null;
      }
      const first = loci.groups[0];
      if (!first || OrderedSet.isEmpty(first.ids)) return null;
      return fallbackIds[OrderedSet.getAt(first.ids, 0)] ?? null;
    },
    dispose() {
      plugin.canvas3d?.remove(vesselRepresentation);
      plugin.canvas3d?.remove(conceptualRepresentation);
      vesselRepresentation.destroy();
      conceptualRepresentation.destroy();
    },
  };
}
