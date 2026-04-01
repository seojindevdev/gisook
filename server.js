const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "schedules.json");
const NAMES_PATH = path.join(ROOT_DIR, "names.json");
const AUTH_PATH = path.join(ROOT_DIR, "auth.json");
const PORT = Number(process.env.PORT || 3000);
const TIME_ZONE = "Asia/Seoul";
const MIN_ALLOWED_MINUTES = 15 * 60;
const MAX_ALLOWED_MINUTES = 24 * 60;
const ROOM_NUMBERS = Array.from({ length: 15 }, (_, index) => String(201 + index));
const SLOT_NUMBERS = [1, 2, 3, 4];
const SESSION_COOKIE_NAME = "gisook_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const authSessions = new Map();

const WEEKDAYS = [
  { key: "MON", label: "월", intl: "Mon" },
  { key: "TUE", label: "화", intl: "Tue" },
  { key: "WED", label: "수", intl: "Wed" },
  { key: "THU", label: "목", intl: "Thu" },
  { key: "FRI", label: "금", intl: "Fri" },
];

const DAY_ORDER = Object.fromEntries(WEEKDAYS.map((day, index) => [day.key, index]));
const DAY_BY_INTL = Object.fromEntries(WEEKDAYS.map((day) => [day.intl, day.key]));
const WEEKDAY_INDEX_BY_INTL = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};
const WEEKDAY_INDEX_BY_KEY = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
};
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

bootstrapFiles();

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    if (error?.statusCode) {
      sendJson(res, error.statusCode, {
        error: "request_error",
        message: error.message,
      });
      return;
    }

    console.error(error);
    sendJson(res, 500, {
      error: "internal_server_error",
      message: "서버 처리 중 오류가 발생했습니다.",
    });
  });
});

server.listen(PORT, () => {
  console.log(`Outing board is running at http://localhost:${PORT} (${TIME_ZONE})`);
});

async function handleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname.startsWith("/api/")) {
    await handleApiRequest(req, res, pathname);
    return;
  }

  serveStatic(req, res, pathname);
}

async function handleApiRequest(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/auth/status") {
    sendJson(res, 200, {
      authenticated: isAuthenticatedRequest(req),
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const payload = await readJsonBody(req);
    const password = String(payload?.password || "");
    if (password !== readAuthConfig().password) {
      throwHttpError(401, "비밀번호가 올바르지 않습니다.");
    }

    const token = createSessionToken();
    authSessions.set(token, Date.now() + SESSION_TTL_MS);
    sendJson(
      res,
      200,
      {
        authenticated: true,
      },
      {
        "Set-Cookie": serializeSessionCookie(token),
      },
    );
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    clearSession(req);
    sendJson(
      res,
      200,
      {
        authenticated: false,
      },
      {
        "Set-Cookie": expireSessionCookie(),
      },
    );
    return;
  }

  if (!isAuthenticatedRequest(req)) {
    throwHttpError(401, "비밀번호를 입력해야 접근할 수 있습니다.");
  }

  if (req.method === "GET" && pathname === "/api/config") {
    sendJson(res, 200, {
      people: readRoster(),
      weekdays: WEEKDAYS,
      rooms: ROOM_NUMBERS,
      slots: SLOT_NUMBERS,
      timeZone: TIME_ZONE,
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/dashboard") {
    sendJson(res, 200, buildDashboardResponse());
    return;
  }

  const userMatch = pathname.match(/^\/api\/users\/(.+)$/);
  if (!userMatch) {
    throwHttpError(404, "요청한 API를 찾을 수 없습니다.");
  }

  const userName = userMatch[1];
  if (req.method === "GET") {
    sendJson(res, 200, buildUserResponse(userName));
    return;
  }

  if (req.method === "PUT") {
    const payload = await readJsonBody(req);
    sendJson(res, 200, saveUserSchedule(userName, payload));
    return;
  }

  throwHttpError(405, "지원하지 않는 메서드입니다.");
}

function serveStatic(req, res, pathname) {
  if (!["GET", "HEAD"].includes(req.method)) {
    throwHttpError(405, "지원하지 않는 메서드입니다.");
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    throwHttpError(403, "잘못된 경로 요청입니다.");
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    throwHttpError(404, "페이지를 찾을 수 없습니다.");
  }

  res.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
}

function bootstrapFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(AUTH_PATH)) {
    fs.writeFileSync(AUTH_PATH, JSON.stringify(getDefaultAuthDocument(), null, 2));
  }

  if (!fs.existsSync(NAMES_PATH)) {
    fs.writeFileSync(NAMES_PATH, JSON.stringify(getDefaultRosterDocument(), null, 2));
  }

  if (!fs.existsSync(DB_PATH)) {
    const roster = normalizeRosterDocument(getDefaultRosterDocument());
    fs.writeFileSync(DB_PATH, JSON.stringify(createEmptyDatabase(roster), null, 2));
  }
}

function getDefaultAuthDocument() {
  return {
    password: "3141",
  };
}

function readAuthConfig() {
  const raw = readJsonFile(AUTH_PATH);
  return {
    password: String(raw?.password || "3141"),
  };
}

function createSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

function isAuthenticatedRequest(req) {
  cleanupExpiredSessions();
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return false;
  }

  const expiresAt = authSessions.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    authSessions.delete(token);
    return false;
  }

  authSessions.set(token, Date.now() + SESSION_TTL_MS);
  return true;
}

function clearSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE_NAME];
  if (token) {
    authSessions.delete(token);
  }
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of authSessions.entries()) {
    if (expiresAt <= now) {
      authSessions.delete(token);
    }
  }
}

function parseCookies(headerValue) {
  return String(headerValue || "")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((accumulator, chunk) => {
      const separatorIndex = chunk.indexOf("=");
      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = chunk.slice(0, separatorIndex).trim();
      const value = chunk.slice(separatorIndex + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

function serializeSessionCookie(token) {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000,
  )}; SameSite=Lax`;
}

function expireSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

function buildUserResponse(userName) {
  const roster = readRoster();
  const person = assertAllowedPerson(userName, roster);
  const now = getCurrentLocalParts();
  const database = readPreparedDatabase(now, roster);
  const userRecord = database.users[person.name];
  const intervals = sanitizeIntervals(userRecord?.intervals || []);
  const overnights = sanitizeStoredOvernights(userRecord?.overnights || [], now);
  const status = computeStatus(intervals, overnights, now);

  return {
    name: person.name,
    room: person.room,
    slot: person.slot,
    exists: Boolean(userRecord),
    intervals,
    overnights,
    updatedAt: userRecord?.updatedAt || null,
    status,
  };
}

function saveUserSchedule(userName, payload) {
  const roster = readRoster();
  const person = assertAllowedPerson(userName, roster);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throwHttpError(400, "잘못된 저장 요청입니다.");
  }

  if (!Array.isArray(payload.intervals)) {
    throwHttpError(400, "스케줄 기록은 배열이어야 합니다.");
  }

  if (payload.overnights !== undefined && !Array.isArray(payload.overnights)) {
    throwHttpError(400, "외박 기록은 배열이어야 합니다.");
  }

  const now = getCurrentLocalParts();
  const intervals = payload.intervals
    .map((interval, index) => normalizeInterval(interval, index))
    .sort(compareIntervals);
  assertIntervalsDoNotOverlap(intervals);

  const overnights = (payload.overnights || [])
    .map((overnight, index) => normalizeIncomingOvernight(overnight, index, now))
    .filter(Boolean)
    .sort(compareOvernights);

  const database = readPreparedDatabase(now, roster);
  database.users[person.name] = {
    profile: {
      room: person.room,
      slot: person.slot,
    },
    intervals: intervals.map(({ day, start, end, reason, outing, phone }) => ({
      day,
      start,
      end,
      reason,
      outing,
      phone,
    })),
    overnights: overnights.map(({ day, reason, targetDate }) => ({
      day,
      reason,
      targetDate,
    })),
    updatedAt: new Date().toISOString(),
  };
  writeDatabase(database);

  return buildUserResponse(person.name);
}

function buildDashboardResponse() {
  const roster = readRoster();
  const now = getCurrentLocalParts();
  const database = readPreparedDatabase(now, roster);

  const users = roster.map((person) => {
    const userRecord = database.users[person.name];
    const intervals = sanitizeIntervals(userRecord?.intervals || []);
    const overnights = sanitizeStoredOvernights(userRecord?.overnights || [], now);
    const status = computeStatus(intervals, overnights, now);

    return {
      name: person.name,
      room: person.room,
      slot: person.slot,
      isOut: status.isOut,
      isPhoneOnly: status.isPhoneOnly,
      isOvernight: status.isOvernight,
      statusLabel: status.statusLabel,
      currentInterval: status.currentInterval,
      currentOvernight: status.currentOvernight,
      updatedAt: userRecord?.updatedAt || null,
    };
  });

  const rooms = ROOM_NUMBERS.map((room) => ({
    room,
    occupants: SLOT_NUMBERS.map((slot) => {
      const user = users.find((candidate) => candidate.room === room && candidate.slot === slot);
      return (
        user || {
          name: "",
          room,
          slot,
          empty: true,
          isOut: false,
          isPhoneOnly: false,
          isOvernight: false,
          statusLabel: "빈자리",
          currentInterval: null,
          currentOvernight: null,
          updatedAt: null,
        }
      );
    }),
  }));

  const totals = {
    total: users.length,
    present: users.filter((user) => !user.isOut && !user.isPhoneOnly && !user.isOvernight).length,
    out: users.filter((user) => user.isOut).length,
    phone: users.filter((user) => user.isPhoneOnly).length,
    overnight: users.filter((user) => user.isOvernight).length,
  };

  return {
    generatedAt: formatNowLabel(now),
    timeZone: TIME_ZONE,
    rooms,
    users,
    totals,
  };
}

function readRoster() {
  return normalizeRosterDocument(readJsonFile(NAMES_PATH));
}

function normalizeRosterDocument(raw) {
  const people = Array.isArray(raw)
    ? raw.map((name, index) => createLegacyRosterEntry(name, index))
    : Array.isArray(raw?.people)
      ? raw.people
      : [];

  const normalized = [];
  const seenNames = new Set();

  for (const person of people) {
    if (!person || typeof person !== "object") {
      continue;
    }

    const name = String(person.name || "").trim();
    const room = String(person.room || "").trim();
    const slot = Number(person.slot);
    if (!name || !room || !Number.isInteger(slot) || slot < 1 || slot > 4) {
      continue;
    }

    if (seenNames.has(name)) {
      continue;
    }

    seenNames.add(name);
    normalized.push({ name, room, slot });
  }

  normalized.sort(compareRosterPeople);
  return normalized;
}

function createLegacyRosterEntry(name, index) {
  const room = ROOM_NUMBERS[Math.floor(index / SLOT_NUMBERS.length)] || ROOM_NUMBERS[0];
  const slot = SLOT_NUMBERS[index % SLOT_NUMBERS.length] || 1;
  return {
    name,
    room,
    slot,
  };
}

function createEmptyDatabase(roster) {
  return {
    users: Object.fromEntries(
      roster.map((person) => [
        person.name,
        {
          profile: {
            room: person.room,
            slot: person.slot,
          },
          intervals: [],
          overnights: [],
          updatedAt: null,
        },
      ]),
    ),
  };
}

function getDefaultRosterDocument() {
  return {
    people: [
      { name: "함병구", room: "201", slot: 1 },
      { name: "김원무", room: "201", slot: 2 },
      { name: "현두영", room: "201", slot: 3 },
      { name: "김태룡", room: "201", slot: 4 },
      { name: "송정민", room: "202", slot: 1 },
      { name: "한성훈", room: "202", slot: 2 },
      { name: "강선우", room: "202", slot: 3 },
      { name: "차원형", room: "202", slot: 4 },
      { name: "조원형", room: "203", slot: 1 },
      { name: "채민규", room: "203", slot: 2 },
      { name: "황성진", room: "204", slot: 1 },
      { name: "심연우", room: "204", slot: 2 },
      { name: "여현교", room: "204", slot: 3 },
      { name: "노건호", room: "204", slot: 4 },
      { name: "지연우", room: "205", slot: 1 },
      { name: "김일구", room: "205", slot: 2 },
      { name: "최겸일", room: "205", slot: 3 },
      { name: "오성윤", room: "205", slot: 4 },
      { name: "홍현권", room: "206", slot: 1 },
      { name: "구본형", room: "206", slot: 2 },
      { name: "서현영", room: "206", slot: 3 },
      { name: "송호경", room: "206", slot: 4 },
      { name: "민주원", room: "207", slot: 1 },
      { name: "정세홍", room: "207", slot: 2 },
      { name: "현성우", room: "207", slot: 3 },
      { name: "노우석", room: "207", slot: 4 },
      { name: "김세진", room: "208", slot: 1 },
      { name: "성성환", room: "208", slot: 3 },
      { name: "이동민", room: "208", slot: 4 },
      { name: "정태영", room: "209", slot: 1 },
      { name: "장선우", room: "209", slot: 2 },
      { name: "황기구", room: "209", slot: 3 },
      { name: "정하윤", room: "209", slot: 4 },
      { name: "한민성", room: "210", slot: 3 },
      { name: "홍현세", room: "210", slot: 4 },
      { name: "강지용", room: "211", slot: 1 },
      { name: "이호진", room: "211", slot: 3 },
      { name: "현솔윤", room: "211", slot: 4 },
      { name: "장예현", room: "212", slot: 1 },
      { name: "서정호", room: "212", slot: 2 },
      { name: "여상민", room: "212", slot: 3 },
      { name: "정병수", room: "213", slot: 1 },
      { name: "현동호", room: "213", slot: 2 },
      { name: "왕재형", room: "213", slot: 3 },
      { name: "김종후", room: "213", slot: 4 },
      { name: "안시훈", room: "214", slot: 1 },
      { name: "오형준", room: "214", slot: 2 },
      { name: "김예범", room: "214", slot: 3 },
      { name: "성지훈", room: "215", slot: 1 },
      { name: "정지호", room: "215", slot: 2 },
      { name: "고유빈", room: "215", slot: 3 },
      { name: "김현우", room: "215", slot: 4 },
    ],
  };
}

function readPreparedDatabase(now, roster) {
  const database = readDatabase();
  let changed = false;

  if (syncRosterProfiles(database, roster)) {
    changed = true;
  }

  if (pruneExpiredOvernights(database, now)) {
    changed = true;
  }

  if (changed) {
    writeDatabase(database);
  }

  return database;
}

function readDatabase() {
  const raw = readJsonFile(DB_PATH);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { users: {} };
  }

  return {
    users: raw.users && typeof raw.users === "object" && !Array.isArray(raw.users) ? raw.users : {},
  };
}

function writeDatabase(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function syncRosterProfiles(database, roster) {
  let changed = false;

  for (const person of roster) {
    const existing = database.users[person.name];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      database.users[person.name] = {
        profile: { room: person.room, slot: person.slot },
        intervals: [],
        overnights: [],
        updatedAt: null,
      };
      changed = true;
      continue;
    }

    const currentRoom = String(existing.profile?.room || "");
    const currentSlot = Number(existing.profile?.slot || 0);
    if (currentRoom !== person.room || currentSlot !== person.slot) {
      existing.profile = { room: person.room, slot: person.slot };
      changed = true;
    }
  }

  return changed;
}

function pruneExpiredOvernights(database, now) {
  let changed = false;

  for (const userRecord of Object.values(database.users)) {
    if (!userRecord || typeof userRecord !== "object" || Array.isArray(userRecord)) {
      continue;
    }

    const previous = Array.isArray(userRecord.overnights) ? userRecord.overnights : [];
    const sanitized = sanitizeStoredOvernights(previous, now);
    if (JSON.stringify(previous) !== JSON.stringify(sanitized)) {
      userRecord.overnights = sanitized;
      changed = true;
    }
  }

  return changed;
}

function sanitizeIntervals(intervals) {
  if (!Array.isArray(intervals)) {
    return [];
  }

  return intervals
    .map((interval, index) => {
      try {
        return normalizeInterval(interval, index);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .sort(compareIntervals)
    .map(({ day, start, end, reason, outing, phone }) => ({
      day,
      start,
      end,
      reason,
      outing,
      phone,
    }));
}

function sanitizeStoredOvernights(overnights, now) {
  if (!Array.isArray(overnights)) {
    return [];
  }

  const todayKey = formatDateKey(now);
  return overnights
    .map((overnight, index) => {
      try {
        return normalizeStoredOvernight(overnight, index);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .filter((overnight) => overnight.targetDate >= todayKey)
    .sort(compareOvernights);
}

function normalizeInterval(interval, index) {
  if (!interval || typeof interval !== "object" || Array.isArray(interval)) {
    throwHttpError(400, `${index + 1}번째 기록 형식이 올바르지 않습니다.`);
  }

  const day = String(interval.day || "").trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(DAY_ORDER, day)) {
    throwHttpError(400, `${index + 1}번째 요일이 올바르지 않습니다.`);
  }

  const start = normalizeTime(interval.start, true, "나감");
  const end = normalizeTime(interval.end, true, "들어옴");
  const reason = String(interval.reason || "").trim();
  const outing = interval.outing === "X" ? "X" : "O";
  const phone = interval.phone === "O" ? "O" : "X";
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);

  if (startMinutes < MIN_ALLOWED_MINUTES || startMinutes > MAX_ALLOWED_MINUTES) {
    throwHttpError(400, `${index + 1}번째 나감 시각은 오후 3시부터 오후 12시까지만 가능합니다.`);
  }

  if (endMinutes < MIN_ALLOWED_MINUTES || endMinutes > MAX_ALLOWED_MINUTES) {
    throwHttpError(400, `${index + 1}번째 들어옴 시각은 오후 3시부터 오후 12시까지만 가능합니다.`);
  }

  if (startMinutes >= endMinutes) {
    throwHttpError(400, `${index + 1}번째 기록은 나감 시각이 들어옴 시각보다 늦거나 같을 수 없습니다.`);
  }

  if (reason.length > 100) {
    throwHttpError(400, `${index + 1}번째 사유는 100자 이하로 입력해주세요.`);
  }

  if (outing !== "O" && phone !== "O") {
    throwHttpError(400, `${index + 1}번째 기록은 외출 또는 폰 중 하나는 체크되어 있어야 합니다.`);
  }

  return { day, start, end, reason, outing, phone, startMinutes, endMinutes };
}

function normalizeStoredOvernight(overnight, index) {
  if (!overnight || typeof overnight !== "object" || Array.isArray(overnight)) {
    throwHttpError(400, `${index + 1}번째 외박 기록 형식이 올바르지 않습니다.`);
  }

  const day = String(overnight.day || "").trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(DAY_ORDER, day)) {
    throwHttpError(400, `${index + 1}번째 외박 요일이 올바르지 않습니다.`);
  }

  const reason = String(overnight.reason || "").trim();
  if (!reason) {
    throwHttpError(400, `${index + 1}번째 외박 사유를 입력해주세요.`);
  }

  if (reason.length > 100) {
    throwHttpError(400, `${index + 1}번째 외박 사유는 100자 이하로 입력해주세요.`);
  }

  const targetDate = String(overnight.targetDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throwHttpError(400, `${index + 1}번째 외박 날짜가 올바르지 않습니다.`);
  }

  return { day, reason, targetDate };
}

function normalizeIncomingOvernight(overnight, index, now) {
  if (!overnight || typeof overnight !== "object" || Array.isArray(overnight)) {
    throwHttpError(400, `${index + 1}번째 외박 기록 형식이 올바르지 않습니다.`);
  }

  const day = String(overnight.day || "").trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(DAY_ORDER, day)) {
    throwHttpError(400, `${index + 1}번째 외박 요일이 올바르지 않습니다.`);
  }

  const reason = String(overnight.reason || "").trim();
  if (!reason) {
    return null;
  }

  if (reason.length > 100) {
    throwHttpError(400, `${index + 1}번째 외박 사유는 100자 이하로 입력해주세요.`);
  }

  return {
    day,
    reason,
    targetDate: resolveNextDateForWeekday(day, now),
  };
}

function normalizeTime(value, allow24, label) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throwHttpError(400, `${label} 시각은 HH:MM 형식이어야 합니다.`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 60) {
    throwHttpError(400, `${label} 시각의 분 값이 올바르지 않습니다.`);
  }

  if (hours < 0 || hours > 24) {
    throwHttpError(400, `${label} 시각의 시간 값이 올바르지 않습니다.`);
  }

  if (hours === 24 && minutes !== 0) {
    throwHttpError(400, `${label} 시각의 시간 값이 올바르지 않습니다.`);
  }

  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes > 1440 || (!allow24 && totalMinutes === 1440)) {
    throwHttpError(400, `${label} 시각의 시간 값이 올바르지 않습니다.`);
  }

  if (totalMinutes === 1440) {
    return "24:00";
  }

  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function computeStatus(intervals, overnights, now) {
  const todayKey = formatDateKey(now);
  const currentOvernights = overnights.filter(
    (overnight) => typeof overnight?.targetDate === "string" && overnight.targetDate === todayKey,
  );
  const currentOvernight =
    currentOvernights.length > 0
      ? {
          reason: currentOvernights.map((overnight) => overnight.reason).join(" / "),
          items: currentOvernights,
        }
      : null;

  if (currentOvernight) {
    return {
      isOut: false,
      isPhoneOnly: false,
      isOvernight: true,
      statusLabel: "외박",
      currentInterval: null,
      currentOvernight,
    };
  }

  const dayKey = DAY_BY_INTL[now.weekday];
  const nowMinutes = Number(now.hour) * 60 + Number(now.minute);
  const activeIntervals = dayKey
    ? intervals.filter((interval) => {
        if (interval.day !== dayKey) {
          return false;
        }
        return nowMinutes >= timeToMinutes(interval.start) && nowMinutes < timeToMinutes(interval.end);
      })
    : [];

  const currentOutInterval = activeIntervals.find((interval) => interval.outing === "O");
  const currentPhoneOnlyInterval = activeIntervals.find(
    (interval) => interval.outing !== "O" && interval.phone === "O",
  );
  const currentInterval = currentOutInterval || currentPhoneOnlyInterval || null;

  return {
    isOut: Boolean(currentOutInterval),
    isPhoneOnly: !currentOutInterval && Boolean(currentPhoneOnlyInterval),
    isOvernight: false,
    statusLabel: currentOutInterval ? "외출" : currentPhoneOnlyInterval ? "폰" : "재실",
    currentInterval,
    currentOvernight: null,
  };
}

function resolveNextDateForWeekday(dayKey, now) {
  const currentDateKey = formatDateKey(now);
  const currentWeekdayIndex = WEEKDAY_INDEX_BY_INTL[now.weekday];
  const targetWeekdayIndex = WEEKDAY_INDEX_BY_KEY[dayKey];

  if (typeof currentWeekdayIndex !== "number" || typeof targetWeekdayIndex !== "number") {
    return currentDateKey;
  }

  let delta = targetWeekdayIndex - currentWeekdayIndex;
  if (delta < 0) {
    delta += 7;
  }

  return addDaysToDateKey(currentDateKey, delta);
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compareIntervals(left, right) {
  if (DAY_ORDER[left.day] !== DAY_ORDER[right.day]) {
    return DAY_ORDER[left.day] - DAY_ORDER[right.day];
  }
  return left.startMinutes - right.startMinutes;
}

function compareOvernights(left, right) {
  if (left.targetDate !== right.targetDate) {
    return left.targetDate.localeCompare(right.targetDate);
  }
  return DAY_ORDER[left.day] - DAY_ORDER[right.day];
}

function compareRosterPeople(left, right) {
  if (left.room !== right.room) {
    return left.room.localeCompare(right.room);
  }
  return left.slot - right.slot;
}

function assertAllowedPerson(userName, roster) {
  const normalizedName = String(userName || "").trim();
  if (!normalizedName) {
    throwHttpError(400, "이름을 입력해주세요.");
  }

  const person = roster.find((candidate) => candidate.name === normalizedName);
  if (!person) {
    throwHttpError(403, "names.json에 있는 이름만 수정할 수 있습니다.");
  }

  return person;
}

function assertIntervalsDoNotOverlap(intervals) {
  for (let index = 1; index < intervals.length; index += 1) {
    const previous = intervals[index - 1];
    const current = intervals[index];
    if (!previous || !current || previous.day !== current.day) {
      continue;
    }

    if (previous.endMinutes > current.startMinutes) {
      throwHttpError(400, "같은 요일의 스케줄 시간은 서로 겹칠 수 없습니다.");
    }
  }
}

function getCurrentLocalParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  return parts.reduce((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});
}

function formatDateKey(now) {
  return `${now.year}-${now.month}-${now.day}`;
}

function formatNowLabel(now) {
  return `${now.year}-${now.month}-${now.day} ${now.hour}:${now.minute}:${now.second} (${TIME_ZONE})`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(newHttpError(413, "요청 크기가 너무 큽니다."));
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_error) {
        reject(newHttpError(400, "JSON 형식이 올바르지 않습니다."));
      }
    });

    req.on("error", () => {
      reject(newHttpError(400, "요청 본문을 읽는 중 오류가 발생했습니다."));
    });
  });
}

function timeToMinutes(timeString) {
  if (timeString === "24:00") {
    return 1440;
  }

  const [hours, minutes] = String(timeString).split(":").map(Number);
  return hours * 60 + minutes;
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function newHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function throwHttpError(statusCode, message) {
  throw newHttpError(statusCode, message);
}
