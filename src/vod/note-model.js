import {requireVodSource} from './source.js';
import {requireTimeMs} from './time.js';

export const NOTE_LIMITS = Object.freeze({count: 5000, bytes: 2 * 1024 * 1024, text: 2000});
export function noteError(code, message) { return Object.assign(new Error(message), {code}); }
export function requireNoteText(value) {
  if (typeof value !== 'string' || !value.trim()) throw noteError('INVALID', '메모를 입력해 주세요.');
  if (value.length > NOTE_LIMITS.text) throw noteError('LIMIT', `메모는 ${NOTE_LIMITS.text}자까지 저장할 수 있습니다.`);
  return value;
}
export function requireNoteId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(value)) throw noteError('INVALID', '메모 ID가 올바르지 않습니다.');
  return value;
}
export function validateNote(note) {
  if (!note || typeof note !== 'object') throw noteError('INVALID', '메모 데이터가 올바르지 않습니다.');
  const source = requireVodSource(note.source);
  if (typeof note.source === 'object' && ['schemaVersion', 'platform', 'sourceKind', 'timeBasis'].some(key => note.source[key] !== source[key])) {
    throw noteError('INVALID', '메모의 다시보기 형식이 올바르지 않습니다.');
  }
  if (!Number.isSafeInteger(note.revision) || note.revision < 1 ||
      !Number.isSafeInteger(note.createdAt) || note.createdAt < 0 ||
      !Number.isSafeInteger(note.updatedAt) || note.updatedAt < note.createdAt) {
    throw noteError('INVALID', '메모의 버전 또는 생성 시각이 올바르지 않습니다.');
  }
  return {id: requireNoteId(note.id), source, positionMs: requireTimeMs(note.positionMs),
    text: requireNoteText(note.text), revision: note.revision, createdAt: note.createdAt, updatedAt: note.updatedAt};
}
export function validateNotes(value) {
  if (!Array.isArray(value)) throw noteError('INVALID', '저장된 메모 형식을 읽을 수 없습니다.');
  if (value.length > NOTE_LIMITS.count) throw noteError('LIMIT', `메모는 전체 ${NOTE_LIMITS.count}개까지 저장할 수 있습니다.`);
  const notes = value.map(validateNote);
  if (new Set(notes.map(n => n.id)).size !== notes.length) throw noteError('INVALID', '중복된 메모 ID가 있습니다.');
  if (new TextEncoder().encode(JSON.stringify(notes)).byteLength > NOTE_LIMITS.bytes) {
    throw noteError('LIMIT', '메모 저장 한도 2 MiB를 넘었습니다. 필요 없는 메모를 삭제해 주세요.');
  }
  return notes;
}
export function applyNoteOperation(current, operation, {now = Date.now, uuid = () => crypto.randomUUID()} = {}) {
  const notes = validateNotes(current);
  let result;
  if (operation.type === 'add') {
    const stamp = now();
    result = validateNote({id: uuid(), source: operation.source, positionMs: operation.positionMs,
      text: operation.text, revision: 1, createdAt: stamp, updatedAt: stamp});
    notes.push(result);
  } else {
    requireNoteId(operation.id);
    const index = notes.findIndex(n => n.id === operation.id);
    if (index < 0) throw noteError('NOT_FOUND', '메모가 삭제되었거나 찾을 수 없습니다. 목록을 새로 확인해 주세요.');
    const previous = notes[index];
    if (!Number.isSafeInteger(operation.expectedRevision) || operation.expectedRevision !== previous.revision) {
      throw noteError('CONFLICT', '다른 창에서 이 메모를 변경했습니다. 목록을 새로 확인한 뒤 다시 편집해 주세요.');
    }
    if (operation.type === 'remove') { result = previous; notes.splice(index, 1); }
    else if (operation.type === 'update') {
      result = validateNote({...previous, text: operation.text === undefined ? previous.text : operation.text,
        positionMs: operation.positionMs === undefined ? previous.positionMs : operation.positionMs,
        revision: previous.revision + 1, updatedAt: Math.max(previous.updatedAt, now())});
      notes[index] = result;
    } else throw noteError('INVALID', '지원하지 않는 메모 작업입니다.');
  }
  return {notes: validateNotes(notes), result};
}
