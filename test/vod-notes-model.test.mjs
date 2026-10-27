import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVodSource} from '../src/vod/source.js';
import {applyNoteOperation, validateNotes, NOTE_LIMITS} from '../src/vod/note-model.js';

const source = parseVodSource('https://chzzk.naver.com/video/00012345678901234567890');
const create = (notes = [], overrides = {}) => applyNoteOperation(notes,
  {type: 'add', source, positionMs: 1234567, text: '원본 메모\n두 번째 줄', ...overrides},
  {now: () => 100, uuid: () => 'note-00000001'});
test('notes retain source ID, exact integer ms and text across JSON roundtrip', () => {
  const {notes, result} = create();
  assert.equal(result.source.videoId, '00012345678901234567890');
  assert.equal(result.positionMs, 1234567);
  assert.deepEqual(validateNotes(JSON.parse(JSON.stringify(notes))), notes);
  assert.equal(result.text, '원본 메모\n두 번째 줄');
});
test('edit preserves identity and creation time, detects stale revisions', () => {
  const {notes, result} = create();
  const next = applyNoteOperation(notes, {type: 'update', id: result.id, expectedRevision: 1, text: '수정', positionMs: 42}, {now: () => 200});
  assert.equal(next.result.id, result.id);
  assert.deepEqual(next.result.source, result.source);
  assert.equal(next.result.createdAt, 100);
  assert.equal(next.result.revision, 2);
  assert.equal(notes[0].text, result.text);
  assert.throws(() => applyNoteOperation(next.notes, {type: 'update', id: result.id, expectedRevision: 1, text: '덮어쓰기'}), {code: 'CONFLICT'});
  assert.throws(() => applyNoteOperation(next.notes, {type: 'remove', id: result.id, expectedRevision: 1}), {code: 'CONFLICT'});
  assert.equal(applyNoteOperation(next.notes, {type: 'remove', id: result.id, expectedRevision: 2}).notes.length, 0);
});
test('live, fractional/nonfinite ms and invalid memo are rejected without truncation', () => {
  for (const positionMs of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => create([], {positionMs}));
  for (const text of ['', '  ', null, 'x'.repeat(NOTE_LIMITS.text + 1)]) assert.throws(() => create([], {text}));
  assert.throws(() => create([], {source: 'https://chzzk.naver.com/live/' + 'a'.repeat(32)}));
});
test('whole-store count, byte and duplicate ID limits reject writes', () => {
  const note = create().result;
  assert.throws(() => validateNotes([note, note]), {code: 'INVALID'});
  assert.throws(() => validateNotes(Array.from({length: NOTE_LIMITS.count + 1}, (_, i) => ({...note, id: `note-${String(i).padStart(8, '0')}`}))), {code: 'LIMIT'});
  assert.throws(() => validateNotes(Array.from({length: 500}, (_, i) => ({...note, id: `note-${String(i).padStart(8, '0')}`, text: '가'.repeat(2000)}))), {code: 'LIMIT'});
});

test('persisted source schema, revisions and timestamps are validated', () => {
  const note = create().result;
  for (const sourcePatch of [{schemaVersion: 2}, {platform: 'other'}, {sourceKind: 'live'}, {timeBasis: 'wall-clock'}]) {
    assert.throws(() => validateNotes([{...note, source: {...note.source, ...sourcePatch}}]), {code: 'INVALID'});
  }
  for (const patch of [{revision: 0}, {revision: 1.5}, {createdAt: -1}, {updatedAt: 99}, {updatedAt: Infinity}]) {
    assert.throws(() => validateNotes([{...note, ...patch}]), {code: 'INVALID'});
  }
  assert.throws(() => applyNoteOperation([{...note, revision: Number.MAX_SAFE_INTEGER}],
    {type: 'update', id: note.id, expectedRevision: Number.MAX_SAFE_INTEGER, text: 'overflow'}), {code: 'INVALID'});
});
