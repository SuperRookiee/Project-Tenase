import { loadStructureFromData } from 'molstar/lib/extensions/plugin/loaders';
import { Loci } from 'molstar/lib/mol-model/loci';
import { Structure } from 'molstar/lib/mol-model/structure';
import { createPluginUI } from 'molstar/lib/mol-plugin-ui';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';
import { renderReact18 } from 'molstar/lib/mol-plugin-ui/react18';
import { DefaultPluginUISpec, type PluginUISpec } from 'molstar/lib/mol-plugin-ui/spec';
import { PluginConfig } from 'molstar/lib/mol-plugin/config';
import { Color } from 'molstar/lib/mol-util/color';
import type { Subscription } from 'rxjs';
import { structureRegistry } from '@/molecules/StructureRegistry';
import type { EntityId } from '@/simulation/types';
import type { SimulationRendererAdapter } from '@/rendering/types';
import { addSimulationCustomShapes, type MolStarCustomShapeHandle } from './customShapes';

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
    plugin.canvas3d?.setProps({ renderer: { backgroundColor: Color(0x070b12) } });
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

  selectEntity(entityId: EntityId | null): void {
    const plugin = this.#plugin;
    if (!plugin) return;
    this.#shapeHandle?.select(entityId === 'factorIXa' ? null : entityId);
    plugin.managers.interactivity.lociSelects.deselectAll();
    if (entityId !== 'factorIXa') return;
    const structure = plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
    if (!structure) return;
    const loci = Structure.Loci(structure);
    plugin.managers.interactivity.lociSelects.selectOnly({ loci });
    plugin.managers.camera.focusLoci(loci, { durationMs: 180, extraRadius: 5 });
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
    this.#plugin?.dispose();
    this.#plugin = null;
    this.#host?.replaceChildren();
    this.#host = null;
  }
}
