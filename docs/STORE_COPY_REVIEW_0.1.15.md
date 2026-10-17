# 0.1.15 스토어 문구 검토 근거

- 원문: 사용자 요청으로 받은 Grok 산출물 Koreanstorecopy.txt 및 PRIVACY_POLICY.md (2026-10-17, 기준 f87abd5ccac9350ffbf657405dd331abb8df3d4c). 원본은 로컬 자료에 보존했습니다.
- 코드 근거: src/background/power-coordinator.js의 기본 ON/OFF·세션 소유권; src/shared/login-session.js의 가명 계정 키; src/shared/power-collector.js의 보상·중복 방지 기록; src/shared/storage.js와 src/shared/presets.js의 저장 범위; src/viewer/site-host.js의 실행 중 칸 수·음량·진단·공식 메뉴 보조; src/viewer/player-frame.js의 측정·음량 메시지 처리.
- scripts/build-extension.mjs의 패키지 목록에는 개인정보 처리방침이 없어 공개 GitHub URL을 안내합니다.
- 공식 안내: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq — 로컬 처리·저장도 데이터 처리 공개 대상입니다.
- 개발자 서버 전송과 필요한 NAVER/CHZZK 요청을 구분하고, 포괄적인 시청 기록 미저장·제3자 통신 전무·준수 보장 표현을 정정했습니다.
- 문서만 변경하며 런타임·권한·패키지 바이트와 실환경 검증 범위는 변경하지 않습니다.
