# notify

NestJS + Firebase Admin 기반의 **최소 알림 발송 서버**입니다.  
이 프로젝트의 목적은 "공통 알림 전송 뼈대"를 만들어 두고, 나중에 다른 프로젝트에서 그대로 가져가서 빠르게 붙일 수 있게 하는 것입니다.

---

## 1) 이 프로젝트가 하는 일

- `POST /notification/send` API 1개를 제공합니다.
- 요청 바디(`NotificationDataPayload`)로 `token`, `title`, `body`와 선택 필드(`type`, `itemId`)를 받아 FCM 푸시를 발송합니다.
- 크론, DB, 배치 로직 없이 "단건 전송 기본 틀"만 포함합니다.

---

## 2) 전체 동작 흐름

1. 클라이언트(또는 서버)가 `POST /notification/send`로 요청
2. `NotificationController`가 요청 바디를 전달
3. `AppService.sendNotification()`이 필수값(`token`, `title`, `body`) 검증
4. Firebase Admin SDK로 FCM 전송
5. 성공 시 `{ "ok": true }` 반환

---

## 3) 현재 코드 구조

```text
src/
  app.module.ts                 # Nest 모듈 등록
  app.service.ts                # sendNotification 핵심 로직
  notification.controller.ts    # /notification/send 엔드포인트
  main.ts                       # Firebase Admin 초기화 + 서버 부트스트랩
```

---

## 4) 로컬 실행 방법

### 4-1. 의존성 설치

```bash
npm install
```

### 4-2. 환경변수 설정

`main.ts`에서 Firebase 서비스 계정 값을 환경변수로 읽습니다.  
아래 키가 모두 필요합니다.

- `FIREBASE_TYPE`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_CLIENT_ID`
- `FIREBASE_AUTH_URI`
- `FIREBASE_TOKEN_URI`
- `FIREBASE_AUTH_PROVIDER_X509_CERT_URL`
- `FIREBASE_CLIENT_X509_CERT_URL`
- `PORT` (선택, 기본값 3000)

예시(`.env`):

```env
PORT=3000

FIREBASE_TYPE=service_account
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=1234567890
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxx%40your-project-id.iam.gserviceaccount.com
```

주의:

- `FIREBASE_PRIVATE_KEY`는 `\n` 형태로 넣어도 코드에서 실제 줄바꿈으로 변환합니다.
- 누락된 값이 있으면 서버 시작 시 에러로 중단됩니다.

### 4-3. 실행

```bash
# 개발 모드
npm run start:dev

# 프로덕션 모드
npm run build
npm run start:prod
```

---

## 5) API 사용법

### 5-1. Endpoint

- `POST /notification/send`

### 5-2. Request Body (`NotificationDataPayload`)

```json
{
  "token": "FCM_DEVICE_TOKEN",
  "title": "알림 제목",
  "body": "알림 내용",
  "type": "MATCH_POST",
  "itemId": "391758446333952"
}
```

필드 설명:

- `token`: 푸시를 받을 디바이스 FCM 토큰
- `title`: 알림 제목
- `body`: 알림 본문
- `type` (선택): 알림 라우팅 타입. FCM `data.type`으로 내려감
- `itemId` (선택): 라우팅 대상 ID. FCM `data.itemId`로 내려감

### 5-3. 성공 응답

```json
{
  "ok": true
}
```

### 5-4. 실패 응답

- `400 Bad Request`: `token/title/body` 중 하나라도 비어 있거나 누락
- `500 Internal Server Error`: Firebase 전송 실패

### 5-5. cURL 예시

```bash
curl -X POST http://localhost:3000/notification/send \
  -H "Content-Type: application/json" \
  -d '{
    "token": "FCM_DEVICE_TOKEN",
    "title": "테스트 알림",
    "body": "notify 서비스에서 보낸 메시지입니다.",
    "type": "MATCH_POST",
    "itemId": "391758446333952"
  }'
```

---

## 6) Firebase로 실제 전송되는 메시지 형태

`app.service.ts`에서 아래 구조로 전송합니다.

- `notification`: `title`, `body`
- `data`: `title`, `body` + `type`, `itemId`(둘 다 전달된 경우에만 포함)
- `android.priority`: `high`
- `apns.payload.aps`: `alert`, `sound`, `contentAvailable`

즉, Android/iOS에서 표시 안정성을 위해 `notification` + `data`를 함께 넣는 기본 형태입니다.

---

## 7) 다른 프로젝트에서 가져다 쓰는 방법

이 프로젝트는 복붙/이식을 쉽게 하도록 최소화되어 있습니다.

1. `src/notification.controller.ts`와 `src/app.service.ts`의 `sendNotification` 로직을 대상 프로젝트로 복사
2. 대상 프로젝트 `main.ts`에 Firebase Admin 초기화 코드 추가
3. 대상 프로젝트 환경변수에 Firebase 서비스 계정 값 추가
4. 대상 프로젝트 `package.json`에 `firebase-admin` 의존성 추가
5. 엔드포인트 경로(`/notification/send`)는 프로젝트 규칙에 맞게 변경

이식 포인트:

- 지금은 단건 전송 전용
- 배치 전송, 토픽 전송, 사용자별 정책, 재시도, 실패 토큰 정리 등은 각 프로젝트에서 확장

---

## 8) Docker Compose 실행

프로덕션 배포 기준 예시입니다.  
(`docker-compose.yml`)

```yaml
services:
  soccer-alarm:
    image: ${DOCKER_IMAGE:-your-dockerhub-id/soccer-alarm:latest}
    container_name: soccer-alarm
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - '3000:3000'
```

실행:

```bash
DOCKER_IMAGE=your-dockerhub-id/soccer-alarm:latest \
docker compose -f docker-compose.yml up -d
```

정리:

```bash
docker image prune -af
```

주의:

- `.env` 파일에 4-2 절의 Firebase 환경변수가 모두 있어야 합니다.

---

## 9) 트러블슈팅

### 서버 시작 시 `Missing required environment variable`

- 원인: Firebase 관련 환경변수 누락
- 해결: `.env` 또는 배포 환경에 필수 키 전부 설정

### `Failed to send notification`

- 원인 후보:
  - 잘못된 토큰
  - 서비스 계정 권한 문제
  - Firebase 프로젝트/키 불일치
- 해결:
  - 서버 로그의 Firebase 에러 코드 확인
  - 토큰 재발급
  - 서비스 계정 JSON 재검증

### 푸시가 안 뜨는 경우

- 앱이 알림 권한을 허용했는지 확인
- iOS APNs 설정/키가 올바른지 확인
- Android 채널 설정 문제 확인 (클라이언트 앱 쪽)

---

## 10) 향후 확장 아이디어

- 멀티 토큰 전송 API 추가
- `data` payload 스키마 표준화(`type`, `itemId`, `memberId` 등)
- 실패 토큰 저장/정리
- 전송 로그 적재 (DB, 로그 플랫폼)
- 인증/권한 (내부 API 키, 서명 검증)

---

## License

UNLICENSED
