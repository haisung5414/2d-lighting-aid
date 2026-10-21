// src/ui/exportPlan.ts
// ☰ 메뉴 "평면도 내보내기": 지금 씬의 2D 평면도를 PNG 그림 파일로 내려받는다.
// 화면과 같은 그리기(render/canvas.ts)를 쓰되, 무대 전체가 들어가게 맞추고 선택 표시는 빼고, 위에 제목 줄을 붙인다.
// 사양: docs/redesign/UI_REDESIGN_SPEC.md §8

import { getCurrentCue, getState } from '../state/store';
import { drawPlanForExport } from '../render/canvas';
import { VENUES } from '../config/venues';

/** 화면과 비슷한 배율(1 m당 픽셀)로 그린 뒤 RESOLUTION배로 키워 저장한다. 조명 기호와 글자가 화면에서와 같은 비율로 보인다 */
const RESOLUTION = 2.5;
const MARGIN = 32;
const HEADER = 68;

const venueLabel = (key: string | undefined) => {
  if (!key) return '직접 정한 무대';
  if (key === 'sandbox') return '빈 무대';
  return (VENUES as Record<string, { label: string }>)[key]?.label ?? key;
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

/** 파일 이름에 쓸 수 없는 글자를 뺀다 */
const safeName = (text: string) => text.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

export const exportPlanImage = (fileName: string | null) => {
  const state = getState();
  const cue = getCurrentCue();
  const { width: sw, depth: sd } = state.stage_config;
  const pxPerMeter = Math.min(80, Math.max(25, 900 / Math.max(sw, sd)));

  const width = sw * pxPerMeter + MARGIN * 2;
  const height = sd * pxPerMeter + MARGIN * 2 + HEADER;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * RESOLUTION);
  canvas.height = Math.round(height * RESOLUTION);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(RESOLUTION, RESOLUTION);

  // 바탕은 편집 화면과 같은 회색이어야 빛(screen 합성)이 보인다
  ctx.fillStyle = '#535353';
  ctx.fillRect(0, 0, width, height);

  // 제목 줄: 작업 이름 · 씬, 극장 · 무대 크기 · 격자 · 날짜
  const title = fileName ?? '이름 없는 작업';
  ctx.fillStyle = '#1f2329';
  ctx.fillRect(0, 0, width, HEADER);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px "IBM Plex Sans KR", "Segoe UI", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(cue ? `${title} · ${cue.label}` : title, MARGIN, 30, width - MARGIN * 2);
  ctx.fillStyle = '#a5b1be';
  ctx.font = '13px "IBM Plex Sans KR", "Segoe UI", sans-serif';
  ctx.fillText(`${venueLabel(state.stage_config.venue_key)} · 무대 ${sw} × ${sd} m · 격자 1칸 = 1 m · ${today()}`, MARGIN, 52, width - MARGIN * 2);

  drawPlanForExport(ctx, pxPerMeter, MARGIN, HEADER + MARGIN);

  const downloadName = `${safeName(title) || '평면도'} 평면도${cue ? ` - ${safeName(cue.label)}` : ''}.png`;
  canvas.toBlob(blob => {
    if (!blob) {
      alert('평면도 그림을 만들지 못했습니다. 다시 시도해 주세요.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
};
