import { OrderedSet } from 'molstar/lib/mol-data/int';
import { Mesh } from 'molstar/lib/mol-geo/geometry/mesh/mesh';
import { MeshBuilder } from 'molstar/lib/mol-geo/geometry/mesh/mesh-builder';
import {
  addCylinder,
  addFixedCountDashedCylinder,
} from 'molstar/lib/mol-geo/geometry/mesh/builder/cylinder';
import { addSphere } from 'molstar/lib/mol-geo/geometry/mesh/builder/sphere';
import { Mat4, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import { Shape, ShapeGroup } from 'molstar/lib/mol-model/shape';
import { ShapeRepresentation } from 'molstar/lib/mol-repr/shape/representation';
import type { Representation } from 'molstar/lib/mol-repr/representation';
import { Color } from 'molstar/lib/mol-util/color';
import { MarkerAction } from 'molstar/lib/mol-util/marker-action';
import type { PluginContext } from 'molstar/lib/mol-plugin/context';
import { ENTITY_DEFINITIONS } from '@/simulation/entities';
import { REACTION_KIND_LABELS } from '@/simulation/reactions';
import type { EntityId, EntityLevels } from '@/simulation/types';
import { structureRegistry } from '@/molecules/StructureRegistry';
import type { SimulationRendererFrame } from '@/rendering/types';
import {
  CASCADE_LINKS,
  CASCADE_NODES,
  type CascadeLink,
  type FlowRelation,
} from './cascadeLayout';

/**
 * 6MV4 실험 구조가 자리를 차지하므로 개념 구체를 그리지 않는 노드.
 * 캐스케이드 배치에는 그대로 남아 있어서 이 노드로 드나드는 엣지는 정상적으로 이어진다.
 */
const STRUCTURE_BACKED_ENTITY: EntityId = 'factorIXa';

const NODE_COUNT = CASCADE_NODES.length;
const LINK_COUNT = CASCADE_LINKS.length;
const TOTAL_GROUPS = NODE_COUNT + LINK_COUNT;

/** 수준이 0일 때 노드가 잦아드는 색. 완전히 사라지지 않고 흐릿한 자취로 남는다. */
const IDLE_COLOR = Color(0x1e293b);

/**
 * 관계별 엣지 색.
 *
 * 색만으로 구분되지 않도록 기하도 함께 다르다. 억제 엣지는 점선 실린더에 이동
 * 표식이 없고, 나머지는 실선 실린더 위로 표식이 하류를 향해 흐른다.
 */
const RELATION_COLORS: Readonly<Record<FlowRelation, Color>> = {
  produces: Color(0x2dd4bf),
  catalyzes: Color(0xc084fc),
  inhibits: Color(0xeab308),
};

const RELATION_LABELS: Readonly<Record<FlowRelation, string>> = {
  produces: '생성',
  catalyzes: '촉진',
  inhibits: '억제',
};

const ENTITY_COLORS: ReadonlyMap<EntityId, Color> = new Map(
  ENTITY_DEFINITIONS.map(
    (item) => [item.id, Color(Number.parseInt(item.color.slice(1), 16))] as const,
  ),
);

interface VesselShapeData {
  readonly kind: 'vessel';
}

export interface ConceptualShapeData {
  readonly kind: 'conceptual-entities';
  readonly levels: EntityLevels;
  /** 엣지별로 이미 `CASCADE_LINKS` 순서에 맞춰 합쳐 둔 0–1 활동도. */
  readonly linkActivity: readonly number[];
  /** 엣지별 이동 표식의 진행도 0–1. */
  readonly linkTravel: readonly number[];
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

/** 엣지 활동도를 눈에 보이는 0–1 강조로 옮긴다. legacy 장면과 같은 기울기다. */
function linkEmphasis(activity: number): number {
  return Math.min(1, Math.max(0, activity) * 2.2);
}

const packetCenter = Vec3.zero();

/**
 * 캐스케이드 노드와 흐름 엣지를 하나의 mesh로 만든다.
 *
 * group 0..NODE_COUNT-1은 노드, 그 뒤가 엣지다. 이 순서 덕분에 group 색인만으로
 * 엔티티를 되찾을 수 있고, 형상을 다시 만들어도 선택 상태가 어긋나지 않는다.
 */
function conceptualEntityShape(_ctx: unknown, data: ConceptualShapeData) {
  const builder = MeshBuilder.createState(4096, 1024);

  for (let index = 0; index < NODE_COUNT; index += 1) {
    const node = CASCADE_NODES[index];
    if (node.entityId === STRUCTURE_BACKED_ENTITY) continue;
    const level = Math.min(Math.max(data.levels[node.entityId] ?? 0, 0), 1);
    builder.currentGroup = index;
    addSphere(builder, node.center, node.baseRadius * (0.34 + 0.72 * level), 2);
  }

  for (let index = 0; index < LINK_COUNT; index += 1) {
    const link = CASCADE_LINKS[index];
    const emphasis = linkEmphasis(data.linkActivity[index] ?? 0);
    builder.currentGroup = NODE_COUNT + index;

    const props = {
      radiusTop: 0.32 + 2.1 * emphasis,
      radiusBottom: 0.32 + 2.1 * emphasis,
      radialSegments: 8,
      topCap: true,
      bottomCap: true,
    };

    if (link.relation === 'inhibits') {
      // 점선이 억제를 색과 무관하게 알려 준다. 막대 표식은 흐르지 않는다.
      addFixedCountDashedCylinder(builder, link.start, link.end, 1, 9, true, props);
      continue;
    }

    addCylinder(builder, link.start, link.end, 1, props);

    if (emphasis <= 0.02) continue;
    // 이동 표식은 엣지 양 끝의 구체에 파묻히지 않도록 안쪽 구간만 오간다.
    const travel = 0.18 + 0.64 * Math.min(Math.max(data.linkTravel[index] ?? 0, 0), 1);
    Vec3.lerp(packetCenter, link.start, link.end, travel);
    addSphere(builder, packetCenter, 0.9 + 1.3 * emphasis, 1);
  }

  const mesh = MeshBuilder.getMesh(builder);
  return Shape.create(
    '캐스케이드 노드와 흐름 엣지',
    data,
    mesh,
    (group) => {
      if (group < NODE_COUNT) {
        const node = CASCADE_NODES[group];
        const level = Math.min(Math.max(data.levels[node.entityId] ?? 0, 0), 1);
        const color = ENTITY_COLORS.get(node.entityId) ?? Color(0x64748b);
        return Color.interpolate(IDLE_COLOR, color, 0.24 + 0.76 * level);
      }
      const link = CASCADE_LINKS[group - NODE_COUNT];
      if (!link) return IDLE_COLOR;
      const emphasis = linkEmphasis(data.linkActivity[group - NODE_COUNT] ?? 0);
      return Color.interpolate(IDLE_COLOR, RELATION_COLORS[link.relation], 0.14 + 0.86 * emphasis);
    },
    () => 1,
    (group) => {
      if (group < NODE_COUNT) {
        const node = CASCADE_NODES[group];
        const level = data.levels[node.entityId] ?? 0;
        const name = structureRegistry.resolve(node.entityId).displayName;
        return `${name} — 개념 대체 표시 · 수준 ${level.toFixed(2)}`;
      }
      const link = CASCADE_LINKS[group - NODE_COUNT];
      if (!link) return '흐름 엣지';
      const activity = data.linkActivity[group - NODE_COUNT] ?? 0;
      const from = structureRegistry.resolve(link.from).displayName;
      const to = structureRegistry.resolve(link.to).displayName;
      return `${from} → ${to} · ${RELATION_LABELS[link.relation]} · ${REACTION_KIND_LABELS[link.kind]} · 활동도 ${activity.toFixed(2)}`;
    },
    undefined,
    TOTAL_GROUPS,
  );
}

export interface MolStarCustomShapeHandle {
  readonly representation: Representation.Any;
  /** 이번 프레임에 표현이 바뀌었으면 참. 호출자가 draw 요청 여부를 정하는 데 쓴다. */
  updateFrame(frame: SimulationRendererFrame): boolean;
  select(entityId: EntityId | null): void;
  entityFromLoci(loci: unknown): EntityId | null;
  dispose(): void;
}

/**
 * 양자화한 상태 지문.
 *
 * 형상을 다시 만드는 비용이 공짜는 아니므로, 눈에 보이지 않을 만큼 작은 변화로는
 * 다시 만들지 않는다. 반응망이 잠잠하면 지문이 고정되어 재생성이 아예 멎는다.
 */
function computeSignature(
  levels: EntityLevels,
  linkActivity: readonly number[],
  linkTravel: readonly number[],
): number {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    hash ^= value + 0x9e3779b9 + (hash << 6) + (hash >>> 2);
    hash >>>= 0;
  };
  for (const node of CASCADE_NODES) {
    mix(Math.round((levels[node.entityId] ?? 0) * 128));
  }
  for (let index = 0; index < LINK_COUNT; index += 1) {
    mix(Math.round(linkEmphasis(linkActivity[index] ?? 0) * 96));
    mix(Math.round((linkTravel[index] ?? 0) * 64));
  }
  return hash;
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

  const linkActivity = new Array<number>(LINK_COUNT).fill(0);
  const linkTravel = new Array<number>(LINK_COUNT).fill(0);
  const initialLevels = Object.fromEntries(
    CASCADE_NODES.map((node) => [node.entityId, 0] as const),
  ) as EntityLevels;

  const conceptualRepresentation = ShapeRepresentation(conceptualEntityShape, Mesh.Utils);
  await plugin.runTask(
    conceptualRepresentation.createOrUpdate(
      { alpha: 0.9, quality: 'low', emissive: 0.14 },
      {
        kind: 'conceptual-entities',
        levels: initialLevels,
        linkActivity: [...linkActivity],
        linkTravel: [...linkTravel],
      },
    ),
  );

  plugin.canvas3d?.add(vesselRepresentation);
  plugin.canvas3d?.add(conceptualRepresentation);

  let selectedIndex: number | null = null;
  let signature = Number.NaN;
  let rebuilding = false;
  let disposed = false;
  let lastTime = Number.NaN;
  let lastPhase = Number.NaN;
  let lastActivity = Number.NaN;
  const transform = Mat4.identity();
  const rotation = Mat4.identity();
  const scale = Mat4.identity();
  const spinAxis = Vec3.create(1, 0, 0);

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
      // 엣지 활동도를 그래프에서 읽어 온다. 같은 두 노드를 잇는 반응이 여럿이면
      // 가장 활발한 쪽이 그 엣지를 대표한다.
      for (let index = 0; index < LINK_COUNT; index += 1) {
        const link: CascadeLink = CASCADE_LINKS[index];
        let activity = 0;
        for (const reactionId of link.reactionIds) {
          const value = frame.reactionActivity[reactionId] ?? 0;
          if (value > activity) activity = value;
        }
        linkActivity[index] = activity;
      }

      // 이동 표식은 프레임 사이 모델 시간 차이만큼 나아간다. 활동이 없으면 서지도
      // 않고 아예 멈춘다 — 덕분에 잠잠한 반응망에서는 형상 재생성이 일어나지 않는다.
      const delta = Number.isNaN(lastTime) ? 0 : frame.time - lastTime;
      lastTime = frame.time;
      if (delta > 0 && !frame.reducedMotion) {
        for (let index = 0; index < LINK_COUNT; index += 1) {
          const emphasis = linkEmphasis(linkActivity[index]);
          if (emphasis <= 0.02) continue;
          linkTravel[index] = (linkTravel[index] + delta * (0.25 + emphasis * 0.85)) % 1;
        }
      }

      // 관 축을 중심으로 아주 느리게 돌려 깊이를 준다. X축 회전이므로 좌→우로 읽는
      // 캐스케이드 순서는 그대로 남는다.
      const phase = frame.reducedMotion ? 0.75 : frame.time;
      const activity = Math.min(Math.max(frame.signals.networkActivity, 0), 1);
      let changed = false;
      if (phase !== lastPhase || activity !== lastActivity) {
        lastPhase = phase;
        lastActivity = activity;
        changed = true;
        const breathing = 1 + Math.sin(phase * 2.2) * (0.02 + activity * 0.03);
        Mat4.fromRotation(rotation, phase * 0.14, spinAxis);
        Mat4.fromUniformScaling(scale, breathing);
        Mat4.mul(transform, rotation, scale);
        conceptualRepresentation.setState({
          transform,
          alphaFactor: 0.78 + activity * 0.22,
        });
      }

      const next = computeSignature(frame.levels, linkActivity, linkTravel);
      if (next === signature || rebuilding || disposed) return changed;
      signature = next;
      rebuilding = true;

      // 수준과 활동도가 기하 자체를 바꾸므로 mesh를 다시 만든다. 노드 13개와
      // 엣지 15개짜리 저해상도 mesh라 프레임 예산 안에 넉넉히 들어온다.
      void plugin
        .runTask(
          conceptualRepresentation.createOrUpdate(
            {},
            {
              kind: 'conceptual-entities',
              levels: { ...frame.levels },
              linkActivity: [...linkActivity],
              linkTravel: [...linkTravel],
            },
          ),
        )
        .then(() => {
          if (disposed) return;
          plugin.canvas3d?.update(conceptualRepresentation, true);
          plugin.canvas3d?.requestDraw();
        })
        .finally(() => {
          rebuilding = false;
        });

      return true;
    },
    select(entityId) {
      if (selectedIndex !== null) {
        const oldLoci = getLoci(selectedIndex);
        if (oldLoci) conceptualRepresentation.mark(oldLoci, MarkerAction.Deselect);
      }
      selectedIndex =
        entityId === null
          ? null
          : CASCADE_NODES.findIndex((node) => node.entityId === entityId);
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
      // 관 경계도 shape loci라서 sourceData로 갈라내야 한다. 이 검사가 없으면 관을
      // 클릭했을 때 group 0이 캐스케이드 첫 노드로 잘못 해석된다.
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
      // 엣지 group은 엔티티로 되돌리지 않는다. 노드만 선택 대상이다.
      const group = OrderedSet.getAt(first.ids, 0);
      if (group < 0 || group >= NODE_COUNT) return null;
      return CASCADE_NODES[group].entityId;
    },
    dispose() {
      disposed = true;
      plugin.canvas3d?.remove(vesselRepresentation);
      plugin.canvas3d?.remove(conceptualRepresentation);
      vesselRepresentation.destroy();
      conceptualRepresentation.destroy();
    },
  };
}
