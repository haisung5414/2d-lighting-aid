// src/cloud/projects.ts
// 온라인 작업: 목록, 열기, 저장(온라인에 저장 · 저장 · 다른 이름으로 저장), 이름 바꾸기, 삭제, 내 컴퓨터에 내려받기.
// 저장하는 내용은 내 컴퓨터에 저장하는 JSON과 똑같다 (getState()). RLS가 자기 행만 보이게 한다.
// 사양: docs/cloud/CLOUD_SPEC.md §3, §5, §6

import { getState, onEdit } from '../state/store';
import { loadProjectData } from '../ui/manager';
import { getFileState } from '../ui/shell';
import { getUser } from './auth';
import { getClient } from './client';

export interface ProjectSummary {
  id: string;
  name: string;
  updated_at: string;
  venue_key: string | null;
  scene_count: number | null;
  thumbnail: string | null;
}

const MAX_BYTES = 5_000_000;
const NETWORK_MESSAGE = '온라인 작업을 처리하지 못했습니다. 인터넷 연결을 확인하거나 잠시 뒤에 다시 시도해 주세요.';

/** 지금 열려 있는 온라인 작업의 행. 새 온라인 작업(아직 저장 전)이거나 내 컴퓨터 작업이면 null */
let openRow: { id: string; updatedAt: string } | null = null;

/** 작업이 고쳐질 때마다 늘어난다. 저장하는 동안 고친 것이 있는지 알아보는 데 쓴다 */
let editCount = 0;
onEdit(() => { editCount += 1; });

const listeners: (() => void)[] = [];
/** 온라인 작업 목록이 바뀌었을 때 (저장·이름 바꾸기·삭제) */
export const onProjectsChange = (listener: () => void) => { listeners.push(listener); };
const changed = () => listeners.forEach(listener => listener());

/** 저장 위치를 위쪽 바(ui/shell.ts)에 알린다 */
const announce = (name: string | null, location: 'local' | 'cloud', dirty = false) => {
  window.dispatchEvent(new CustomEvent('lighting:file', { detail: { name, location, dirty } }));
};

export const reportError = (err: unknown) => {
  console.error('온라인 작업 오류', err);
  alert(NETWORK_MESSAGE);
};

export { NETWORK_MESSAGE };

const table = async () => (await getClient()).from('projects');

export const listProjects = async (): Promise<ProjectSummary[]> => {
  const { data, error } = await (await table())
    .select('id,name,updated_at,venue_key,scene_count,thumbnail')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
};

const findByName = async (name: string) => {
  const { data, error } = await (await table()).select('id,updated_at').eq('name', name).maybeSingle();
  if (error) throw error;
  return data as { id: string; updated_at: string } | null;
};

/** 온라인 작업을 열어 편집 화면으로 간다 */
export const openProject = async (id: string) => {
  try {
    const { data, error } = await (await table()).select('id,name,data,updated_at').eq('id', id).single();
    if (error) throw error;
    loadProjectData(data.data, data.name);
    openRow = { id: data.id, updatedAt: data.updated_at };
    announce(data.name, 'cloud');
  } catch (err) {
    reportError(err);
  }
};

/** 새 작업을 시작한 직후: 로그인 중이면 저장 위치를 온라인으로 둔다 (ui/store가 이미 '이름 없는 작업'으로 알린 뒤) */
export const markNewWork = () => {
  openRow = null;
  if (getUser()) announce(null, 'cloud');
};

/**
 * 지금 작업을 온라인에 저장한다.
 * asNew = 다른 이름으로 저장 / 내 컴퓨터 작업을 온라인에 처음 저장 (열린 행을 덮지 않고 새 행을 만든다)
 */
export const saveOnline = async (name: string, asNew: boolean) => {
  if (!getUser()) {
    alert('온라인에 저장하려면 먼저 로그인해야 합니다. 오른쪽 위의 로그인 버튼을 눌러 주세요.');
    return;
  }
  const state = getState();
  const json = JSON.stringify(state);
  if (new Blob([json]).size >= MAX_BYTES) {
    alert('작업 파일이 너무 커서 온라인에 저장할 수 없습니다 (최대 5MB). 배경 이미지를 줄이거나 내 컴퓨터에 저장해 주세요.');
    return;
  }
  const data = JSON.parse(json);
  const editsBefore = editCount;

  try {
    const projects = await table();
    let targetId = asNew ? null : openRow?.id ?? null;
    let checkNewer = targetId !== null;

    // 같은 이름의 다른 작업이 있으면 덮어쓸지 묻는다
    const sameName = await findByName(name);
    if (sameName && sameName.id !== targetId) {
      if (!window.confirm('온라인에 같은 이름의 작업이 있습니다. 덮어쓸까요?')) return;
      if (targetId) {
        // 열린 작업의 이름을 바꿔 저장하면서 같은 이름의 작업을 덮는다 = 그 작업을 지우고 이 작업이 이름을 가져간다
        const { error } = await projects.delete().eq('id', sameName.id);
        if (error) throw error;
      } else {
        targetId = sameName.id;
        checkNewer = false;
      }
    }

    // 다른 컴퓨터에서 더 최근에 저장했는지
    if (targetId && checkNewer && openRow) {
      const { data: remote, error } = await projects.select('updated_at').eq('id', targetId).maybeSingle();
      if (error) throw error;
      if (!remote) targetId = null; // 다른 곳에서 지워졌다: 새로 넣는다
      else if (remote.updated_at !== openRow.updatedAt
        && !window.confirm('다른 곳에서 이 작업을 더 최근에 저장했습니다. 덮어쓸까요?')) return;
    }

    const query = targetId
      ? projects.update({ name, data }).eq('id', targetId)
      : projects.insert({ name, data });
    const { data: row, error } = await query.select('id,updated_at').single();
    if (error) throw error;

    openRow = { id: row.id, updatedAt: row.updated_at };
    // 저장하는 동안 고친 것이 있으면 "저장 안 됨"을 남긴다
    announce(name, 'cloud', editCount !== editsBefore);
    changed();
  } catch (err) {
    reportError(err);
  }
};

export const renameProject = async (id: string, name: string) => {
  try {
    const sameName = await findByName(name);
    if (sameName && sameName.id !== id) {
      alert('같은 이름의 작업이 이미 있습니다. 다른 이름을 적어 주세요.');
      return false;
    }
    const { data: row, error } = await (await table()).update({ name }).eq('id', id).select('id,updated_at').single();
    if (error) throw error;
    // 열려 있는 작업이면 위쪽 바의 이름도 바꾼다
    if (openRow?.id === id) {
      openRow = { id, updatedAt: row.updated_at };
      const { dirty } = getFileState();
      announce(name, 'cloud', dirty);
    }
    changed();
    return true;
  } catch (err) {
    reportError(err);
    return false;
  }
};

export const deleteProject = async (id: string) => {
  try {
    const { error } = await (await table()).delete().eq('id', id);
    if (error) throw error;
    if (openRow?.id === id) openRow = null;
    changed();
    return true;
  } catch (err) {
    reportError(err);
    return false;
  }
};

const downloadJson = (name: string, data: unknown) => {
  const base = name.trim().replace(/\.json$/i, '') || '이름 없는 작업';
  const link = document.createElement('a');
  link.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
  link.download = `${base}.json`;
  link.click();
};

/** 열려 있는 작업을 JSON으로 내려받는다. 저장 위치(온라인)는 그대로 둔다 */
export const downloadCurrent = () => {
  downloadJson(getFileState().name ?? '이름 없는 작업', getState());
};

/** 홈의 작업 카드에서: 그 작업을 받아 JSON으로 내려받는다 */
export const downloadProject = async (id: string) => {
  try {
    const { data, error } = await (await table()).select('name,data').eq('id', id).single();
    if (error) throw error;
    downloadJson(data.name, data.data);
  } catch (err) {
    reportError(err);
  }
};

/** 저장 위치가 온라인이 아닌 작업이 열리면 (내 컴퓨터 파일, 로그아웃) 열린 행을 잊는다 */
export const initProjectTracking = () => {
  window.addEventListener('lighting:file', (e) => {
    const location = (e as CustomEvent<{ location?: string }>).detail?.location;
    if (location !== 'cloud') openRow = null;
  });
};

/** 로그아웃: 열려 있던 온라인 작업은 화면에 두고 저장 위치만 내 컴퓨터로 바꾼다 */
export const detachOnSignOut = () => {
  const { name, dirty, location } = getFileState();
  openRow = null;
  if (location === 'cloud') announce(name, 'local', dirty);
};
