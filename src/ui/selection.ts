// src/ui/selection.ts
// 단일 선택 모델: 조명 하나, 세트 하나, 사람 모형, 또는 아무것도 아님 (여러 개 동시 선택은 없다).
// 조명·세트 선택은 저장 상태(selected_fixture_id / selected_set_id)에 두고, 사람 모형 선택만 화면용 값으로 둔다.
// 화면 모듈과 의존하지 않도록, 선택이 바뀌면 등록된 함수에 알리기만 한다 (패널 열기는 shell.ts가 맡는다).
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §4, §5.4

import { getState, setState } from '../state/store';

export type SelectionKind = 'fixture' | 'set' | 'actor' | null;

let actorSelected = false;
type SelectListener = (kind: SelectionKind) => void;
const listeners = new Set<SelectListener>();

/** 사용자가 무언가를 골랐을 때 (상태 변화 전체가 아니라 "고르는 동작"에만) */
export const onSelect = (listener: SelectListener) => { listeners.add(listener); };

export const getSelectionKind = (): SelectionKind => {
  if (actorSelected) return 'actor';
  const state = getState();
  if (state.selected_set_id) return 'set';
  if (state.selected_fixture_id) return 'fixture';
  return null;
};

export const isActorSelected = () => actorSelected;

const emit = (kind: SelectionKind) => listeners.forEach(listener => listener(kind));

export const selectFixture = (id: string) => {
  actorSelected = false;
  setState(s => {
    s.selected_fixture_id = id;
    s.selected_fixture_ids = [id];
    s.selected_set_id = null;
  });
  emit('fixture');
};

export const selectSet = (id: string) => {
  actorSelected = false;
  setState(s => {
    s.selected_set_id = id;
    s.selected_fixture_id = null;
    s.selected_fixture_ids = [];
  });
  emit('set');
};

export const selectActor = () => {
  actorSelected = true;
  setState(s => {
    s.selected_set_id = null;
    s.selected_fixture_id = null;
    s.selected_fixture_ids = [];
  });
  emit('actor');
};

export const clearSelection = () => {
  if (!actorSelected && !getState().selected_fixture_id && !getState().selected_set_id) return;
  actorSelected = false;
  setState(s => {
    s.selected_set_id = null;
    s.selected_fixture_id = null;
    s.selected_fixture_ids = [];
  });
  emit(null);
};
