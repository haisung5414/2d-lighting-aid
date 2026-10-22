// src/ui/importScenes.ts
// ☰ 메뉴 "씬 가져오기 (이어 붙이기)" 창. 계산은 state/mergeWork.ts가 맡는다.
//   1) 가져올 작업 고르기: 내 컴퓨터의 JSON 파일, 또는 로그인했다면 내 온라인 작업
//   2) 가져올 씬 고르기 (썸네일 + 체크, 기본은 모두) + 미리 계산한 결과 (세트·사람, 채널 겹침, 파일 크기)
//   3) 가져온 뒤 요약. 가져오기 전체는 실행 취소 한 번으로 되돌린다

import { commitHistory, getState, setState } from '../state/store';
import { ONLINE_LIMIT_BYTES, checkIncoming, mergeInto, previewMerge, type ImportResult } from '../state/mergeWork';
import { openPanel } from './shell';
import './importScenes.css';

const esc = (text: string) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes < 1_000_000 ? 2 : 1)} MB`;

let dialog: HTMLDialogElement | null = null;

const ensureDialog = () => {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'cloud-dialog imp-dialog';
  dialog.setAttribute('aria-labelledby', 'imp-title');
  // 창 안의 단축키(Enter, Delete 등)가 편집 화면으로 새지 않게 한다
  dialog.addEventListener('keydown', e => e.stopPropagation());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog?.close(); });
  document.body.append(dialog);
  return dialog;
};

/* ---------- 1) 가져올 작업 고르기 ---------- */

const signedInUser = async () => {
  try {
    const { getUser } = await import('../cloud/auth');
    return getUser();
  } catch {
    return null;
  }
};

const showSourceStep = async () => {
  const dlg = ensureDialog();
  dlg.innerHTML = `
    <h2 id="imp-title">씬 가져오기</h2>
    <p>다른 작업의 씬을 지금 작업 뒤에 이어 붙입니다. 같은 공연장의 작업만 가져올 수 있고, 빈 무대는 무대 크기까지 같아야 합니다.</p>
    <button type="button" class="imp-source" data-imp="file"><b>내 컴퓨터의 파일</b><small>저장해 둔 .json 작업 파일을 고릅니다</small></button>
    <div class="imp-online" hidden>
      <div class="imp-sub">내 온라인 작업</div>
      <div class="imp-online-list"><p class="imp-note">목록을 불러오는 중…</p></div>
    </div>
    <input type="file" accept=".json" hidden data-imp="file-input">
    <div class="cloud-dialog-actions"><button type="button" class="cloud-text-btn" data-imp="cancel">취소</button></div>`;
  if (!dlg.open) dlg.showModal();

  const input = dlg.querySelector<HTMLInputElement>('[data-imp="file-input"]')!;
  dlg.querySelector('[data-imp="file"]')?.addEventListener('click', () => input.click());
  dlg.querySelector('[data-imp="cancel"]')?.addEventListener('click', () => dlg.close());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        showSceneStep(JSON.parse(String(reader.result)), file.name);
      } catch {
        alert('파일을 읽지 못했습니다. 조명 작업 파일(.json)인지 확인해 주세요.');
      }
    };
    reader.readAsText(file);
  });

  if (!(await signedInUser())) return;
  const box = dlg.querySelector<HTMLElement>('.imp-online');
  const list = dlg.querySelector<HTMLElement>('.imp-online-list');
  if (!box || !list) return;
  box.hidden = false;
  try {
    const { listProjects } = await import('../cloud/projects');
    const projects = await listProjects();
    if (!projects.length) { list.innerHTML = '<p class="imp-note">온라인에 저장한 작업이 없습니다.</p>'; return; }
    list.innerHTML = projects.map(p => `
      <button type="button" class="imp-project" data-project="${esc(p.id)}">
        ${p.thumbnail ? `<img src="${esc(p.thumbnail)}" alt="">` : '<span class="imp-thumb-empty"></span>'}
        <span><b>${esc(p.name)}</b><small>씬 ${p.scene_count ?? '?'}개 · ${new Date(p.updated_at).toLocaleDateString('ko-KR')}</small></span>
      </button>`).join('');
    list.querySelectorAll<HTMLButtonElement>('[data-project]').forEach(button => button.addEventListener('click', () => {
      void loadOnline(button.dataset.project!);
    }));
  } catch {
    list.innerHTML = '<p class="imp-note">온라인 작업 목록을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.</p>';
  }
};

/** 온라인 작업의 내용만 읽는다 (지금 작업을 바꾸지 않는다) */
const loadOnline = async (id: string) => {
  try {
    const { getClient } = await import('../cloud/client');
    const { data, error } = await (await getClient()).from('projects').select('name,data').eq('id', id).single();
    if (error) throw error;
    showSceneStep(data.data, data.name);
  } catch {
    alert('온라인 작업을 불러오지 못했습니다. 인터넷 연결을 확인하거나 잠시 뒤에 다시 시도해 주세요.');
  }
};

/* ---------- 2) 가져올 씬 고르기 ---------- */

const summaryText = (r: ImportResult) => {
  const parts: string[] = [];
  if (r.addedSets || r.mergedSets) {
    parts.push(`세트 ${r.addedSets}개를 함께 가져옵니다${r.mergedSets ? ` (같은 자리·크기의 세트 ${r.mergedSets}개는 하나로 합칩니다)` : ''}.`);
  }
  if (r.addedActors || r.mergedActors) {
    parts.push(`사람 모형 ${r.addedActors}개를 함께 가져옵니다${r.mergedActors ? ` (같은 자리의 사람 모형 ${r.mergedActors}개는 하나로 합칩니다)` : ''}.`);
  }
  if (r.addedSets || r.addedActors) {
    parts.push('기존 씬에서는 가져온 세트·사람 모형을, 가져온 씬에서는 원래 있던 것을 숨겨 두어 양쪽 모두 원래 모습 그대로 보입니다. 객체 전체 목록의 눈 버튼으로 씬마다 바꿀 수 있습니다.');
  }
  return parts;
};

const showSceneStep = (data: unknown, sourceName: string) => {
  const dlg = ensureDialog();
  const name = sourceName.replace(/\.json$/i, '');
  const check = checkIncoming(getState(), data);
  const picked = new Set(check.cues.map(cue => cue.id));

  dlg.innerHTML = `
    <h2 id="imp-title">"${esc(name)}"에서 가져올 씬</h2>
    ${check.error ? `<p class="imp-error">${esc(check.error)}</p>` : ''}
    ${check.warnings.map(w => `<p class="imp-warn">${esc(w)}</p>`).join('')}
    ${check.error ? '' : `
      <div class="imp-pick-bar"><span class="imp-count"></span>
        <button type="button" class="cloud-text-btn" data-imp="all">모두 고르기</button>
        <button type="button" class="cloud-text-btn" data-imp="none">모두 빼기</button></div>
      <div class="imp-cues">${check.cues.map(cue => `
        <label class="imp-cue">
          <input type="checkbox" data-cue="${esc(cue.id)}" checked>
          ${cue.thumbnail ? `<img src="${esc(cue.thumbnail)}" alt="">` : '<span class="imp-thumb-empty"></span>'}
          <span class="imp-cue-name">${esc(cue.label)}</span>
          <small>조명 ${cue.fixtures}개</small>
        </label>`).join('')}</div>
      <div class="imp-preview"></div>`}
    <div class="cloud-dialog-actions">
      <button type="button" class="cloud-text-btn" data-imp="back">다른 작업 고르기</button>
      <button type="button" class="cloud-text-btn" data-imp="cancel">취소</button>
      ${check.error ? '' : '<button type="button" class="cloud-google-btn" data-imp="go">가져오기</button>'}
    </div>`;
  if (!dlg.open) dlg.showModal();

  dlg.querySelector('[data-imp="back"]')?.addEventListener('click', () => void showSourceStep());
  dlg.querySelector('[data-imp="cancel"]')?.addEventListener('click', () => dlg.close());
  if (check.error) return;

  const go = dlg.querySelector<HTMLButtonElement>('[data-imp="go"]')!;
  const preview = dlg.querySelector<HTMLElement>('.imp-preview')!;
  const count = dlg.querySelector<HTMLElement>('.imp-count')!;
  const boxes = [...dlg.querySelectorAll<HTMLInputElement>('[data-cue]')];

  const refresh = () => {
    count.textContent = `${picked.size} / ${check.cues.length}개 고름`;
    go.disabled = picked.size === 0;
    go.textContent = `씬 ${picked.size}개 가져오기`;
    if (!picked.size) { preview.innerHTML = '<p class="imp-note">가져올 씬을 하나 이상 고르세요.</p>'; return; }
    const result = previewMerge(getState(), data, sourceName, [...picked]);
    const lines = summaryText(result).map(line => `<p class="imp-note">${esc(line)}</p>`);
    if (result.channelClashes.length) {
      lines.push(`<p class="imp-warn">채널 ${result.channelClashes.join(', ')}번을 지금 작업의 다른 자리 조명이 이미 쓰고 있습니다. 번호는 바꾸지 않으니, 가져온 뒤 채널 검사에서 확인하세요.</p>`);
    }
    lines.push(result.bytes >= ONLINE_LIMIT_BYTES
      ? `<p class="imp-warn">가져온 뒤 작업 크기가 약 ${mb(result.bytes)}로, 온라인 저장 한도(5 MB)를 넘습니다. 내 컴퓨터에는 저장할 수 있습니다. 씬 배경 이미지가 있는 씬을 빼면 줄어듭니다.</p>`
      : `<p class="imp-note">가져온 뒤 작업 크기: 약 ${mb(result.bytes)} (온라인 저장 한도 5 MB)</p>`);
    preview.innerHTML = lines.join('');
  };

  boxes.forEach(box => box.addEventListener('change', () => {
    if (box.checked) picked.add(box.dataset.cue!);
    else picked.delete(box.dataset.cue!);
    refresh();
  }));
  const setAll = (on: boolean) => {
    boxes.forEach(box => { box.checked = on; if (on) picked.add(box.dataset.cue!); else picked.delete(box.dataset.cue!); });
    refresh();
  };
  dlg.querySelector('[data-imp="all"]')?.addEventListener('click', () => setAll(true));
  dlg.querySelector('[data-imp="none"]')?.addEventListener('click', () => setAll(false));
  go.addEventListener('click', () => {
    // 고른 순서가 아니라 파일 안의 씬 순서대로 붙인다
    const ids = check.cues.map(cue => cue.id).filter(id => picked.has(id));
    let result: ImportResult | null = null;
    commitHistory();
    setState(s => { result = mergeInto(s, data, sourceName, ids); });
    if (result) showDoneStep(result);
  });
  refresh();
};

/* ---------- 3) 결과 ---------- */

const showDoneStep = (r: ImportResult) => {
  const dlg = ensureDialog();
  const lines = [
    `씬 ${r.addedCues}개를 지금 작업 뒤에 붙였습니다. 첫 번째 가져온 씬을 열어 두었습니다.`,
    ...summaryText(r).map(line => line.replace('가져옵니다', '가져왔습니다').replace('합칩니다', '합쳤습니다'))
  ];
  dlg.innerHTML = `
    <h2 id="imp-title">씬을 가져왔습니다</h2>
    ${lines.map(line => `<p class="imp-note">${esc(line)}</p>`).join('')}
    ${r.channelClashes.length ? `<p class="imp-warn">채널 ${r.channelClashes.join(', ')}번이 겹칩니다. 채널 검사에서 확인하세요.</p>` : ''}
    ${r.bytes >= ONLINE_LIMIT_BYTES ? `<p class="imp-warn">작업 크기가 약 ${mb(r.bytes)}라 온라인에는 저장할 수 없습니다. 내 컴퓨터에 저장해 주세요.</p>` : ''}
    <p class="imp-note">마음에 들지 않으면 실행 취소(Ctrl+Z) 한 번으로 가져오기 전체를 되돌릴 수 있습니다.</p>
    <div class="cloud-dialog-actions">
      ${r.channelClashes.length ? '<button type="button" class="cloud-text-btn" data-imp="patch">채널 검사 열기</button>' : ''}
      <button type="button" class="cloud-google-btn" data-imp="close">닫기</button>
    </div>`;
  dlg.querySelector('[data-imp="close"]')?.addEventListener('click', () => dlg.close());
  dlg.querySelector('[data-imp="patch"]')?.addEventListener('click', () => { dlg.close(); openPanel('patch'); });
};

export const openImportDialog = () => void showSourceStep();
