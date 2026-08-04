import { loadStructureFromData } from 'molstar/lib/extensions/plugin/loaders';
import { Loci } from 'molstar/lib/mol-model/loci';
import { Structure } from 'molstar/lib/mol-model/structure';
import { Sphere3D } from 'molstar/lib/mol-math/geometry';
import { Mat4, Vec3 } from 'molstar/lib/mol-math/linear-algebra';
import type { Representation } from 'molstar/lib/mol-repr/representation';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec, type PluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { PluginConfig } from 'molstar/lib/mol-plugin/config';
import { Color } from 'molstar/lib/mol-util/color';
import { now } from 'molstar/lib/mol-util/now';
import type { Subscription } from 'rxjs';
import { structureRegistry } from '@/molecules/StructureRegistry';
import type { EntityId } from '@/simulation/types';
import type {
  SimulationRendererAdapter,
  SimulationRendererFrame,
} from '@/rendering/types';
import { addSimulationCustomShapes, type MolStarCustomShapeHandle } from './customShapes';
import { CASCADE_NODES, cascadeNodeIndex } from './cascadeLayout';

/**
 * 6MV4가 캐스케이드 안에서 차지하는 자리. 이 노드의 개념 구체는 그리지 않으므로
 * 실험 구조가 곧 Factor IXa 노드다.
 */
const STRUCTURE_SLOT = CASCADE_NODES[cascadeNodeIndex('factorIXa')].center;
/** 실험 구조를 옮겨 심을 때 맞출 bounding sphere 반지름. */
const STRUCTURE_TARGET_RADIUS = 9;

export interface MolStarAdapterEvents {
  onLifecycle(state: 'loading-structure' | 'ready' | 'context-lost'): void;
  onSelection(entityId: EntityId | null): void;
}

/**
 * 분자와 custom shape 렌더링은 Mol*이 소유하며, 넘겨받는 것은 안정적인 도메인
 * 식별자뿐이다. 시뮬레이션 엔진을 가져오지도, 바꾸지도 않는다.
 */
export class MolStarSimulationAdapter implements SimulationRendererAdapter {
  readonly kind = 'molstar' as const;
  #plugin: PluginUIContext | null = null;
  #host: HTMLElement | null = null;
  #shapeHandle: MolStarCustomShapeHandle | null = null;
  #clickSubscription: Subscription | null = null;
  #detachContextEvents: (() => void) | null = null;
  #structureRepresentations: Representation.Any[] = [];
  #structureCenter = Vec3.zero();
  #structureTransform = Mat4.identity();
  #toOrigin = Mat4.identity();
  #rotationY = Mat4.identity();
  #rotationZ = Mat4.identity();
  #toCenter = Mat4.identity();
  #structureScale = Mat4.identity();
  #negativeCenter = Vec3.zero();
  #animatedCenter = Vec3.zero();
  #structureScaleFactor = 1;
  #yAxis = Vec3.create(0, 1, 0);
  #zAxis = Vec3.create(0, 0, 1);
  #lastFrameTime: number | null = null;
  #lastFrameActivity: number | null = null;
  #lastFrameReducedMotion: boolean | null = null;
  #disposed = false;

  constructor(private readonly events: MolStarAdapterEvents) {}

  async mount(target: HTMLElement, signal: AbortSignal): Promise<void> {
    if (this.#plugin) throw new Error('Mol* adapter가 이미 마운트돼 있다.');
    signal.throwIfAborted();
    this.#host = target;

    const defaults = DefaultPluginUISpec();
    const spec: PluginUISpec = {
      ...defaults,
      layout: {
        initial: {
          isExpanded: false,
          showControls: false,
          controlsDisplay: 'reactive',
          regionState: { top: 'hidden', bottom: 'hidden', left: 'hidden', right: 'hidden' },
        },
      },
      components: {
        ...defaults.components,
        controls: { top: 'none', bottom: 'none', left: 'none', right: 'none' },
        remoteState: 'none',
      },
      config: [
        ...(defaults.config ?? []),
        [PluginConfig.General.PowerPreference, 'high-performance'],
        [PluginConfig.General.ResolutionMode, 'auto'],
        [PluginConfig.Viewport.ShowControls, false],
        [PluginConfig.Viewport.ShowReset, false],
        [PluginConfig.Viewport.ShowScreenshotControls, false],
        [PluginConfig.Viewport.ShowExpand, false],
        [PluginConfig.Viewport.ShowToggleFullscreen, false],
        [PluginConfig.Viewport.ShowSettings, false],
        [PluginConfig.Viewport.ShowSelectionMode, false],
        [PluginConfig.Viewport.ShowAnimation, false],
        [PluginConfig.Viewport.ShowTrajectoryControls, false],
        [PluginConfig.VolumeStreaming.Enabled, false],
      ],
    };
    const plugin = await createPluginUI({ target, spec, render: renderReact18 });
    if (signal.aborted || this.#disposed) {
      plugin.dispose();
      signal.throwIfAborted();
      return;
    }
    this.#plugin = plugin;
    // Mol*의 내부 루프 대신 애플리케이션의 단일 RAF에서 Canvas3D까지 직접 tick한다.
    // requestDraw만 호출하면 일부 브라우저에서 포인터 이벤트가 올 때까지 실제 draw가
    // 지연될 수 있다.
    plugin.animationLoop.stop();
    plugin.canvas3d?.setProps({
      renderer: { backgroundColor: Color(0x070b12) },
      trackball: {
        rotateSpeed: 4,
        zoomSpeed: 5,
        panSpeed: 1.2,
        staticMoving: false,
        dynamicDampingFactor: 0.12,
      },
    });
    const canvas = target.querySelector('canvas');
    if (canvas) canvas.style.cursor = 'grab';
    this.#attachContextEvents();

    this.events.onLifecycle('loading-structure');
    const descriptor = structureRegistry.resolve('factorIXa');
    if (!descriptor.localUrl || descriptor.format !== 'mmcif') {
      throw new Error('Factor IXa에 쓸 수 있는 로컬 mmCIF fixture가 없다.');
    }
    const response = await fetch(descriptor.localUrl, {
      signal,
      headers: { Accept: 'text/plain,chemical/x-mmcif' },
    });
    if (!response.ok) throw new Error(`구조 fixture 응답이 HTTP ${response.status}였다.`);
    const structureData = await response.text();
    signal.throwIfAborted();
    if (!structureData.startsWith('data_6MV4')) {
      throw new Error('6MV4 구조 fixture의 형식이 어긋나 있다.');
    }
    await loadStructureFromData(plugin, structureData, 'mmcif', {
      dataLabel: 'Factor IXa · RCSB 6MV4',
    });
    signal.throwIfAborted();

    this.#shapeHandle = await addSimulationCustomShapes(plugin);
    const structureRef = plugin.managers.structure.hierarchy.current.structures[0];
    const structure = structureRef?.cell.obj?.data;
    if (structure) {
      Vec3.copy(this.#structureCenter, structure.boundary.sphere.center);
      // mmCIF 원본 좌표는 관 기준으로 크고 축에서 멀리 떨어져 있다. 캐스케이드 자리에
      // 맞도록 자기 중심 기준으로 줄인 뒤 옮겨 심는다.
      const radius = structure.boundary.sphere.radius;
      this.#structureScaleFactor =
        radius > 0 ? STRUCTURE_TARGET_RADIUS / radius : 1;
      this.#structureRepresentations = structureRef.components.flatMap((component) =>
        component.representations.flatMap((representation) => {
          const repr = representation.cell.obj?.data.repr;
          return repr ? [repr] : [];
        }),
      );
    }
    this.#clickSubscription = plugin.behaviors.interaction.click.subscribe(
      ({ current }) => {
        if (Loci.isEmpty(current.loci)) return;
        const conceptualEntity = this.#shapeHandle?.entityFromLoci(current.loci) ?? null;
        if (conceptualEntity) {
          this.events.onSelection(conceptualEntity);
          return;
        }
        if (
          current.loci.kind === 'structure-loci' ||
          current.loci.kind === 'element-loci' ||
          current.loci.kind === 'bond-loci'
        ) {
          this.events.onSelection('factorIXa');
        }
      },
    );
    plugin.canvas3d?.requestCameraReset({ durationMs: 0 });
    this.events.onLifecycle('ready');
  }

  updateFrame(frame: SimulationRendererFrame): void {
    const plugin = this.#plugin;
    if (!plugin || this.#disposed) return;

    const phase = frame.reducedMotion ? 0.75 : frame.time;
    const activity = Math.min(Math.max(frame.signals.networkActivity, 0), 1);
    const stateChanged = !(
      frame.time === this.#lastFrameTime &&
      activity === this.#lastFrameActivity &&
      frame.reducedMotion === this.#lastFrameReducedMotion
    );
    if (stateChanged) {
      this.#lastFrameTime = frame.time;
      this.#lastFrameActivity = activity;
      this.#lastFrameReducedMotion = frame.reducedMotion;
      const center = this.#structureCenter;

      // 구조를 자기 중심으로 끌어와 줄이고 돌린 뒤 캐스케이드의 Factor IXa 자리로
      // 옮긴다. 이렇게 해야 실험 구조가 관 밖에 떠 있지 않고 연쇄의 한 노드로 읽힌다.
      // 반응망 활동이 높을수록 자전과 흔들림이 조금 커진다.
      Vec3.negate(this.#negativeCenter, center);
      Mat4.fromTranslation(this.#toOrigin, this.#negativeCenter);
      Mat4.fromUniformScaling(this.#structureScale, this.#structureScaleFactor);
      Mat4.mul(this.#structureTransform, this.#structureScale, this.#toOrigin);
      Mat4.fromRotation(
        this.#rotationY,
        phase * (0.42 + activity * 0.22),
        this.#yAxis,
      );
      Mat4.mul(this.#structureTransform, this.#rotationY, this.#structureTransform);
      Mat4.fromRotation(this.#rotationZ, Math.sin(phase * 0.7) * 0.2, this.#zAxis);
      Mat4.mul(this.#structureTransform, this.#rotationZ, this.#structureTransform);
      Vec3.set(
        this.#animatedCenter,
        STRUCTURE_SLOT[0],
        STRUCTURE_SLOT[1] + Math.sin(phase * 1.05) * (1.2 + activity),
        STRUCTURE_SLOT[2],
      );
      Mat4.fromTranslation(this.#toCenter, this.#animatedCenter);
      Mat4.mul(this.#structureTransform, this.#toCenter, this.#structureTransform);

      for (const representation of this.#structureRepresentations) {
        representation.setState({ transform: this.#structureTransform });
        plugin.canvas3d?.update(representation, true);
      }
    }

    // 수준과 반응 활동도는 시간과 무관하게 바뀔 수 있으므로 도형 갱신은 위 gate와
    // 별개로 매 프레임 시도하고, 실제로 바뀌었을 때만 draw를 요청한다.
    const shapeChanged = this.#shapeHandle?.updateFrame(frame) ?? false;
    if (stateChanged || shapeChanged) {
      if (this.#shapeHandle) {
        plugin.canvas3d?.update(this.#shapeHandle.representation, true);
      }
      plugin.canvas3d?.requestDraw();
    }

    // 컨트롤 갱신과 draw를 같은 애플리케이션 프레임에서 확정한다. 사용자가 마우스를
    // 움직이지 않아도 애니메이션이 보이며, 드래그/휠 입력도 즉시 반영된다.
    plugin.canvas3d?.tick(now(), {
      isSynchronous: true,
      updateControls: true,
    });
  }

  selectEntity(entityId: EntityId | null): void {
    const plugin = this.#plugin;
    if (!plugin) return;
    this.#shapeHandle?.select(entityId === 'factorIXa' ? null : entityId);
    plugin.managers.interactivity.lociSelects.deselectAll();
    if (entityId === null) {
      plugin.canvas3d?.requestCameraReset({ durationMs: 180 });
      return;
    }
    if (entityId !== 'factorIXa') return;
    const structure = plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
    if (!structure) return;
    const loci = Structure.Loci(structure);
    plugin.managers.interactivity.lociSelects.selectOnly({ loci });
    // loci의 경계는 변환 이전의 원본 mmCIF 좌표라서 화면에 그려지는 자리와 다르다.
    // 캐스케이드 자리를 직접 겨냥해야 카메라가 빈 공간을 잡지 않는다.
    plugin.managers.camera.focusSphere(
      Sphere3D.create(Vec3.clone(STRUCTURE_SLOT), STRUCTURE_TARGET_RADIUS),
      { durationMs: 180, extraRadius: 5 },
    );
  }

  resetCamera(): void {
    this.#plugin?.canvas3d?.requestCameraReset({ durationMs: 180 });
  }

  #attachContextEvents(): void {
    const canvas = this.#host?.querySelector('canvas');
    if (!canvas) return;
    const lost = (event: Event) => {
      event.preventDefault();
      this.events.onLifecycle('context-lost');
    };
    const restored = () => this.events.onLifecycle('ready');
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    this.#detachContextEvents = () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#clickSubscription?.unsubscribe();
    this.#clickSubscription = null;
    this.#detachContextEvents?.();
    this.#detachContextEvents = null;
    this.#shapeHandle?.dispose();
    this.#shapeHandle = null;
    this.#structureRepresentations = [];
    this.#lastFrameTime = null;
    this.#lastFrameActivity = null;
    this.#lastFrameReducedMotion = null;
    this.#plugin?.dispose();
    this.#plugin = null;
    this.#host?.replaceChildren();
    this.#host = null;
  }
}
