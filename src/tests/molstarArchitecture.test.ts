import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ENTITY_IDS } from '@/simulation/entities';
import { StructureRegistry, structureRegistry } from '@/molecules/StructureRegistry';
import { parseSimulationRenderer } from '@/rendering/featureFlags';
import { MolStarSelectionBridge } from '@/rendering/MolStarSelectionBridge';
import { simulationRepresentationRegistry } from '@/rendering/RepresentationRegistry';

describe('Mol* 렌더러 구조', () => {
  it('Mol* import를 시뮬레이션 엔진 계층 밖에 둔다', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'simulation');
    for (const file of ['engine.ts', 'types.ts', 'entities.ts', 'reactions.ts']) {
      expect(readFileSync(resolve(root, file), 'utf8')).not.toMatch(/molstar|MolStar|Mol\*/);
    }
  });

  it('기본값으로 Mol*을 쓰면서 legacy feature flag도 남겨 둔다', () => {
    expect(parseSimulationRenderer(undefined)).toBe('molstar');
    expect(parseSimulationRenderer('molstar')).toBe('molstar');
    expect(parseSimulationRenderer('legacy-r3f')).toBe('legacy-r3f');
    expect(parseSimulationRenderer('invalid')).toBe('molstar');
  });
});

describe('StructureRegistry', () => {
  it('모든 시뮬레이션 엔티티를 빠짐없이 해석한다', () => {
    expect(structureRegistry.list()).toHaveLength(ENTITY_IDS.length);
    for (const id of ENTITY_IDS) {
      expect(structureRegistry.resolve(id).moleculeId).toBe(id);
    }
  });

  it('Factor IXa를 함께 담아 둔 실험 구조 6MV4 fixture에 연결한다', () => {
    expect(structureRegistry.resolve('factorIXa')).toMatchObject({
      evidence: 'experimental',
      accession: '6MV4',
      format: 'mmcif',
      localUrl: '/structures/6mv4.cif',
    });
    expect(structureRegistry.loadableForLiveScene()).toHaveLength(1);
  });

  it('추정하는 대신 이름을 붙인 개념 대체 표시를 쓴다', () => {
    expect(new StructureRegistry().resolve('tenaseComplex')).toMatchObject({
      source: 'unavailable',
      evidence: 'conceptual-fallback',
    });
  });
});

describe('선택과 표현 정책', () => {
  it('애플리케이션과 렌더러의 선택을 양방향으로 동기화한다', () => {
    const port = { select: vi.fn(), clear: vi.fn() };
    const updateApplication = vi.fn();
    const bridge = new MolStarSelectionBridge(port, updateApplication);

    bridge.applicationSelectionChanged('factorIXa');
    expect(port.select).toHaveBeenCalledWith('factorIXa');
    bridge.applicationSelectionChanged(null);
    expect(port.clear).toHaveBeenCalledOnce();
    bridge.rendererSelectionChanged('thrombin');
    expect(updateApplication).toHaveBeenCalledWith('thrombin');
  });

  it('선택되지 않은 구조에는 cartoon을, 대체 표시 엔티티에는 conceptual 모드를 배정한다', () => {
    expect(
      simulationRepresentationRegistry.resolve(structureRegistry.resolve('factorIXa'), false),
    ).toMatchObject({ mode: 'cartoon', lod: 1 });
    expect(
      simulationRepresentationRegistry.resolve(structureRegistry.resolve('fibrin'), true),
    ).toMatchObject({ mode: 'conceptual', lod: 0 });
    expect(
      simulationRepresentationRegistry.capDetailed(['factorIXa', 'factorXa', 'thrombin']),
    ).toHaveLength(2);
  });
});
