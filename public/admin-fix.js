const adminFixState = {
  draftStudents: [],
  searchQuery: "",
  gradeFilter: "",
  roomFilter: "",
  dashboardUsers: [],
  dashboardLoading: false,
  dashboardLoaded: false,
};

const ADMIN_PHONE_BORROWING_ENABLED = false;
const adminProfileSaveTimers = new Map();
const adminConfiscationSaveTimers = new Map();

function getAdminTableColumnCount() {
  return ADMIN_PHONE_BORROWING_ENABLED ? 5 : 4;
}

function normalizeAdminFixRoom(room) {
  const normalizedRoom = String(room || "").trim();
  if (state.roomChoices.includes(normalizedRoom)) {
    return normalizedRoom;
  }

  for (const candidate of state.roomChoices) {
    const occupancy = state.people.filter((person) => person.room === candidate).length;
    if (occupancy < 4) {
      return candidate;
    }
  }

  return state.roomChoices[0] || "201";
}

function buildAdminRoomFilterOptions(selectedRoom = "") {
  const baseOption = `<option value="">전체 호실</option>`;
  const roomOptions = state.roomChoices
    .map((room) => {
      const isSelected = room === selectedRoom ? " selected" : "";
      return `<option value="${escapeHtml(room)}"${isSelected}>${escapeHtml(room)}호</option>`;
    })
    .join("");

  return `${baseOption}${roomOptions}`;
}

function ensureAdminFilters() {
  elements.adminSearchInput = document.querySelector("#adminSearchInput");
  elements.adminGradeFilterInput = document.querySelector("#adminGradeFilterInput");
  elements.adminRoomFilterInput = document.querySelector("#adminRoomFilterInput");
  elements.adminStudentRows = document.querySelector("#adminStudentRows");
  ensureAdminTableHeader();

  if (elements.adminSearchInput && elements.adminSearchInput.dataset.adminFilterBound !== "true") {
    elements.adminSearchInput.addEventListener("input", handleAdminFilterChange);
    elements.adminSearchInput.dataset.adminFilterBound = "true";
  }

  if (elements.adminGradeFilterInput && elements.adminGradeFilterInput.dataset.adminFilterBound !== "true") {
    elements.adminGradeFilterInput.addEventListener("change", handleAdminFilterChange);
    elements.adminGradeFilterInput.dataset.adminFilterBound = "true";
  }

  if (elements.adminRoomFilterInput) {
    elements.adminRoomFilterInput.innerHTML = buildAdminRoomFilterOptions(adminFixState.roomFilter);
    if (elements.adminRoomFilterInput.dataset.adminFilterBound !== "true") {
      elements.adminRoomFilterInput.addEventListener("change", handleAdminFilterChange);
      elements.adminRoomFilterInput.dataset.adminFilterBound = "true";
    }
  }

  if (elements.adminSearchInput && elements.adminSearchInput.value !== adminFixState.searchQuery) {
    elements.adminSearchInput.value = adminFixState.searchQuery;
  }

  if (elements.adminGradeFilterInput && elements.adminGradeFilterInput.value !== adminFixState.gradeFilter) {
    elements.adminGradeFilterInput.value = adminFixState.gradeFilter;
  }

  if (elements.adminRoomFilterInput && elements.adminRoomFilterInput.value !== adminFixState.roomFilter) {
    elements.adminRoomFilterInput.value = adminFixState.roomFilter;
  }

  if (elements.adminStudentRows && elements.adminStudentRows.dataset.adminInlineEditBound !== "true") {
    elements.adminStudentRows.addEventListener("input", handleAdminStudentFieldInput);
    elements.adminStudentRows.addEventListener("change", handleAdminStudentFieldChange);
    elements.adminStudentRows.addEventListener("focusout", handleAdminStudentFieldBlur);
    elements.adminStudentRows.addEventListener("keydown", handleAdminStudentFieldKeydown);
    elements.adminStudentRows.dataset.adminInlineEditBound = "true";
  }
}

function ensureAdminTableHeader() {
  const headerRow = document.querySelector("#adminTab table thead tr");
  if (!headerRow || headerRow.dataset.adminToneApplied === "true") {
    return;
  }

  headerRow.dataset.adminToneApplied = "true";
  headerRow.innerHTML = `
    <th>이름</th>
    <th>호실</th>
    <th>학년</th>
    ${ADMIN_PHONE_BORROWING_ENABLED ? "<th>핸드폰 압수</th>" : ""}
    <th>관리</th>
  `;
}

function normalizeAdminSearchQuery(value) {
  return String(value || "").trim().toLocaleLowerCase("ko-KR");
}

function hasActiveAdminFilters() {
  return Boolean(adminFixState.searchQuery.trim() || adminFixState.gradeFilter || adminFixState.roomFilter);
}

function matchesAdminSearchQuery(name) {
  const keyword = normalizeAdminSearchQuery(adminFixState.searchQuery);
  if (!keyword) {
    return true;
  }

  return normalizeAdminSearchQuery(name).includes(keyword);
}

function matchesAdminGradeFilter(grade) {
  if (!adminFixState.gradeFilter) {
    return true;
  }

  return Number(grade) === Number(adminFixState.gradeFilter);
}

function matchesAdminRoomFilter(room) {
  if (!adminFixState.roomFilter) {
    return true;
  }

  return String(room || "").trim() === adminFixState.roomFilter;
}

function normalizeAdminPhoneConfiscation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !value.active) {
    return {
      active: false,
      availableDate: "",
      availableAt: null,
      availableLabel: "",
      days: 0,
      daysRemaining: 0,
    };
  }

  const daysRemaining = Math.max(0, Number(value.daysRemaining ?? value.days ?? 0));
  const availableLabel = normalizeAdminDateTimeLabel(value.availableLabel || value.availableAt || value.availableDate || value.untilDate || "");
  return {
    active: daysRemaining > 0,
    availableDate: String(value.availableDate || value.untilDate || ""),
    availableAt: typeof value.availableAt === "string" ? value.availableAt : null,
    availableLabel,
    days: Math.max(0, Number(value.days || daysRemaining)),
    daysRemaining,
  };
}

function getAdminDashboardUser(name) {
  const targetName = String(name || "").trim();
  return adminFixState.dashboardUsers.find((user) => user && user.name === targetName) || null;
}

function getAdminPhoneConfiscation(name) {
  return normalizeAdminPhoneConfiscation(getAdminDashboardUser(name)?.phoneConfiscation);
}

function renderAdminConfiscationStatus(name) {
  const phoneConfiscation = getAdminPhoneConfiscation(name);
  if (!phoneConfiscation.active) {
    return "";
  }

  return `
    <span class="admin-confiscation-badge is-active">압수 중</span>
    <span class="admin-confiscation-detail">${phoneConfiscation.daysRemaining}일 남음</span>
  `;
}

function getAdminConfiscationInputValue(name) {
  const phoneConfiscation = getAdminPhoneConfiscation(name);
  return phoneConfiscation.active ? phoneConfiscation.daysRemaining : 0;
}

function formatAdminDateTime(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day || !values.hour || !values.minute) {
    return "";
  }

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function normalizeAdminDateTimeLabel(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text} 00:00`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  return formatAdminDateTime(date);
}

function getAdminConfiscationEndLabel(days) {
  const normalizedDays = Number(days);
  if (!Number.isInteger(normalizedDays) || normalizedDays <= 0) {
    return "";
  }

  return formatAdminDateTime(new Date(Date.now() + normalizedDays * 24 * 60 * 60 * 1000));
}

function renderAdminConfiscationEndPreview(days) {
  const endLabel = getAdminConfiscationEndLabel(days);
  return endLabel ? `${escapeHtml(endLabel)} 종료` : "";
}

function renderAdminConfiscationEndPreviewForName(name, days) {
  const phoneConfiscation = getAdminPhoneConfiscation(name);
  const normalizedDays = Number(days);
  if (
    phoneConfiscation.active &&
    phoneConfiscation.availableLabel &&
    normalizedDays === phoneConfiscation.daysRemaining
  ) {
    return `${escapeHtml(phoneConfiscation.availableLabel)} 종료`;
  }

  return renderAdminConfiscationEndPreview(days);
}

function updateAdminConfiscationEndPreview(row) {
  if (!ADMIN_PHONE_BORROWING_ENABLED) {
    return;
  }

  const input = row?.querySelector("[data-admin-confiscation-days]");
  const preview = row?.querySelector("[data-admin-confiscation-preview]");
  if (!input || !preview) {
    return;
  }

  const previewText = renderAdminConfiscationEndPreview(Number(input.value || 0));
  preview.innerHTML = previewText;
  preview.classList.toggle("hidden", !previewText);
}

function readAdminConfiscationDays(row) {
  const input = row?.querySelector("[data-admin-confiscation-days]");
  const rawValue = String(input?.value ?? "").trim();
  if (!rawValue) {
    return null;
  }

  const days = Number(rawValue);
  return Number.isInteger(days) ? days : null;
}

function upsertAdminDashboardPhoneConfiscation(name, phoneConfiscation) {
  const targetName = String(name || "").trim();
  if (!targetName) {
    return;
  }

  const existingUser = getAdminDashboardUser(targetName);
  if (existingUser) {
    existingUser.phoneConfiscation = phoneConfiscation;
    return;
  }

  adminFixState.dashboardUsers.push({
    name: targetName,
    phoneConfiscation,
  });
}

function updateAdminConfiscationRow(row, name) {
  const input = row?.querySelector("[data-admin-confiscation-days]");
  const preview = row?.querySelector("[data-admin-confiscation-preview]");
  if (input && preview) {
    const previewText = renderAdminConfiscationEndPreviewForName(name, Number(input.value || 0));
    preview.innerHTML = previewText;
    preview.classList.toggle("hidden", !previewText);
  }
}

function clearQueuedAdminConfiscationSave(name) {
  const targetName = String(name || "").trim();
  const timerId = adminConfiscationSaveTimers.get(targetName);
  if (!timerId) {
    return;
  }

  window.clearTimeout(timerId);
  adminConfiscationSaveTimers.delete(targetName);
}

function queueAdminConfiscationSave(row) {
  if (!ADMIN_PHONE_BORROWING_ENABLED) {
    return;
  }

  const name = String(row?.dataset.adminName || "").trim();
  const days = readAdminConfiscationDays(row);
  if (!name || days === null) {
    return;
  }

  clearQueuedAdminConfiscationSave(name);
  const timerId = window.setTimeout(() => {
    adminConfiscationSaveTimers.delete(name);
    saveAdminPhoneConfiscation(name, false, { silent: true });
  }, 500);
  adminConfiscationSaveTimers.set(name, timerId);
}

function flushAdminConfiscationSave(row) {
  if (!ADMIN_PHONE_BORROWING_ENABLED) {
    return;
  }

  const name = String(row?.dataset.adminName || "").trim();
  const days = readAdminConfiscationDays(row);
  if (!name || days === null) {
    return;
  }

  clearQueuedAdminConfiscationSave(name);
  saveAdminPhoneConfiscation(name, false, { silent: true });
}

async function requestAdminDashboardSnapshot(force = false) {
  if (!ADMIN_PHONE_BORROWING_ENABLED) {
    return;
  }

  if (state.userRole !== "warden" || !state.authenticated || adminFixState.dashboardLoading) {
    return;
  }

  if (!force && adminFixState.dashboardLoaded) {
    return;
  }

  adminFixState.dashboardLoading = true;
  try {
    const payload = await fetchJson("/api/dashboard");
    adminFixState.dashboardUsers = Array.isArray(payload.users) ? payload.users : [];
    adminFixState.dashboardLoaded = true;
    renderAdminStudentRows();
  } catch (error) {
    adminFixState.dashboardLoaded = false;
  } finally {
    adminFixState.dashboardLoading = false;
  }
}

function handleAdminFilterChange() {
  adminFixState.searchQuery = String(elements.adminSearchInput?.value || "");
  adminFixState.gradeFilter = String(elements.adminGradeFilterInput?.value || "");
  adminFixState.roomFilter = String(elements.adminRoomFilterInput?.value || "");
  syncAdminDraftStudentsFromDom();
  renderAdminStudentRows();
}

function createAdminDraftStudent() {
  return {
    id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    room: normalizeAdminFixRoom(""),
    grade: 1,
  };
}

function populateAdminControls() {
  adminFixState.draftStudents = adminFixState.draftStudents.map((draft) => ({
    ...draft,
    room: normalizeAdminFixRoom(draft.room),
    grade: [1, 2, 3].includes(Number(draft.grade)) ? Number(draft.grade) : 1,
  }));

  if (adminFixState.roomFilter && !state.roomChoices.includes(adminFixState.roomFilter)) {
    adminFixState.roomFilter = "";
  }

  ensureAdminFilters();
}

function syncAdminDraftStudentsFromDom() {
  const rows = Array.from(elements.adminStudentRows?.querySelectorAll("[data-admin-draft-id]") || []);
  if (rows.length === 0) {
    return;
  }

  adminFixState.draftStudents = rows.map((row) => ({
    id: String(row.dataset.adminDraftId || ""),
    name: String(row.querySelector("[data-admin-draft-name]")?.value || "").trim(),
    room: String(row.querySelector("[data-admin-draft-room]")?.value || normalizeAdminFixRoom("")).trim(),
    grade: Number(row.querySelector("[data-admin-draft-grade]")?.value || 1),
  }));
}

function renderAdminDraftStudentRow(draft) {
  const confiscationCell = ADMIN_PHONE_BORROWING_ENABLED ? '<td><span class="admin-confiscation-muted">추가 후 설정</span></td>' : "";

  return `
    <tr data-admin-draft-id="${escapeHtml(draft.id)}" class="admin-draft-row">
      <td><input type="text" class="text-input" data-admin-draft-name placeholder="이름" value="${escapeHtml(draft.name || "")}" /></td>
      <td>
        <select class="text-input" data-admin-draft-room>
          ${buildAdminRoomOptions(normalizeAdminFixRoom(draft.room))}
        </select>
      </td>
      <td>
        <select class="text-input" data-admin-draft-grade>
          ${buildAdminGradeOptions(Number(draft.grade || 1))}
        </select>
      </td>
      ${confiscationCell}
      <td>
        <div class="admin-cell-actions">
          <button type="button" data-admin-draft-save="${escapeHtml(draft.id)}">저장</button>
          <button type="button" data-admin-draft-cancel="${escapeHtml(draft.id)}">취소</button>
        </div>
      </td>
    </tr>
  `;
}

function renderAdminStudentRows() {
  ensureAdminFilters();
  if (!elements.adminStudentRows) {
    return;
  }
  requestAdminDashboardSnapshot();

  const people = [...state.people]
    .filter((person) => matchesAdminSearchQuery(person.name))
    .filter((person) => matchesAdminGradeFilter(person.grade))
    .filter((person) => matchesAdminRoomFilter(person.room))
    .sort((left, right) => {
      if (left.room !== right.room) {
        return left.room.localeCompare(right.room);
      }
      if (Number(left.slot) !== Number(right.slot)) {
        return Number(left.slot) - Number(right.slot);
      }
      return left.name.localeCompare(right.name, "ko");
    });

  const rows = [
    ...adminFixState.draftStudents.map(renderAdminDraftStudentRow),
    ...people.map((person) => {
      const confiscationDays = getAdminConfiscationInputValue(person.name);
      const confiscationEndPreview = renderAdminConfiscationEndPreviewForName(person.name, confiscationDays);
      const confiscationEndPreviewClass = confiscationEndPreview
        ? "admin-confiscation-end-preview"
        : "admin-confiscation-end-preview hidden";
      const confiscationCell = ADMIN_PHONE_BORROWING_ENABLED
        ? `
          <td>
            <div class="admin-confiscation-control">
              <div class="admin-confiscation-actions">
                <div class="admin-confiscation-duration-wrap">
                  <label class="admin-confiscation-days-field">
                    <input
                      type="number"
                      class="text-input admin-confiscation-days-input"
                      data-admin-confiscation-days="${escapeHtml(person.name)}"
                      min="0"
                      max="365"
                      step="1"
                      value="${confiscationDays}"
                      aria-label="${escapeHtml(person.name)} 핸드폰 압수 기간"
                    />
                    <span class="admin-confiscation-days-unit">일</span>
                  </label>
                  <span class="${confiscationEndPreviewClass}" data-admin-confiscation-preview>${confiscationEndPreview}</span>
                </div>
              </div>
            </div>
          </td>
        `
        : "";
      return `
        <tr data-admin-name="${escapeHtml(person.name)}">
          <td>
            <input
              type="text"
              class="text-input admin-profile-name-input"
              data-admin-name-input="${escapeHtml(person.name)}"
              value="${escapeHtml(person.name)}"
              placeholder="이름"
              autocomplete="off"
              spellcheck="false"
            />
          </td>
          <td>
            <select class="text-input admin-profile-select" data-admin-room-input="${escapeHtml(person.name)}">
              ${buildAdminRoomOptions(String(person.room || state.roomChoices[0] || ""))}
            </select>
          </td>
          <td>
            <select class="text-input admin-profile-select" data-admin-grade-input="${escapeHtml(person.name)}">
              ${buildAdminGradeOptions(Number(person.grade || 1))}
            </select>
          </td>
          ${confiscationCell}
          <td><button type="button" data-admin-delete="${escapeHtml(person.name)}">삭제</button></td>
        </tr>
      `;
    }),
  ];

  if (rows.length === 0) {
    const emptyMessage = hasActiveAdminFilters() ? "조건에 맞는 학생이 없습니다." : "학생 데이터가 없습니다.";
    elements.adminStudentRows.innerHTML = `
      <tr>
        <td colspan="${getAdminTableColumnCount()}" class="empty-row">${escapeHtml(emptyMessage)}</td>
      </tr>
    `;
    return;
  }

  elements.adminStudentRows.innerHTML = rows.join("");
}

async function addStudent() {
  if (state.userRole !== "warden") {
    setMessage("사감 모드에서만 가능합니다.", true);
    return;
  }

  syncAdminDraftStudentsFromDom();
  const draft = createAdminDraftStudent();
  adminFixState.draftStudents.unshift(draft);
  renderAdminStudentRows();
  elements.adminStudentRows
    ?.querySelector(`[data-admin-draft-id="${CSS.escape(draft.id)}"] [data-admin-draft-name]`)
    ?.focus();
}

function handleAdminStudentAction(event) {
  const draftSaveButton = event.target.closest("[data-admin-draft-save]");
  if (draftSaveButton) {
    const draftId = String(draftSaveButton.dataset.adminDraftSave || "").trim();
    if (draftId) {
      saveDraftStudentById(draftId);
    }
    return;
  }

  const draftCancelButton = event.target.closest("[data-admin-draft-cancel]");
  if (draftCancelButton) {
    const draftId = String(draftCancelButton.dataset.adminDraftCancel || "").trim();
    if (draftId) {
      cancelDraftStudentById(draftId);
    }
    return;
  }

  const confiscationSaveButton = event.target.closest("[data-admin-confiscation-save]");
  if (confiscationSaveButton) {
    const name = String(confiscationSaveButton.dataset.adminConfiscationSave || "").trim();
    if (name) {
      saveAdminPhoneConfiscation(name, false);
    }
    return;
  }

  const confiscationClearButton = event.target.closest("[data-admin-confiscation-clear]");
  if (confiscationClearButton) {
    const name = String(confiscationClearButton.dataset.adminConfiscationClear || "").trim();
    if (name) {
      saveAdminPhoneConfiscation(name, true);
    }
    return;
  }

  const deleteButton = event.target.closest("[data-admin-delete]");
  if (!deleteButton) {
    return;
  }

  const name = String(deleteButton.dataset.adminDelete || "").trim();
  if (!name) {
    return;
  }

  if (!window.confirm(`${name} 학생을 삭제할까요?`)) {
    return;
  }

  deleteStudentByName(name);
}

function handleAdminStudentFieldChange(event) {
  const draftRow = event.target.closest("tr[data-admin-draft-id]");
  if (draftRow) {
    syncAdminDraftStudentsFromDom();
    return;
  }

  const row = event.target.closest("tr[data-admin-name]");
  if (!row) {
    return;
  }

  const changedRoom = event.target.closest("[data-admin-room-input]");
  const changedGrade = event.target.closest("[data-admin-grade-input]");
  if (!changedRoom && !changedGrade) {
    return;
  }

  const name = String(row.dataset.adminName || "").trim();
  const room = String(row.querySelector("[data-admin-room-input]")?.value || "").trim();
  const grade = Number(row.querySelector("[data-admin-grade-input]")?.value || 0);
  if (!name) {
    return;
  }

  updateStudentProfileByName(name, room, grade);
}

async function saveDraftStudentById(draftId) {
  syncAdminDraftStudentsFromDom();
  const draft = adminFixState.draftStudents.find((candidate) => candidate.id === draftId);
  if (!draft) {
    return;
  }

  if (!draft.name) {
    setMessage("학생 이름을 입력하세요.", true);
    return;
  }

  if (!draft.room) {
    setMessage("호실을 선택하세요.", true);
    return;
  }

  if (![1, 2, 3].includes(Number(draft.grade))) {
    setMessage("학년은 1, 2, 3만 가능합니다.", true);
    return;
  }

  try {
    await fetchJson("/api/admin/students", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: draft.name,
        room: draft.room,
        grade: Number(draft.grade),
      }),
    });
    adminFixState.draftStudents = adminFixState.draftStudents.filter((candidate) => candidate.id !== draftId);
    await loadProtectedData();
    switchTab("admin");
    setMessage("학생을 추가했습니다.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

function cancelDraftStudentById(draftId) {
  syncAdminDraftStudentsFromDom();
  adminFixState.draftStudents = adminFixState.draftStudents.filter((candidate) => candidate.id !== draftId);
  renderAdminStudentRows();
}

async function updateStudentProfileByName(name, room, grade) {
  try {
    await fetchJson(`/api/admin/students/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ room, grade }),
    });
    await loadProtectedData();
    switchTab("admin");
    setMessage("학생 정보를 수정했습니다.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ensureAdminFilters);
} else {
  ensureAdminFilters();
}

function renderAdminStudentRows() {
  ensureAdminFilters();
  if (!elements.adminStudentRows) {
    return;
  }
  requestAdminDashboardSnapshot();

  const people = [...state.people]
    .filter((person) => matchesAdminSearchQuery(person.name))
    .filter((person) => matchesAdminGradeFilter(person.grade))
    .filter((person) => matchesAdminRoomFilter(person.room))
    .sort((left, right) => {
      if (left.room !== right.room) {
        return left.room.localeCompare(right.room);
      }
      if (Number(left.slot) !== Number(right.slot)) {
        return Number(left.slot) - Number(right.slot);
      }
      return left.name.localeCompare(right.name, "ko");
    });

  const rows = [
    ...adminFixState.draftStudents.map(renderAdminDraftStudentRow),
    ...people.map((person) => {
      const confiscationDays = getAdminConfiscationInputValue(person.name);
      const confiscationEndPreview = renderAdminConfiscationEndPreviewForName(person.name, confiscationDays);
      const confiscationEndPreviewClass = confiscationEndPreview
        ? "admin-confiscation-end-preview"
        : "admin-confiscation-end-preview hidden";
      const confiscationCell = ADMIN_PHONE_BORROWING_ENABLED
        ? `
          <td>
            <div class="admin-confiscation-control">
              <div class="admin-confiscation-actions">
                <div class="admin-confiscation-duration-wrap">
                  <label class="admin-confiscation-days-field">
                    <input
                      type="number"
                      class="text-input admin-confiscation-days-input"
                      data-admin-confiscation-days="${escapeHtml(person.name)}"
                      min="0"
                      max="365"
                      step="1"
                      value="${confiscationDays}"
                      aria-label="${escapeHtml(person.name)} 핸드폰 압수 기간"
                    />
                    <span class="admin-confiscation-days-unit">일</span>
                  </label>
                  <span class="${confiscationEndPreviewClass}" data-admin-confiscation-preview>${confiscationEndPreview}</span>
                </div>
              </div>
            </div>
          </td>
        `
        : "";
      return `
        <tr data-admin-name="${escapeHtml(person.name)}">
          <td>
            <input
              type="text"
              class="text-input admin-profile-name-input"
              data-admin-name-input="${escapeHtml(person.name)}"
              value="${escapeHtml(person.name)}"
              placeholder="이름"
              autocomplete="off"
              spellcheck="false"
            />
          </td>
          <td>
            <select class="text-input admin-profile-select" data-admin-room-input="${escapeHtml(person.name)}">
              ${buildAdminRoomOptions(String(person.room || state.roomChoices[0] || ""))}
            </select>
          </td>
          <td>
            <select class="text-input admin-profile-select" data-admin-grade-input="${escapeHtml(person.name)}">
              ${buildAdminGradeOptions(Number(person.grade || 1))}
            </select>
          </td>
          ${confiscationCell}
          <td>
            <button type="button" class="admin-delete-button" data-admin-delete="${escapeHtml(person.name)}">삭제</button>
          </td>
        </tr>
      `;
    }),
  ];

  if (rows.length === 0) {
    const emptyMessage = hasActiveAdminFilters() ? "조건에 맞는 학생이 없습니다." : "학생 데이터가 없습니다.";
    elements.adminStudentRows.innerHTML = `
      <tr>
        <td colspan="${getAdminTableColumnCount()}" class="empty-row">${escapeHtml(emptyMessage)}</td>
      </tr>
    `;
    return;
  }

  elements.adminStudentRows.innerHTML = rows.join("");
}

function handleAdminStudentAction(event) {
  const draftSaveButton = event.target.closest("[data-admin-draft-save]");
  if (draftSaveButton) {
    const draftId = String(draftSaveButton.dataset.adminDraftSave || "").trim();
    if (draftId) {
      saveDraftStudentById(draftId);
    }
    return;
  }

  const draftCancelButton = event.target.closest("[data-admin-draft-cancel]");
  if (draftCancelButton) {
    const draftId = String(draftCancelButton.dataset.adminDraftCancel || "").trim();
    if (draftId) {
      cancelDraftStudentById(draftId);
    }
    return;
  }

  const confiscationSaveButton = event.target.closest("[data-admin-confiscation-save]");
  if (confiscationSaveButton) {
    const name = String(confiscationSaveButton.dataset.adminConfiscationSave || "").trim();
    if (name) {
      saveAdminPhoneConfiscation(name, false);
    }
    return;
  }

  const confiscationClearButton = event.target.closest("[data-admin-confiscation-clear]");
  if (confiscationClearButton) {
    const name = String(confiscationClearButton.dataset.adminConfiscationClear || "").trim();
    if (name) {
      saveAdminPhoneConfiscation(name, true);
    }
    return;
  }

  const deleteButton = event.target.closest("[data-admin-delete]");
  if (!deleteButton) {
    return;
  }

  const name = String(deleteButton.dataset.adminDelete || "").trim();
  if (!name) {
    return;
  }

  if (!window.confirm(`${name} 학생을 삭제할까요?`)) {
    return;
  }

  deleteStudentByName(name);
}

async function saveAdminPhoneConfiscation(name, clear = false, options = {}) {
  const { silent = false } = options;
  if (!ADMIN_PHONE_BORROWING_ENABLED) {
    return;
  }

  if (state.userRole !== "warden" || !state.authenticated) {
    setMessage("사감 모드에서만 사용할 수 있습니다.", true);
    return;
  }

  const targetName = String(name || "").trim();
  const row = elements.adminStudentRows?.querySelector(`tr[data-admin-name="${CSS.escape(targetName)}"]`);
  const input = row?.querySelector("[data-admin-confiscation-days]");
  if (!clear && !input) {
    return;
  }

  const days = clear ? 0 : Number(input?.value || 0);
  if (!targetName) {
    return;
  }

  if (!clear && (!Number.isInteger(days) || days < 0 || days > 365)) {
    setMessage("압수 기간은 0일부터 365일 사이로 입력해주세요.", true);
    return;
  }

  try {
    const payload = await fetchJson(`/api/admin/phone-confiscations/${encodeURIComponent(targetName)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(clear || days === 0 ? { clear: true, days: 0 } : { days }),
    });
    upsertAdminDashboardPhoneConfiscation(payload.name || targetName, payload.phoneConfiscation);
    updateAdminConfiscationRow(row, payload.name || targetName);
    if (typeof refreshDashboard === "function") {
      await refreshDashboard();
    }
    if (!silent) {
      setMessage(clear || days === 0 ? "핸드폰 압수를 해제했습니다." : "핸드폰 압수 기간을 설정했습니다.");
    }
  } catch (error) {
    setMessage(error.message, true);
  }
}

function getAdminRowProfileValues(row) {
  return {
    originalName: String(row.dataset.adminName || "").trim(),
    nextName: String(row.querySelector("[data-admin-name-input]")?.value || "").trim(),
    room: String(row.querySelector("[data-admin-room-input]")?.value || "").trim(),
    grade: Number(row.querySelector("[data-admin-grade-input]")?.value || 0),
  };
}

function clearQueuedAdminProfileUpdate(originalName) {
  const timerId = adminProfileSaveTimers.get(originalName);
  if (!timerId) {
    return;
  }

  window.clearTimeout(timerId);
  adminProfileSaveTimers.delete(originalName);
}

function queueAdminProfileUpdate(row) {
  const { originalName, nextName, room, grade } = getAdminRowProfileValues(row);
  if (!originalName || !nextName || !room || ![1, 2, 3].includes(grade)) {
    return;
  }

  clearQueuedAdminProfileUpdate(originalName);
  const timerId = window.setTimeout(() => {
    adminProfileSaveTimers.delete(originalName);
    updateStudentProfileByName(originalName, nextName, room, grade);
  }, 400);
  adminProfileSaveTimers.set(originalName, timerId);
}

function flushAdminProfileUpdate(row) {
  const { originalName, nextName, room, grade } = getAdminRowProfileValues(row);
  if (!originalName || !nextName || !room || ![1, 2, 3].includes(grade)) {
    return;
  }

  clearQueuedAdminProfileUpdate(originalName);
  updateStudentProfileByName(originalName, nextName, room, grade);
}

function handleAdminStudentFieldInput(event) {
  const draftRow = event.target.closest("tr[data-admin-draft-id]");
  if (draftRow) {
    syncAdminDraftStudentsFromDom();
    return;
  }

  if (event.target.closest("[data-admin-confiscation-days]")) {
    const row = event.target.closest("tr[data-admin-name]");
    updateAdminConfiscationEndPreview(row);
    queueAdminConfiscationSave(row);
    return;
  }

  if (!event.target.closest("[data-admin-name-input]")) {
    return;
  }

  const row = event.target.closest("tr[data-admin-name]");
  if (!row) {
    return;
  }

  queueAdminProfileUpdate(row);
}

function handleAdminStudentFieldChange(event) {
  const draftRow = event.target.closest("tr[data-admin-draft-id]");
  if (draftRow) {
    syncAdminDraftStudentsFromDom();
    return;
  }

  const row = event.target.closest("tr[data-admin-name]");
  if (!row) {
    return;
  }

  if (event.target.closest("[data-admin-confiscation-days]")) {
    updateAdminConfiscationEndPreview(row);
    flushAdminConfiscationSave(row);
    return;
  }

  if (
    event.target.closest("[data-admin-room-input]") ||
    event.target.closest("[data-admin-grade-input]") ||
    event.target.closest("[data-admin-name-input]")
  ) {
    flushAdminProfileUpdate(row);
  }
}

function handleAdminStudentFieldBlur(event) {
  if (event.target.closest("[data-admin-confiscation-days]")) {
    flushAdminConfiscationSave(event.target.closest("tr[data-admin-name]"));
    return;
  }

  if (!event.target.closest("[data-admin-name-input]")) {
    return;
  }

  const row = event.target.closest("tr[data-admin-name]");
  if (!row) {
    return;
  }

  flushAdminProfileUpdate(row);
}

function handleAdminStudentFieldKeydown(event) {
  if (event.key === "Enter" && event.target.closest("[data-admin-confiscation-days]")) {
    event.preventDefault();
    const row = event.target.closest("tr[data-admin-name]");
    flushAdminConfiscationSave(row);
    event.target.blur();
    return;
  }

  if (event.key !== "Enter" || !event.target.closest("[data-admin-name-input]")) {
    return;
  }

  event.preventDefault();
  const row = event.target.closest("tr[data-admin-name]");
  if (!row) {
    return;
  }

  flushAdminProfileUpdate(row);
}

async function updateStudentProfileByName(originalName, nextNameOrRoom, roomOrGrade, maybeGrade) {
  const usesLegacySignature = maybeGrade === undefined;
  const nextName = usesLegacySignature ? originalName : nextNameOrRoom;
  const room = usesLegacySignature ? nextNameOrRoom : roomOrGrade;
  const grade = usesLegacySignature ? roomOrGrade : maybeGrade;

  try {
    await fetchJson(`/api/admin/students/${encodeURIComponent(originalName)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: nextName, room, grade }),
    });
    clearQueuedAdminProfileUpdate(originalName);
    await loadProtectedData();
    switchTab("admin");
  } catch (error) {
    setMessage(error.message, true);
  }
}
