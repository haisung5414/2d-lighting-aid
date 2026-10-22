// src/ui/sets.ts
// 세트(무대 위 덩어리) 데이터 조작. 만들기는 왼쪽 도구(tools.ts)가 하고,
// 화면은 properties.ts(선택한 객체 속성)와 stageList.ts(객체 전체 목록)가 그린다.

import { commitHistory, setState } from '../state/store';
import { setHiddenIn } from '../state/sceneVisibility';
import type { SetPiece } from '../types';

type EditableSetProp = 'label' | 'color' | 'x' | 'y' | 'width' | 'depth' | 'height' | 'rotation';

/** 세트 속성을 바꾼다. 크기는 m 단위로 받는다 */
export const updateSetPiece = (id: string, prop: EditableSetProp, value: string | number) => {
  commitHistory();
  setState(s => {
    const piece = (s.stage_config.set_pieces ?? []).find(item => item.id === id);
    if (!piece) return;
    if (prop === 'label' || prop === 'color') {
      const text = String(value).trim();
      if (text) piece[prop] = text;
      return;
    }
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(num)) return;
    if (prop === 'width' || prop === 'depth' || prop === 'height') piece[prop] = Math.max(0.02, num);
    else if (prop === 'rotation') piece.rotation = ((num + 180) % 360 + 360) % 360 - 180;
    else piece[prop] = num;
  });
};

/** 지금 씬에서 세트나 사람 모형을 숨기거나 다시 보이게 한다 (다른 씬은 그대로) */
export const setShownInScene = (kind: 'set' | 'actor', id: string, shown: boolean) => {
  commitHistory();
  setState(s => {
    const cue = s.cues[s.active_cue_index];
    if (!cue) return;
    // 선택은 그대로 둔다: 속성 패널에서 바로 다시 보이게 할 수 있다 (무대에서는 숨긴 것의 손잡이를 그리지 않는다)
    setHiddenIn(cue, kind === 'set' ? 'hidden_set_ids' : 'hidden_actor_ids', id, !shown);
  });
};

export const deleteSetPiece = (id: string) => {
  commitHistory();
  setState(s => {
    s.stage_config.set_pieces = (s.stage_config.set_pieces ?? []).filter((piece: SetPiece) => piece.id !== id);
    if (s.selected_set_id === id) s.selected_set_id = null;
  });
};
