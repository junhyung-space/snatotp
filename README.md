# Snap OTP

Snap OTP is a Chrome extension for storing and generating OTP codes inside Chrome, with a quick popup for daily use and a full settings page for import, protection, backup, and account management.

## Current MVP scope

- Import an image that contains an OTP QR code from the settings page
- Capture a screen region and decode an OTP QR code
- Paste an `otpauth://` URL from the settings page
- Store OTP entries in `chrome.storage.sync`
- Optionally encrypt synced OTP entries with passphrase protection
- Export and restore entries plus app preferences with merge-safe backups
- Manage all accounts from the settings page, including a confirmation step before deleting everything
- Show live 6-digit codes in the popup
- Copy the current code by clicking an entry
- Rename, recolor, reorder, or delete an entry from the popup menu

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## Load in Chrome

1. Run `pnpm build`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Click `Load unpacked`
5. Select `./dist` from this repository

## Public links

- Homepage: `https://junhyung-space.github.io/snatotp/`
- Privacy Policy: `https://junhyung-space.github.io/snatotp/privacy/`
- Support: `https://github.com/junhyung-space/snatotp/issues`

## Security note

Snap OTP defaults to storing entries in `chrome.storage.sync` for convenience. Users can optionally enable passphrase protection in Settings, which encrypts stored OTP entries, requires an unlock step before the popup reveals saved data, and auto-locks again after 30 minutes.

If passphrase protection is not enabled, synced OTP entries remain readable to anyone with access to the user's Chrome profile or synced extension storage. Even when passphrase protection is enabled, your Chrome profile and Google account remain part of the overall security boundary.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](./CONTRIBUTING.md) for
the preferred workflow and review expectations.

## Security reporting

Please report security-sensitive issues privately. The current reporting process
is documented in [SECURITY.md](./SECURITY.md).

## License

Snap OTP is available under the [MIT License](./LICENSE).

---

## 한국어

Snap OTP는 Chrome 안에서 OTP 코드를 저장하고 생성할 수 있는 확장 프로그램입니다. 일상적으로 쓰는 빠른 팝업 화면과, 가져오기, 보호 설정, 백업, 계정 관리를 위한 전체 설정 페이지를 함께 제공합니다.

### 현재 MVP 범위

- 설정 페이지에서 OTP QR 코드가 포함된 이미지를 가져오기
- 화면 영역을 캡처해 OTP QR 코드 해석하기
- 설정 페이지에서 `otpauth://` URL 붙여넣기
- OTP 항목을 `chrome.storage.sync`에 저장하기
- 선택형 패스프레이즈 보호로 동기화된 OTP 항목 암호화하기
- 앱 설정과 OTP 항목을 백업/복구하기
- 설정 페이지에서 전체 항목을 관리하고, 전체 삭제 전 확인 단계 제공하기
- 팝업에서 실시간 6자리 코드 표시하기
- 항목 클릭으로 현재 코드 복사하기
- 팝업 메뉴에서 항목 이름 변경, 색상 변경, 순서 변경, 삭제하기

### 개발

```bash
pnpm install
pnpm test
pnpm build
```

### Chrome에 로드하기

1. `pnpm build` 실행
2. `chrome://extensions` 열기
3. 개발자 모드 활성화
4. `압축해제된 확장 프로그램을 로드합니다` 클릭
5. 이 저장소의 `./dist` 선택

### 공개 링크

- 홈페이지: `https://junhyung-space.github.io/snatotp/`
- 개인정보처리방침: `https://junhyung-space.github.io/snatotp/privacy/`
- 지원: `https://github.com/junhyung-space/snatotp/issues`

### 보안 안내

Snap OTP는 기본적으로 편의성을 위해 `chrome.storage.sync`에 항목을 저장합니다. 사용자는 설정에서 선택적으로 패스프레이즈 보호를 활성화할 수 있고, 이 경우 저장된 OTP 항목은 암호화되며 팝업에서 데이터를 보기 전에 잠금 해제가 필요하고 30분 후 자동으로 다시 잠깁니다.

패스프레이즈 보호를 사용하지 않으면, 동기화된 OTP 항목은 사용자의 Chrome 프로필이나 동기화된 확장 저장소에 접근할 수 있는 사람에게 읽힐 수 있습니다. 패스프레이즈 보호를 사용하더라도 Chrome 프로필과 Google 계정은 전체 보안 경계의 일부로 남습니다.

### 기여

기여는 언제든지 환영합니다. 권장 워크플로와 리뷰 기준은 [CONTRIBUTING.md](./CONTRIBUTING.md)에서 확인할 수 있습니다.

### 보안 제보

보안에 민감한 이슈는 비공개로 제보해 주세요. 현재 제보 절차는 [SECURITY.md](./SECURITY.md)에 정리되어 있습니다.

### 라이선스

Snap OTP는 [MIT License](./LICENSE)로 배포됩니다.
