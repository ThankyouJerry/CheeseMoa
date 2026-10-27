import { requireVodSource } from './source.js';
import { parseTimeMs, formatTimeMs } from './time.js';
import { createChatController } from './chat-job.js';
import { createNoteStore } from './note-store.js';
import { createNotePlayer } from './note-player.js';

const STATUS = {
  running: '수집 중 또는 다른 창에서 실행 중', paused: '일시정지', partial: '부분 수집',
  failed: '오류로 중단', completed: '수집 종료 (완전성 미검증)',
};

/** Bind an extension document; dependencies can be replaced by offline UI tests. */
export async function initVodTools({
  document: doc = globalThis.document,
  createController = createChatController,
  noteStore = createNoteStore(),
  player = createNotePlayer(),
  urlApi = globalThis.URL,
} = {}) {
  const $ = (id) => doc.getElementById(id);
  const disposers = [];
  let disposed = false;
  let source = null;
  let sourceVersion = 0;
  let jobsVersion = 0;
  let notesVersion = 0;
  let discoverVersion = 0;
  let exportVersion = 0;
  let exporting = false;
  let active = false;
  let pausing = false;
  let noteBusy = false;
  let playerBusy = false;
  let editing = null;
  let players = [];
  let jobs = new Map();
  let notes = [];
  const objectUrls = new Set();
  const busyJobs = new Set();
  const element = (tag, text, className) => {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const status = (id, text, error = false) => {
    if (disposed) return;
    $(id).textContent = text;
    $(id).classList.toggle('error', error);
  };
  const errorText = (error) => error?.message || '작업을 완료하지 못했습니다. 다시 시도해 주세요.';
  function listen(node, event, callback) {
    const handler = (ev) => {
      try { Promise.resolve(callback(ev)).catch((error) => status('source-status', errorText(error), true)); }
      catch (error) { status('source-status', errorText(error), true); }
    };
    node.addEventListener(event, handler);
    disposers.push(() => node.removeEventListener(event, handler));
  }
  function button(text, action, disabled = false) {
    const node = element('button', text);
    node.type = 'button';
    node.disabled = disabled;
    // Removed list rows and their closures can be collected together.
    node.addEventListener('click', () => {
      if (disposed || node.disabled) return;
      try { Promise.resolve(action()).catch((error) => status('source-status', errorText(error), true)); }
      catch (error) { status('source-status', errorText(error), true); }
    });
    return node;
  }
  const selectedPlayer = () => players.find((_, index) => String(index) === $('player-select').value);
  function controls() {
    if (disposed) return;
    $('chat-fields').disabled = !source || active;
    $('chat-pause').hidden = !active;
    $('chat-pause').disabled = pausing;
    $('source-url').disabled = noteBusy;
    $('source-form').querySelector('button').disabled = noteBusy;
    $('note-fields').disabled = !source || noteBusy || playerBusy;
    $('notes-refresh').disabled = !source || noteBusy;
    $('player-discover').disabled = !source || playerBusy;
    $('player-select').disabled = !source || !players.length || playerBusy;
    $('note-snapshot').disabled = !selectedPlayer() || playerBusy || noteBusy;
  }
  function clearExports() {
    if (exporting || objectUrls.size) status('chat-status', 'CSV 표시를 닫았습니다. 필요하면 저장된 작업에서 다시 준비해 주세요.');
    exporting = false;
    exportVersion += 1;
    for (const url of objectUrls) urlApi.revokeObjectURL(url);
    objectUrls.clear();
    $('export-links').replaceChildren();
    $('export-panel').hidden = true;
  }
  function resetEditor() {
    editing = null;
    $('note-editor-title').textContent = '새 메모';
    $('note-save').textContent = '메모 추가';
    $('note-cancel').hidden = true;
    $('note-text').value = '';
    $('note-time').value = '00:00:00.000';
  }
  function resetPlayers() {
    discoverVersion += 1;
    players = [];
    $('player-select').replaceChildren(element('option', '플레이어를 직접 선택해 주세요'));
    $('player-select').firstChild.value = '';
    status('player-status', '선택한 다시보기의 열린 CHZZK 탭에서 찾습니다. 시각을 직접 입력해도 됩니다.');
  }
  function renderJobs() {
    if (disposed) return;
    const rows = [...jobs.values()].map((job) => {
      const row = element('li');
      row.dataset.jobId = job.id;
      row.append(element('p', `VOD ${job.source.videoId} · ${STATUS[job.status] || '상태 확인 필요'}`, 'record-title'));
      row.append(element('p', `${job.count.toLocaleString()}개 · ${(job.bytes / 1024).toFixed(1)} KB · ${formatTimeMs(job.startMs)} ~ ${job.endMs == null ? '끝까지' : formatTimeMs(job.endMs)}`, 'record-detail'));
      row.append(element('p', `저장 지점 ${formatTimeMs(job.cursorMs ?? job.startMs)} · 전체 채팅 완전성 미검증`, 'record-detail'));
      if (job.detail) row.append(element('p', job.detail, 'record-detail'));
      const actions = element('div', undefined, 'actions');
      const busy = busyJobs.has(job.id);
      actions.append(button('이 VOD 선택', () => selectSource(job.source.canonicalUrl), noteBusy));
      if (job.status !== 'completed') actions.append(button('이어 수집', () => runChat(() => controller.resume(job.id)), active || busy || job.status === 'running'));
      actions.append(button('CSV 준비', () => exportJob(job.id), active || busy || job.status === 'running'));
      actions.append(button('작업 삭제', () => deleteJob(job.id), active || busy || job.status === 'running'));
      row.append(actions);
      return row;
    });
    $('jobs-list').replaceChildren(...(rows.length ? rows : [element('li', '저장된 수집 작업이 없습니다.', 'empty')]));
  }
  const controller = createController({ onUpdate(job) {
    if (disposed) return;
    // Invalidate an older list read so it cannot overwrite a committed checkpoint.
    jobsVersion += 1;
    jobs.set(job.id, job);
    renderJobs();
    status('chat-status', `VOD ${job.source.videoId} · ${STATUS[job.status] || job.status} · ${job.count.toLocaleString()}개${job.detail ? ` · ${job.detail}` : ''}`, job.status === 'failed');
  } });
  async function refreshJobs() {
    const version = ++jobsVersion;
    $('jobs-refresh').disabled = true;
    try {
      const saved = await controller.listJobs();
      if (disposed || version !== jobsVersion) return;
      jobs = new Map(saved.map((job) => [job.id, job]));
      renderJobs();
    } catch (error) { if (version === jobsVersion) status('chat-status', `작업 목록을 불러오지 못했습니다. ${errorText(error)}`, true); }
    finally { if (!disposed) $('jobs-refresh').disabled = false; }
  }
  async function runChat(action) {
    if (active || disposed) return;
    clearExports();
    active = true;
    controls();
    renderJobs();
    status('chat-status', '수집을 시작하는 중…');
    try { await action(); }
    catch (error) { status('chat-status', errorText(error), true); }
    finally {
      active = false;
      pausing = false;
      controls();
      renderJobs();
      if (!disposed) await refreshJobs();
    }
  }
  async function exportJob(id) {
    if (disposed || active || busyJobs.has(id)) return;
    clearExports();
    const version = exportVersion;
    exporting = true;
    busyJobs.add(id);
    renderJobs();
    status('chat-status', 'CSV 파일을 준비하는 중…');
    try {
      const parts = await controller.exportParts(id);
      if (disposed || version !== exportVersion) return;
      exporting = false;
      const links = parts.map(({ filename, blob }) => {
        const url = urlApi.createObjectURL(blob);
        objectUrls.add(url);
        const link = element('a', filename, 'download');
        link.href = url;
        link.download = filename;
        const item = element('li');
        item.append(link);
        return item;
      });
      $('export-links').replaceChildren(...links);
      $('export-panel').hidden = !links.length;
      const job = jobs.get(id);
      const coverage = `VOD ${job?.source.videoId || ''} · ${STATUS[job?.status] || '상태 확인 필요'} · 전체 채팅 완전성 미검증`;
      status('chat-status', links.length ? `${coverage}. CSV ${links.length}개 준비됨. 아래 링크를 눌러 파일을 저장하세요.` : `${coverage}. 내보낼 채팅이 없습니다.`);
    } catch (error) {
      if (version === exportVersion) { clearExports(); status('chat-status', errorText(error), true); }
    } finally { busyJobs.delete(id); renderJobs(); }
  }
  async function deleteJob(id) {
    if (disposed || active || busyJobs.has(id)) return;
    jobsVersion += 1;
    busyJobs.add(id);
    renderJobs();
    try {
      await controller.deleteJob(id);
      if (disposed) return;
      jobsVersion += 1;
      clearExports();
      jobs.delete(id);
      status('chat-status', '수집 작업과 저장된 채팅을 삭제했습니다.');
    } catch (error) { status('chat-status', errorText(error), true); }
    finally { busyJobs.delete(id); renderJobs(); }
  }
  function renderNotes() {
    if (disposed) return;
    const rows = notes.map((note) => {
      const row = element('li');
      row.dataset.noteId = note.id;
      row.append(element('p', formatTimeMs(note.positionMs), 'record-title'), element('p', note.text, 'note-content'));
      const actions = element('div', undefined, 'actions');
      actions.append(button('이 시각으로 이동', () => seekNote(note), !selectedPlayer() || playerBusy));
      actions.append(button('수정', () => {
        editing = note;
        $('note-editor-title').textContent = '메모 수정';
        $('note-save').textContent = '수정 저장';
        $('note-cancel').hidden = false;
        $('note-time').value = formatTimeMs(note.positionMs);
        $('note-text').value = note.text;
        $('note-text').focus();
        status('note-status', '시각과 내용을 수정한 뒤 저장해 주세요.');
      }, noteBusy || playerBusy));
      actions.append(button('삭제', () => deleteNote(note), noteBusy || playerBusy));
      row.append(actions);
      return row;
    });
    $('notes-list').replaceChildren(...(rows.length ? rows : [element('li', source ? '이 다시보기에 저장된 메모가 없습니다.' : '다시보기를 선택하면 메모가 표시됩니다.', 'empty')]));
  }
  async function refreshNotes() {
    const key = source?.sourceKey;
    const version = ++notesVersion;
    if (!key) return;
    try {
      const saved = await noteStore.list(key);
      if (disposed || version !== notesVersion || source?.sourceKey !== key) return;
      notes = saved;
      renderNotes();
    } catch (error) {
      if (version === notesVersion) status('note-status', `메모 목록을 불러오지 못했습니다. ${errorText(error)}`, true);
    }
  }
  async function selectSource(value) {
    if (disposed || noteBusy) return;
    try {
      const next = requireVodSource(value);
      sourceVersion += 1;
      source = next;
      $('source-url').value = source.canonicalUrl;
      clearExports();
      resetEditor();
      resetPlayers();
      notes = [];
      controls();
      renderNotes();
      status('source-status', `VOD ${source.videoId} 선택됨 · ${source.canonicalUrl}`);
      status('note-status', '선택한 다시보기의 메모를 불러오는 중…');
      const version = sourceVersion;
      await refreshNotes();
      if (!disposed && version === sourceVersion && !$('note-status').classList.contains('error')) status('note-status', '메모는 이 브라우저의 확장 저장소에 보관됩니다.');
    } catch (error) { status('source-status', errorText(error), true); }
  }
  async function discoverPlayers() {
    if (!source || playerBusy) return;
    resetPlayers();
    const version = discoverVersion;
    const key = source.sourceKey;
    playerBusy = true;
    controls();
    status('player-status', '열린 플레이어를 찾는 중…');
    try {
      const found = await player.discover();
      if (disposed || version !== discoverVersion || source?.sourceKey !== key) return;
      players = found.filter((candidate) => candidate.source?.sourceKey === key);
      const placeholder = element('option', '플레이어를 직접 선택해 주세요');
      placeholder.value = '';
      $('player-select').replaceChildren(placeholder, ...players.map((candidate, index) => {
        const option = element('option', `${candidate.label || `VOD ${candidate.source.videoId}`} · 탭 ${candidate.tabId} / 프레임 ${candidate.frameId}`);
        option.value = String(index);
        return option;
      }));
      status('player-status', players.length ? `${players.length}개 찾음. 사용할 탭·프레임을 직접 선택하세요.` : '이 VOD의 플레이어를 찾지 못했습니다. CHZZK에서 다시보기를 열거나 시각을 직접 입력하세요.');
    } catch (error) { if (version === discoverVersion) status('player-status', errorText(error), true); }
    finally { playerBusy = false; controls(); renderNotes(); }
  }
  async function usePlayer(action, onResult) {
    const selected = selectedPlayer();
    if (!selected || playerBusy || !source) return;
    const version = sourceVersion;
    playerBusy = true;
    controls();
    renderNotes();
    status('player-status', '선택한 플레이어에 요청하는 중…');
    try {
      const result = await action(selected);
      if (disposed || version !== sourceVersion) return;
      if (result.source?.sourceKey !== source.sourceKey) throw new Error('플레이어의 다시보기가 바뀌었습니다. 플레이어를 다시 찾아 주세요.');
      onResult(result);
    } catch (error) {
      if (version === sourceVersion) {
        // Require rediscovery after navigation, stale frame or timeout.
        resetPlayers();
        status('player-status', `${errorText(error)} 시각을 직접 입력하거나 플레이어를 다시 찾아 주세요.`, true);
      }
    } finally { playerBusy = false; controls(); renderNotes(); }
  }
  async function seekNote(note) {
    if (note.source.sourceKey !== source?.sourceKey) return;
    await usePlayer((selected) => player.seek(selected, note.positionMs), (result) => {
      status('player-status', `${formatTimeMs(result.positionMs)} 시각으로 이동했습니다.`);
    });
  }
  async function saveNote(event) {
    event.preventDefault();
    if (disposed || !source || noteBusy || playerBusy) return;
    const version = sourceVersion;
    notesVersion += 1;
    let saved = false;
    noteBusy = true;
    controls();
    renderJobs();
    renderNotes();
    try {
      const positionMs = parseTimeMs($('note-time').value);
      const text = $('note-text').value.trim();
      if (!text) throw new Error('메모 내용을 입력해 주세요.');
      status('note-status', '메모를 저장하는 중…');
      if (editing) await noteStore.update(editing.id, { text, positionMs, expectedRevision: editing.revision });
      else await noteStore.add({ source, positionMs, text });
      saved = true;
      if (!disposed && version === sourceVersion) { resetEditor(); status('note-status', '메모를 저장했습니다.'); }
    } catch (error) { if (version === sourceVersion) status('note-status', errorText(error), true); }
    finally {
      noteBusy = false;
      controls();
      renderJobs();
      renderNotes();
      if (!disposed && version === sourceVersion && saved) await refreshNotes();
    }
  }
  async function deleteNote(note) {
    if (disposed || noteBusy || playerBusy || note.source.sourceKey !== source?.sourceKey) return;
    const version = sourceVersion;
    notesVersion += 1;
    noteBusy = true;
    controls();
    renderJobs();
    renderNotes();
    try {
      await noteStore.remove(note.id, note.revision);
      if (!disposed && version === sourceVersion) {
        if (editing?.id === note.id) resetEditor();
        status('note-status', '메모를 삭제했습니다.');
        await refreshNotes();
      }
    } catch (error) { if (version === sourceVersion) status('note-status', errorText(error), true); }
    finally { noteBusy = false; controls(); renderJobs(); renderNotes(); }
  }

  listen($('source-form'), 'submit', (event) => { event.preventDefault(); return selectSource($('source-url').value); });
  listen($('chat-form'), 'submit', async (event) => {
    event.preventDefault();
    if (!source || active) return;
    try {
      const startMs = parseTimeMs($('range-start').value);
      const endMs = $('range-end').value.trim() ? parseTimeMs($('range-end').value) : null;
      if (endMs !== null && endMs <= startMs) throw new Error('종료 시각은 시작 시각보다 커야 합니다.');
      const selectedSource = source;
      await runChat(() => controller.start({ source: selectedSource, startMs, endMs }));
    } catch (error) { status('chat-status', errorText(error), true); }
  });
  listen($('chat-pause'), 'click', async () => {
    if (!active || pausing) return;
    pausing = true;
    controls();
    status('chat-status', '현재 저장 경계에서 일시정지하는 중…');
    try { await controller.pause(); }
    catch (error) { status('chat-status', errorText(error), true); }
    finally { pausing = false; controls(); }
  });
  listen($('jobs-refresh'), 'click', refreshJobs);
  listen($('notes-refresh'), 'click', refreshNotes);
  listen($('player-discover'), 'click', discoverPlayers);
  listen($('player-select'), 'change', () => { controls(); renderNotes(); });
  listen($('note-snapshot'), 'click', () => usePlayer((selected) => player.snapshot(selected), (result) => {
    $('note-time').value = formatTimeMs(result.positionMs);
    status('player-status', `${formatTimeMs(result.positionMs)} 시각을 가져왔습니다.`);
  }));
  listen($('note-form'), 'submit', saveNote);
  listen($('note-cancel'), 'click', () => { resetEditor(); status('note-status', '수정을 취소했습니다.'); });
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearExports();
    for (const remove of disposers) remove();
    // Collection is explicit and document-scoped. Its persisted checkpoint survives closing.
    Promise.resolve(controller.pause()).catch(() => {});
    player.dispose();
    noteStore.close?.();
  }
  if (doc.defaultView) listen(doc.defaultView, 'pagehide', dispose);
  controls();
  renderJobs();
  renderNotes();
  await refreshJobs();
  return { dispose, selectSource, refreshJobs, refreshNotes };
}

if (typeof document !== 'undefined' && document.body?.hasAttribute('data-vod-tools-auto')) {
  initVodTools().catch((error) => {
    const output = document.getElementById('source-status');
    output.textContent = `VOD 도구를 준비하지 못했습니다. ${error?.message || '탭을 다시 열어 주세요.'}`;
    output.classList.add('error');
  });
}
