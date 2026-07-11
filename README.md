<p align="center">
  <img src="assets/brand/cheesemoa-lockup.svg" width="520" alt="치즈모아 CheeseMoa" />
</p>

<p align="center">
  여러 CHZZK 라이브와 다시보기를 한 화면에 모아보는 로컬 Chrome 멀티뷰
</p>

<p align="center">
  <a href="https://github.com/ThankyouJerry/CheeseMoa/releases/latest"><img src="https://img.shields.io/github/v/release/ThankyouJerry/CheeseMoa?style=flat-square&color=ff6b4a" alt="Latest release" /></a>
  <a href="https://github.com/ThankyouJerry/CheeseMoa/actions/workflows/validate.yml"><img src="https://img.shields.io/github/actions/workflow/status/ThankyouJerry/CheeseMoa/validate.yml?style=flat-square&label=build" alt="Build status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/ThankyouJerry/CheeseMoa?style=flat-square&color=173b57" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="https://github.com/ThankyouJerry/CheeseMoa/releases/latest"><strong>최신 버전 다운로드</strong></a>
  ·
  <a href="#설치하기">설치 방법</a>
  ·
  <a href="#개인정보와-권한">개인정보와 권한</a>
</p>

![두 개의 CHZZK VOD를 실행한 치즈모아](docs/images/mvp-preview.png)

## 소개

치즈모아는 여러 CHZZK 방송을 하나의 Chrome 탭에 배치하는 오픈소스 확장 프로그램입니다.
별도 회원가입, 외부 멀티뷰 서버, 원격 호스팅 없이 확장 프로그램 내부에서 실행됩니다.
입력한 링크는 현재 Chrome 프로필에만 저장됩니다.

## 주요 기능

| 기능 | 설명 |
| --- | --- |
| 여러 방송 추가 | 라이브와 다시보기 링크를 줄 단위로 한 번에 입력합니다. |
| 자동 화면 배치 | 방송 수에 따라 1~3열 그리드를 자동으로 구성합니다. |
| 수동 레이아웃 | 자동, 1열, 2열, 3열 중 원하는 배치를 선택합니다. |
| 개별 제어 | 각 방송을 새로고침하거나 제거하고 전체화면으로 전환합니다. |
| 로그인 세션 사용 | 같은 Chrome 프로필에 로그인된 기존 CHZZK 세션을 사용합니다. |
| 로컬 저장 | 방송 목록을 `chrome.storage.local`에 저장합니다. |

## 설치하기

> 치즈모아는 아직 Chrome Web Store에 등록되지 않았습니다. 현재는 개발자 모드에서
> 압축해제 확장 프로그램으로 설치합니다.

1. [Releases](https://github.com/ThankyouJerry/CheeseMoa/releases/latest)에서 최신 `CheeseMoa-v*.zip`을 내려받습니다.
2. ZIP을 새 폴더에 압축 해제합니다.
3. Chrome 주소창에 `chrome://extensions`를 입력합니다.
4. 오른쪽 위의 `개발자 모드`를 켭니다.
5. `압축해제된 확장 프로그램을 로드합니다`를 누릅니다.
6. 압축을 푼 폴더 중 `manifest.json`이 있는 폴더를 선택합니다.
7. Chrome 도구 모음에서 치즈모아 아이콘을 고정하면 설치가 끝납니다.

배포 ZIP의 무결성은 Release에 함께 제공되는 `SHA256SUMS.txt`로 확인할 수 있습니다.

## 사용 방법

1. Chrome 도구 모음에서 치즈모아 아이콘을 누릅니다.
2. CHZZK 링크를 한 줄에 하나씩 붙여 넣습니다.
3. `방송 모아보기`를 누르면 멀티뷰 탭이 열립니다.
4. 상단의 `자동`, `1열`, `2열`, `3열` 버튼으로 화면 배치를 바꿉니다.
5. 방송 카드 오른쪽 위에서 새로고침, 전체화면, 제거 기능을 사용합니다.

지원하는 링크 형식은 다음과 같습니다.

```text
https://chzzk.naver.com/live/{channelId}
https://chzzk.naver.com/video/{videoId}
```

동일한 링크를 다시 입력하면 중복으로 추가되지 않습니다. 라이브와 다시보기 링크를 함께
입력할 수도 있습니다.

## CHZZK 로그인

치즈모아는 로그인 쿠키를 직접 읽거나 복사하지 않습니다. Chrome이 관리하는 기존 CHZZK
세션을 내장 프레임에서 그대로 사용합니다.

로그인이 필요한 경우 `CHZZK 로그인` 버튼을 눌러 새 탭에서 로그인한 다음 멀티뷰 방송을
새로고침하면 됩니다. 시크릿 창은 일반 창과 쿠키 저장소가 다르므로 별도 로그인이 필요할 수
있습니다.

## 개인정보와 권한

치즈모아에는 분석 서버, 광고 SDK, 사용자 추적 코드가 없습니다. 입력한 방송 링크 외의
사용자 데이터는 저장하지 않습니다.

| 권한 | 사용하는 이유 |
| --- | --- |
| `storage` | 사용자가 추가한 방송 목록을 현재 브라우저에 저장합니다. |
| `https://chzzk.naver.com/*` | CHZZK 라이브와 다시보기를 멀티뷰 안에서 불러옵니다. |

치즈모아는 다음 작업을 하지 않습니다.

- CHZZK 쿠키 값 읽기, 복사 또는 별도 저장
- 외부 서버로 방송 목록이나 사용자 정보 전송
- 검색 기록, 시청 기록 또는 로그인 정보 수집
- 원격 JavaScript 코드 다운로드 및 실행

## 알아둘 점

- 여러 방송을 동시에 재생하면 네트워크와 CPU 사용량이 증가합니다.
- Chrome 자동 재생 정책에 따라 처음 한 번 재생 버튼을 눌러야 할 수 있습니다.
- CHZZK 화면 구조나 정책이 변경되면 일부 기능이 일시적으로 동작하지 않을 수 있습니다.
- 다른 확장 프로그램의 영향으로 CHZZK가 광고 차단 안내를 표시할 수 있습니다.

## 개발 및 빌드

Node.js 18 이상과 `zip` 명령이 필요합니다.

```bash
git clone https://github.com/ThankyouJerry/CheeseMoa.git
cd CheeseMoa
npm test
npm run validate
npm run build
```

`npm run build` 결과는 `dist/`에 생성됩니다.

```text
dist/
├── CheeseMoa-v{version}/
├── CheeseMoa-v{version}.zip
└── SHA256SUMS.txt
```

ZIP 최상단에는 Chrome이 요구하는 `manifest.json`이 위치합니다. `v*` 태그를 푸시하면
GitHub Actions가 테스트, 패키징, 체크섬 생성과 Release 게시를 자동으로 수행합니다.

## 프로젝트 구조

```text
CheeseMoa/
├── assets/              로고와 확장 프로그램 아이콘
├── src/popup/           도구 모음 팝업
├── src/viewer/          멀티뷰 화면
├── src/shared/          URL 파서와 로컬 저장 모듈
├── test/                URL 입력 단위 테스트
├── manifest.json        Chrome Manifest V3 설정
└── scripts/             검증 및 배포 패키징
```

## 기여하기

오류 제보와 기능 제안은 [Issues](https://github.com/ThankyouJerry/CheeseMoa/issues)에 남길 수
있습니다. 코드 변경은 테스트와 `npm run validate`를 통과한 뒤 Pull Request로 제안해 주세요.

## 라이선스 및 이용 안내

소스 코드는 [MIT License](LICENSE)로 배포됩니다.

치즈모아는 CHZZK 또는 NAVER의 공식 서비스가 아닌 독립 오픈소스 프로젝트입니다. 각 방송과
콘텐츠의 권리는 원 저작권자에게 있습니다. 사용자는 CHZZK 이용약관과 저작권을 준수해야 하며,
권리자의 허가 없이 콘텐츠를 재배포하거나 상업적으로 이용해서는 안 됩니다.

<p align="center">
  <img src="assets/brand/cheesemoa-mark.svg" width="64" alt="치즈모아 아이콘" /><br />
  <strong>보고 싶은 방송, 한곳에.</strong>
</p>
