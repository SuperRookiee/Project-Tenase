'use client';

/**
 * 전역 키보드 단축키.
 *
 * 모든 단축키는 화면에 보이는 컨트롤과 짝을 이루므로, 키보드는 어떤 기능에
 * 도달하는 유일한 수단이 아니라 단축 계층일 뿐이다. 여기 있는 목록은
 * `KeyboardHelp`가 그대로 문서화한다.
 */
import { useEffect } from 'react';
import { simulationStore } from '@/store/simulationStore';

/**
 * 텍스트 입력 대상은 자기 키 입력을 삼킨다. 입력란에 타이핑하거나 방향키로 범위
 * 슬라이더를 미세 조정하는 동작이 실행 제어까지 함께 움직여서는 절대 안 된다.
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== 'object') return false;
  // `instanceof` 대신 구조를 검사한다. 그래야 iframe 안이나 자체 realm을 가진
  // 테스트 문서에서도 이 훅이 똑같이 동작한다.
  const element = target as HTMLElement;
  if (element.isContentEditable === true) return true;
  const tagName =
    typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

/**
 * 스페이스 키는 포커스된 버튼이나 링크를 브라우저 기본 동작으로 활성화한다. 그
 * 상황에서 스페이스를 가로채면 초기화 버튼이 초기화 대신 실행을 토글하게 되므로,
 * 그런 컨트롤에 포커스가 있는 동안에는 실행 제어 단축키가 물러난다.
 */
function isActivationTarget(target: EventTarget | null): boolean {
  if (target === null || typeof target !== 'object') return false;
  const element = target as HTMLElement;
  const tagName =
    typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  if (tagName === 'BUTTON' || tagName === 'A' || tagName === 'SUMMARY') return true;
  return typeof element.getAttribute === 'function'
    ? element.getAttribute('role') === 'button'
    : false;
}

/** 타임라인 커서를 현재 위치를 기준으로 상대 이동시킨다. */
function moveScrubIndex(delta: number): void {
  const state = simulationStore.getState();
  const length = state.frame.snapshots.length;
  if (length === 0) return;
  // 실시간 뷰는 가장 최근에 기록된 샘플 위에 있는 것으로 친다.
  const current = state.scrubIndex ?? length - 1;
  state.setScrubIndex(current + delta);
}

function jumpScrubIndex(edge: 'oldest' | 'newest'): void {
  const state = simulationStore.getState();
  const length = state.frame.snapshots.length;
  if (length === 0) return;
  state.setScrubIndex(edge === 'oldest' ? 0 : length - 1);
}

export function useKeyboardControls(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      // 수식 키가 눌려 있다면 사용자가 브라우저나 OS 명령을 쓰려는 것이다.
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isTextEntryTarget(event.target)) return;

      const store = simulationStore.getState();

      switch (event.key) {
        case ' ':
        case 'Spacebar': {
          if (isActivationTarget(event.target)) return;
          event.preventDefault();
          store.toggleRunning();
          return;
        }
        case 'r':
        case 'R': {
          event.preventDefault();
          store.reset();
          return;
        }
        case 's':
        case 'S': {
          event.preventDefault();
          store.stepOnce();
          return;
        }
        case 'ArrowLeft': {
          event.preventDefault();
          moveScrubIndex(-1);
          return;
        }
        case 'ArrowRight': {
          event.preventDefault();
          moveScrubIndex(1);
          return;
        }
        case 'Home': {
          event.preventDefault();
          jumpScrubIndex('oldest');
          return;
        }
        case 'End': {
          event.preventDefault();
          jumpScrubIndex('newest');
          return;
        }
        case 'l':
        case 'L': {
          event.preventDefault();
          store.setScrubIndex(null);
          return;
        }
        case 'c':
        case 'C': {
          event.preventDefault();
          if (store.cameraStoryTarget === null) {
            store.startCameraStory('full');
          } else {
            store.stopCameraStory();
          }
          return;
        }
        case 'Escape': {
          event.preventDefault();
          if (store.cameraStoryTarget !== null) {
            store.stopCameraStory();
            return;
          }
          store.selectEntity(null);
          return;
        }
        default:
          // 나머지는 전부 브라우저의 몫이다.
          return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
