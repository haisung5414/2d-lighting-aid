// src/render/setShape.ts
// 세트 사각형의 평면 모양: 네 꼭짓점과 점 포함 검사 (회전 포함). 캔버스와 다중 선택이 함께 쓴다.

import type { Position2D, SetPiece } from '../types';

export const setPieceCorners = (piece: SetPiece): Position2D[] => {
  const r = piece.rotation * Math.PI / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const lx = sx * piece.width / 2;
    const ly = sy * piece.depth / 2;
    return { x: piece.x + lx * cos - ly * sin, y: piece.y + lx * sin + ly * cos };
  });
};

export const pointInSetPiece = (point: Position2D, piece: SetPiece): boolean => {
  const r = -piece.rotation * Math.PI / 180;
  const dx = point.x - piece.x;
  const dy = point.y - piece.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return Math.abs(lx) <= piece.width / 2 && Math.abs(ly) <= piece.depth / 2;
};
