export function requireTimeMs(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('시각은 0 이상의 밀리초여야 합니다.');
  return value;
}

export function formatTimeMs(value) {
  const ms = requireTimeMs(value);
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor(ms / 60000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

export function parseTimeMs(value) {
  if (typeof value !== 'string') throw new Error('시각을 HH:MM:SS.mmm 또는 초 단위로 입력해 주세요.');
  const text = value.trim();
  const match = /^(?:(\d+):([0-5]\d):)?(\d+)(?:\.(\d{1,3}))?$/.exec(text);
  if (!match || (match[1] !== undefined && Number(match[3]) >= 60)) throw new Error('시각 형식을 확인해 주세요. 예: 00:01:23.456');
  return requireTimeMs((Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3])) * 1000 + Number((match[4] || '').padEnd(3, '0')));
}
