# 외출 현황판

이 프로젝트는 이름별 외출 시간을 저장하고 현재 시각 기준 재실/외출 여부를 보여주는 로컬 웹앱입니다.

## 실행

```bash
npm start
```

브라우저에서 `http://localhost:3000`을 열면 됩니다.

## 파일

- `names.json`: 수정 가능한 이름 목록
- `data/schedules.json`: 이름별 외출 시간 DB
- `public/`: 화면 파일
- `server.js`: 로컬 API 및 정적 파일 서버
