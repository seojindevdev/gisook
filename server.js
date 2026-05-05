const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE_PATH = path.join(ROOT_DIR, "data.json");
const LEGACY_DB_PATH = path.join(DATA_DIR, "schedules.json");
const LEGACY_MESSAGES_PATH = path.join(DATA_DIR, "messages.json");
const LEGACY_ATTENDANCE_PATH = path.join(DATA_DIR, "attendance.json");
const LEGACY_NAMES_PATH = path.join(ROOT_DIR, "names.json");
const LEGACY_AUTH_PATH = path.join(ROOT_DIR, "auth.json");
const PORT = Number(process.env.PORT || 3000);
const TIME_ZONE = "Asia/Seoul";
const MIN_ALLOWED_MINUTES = 15 * 60;
const MAX_ALLOWED_MINUTES = 24 * 60;
const ROOM_NUMBERS = Array.from({ length: 20 }, (_, index) => String(201 + index));
const SLOT_NUMBERS = [1, 2, 3, 4];
const SESSION_COOKIE_NAME = "gisook_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const DEFAULT_STUDENT_PASSWORD = "0000";
const LEGACY_STUDENT_PASSWORD = "3141";
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

const PERSON_NAME_ALIASES = {};

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
    await handleApiRequest(req, res, pathname, requestUrl);
    return;
  }

  serveStatic(req, res, pathname);
}

async function handleApiRequest(req, res, pathname, requestUrl) {
  const session = getAuthenticatedSession(req);

  if (req.method === "GET" && pathname === "/api/auth/options") {
    const authConfig = readPreparedAuthConfig(readRoster());
    sendJson(res, 200, {
      names: readRoster().map((person) => person.name),
      wardenName: authConfig.wardenName,
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/auth/status") {
    sendJson(res, 200, {
      authenticated: Boolean(session),
      role: session?.role || null,
      loginName: session?.loginName || null,
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    if (session) {
      throwHttpError(409, "이미 로그인 중입니다. 다른 계정으로 로그인하려면 먼저 로그아웃하세요.");
    }

    const payload = await readJsonBody(req);
    const requestedName = canonicalizeKnownPersonName(payload?.name || "");
    const password = String(payload?.password || "");
    const roster = readRoster();
    const authConfig = readPreparedAuthConfig(roster);
    if (!requestedName) {
      throwHttpError(400, "이름을 선택하세요.");
    }

    let role = null;
    let loginName = "";
    if (requestedName === canonicalizeKnownPersonName(authConfig.wardenName) && password === authConfig.wardenPassword) {
      role = "warden";
      loginName = authConfig.wardenName;
    } else {
      const person = findRosterPersonByName(roster, requestedName);
      if (person && password === authConfig.studentPasswords[person.name]) {
        role = "student";
        loginName = person.name;
      }
    }

    if (!role || !loginName) {
      throwHttpError(401, "비밀번호가 올바르지 않습니다.");
    }

    const token = createSessionToken();
    authSessions.set(token, {
      expiresAt: Date.now() + SESSION_TTL_MS,
      role,
      loginName,
    });
    sendJson(
      res,
      200,
      {
        authenticated: true,
        role,
        loginName,
      },
      {
        "Set-Cookie": serializeSessionCookie(token),
      },
    );
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/change-password") {
    const payload = await readJsonBody(req);
    sendJson(res, 200, changeOwnPassword(session, payload));
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    clearSession(req);
    sendJson(
      res,
      200,
      {
        authenticated: false,
        role: null,
        loginName: null,
      },
      {
        "Set-Cookie": expireSessionCookie(),
      },
    );
    return;
  }

  if (!session) {
    throwHttpError(401, "비밀번호를 입력해야 접근할 수 있습니다.");
  }

  if (req.method === "GET" && pathname === "/api/config") {
    const roster = readRoster();
    const authConfig = readPreparedAuthConfig(roster);
    const people =
      session.role === "warden" ? roster : [assertAllowedPerson(session.loginName, roster)];

    sendJson(res, 200, {
      role: session.role,
      loginName: session.loginName || "",
      people,
      authNames: roster.map((person) => person.name),
      wardenName: authConfig.wardenName,
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

  if (req.method === "POST" && pathname === "/api/attendance/toggle") {
    sendJson(res, 200, toggleAttendanceForCurrentUser(session));
    return;
  }

  if (pathname === "/api/messages") {
    if (req.method === "GET") {
      sendJson(res, 200, buildMessagesResponse(session, requestUrl.searchParams));
      return;
    }

    if (req.method === "POST") {
      const payload = await readJsonBody(req);
      sendJson(res, 200, createWardenMessage(session, payload));
      return;
    }
  }

  if (pathname === "/api/admin/students" && req.method === "POST") {
    assertWardenSession(session);
    const payload = await readJsonBody(req);
    sendJson(res, 200, createStudent(payload));
    return;
  }

  const adminStudentPasswordMatch = pathname.match(/^\/api\/admin\/students\/(.+)\/password$/);
  if (adminStudentPasswordMatch && req.method === "PUT") {
    assertWardenSession(session);
    const payload = await readJsonBody(req);
    sendJson(res, 200, updateStudentPassword(adminStudentPasswordMatch[1], payload));
    return;
  }

  const adminStudentMatch = pathname.match(/^\/api\/admin\/students\/(.+)$/);
  if (adminStudentMatch && req.method === "PUT") {
    assertWardenSession(session);
    const payload = await readJsonBody(req);
    sendJson(res, 200, updateStudentProfile(adminStudentMatch[1], payload));
    return;
  }

  if (adminStudentMatch && req.method === "DELETE") {
    assertWardenSession(session);
    sendJson(res, 200, deleteStudent(adminStudentMatch[1]));
    return;
  }

  const userMatch = pathname.match(/^\/api\/users\/(.+)$/);
  if (!userMatch) {
    throwHttpError(404, "요청한 API를 찾을 수 없습니다.");
  }

  const userName = userMatch[1];
  if (req.method === "GET") {
    sendJson(res, 200, buildUserResponse(session, userName));
    return;
  }

  if (req.method === "PUT") {
    const payload = await readJsonBody(req);
    sendJson(res, 200, saveUserSchedule(session, userName, payload));
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
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
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

  if (!fs.existsSync(LEGACY_AUTH_PATH)) {
    fs.writeFileSync(LEGACY_AUTH_PATH, JSON.stringify(getDefaultAuthDocument(), null, 2));
  }

  if (!fs.existsSync(LEGACY_NAMES_PATH)) {
    fs.writeFileSync(LEGACY_NAMES_PATH, JSON.stringify(getDefaultRosterDocument(), null, 2));
  }

  if (!fs.existsSync(LEGACY_DB_PATH)) {
    const roster = normalizeRosterDocument(getDefaultRosterDocument());
    writeJsonFile(LEGACY_DB_PATH, createEmptyDatabase(roster));
  }

  if (!fs.existsSync(LEGACY_MESSAGES_PATH)) {
    writeJsonFile(LEGACY_MESSAGES_PATH, getDefaultMessagesDocument());
  }

  const roster = readRoster();
  readPreparedAuthConfig(roster);
}

function getDefaultAuthDocument() {
  return {
    wardenName: "사감",
    wardenPassword: "사감1",
    studentPasswords: {},
  };
}

function readAuthConfig() {
  const raw = readJsonFile(LEGACY_AUTH_PATH);
  return {
    wardenName: String(raw?.wardenName || "사감"),
    wardenPassword: String(raw?.wardenPassword || "사감1"),
    studentPasswords:
      raw?.studentPasswords && typeof raw.studentPasswords === "object" && !Array.isArray(raw.studentPasswords)
        ? raw.studentPasswords
        : {},
  };
}

function readPreparedAuthConfig(roster) {
  const raw = readJsonFile(LEGACY_AUTH_PATH);
  const normalized = normalizeAuthConfig(raw, roster);
  const rawStudentPasswordCount =
    raw?.studentPasswords && typeof raw.studentPasswords === "object" && !Array.isArray(raw.studentPasswords)
      ? Object.keys(raw.studentPasswords).length
      : 0;
  const shouldPreserveExistingPasswords = roster.length === 0 && rawStudentPasswordCount > 0;
  const normalizedJson = JSON.stringify(normalized);
  const rawJson = JSON.stringify({
    wardenName: String(raw?.wardenName || "사감"),
    wardenPassword: String(raw?.wardenPassword || "사감1"),
    studentPasswords:
      raw?.studentPasswords && typeof raw.studentPasswords === "object" && !Array.isArray(raw.studentPasswords)
        ? raw.studentPasswords
        : {},
  });

  if (!shouldPreserveExistingPasswords && normalizedJson !== rawJson) {
    writeAuthConfig(normalized);
  }

  return shouldPreserveExistingPasswords
    ? {
        wardenName: String(raw?.wardenName || "사감"),
        wardenPassword: String(raw?.wardenPassword || "사감1"),
        studentPasswords:
          raw?.studentPasswords && typeof raw.studentPasswords === "object" && !Array.isArray(raw.studentPasswords)
            ? raw.studentPasswords
            : {},
      }
    : normalized;
}

function normalizeAuthConfig(raw, roster) {
  const legacyPassword = String(raw?.studentPassword || raw?.password || DEFAULT_STUDENT_PASSWORD);
  const rawPasswords =
    raw?.studentPasswords && typeof raw.studentPasswords === "object" && !Array.isArray(raw.studentPasswords)
      ? raw.studentPasswords
      : {};

  const normalizedRawPasswords = Object.fromEntries(
    Object.entries(rawPasswords).map(([name, password]) => [canonicalizeKnownPersonName(name), String(password ?? "")]),
  );

  const studentPasswords = Object.fromEntries(
    roster.map((person) => {
      const storedPassword = normalizedRawPasswords[person.name];
      const resolvedPassword = String(storedPassword ?? legacyPassword ?? DEFAULT_STUDENT_PASSWORD);
      return [
        person.name,
        resolvedPassword === LEGACY_STUDENT_PASSWORD ? DEFAULT_STUDENT_PASSWORD : resolvedPassword,
      ];
    }),
  );

  return {
    wardenName: String(raw?.wardenName || "사감"),
    wardenPassword: String(raw?.wardenPassword || "사감1"),
    studentPasswords,
  };
}

function writeAuthConfig(config) {
  writeJsonFile(LEGACY_AUTH_PATH, {
    wardenName: String(config?.wardenName || "사감"),
    wardenPassword: String(config?.wardenPassword || "사감1"),
    studentPasswords:
      config?.studentPasswords && typeof config.studentPasswords === "object" && !Array.isArray(config.studentPasswords)
        ? config.studentPasswords
        : {},
  });
}

function getDefaultMessagesDocument() {
  return {
    messages: [],
  };
}

function getDefaultAttendanceDocument() {
  return {
    records: {},
  };
}

function getDefaultDataDocument() {
  const roster = normalizeRosterDocument(getDefaultRosterDocument());
  return {
    auth: normalizeAuthConfig(getDefaultAuthDocument(), roster),
    roster: createStoredRosterDocument(roster),
    schedules: createEmptyDatabase(roster),
    messages: getDefaultMessagesDocument(),
    attendance: getDefaultAttendanceDocument(),
  };
}

function buildInitialDataDocument() {
  const rosterSource = readLegacyJsonFile(LEGACY_NAMES_PATH, getDefaultRosterDocument());
  const roster = normalizeRosterDocument(rosterSource);

  return normalizeDataDocument({
    auth: readLegacyJsonFile(LEGACY_AUTH_PATH, getDefaultAuthDocument()),
    roster: createStoredRosterDocument(roster),
    schedules: readLegacyJsonFile(LEGACY_DB_PATH, createEmptyDatabase(roster)),
    messages: readLegacyJsonFile(LEGACY_MESSAGES_PATH, getDefaultMessagesDocument()),
    attendance: readLegacyJsonFile(LEGACY_ATTENDANCE_PATH, getDefaultAttendanceDocument()),
  });
}

function readLegacyJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return readJsonFile(filePath);
  } catch (_error) {
    return fallback;
  }
}

function normalizeDataDocument(raw) {
  const rosterSource =
    raw?.roster && typeof raw.roster === "object" && !Array.isArray(raw.roster)
      ? raw.roster
      : raw?.people
        ? { people: raw.people }
        : getDefaultRosterDocument();
  const roster = normalizeRosterDocument(rosterSource);

  return {
    auth: normalizeAuthConfig(raw?.auth, roster),
    roster: createStoredRosterDocument(roster),
    schedules: normalizeDatabaseDocument(raw?.schedules, roster),
    messages: normalizeMessagesDocument(raw?.messages),
    attendance: normalizeAttendanceDocument(raw?.attendance),
  };
}

function readDataDocument() {
  const fallback = getDefaultDataDocument();
  const raw = fs.existsSync(DATA_FILE_PATH) ? readJsonFile(DATA_FILE_PATH) : fallback;
  const normalized = normalizeDataDocument(raw);

  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    writeDataDocument(normalized);
  }

  return normalized;
}

function writeDataDocument(data) {
  writeJsonFile(DATA_FILE_PATH, normalizeDataDocument(data));
}

function normalizeDatabaseDocument(raw, roster = []) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyDatabase(roster);
  }

  const rawUsers = raw.users && typeof raw.users === "object" && !Array.isArray(raw.users) ? raw.users : {};
  const normalizedUsers = Object.fromEntries(
    Object.entries(rawUsers).map(([name, userRecord]) => [canonicalizeKnownPersonName(name), userRecord]),
  );

  return {
    users: normalizedUsers,
  };
}

function normalizeMessagesDocument(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return getDefaultMessagesDocument();
  }

  return {
    messages: Array.isArray(raw.messages)
      ? raw.messages.map((message) =>
          message && typeof message === "object" && !Array.isArray(message)
            ? {
                ...message,
                senderName: canonicalizeKnownPersonName(message.senderName || ""),
              }
            : message,
        )
      : [],
  };
}

function normalizeAttendanceDocument(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return getDefaultAttendanceDocument();
  }

  return {
    records:
      raw.records && typeof raw.records === "object" && !Array.isArray(raw.records)
        ? Object.fromEntries(
            Object.entries(raw.records).map(([dateKey, record]) => [
              dateKey,
              record && typeof record === "object" && !Array.isArray(record)
                ? Object.fromEntries(
                    Object.entries(record).map(([name, checked]) => [canonicalizeKnownPersonName(name), checked]),
                  )
                : {},
            ]),
          )
        : {},
  };
}

function createSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getAuthenticatedSession(req) {
  cleanupExpiredSessions();
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const session = authSessions.get(token);
  if (!session || typeof session !== "object" || session.expiresAt <= Date.now()) {
    authSessions.delete(token);
    return null;
  }

  const nextSession = {
    ...session,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  authSessions.set(token, nextSession);
  return nextSession;
}

function isAuthenticatedRequest(req) {
  return Boolean(getAuthenticatedSession(req));
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
  for (const [token, session] of authSessions.entries()) {
    if (!session || typeof session !== "object" || session.expiresAt <= now) {
      authSessions.delete(token);
    }
  }
}

function assertWardenSession(session) {
  if (!session || session.role !== "warden") {
    throwHttpError(403, "사감 모드에서만 사용할 수 있습니다.");
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

function buildUserResponse(session, userName) {
  const roster = readRoster();
  const person = assertSessionCanAccessUser(session, userName, roster);
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

function saveUserSchedule(session, userName, payload) {
  const roster = readRoster();
  const person = assertSessionCanAccessUser(session, userName, roster);

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

  return buildUserResponse(session, person.name);
}

function buildDashboardResponse() {
  const roster = readRoster();
  const now = getCurrentLocalParts();
  const database = readPreparedDatabase(now, roster);
  const attendanceDateKey = formatDateKey(now);

  const users = roster.map((person) => {
    const userRecord = database.users[person.name];
    const intervals = sanitizeIntervals(userRecord?.intervals || []);
    const overnights = sanitizeStoredOvernights(userRecord?.overnights || [], now);
    const status = computeStatus(intervals, overnights, now);

    return {
      name: person.name,
      room: person.room,
      slot: person.slot,
      grade: person.grade,
      isOut: status.isOut,
      isPhoneOnly: status.isPhoneOnly,
      isOvernight: status.isOvernight,
      statusLabel: status.statusLabel,
      currentInterval: status.currentInterval,
      currentOvernight: status.currentOvernight,
      attendanceChecked: false,
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
           grade: null,
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
    attendanceChecked: users.filter((user) => user.attendanceChecked).length,
  };

  return {
    generatedAt: formatNowLabel(now),
    timeZone: TIME_ZONE,
    attendanceDateKey,
    rooms,
    users,
    totals,
  };
}

function buildMessagesResponse(session, searchParams) {
  const roster = readRoster();
  const senderName = String(searchParams?.get("senderName") || "").trim();
  const messages = readMessages()
    .messages
    .map((message, index) => {
      try {
        return normalizeStoredMessage(message, index);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  if (session.role === "warden") {
    const filtered = senderName ? messages.filter((message) => message.senderName === senderName) : messages;
    return {
      role: session.role,
      senderName,
      messages: filtered,
    };
  }

  const person = assertAllowedPerson(session.loginName, roster);
  return {
    role: session.role,
    senderName: person.name,
    messages: messages.filter((message) => message.senderName === person.name),
  };
}

function createWardenMessage(session, payload) {
  if (!session || session.role !== "student") {
    throwHttpError(403, "학생 모드에서만 보낼 수 있습니다.");
  }

  const roster = readRoster();
  const sender = assertAllowedPerson(session.loginName, roster);
  const text = String(payload?.text || "").trim();
  if (!text) {
    throwHttpError(400, "메시지를 입력해주세요.");
  }

  if (text.length > 500) {
    throwHttpError(400, "메시지는 500자 이하로 입력해주세요.");
  }

  const document = readMessages();
  const message = {
    id: createSessionToken(),
    senderName: sender.name,
    text,
    createdAt: new Date().toISOString(),
  };
  document.messages.push(message);
  writeMessages(document);

  return {
    role: session.role,
    senderName: sender.name,
    message,
  };
}

function toggleAttendanceForCurrentUser(session) {
  if (!session || session.role !== "student") {
    throwHttpError(403, "학생만 출석체크를 할 수 있습니다.");
  }

  const roster = readRoster();
  const person = assertAllowedPerson(session.loginName, roster);
  const now = getCurrentLocalParts();
  const attendanceDocument = readPreparedAttendance(now, roster);
  const attendanceDateKey = formatDateKey(now);
  const nextDayRecord =
    attendanceDocument.records?.[attendanceDateKey] &&
    typeof attendanceDocument.records[attendanceDateKey] === "object" &&
    !Array.isArray(attendanceDocument.records[attendanceDateKey])
      ? { ...attendanceDocument.records[attendanceDateKey] }
      : {};

  if (nextDayRecord[person.name]) {
    delete nextDayRecord[person.name];
  } else {
    nextDayRecord[person.name] = true;
  }

  attendanceDocument.records = {
    [attendanceDateKey]: nextDayRecord,
  };
  writeAttendance(attendanceDocument);

  return {
    name: person.name,
    attendanceDateKey,
    checked: Boolean(nextDayRecord[person.name]),
  };
}

function changeOwnPassword(session, payload) {
  if (!session || !session.loginName) {
    throwHttpError(401, "로그인이 필요합니다.");
  }

  const roster = readRoster();
  const authConfig = readPreparedAuthConfig(roster);
  const currentPassword = String(payload?.currentPassword || "");
  const nextPassword = String(payload?.newPassword || "");

  if (!nextPassword) {
    throwHttpError(400, "새 비밀번호를 입력해주세요.");
  }

  if (nextPassword.length > 100) {
    throwHttpError(400, "비밀번호는 100자 이하로 입력해주세요.");
  }

  if (session.role === "warden") {
    if (currentPassword !== authConfig.wardenPassword) {
      throwHttpError(401, "현재 비밀번호가 올바르지 않습니다.");
    }

    authConfig.wardenPassword = nextPassword;
    writeAuthConfig(authConfig);
    return {
      role: session.role,
      loginName: session.loginName,
    };
  }

  const person = assertAllowedPerson(session.loginName, roster);
  if (currentPassword !== authConfig.studentPasswords[person.name]) {
    throwHttpError(401, "현재 비밀번호가 올바르지 않습니다.");
  }

  authConfig.studentPasswords[person.name] = nextPassword;
  writeAuthConfig(authConfig);
  return {
    role: session.role,
    loginName: session.loginName,
  };
}

function createStudent(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throwHttpError(400, "학생 추가 요청 형식이 올바르지 않습니다.");
  }

  const roster = readRoster();
  const name = String(payload.name || "").trim();
  const room = String(payload.room || "").trim();
  const grade = Number(payload.grade);

  if (!name) {
    throwHttpError(400, "이름을 입력해주세요.");
  }

  if (name.length > 30) {
    throwHttpError(400, "이름은 30자 이하로 입력해주세요.");
  }

  if (!ROOM_NUMBERS.includes(room)) {
    throwHttpError(400, "호실이 올바르지 않습니다.");
  }

  if (![1, 2, 3].includes(grade)) {
    throwHttpError(400, "학년은 1, 2, 3만 가능합니다.");
  }

  const password = DEFAULT_STUDENT_PASSWORD;

  if (roster.some((person) => person.name === name)) {
    throwHttpError(400, "이미 있는 이름입니다.");
  }

  assertRoomCapacity(roster, room);

  const nextRoster = [...roster, { name, room, grade }];
  writeRoster(nextRoster);
  const normalizedRoster = readRoster();
  const addedStudent = assertAllowedPerson(name, normalizedRoster);

  const database = readDatabase();
  database.users[name] = {
    profile: { room },
    intervals: [],
    overnights: [],
    updatedAt: null,
  };
  writeDatabase(database);

  const authConfig = readPreparedAuthConfig(normalizedRoster);
  authConfig.studentPasswords[name] = password;
  writeAuthConfig(authConfig);

  return {
    added: addedStudent,
    people: normalizedRoster,
  };
}

function updateStudentProfile(userName, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throwHttpError(400, "학생 수정 요청 형식이 올바르지 않습니다.");
  }

  const roster = readRoster();
  const person = assertAllowedPerson(userName, roster);
  const nextName = String(payload.name || "").trim();
  const room = String(payload.room || "").trim();
  const grade = Number(payload.grade);
  const authConfig = readPreparedAuthConfig(roster);

  if (!nextName) {
    throwHttpError(400, "이름을 입력해주세요.");
  }

  if (nextName.length > 30) {
    throwHttpError(400, "이름은 30자 이하로 입력해주세요.");
  }

  if (nextName !== person.name && roster.some((candidate) => candidate.name === nextName)) {
    throwHttpError(400, "이미 있는 이름입니다.");
  }

  if (!ROOM_NUMBERS.includes(room)) {
    throwHttpError(400, "호실이 올바르지 않습니다.");
  }

  if (![1, 2, 3].includes(grade)) {
    throwHttpError(400, "학년은 1, 2, 3만 가능합니다.");
  }

  assertRoomCapacity(roster, room, person.name);

  const nextRoster = roster.map((candidate) => {
    if (candidate.name !== person.name) {
      return candidate;
    }

    return {
      ...candidate,
      name: nextName,
      room,
      grade,
      ...(candidate.room === room ? { slot: candidate.slot } : {}),
    };
  });

  writeRoster(nextRoster);
  const normalizedRoster = readRoster();
  const database = readDatabase();
  const existingUserRecord =
    database.users[person.name] && typeof database.users[person.name] === "object" && !Array.isArray(database.users[person.name])
      ? database.users[person.name]
      : {
          profile: { room: person.room },
          intervals: [],
          overnights: [],
          updatedAt: null,
        };

  if (nextName !== person.name) {
    delete database.users[person.name];
  }

  database.users[nextName] = {
    ...existingUserRecord,
    profile: { room },
  };
  writeDatabase(database);

  if (nextName !== person.name) {
    authConfig.studentPasswords[nextName] = authConfig.studentPasswords[person.name] || DEFAULT_STUDENT_PASSWORD;
    delete authConfig.studentPasswords[person.name];
    renameStudentMessages(person.name, nextName);
    renameStudentAttendance(person.name, nextName);
    renameStudentSessions(person.name, nextName);
  }
  writeAuthConfig(authConfig);

  readPreparedDatabase(getCurrentLocalParts(), normalizedRoster);

  return {
    updated: assertAllowedPerson(nextName, normalizedRoster),
    people: normalizedRoster,
  };
}

function updateStudentPassword(userName, payload) {
  throwHttpError(410, "학생 비밀번호 변경은 비활성화되어 있습니다.");
}

function deleteStudent(userName) {
  const roster = readRoster();
  const person = assertAllowedPerson(userName, roster);
  const nextRoster = roster.filter((candidate) => candidate.name !== person.name);
  writeRoster(nextRoster);

  const database = readDatabase();
  delete database.users[person.name];
  writeDatabase(database);

  const authConfig = readPreparedAuthConfig(roster);
  delete authConfig.studentPasswords[person.name];
  writeAuthConfig({
    ...authConfig,
    studentPasswords: Object.fromEntries(
      Object.entries(authConfig.studentPasswords).filter(([name]) => name !== person.name),
    ),
  });

  return {
    deletedName: person.name,
    people: nextRoster,
  };
}

function renameStudentMessages(previousName, nextName) {
  if (!previousName || !nextName || previousName === nextName) {
    return;
  }

  const document = readMessages();
  let changed = false;
  document.messages = document.messages.map((message) => {
    if (!message || typeof message !== "object" || message.senderName !== previousName) {
      return message;
    }

    changed = true;
    return {
      ...message,
      senderName: nextName,
    };
  });

  if (changed) {
    writeMessages(document);
  }
}

function renameStudentAttendance(previousName, nextName) {
  if (!previousName || !nextName || previousName === nextName) {
    return;
  }

  const document = readAttendance();
  let changed = false;
  const nextRecords = {};

  for (const [dateKey, record] of Object.entries(document.records || {})) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      nextRecords[dateKey] = {};
      continue;
    }

    const nextRecord = { ...record };
    if (Object.prototype.hasOwnProperty.call(nextRecord, previousName)) {
      nextRecord[nextName] = nextRecord[previousName];
      delete nextRecord[previousName];
      changed = true;
    }
    nextRecords[dateKey] = nextRecord;
  }

  if (changed) {
    writeAttendance({
      records: nextRecords,
    });
  }
}

function renameStudentSessions(previousName, nextName) {
  if (!previousName || !nextName || previousName === nextName) {
    return;
  }

  for (const [token, session] of authSessions.entries()) {
    if (!session || typeof session !== "object" || session.loginName !== previousName) {
      continue;
    }

    authSessions.set(token, {
      ...session,
      loginName: nextName,
    });
  }
}

function readRoster() {
  const raw = readJsonFile(LEGACY_NAMES_PATH);
  const normalized = normalizeRosterDocument(raw);
  const normalizedDocument = createStoredRosterDocument(normalized);

  if (JSON.stringify(raw) !== JSON.stringify(normalizedDocument)) {
    writeJsonFile(LEGACY_NAMES_PATH, normalizedDocument);
  }

  return normalized;
}

function writeRoster(people) {
  writeJsonFile(LEGACY_NAMES_PATH, createStoredRosterDocument(people));
}

function normalizePersonNameSpacing(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/([가-힣])\s+(?=[가-힣])/g, "$1");
}

function canonicalizeKnownPersonName(name) {
  const normalizedName = normalizePersonNameSpacing(name);
  return PERSON_NAME_ALIASES[normalizedName] || normalizedName;
}

function findRosterPersonByName(roster, userName) {
  const canonicalName = canonicalizeKnownPersonName(userName);
  return roster.find((candidate) => candidate.name === canonicalName) || null;
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

    const name = canonicalizeKnownPersonName(person.name);
    const room = String(person.room || "").trim();
    const slot = Number(person.slot);
    const grade = Number(person.grade);
    if (!name || !ROOM_NUMBERS.includes(room)) {
      continue;
    }

    if (seenNames.has(name)) {
      continue;
    }

    seenNames.add(name);
    normalized.push({
      name,
      room,
      legacySlot: SLOT_NUMBERS.includes(slot) ? slot : null,
      grade: [1, 2, 3].includes(grade) ? grade : null,
      sourceIndex: normalized.length,
    });
  }

  return assignRosterSlots(normalized);
}

function createLegacyRosterEntry(name, index) {
  const room = ROOM_NUMBERS[Math.floor(index / SLOT_NUMBERS.length)] || ROOM_NUMBERS[0];
  const slot = SLOT_NUMBERS[index % SLOT_NUMBERS.length] || 1;
  return {
    name,
    room,
    slot,
    grade: null,
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
    people: [],
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
  const raw = readJsonFile(LEGACY_DB_PATH);
  return normalizeDatabaseDocument(raw);
}

function writeDatabase(data) {
  writeJsonFile(LEGACY_DB_PATH, normalizeDatabaseDocument(data));
}

function readMessages() {
  const raw = readJsonFile(LEGACY_MESSAGES_PATH);
  return normalizeMessagesDocument(raw);
}

function writeMessages(data) {
  writeJsonFile(LEGACY_MESSAGES_PATH, normalizeMessagesDocument(data));
}

function readAttendance() {
  const raw = readJsonFile(LEGACY_ATTENDANCE_PATH);
  return normalizeAttendanceDocument(raw);
}

function writeAttendance(data) {
  writeJsonFile(LEGACY_ATTENDANCE_PATH, normalizeAttendanceDocument(data));
}

function readPreparedAttendance(now, roster) {
  const raw = readAttendance();
  const attendanceDateKey = formatDateKey(now);
  const allowedNames = new Set(roster.map((person) => person.name));
  const rawTodayRecord =
    raw.records?.[attendanceDateKey] &&
    typeof raw.records[attendanceDateKey] === "object" &&
    !Array.isArray(raw.records[attendanceDateKey])
      ? raw.records[attendanceDateKey]
      : {};

  const normalizedTodayRecord = Object.fromEntries(
    Object.entries(rawTodayRecord).filter(([name, checked]) => allowedNames.has(name) && Boolean(checked)),
  );

  const normalized = {
    records: {
      [attendanceDateKey]: normalizedTodayRecord,
    },
  };

  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    writeAttendance(normalized);
  }

  return normalized;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function syncRosterProfiles(database, roster) {
  let changed = false;

  for (const person of roster) {
    const existing = database.users[person.name];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      database.users[person.name] = {
        profile: { room: person.room },
        intervals: [],
        overnights: [],
        updatedAt: null,
      };
      changed = true;
      continue;
    }

    const nextProfile = { room: person.room };
    if (JSON.stringify(existing.profile || {}) !== JSON.stringify(nextProfile)) {
      existing.profile = nextProfile;
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

function normalizeStoredMessage(message, index) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throwHttpError(400, `${index + 1}번째 메시지 형식이 올바르지 않습니다.`);
  }

  const senderName = String(message.senderName || "").trim();
  const text = String(message.text || "").trim();
  const createdAt = String(message.createdAt || "").trim();
  const id = String(message.id || "").trim() || createSessionToken();

  if (!senderName || !text || !createdAt) {
    throwHttpError(400, `${index + 1}번째 메시지 형식이 올바르지 않습니다.`);
  }

  if (Number.isNaN(Date.parse(createdAt))) {
    throwHttpError(400, `${index + 1}번째 메시지 시간이 올바르지 않습니다.`);
  }

  return { id, senderName, text, createdAt };
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
  if (left.slot !== right.slot) {
    return left.slot - right.slot;
  }
  return left.name.localeCompare(right.name, "ko");
}

function compareRosterPlacement(left, right) {
  const leftSlot = Number.isInteger(left.legacySlot) ? left.legacySlot : Number.MAX_SAFE_INTEGER;
  const rightSlot = Number.isInteger(right.legacySlot) ? right.legacySlot : Number.MAX_SAFE_INTEGER;

  if (leftSlot !== rightSlot) {
    return leftSlot - rightSlot;
  }

  if (left.sourceIndex !== right.sourceIndex) {
    return left.sourceIndex - right.sourceIndex;
  }

  return left.name.localeCompare(right.name, "ko");
}

function assignRosterSlots(people) {
  const groupedByRoom = new Map();
  for (const person of people) {
    const roomPeople = groupedByRoom.get(person.room) || [];
    roomPeople.push(person);
    groupedByRoom.set(person.room, roomPeople);
  }

  const assigned = [];
  for (const room of ROOM_NUMBERS) {
    const roomPeople = groupedByRoom.get(room);
    if (!roomPeople?.length) {
      continue;
    }

    roomPeople
      .sort(compareRosterPlacement)
      .forEach((person, index) => {
        assigned.push({
          name: person.name,
          room: person.room,
          slot: SLOT_NUMBERS[index] || index + 1,
          grade: person.grade,
        });
      });
  }

  return assigned.sort(compareRosterPeople);
}

function createStoredRosterDocument(people) {
  return {
    people: assignRosterSlots(
      (Array.isArray(people) ? people : [])
        .map((person, index) => {
          if (!person || typeof person !== "object") {
            return null;
          }

          const name = canonicalizeKnownPersonName(person.name);
          const room = String(person.room || "").trim();
          const slot = Number(person.slot);
          const grade = Number(person.grade);
          if (!name || !ROOM_NUMBERS.includes(room)) {
            return null;
          }

          return {
            name,
            room,
            legacySlot: SLOT_NUMBERS.includes(slot) ? slot : null,
            grade: [1, 2, 3].includes(grade) ? grade : null,
            sourceIndex: index,
          };
        })
        .filter(Boolean),
    ).map(({ name, room, grade }) => ({
      name,
      room,
      ...(Number.isInteger(grade) ? { grade } : {}),
    })),
  };
}

function assertRoomCapacity(roster, room, excludedName = "") {
  const occupancy = roster.filter((person) => person.room === room && person.name !== excludedName).length;
  if (occupancy >= SLOT_NUMBERS.length) {
    throwHttpError(400, "해당 호실은 이미 정원이 가득 찼습니다.");
  }
}

function assertAllowedPerson(userName, roster) {
  const normalizedName = canonicalizeKnownPersonName(userName);
  if (!normalizedName) {
    throwHttpError(400, "이름을 입력해주세요.");
  }

  const person = findRosterPersonByName(roster, normalizedName);
  if (!person) {
    throwHttpError(403, "names.json에 있는 이름만 수정할 수 있습니다.");
  }

  return person;
}

function assertSessionCanAccessUser(session, userName, roster) {
  const person = assertAllowedPerson(userName, roster);
  if (session?.role === "warden") {
    return person;
  }

  if (!session?.loginName || person.name !== session.loginName) {
    throwHttpError(403, "다른 계정 정보는 볼 수 없습니다. 로그아웃 후 해당 계정으로 다시 로그인하세요.");
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

function toggleAttendanceForCurrentUser(session) {
  if (!session || session.role !== "student") {
    throwHttpError(403, "학생만 출석 체크를 할 수 있습니다.");
  }

  throwHttpError(410, "출석 체크는 프론트엔드에서만 처리됩니다. 페이지를 새로고침해주세요.");
}

