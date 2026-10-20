// src/ui/selection.ts
// 단일 선택 모델: 조명 하나, 세트 하나, 사람 모형 하나, 또는 아무것도 아님 (여러 개 동시 선택은 없다).
// 선택은 상태(selected_fixture_id / selected_set_id / selected_actor_id)에 둔다.
// 화면 모듈과 의존하지 않도록, 선택이 바뀌면 등록된 함수에 알리기만 한다 (패널 열기는 shell.ts가 맡는다).
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §4, §5.4

import { getState, setState } from '../state/store';

export type SelectionKind = 'fixture' | 'set' | 'actor' | null;

type SelectListener = (kind: SelectionKind) => void;
const listeners = new Set<SelectListener>();
const openListeners = new Set<SelectListener>();

/** 사용자가 무언가를 골랐을 때 (상태 변화 전체가 아니라 "고르는 동작"에만) */
export const onSelect = (listener: SelectListener) => { listeners.add(listener); };
/** 더블클릭처럼 "고른 것의 패널을 꼭 열어 달라"는 요청 (자동으로 열지 않기 설정과 상관없이) */
export const onOpenRequest = (listener: SelectListener) => { openListeners.add(listener); };

export const getSelectionKind = (): SelectionKind => {
  const state = getState();
  if (state.selected_actor_id) return 'actor';
  if (state.selected_set_id) return 'set';
  if (state.selected_fixture_id) return 'fixture';
  return null;
};

/** 지금 고른 것의 패널을 연다 (조명 → 조명 설정, 세트·사람 모형 → 선택한 객체 속성) */
export const openSelected = () => {
  const kind = getSelectionKind();
  if (kind) openListeners.forEach(listener => listener(kind));
};

const emit = (kind: SelectionKind) => listeners.forEach(listener => listener(kind));

export const selectFixture = (id: string) => {
  setState(s => {
    s.selected_fixture_id = id;
    s.selected_fixture_ids = [id];
    s.selected_set_id = null;
    s.selected_actor_id = null;
  });
  emit('fixture');
};

export const selectSet = (id: string) => {
  setState(s => {
    s.selected_set_id = id;
    s.selected_fixture_id = null;
    s.selected_fixture_ids = [];
    s.selected_actor_id = null;
  });
  emit('set');
};

export const selectActor = (id: string) => {
  setState(s => {
    s.selected_actor_id = id;
    s.selected_set_id = null;
    s.selected_fixture_id = null;
    s.selected_fixture_ids = [];
  });
  emit('actor');
};

export const clearSelection = () => {
  const s0 = getState();
  if (!s0.selected_actor_id && !s0.selected_fixture_id && !s0.selected_set_id) return;
  setState(s => {
    s.selected_actor_id = null;
    s.selected_set_id = null;
    s.selected_fixture_id = null;
    s.selected_fixture_ids = [];
  });
  emit(null);
};
