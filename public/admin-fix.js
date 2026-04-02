const adminFixState = {
  draftStudents: [],
  searchQuery: "",
  gradeFilter: "",
  roomFilter: "",
};

const adminProfileSaveTimers = new Map();

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
    ...people.map(
      (person) => `
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
          <td><button type="button" data-admin-delete="${escapeHtml(person.name)}">삭제</button></td>
        </tr>
      `,
    ),
  ];

  if (rows.length === 0) {
    const emptyMessage = hasActiveAdminFilters() ? "조건에 맞는 학생이 없습니다." : "학생 데이터가 없습니다.";
    elements.adminStudentRows.innerHTML = `
      <tr>
        <td colspan="4" class="empty-row">${escapeHtml(emptyMessage)}</td>
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
    ...people.map(
      (person) => `
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
          <td>
            <button type="button" class="admin-delete-button" data-admin-delete="${escapeHtml(person.name)}">삭제</button>
          </td>
        </tr>
      `,
    ),
  ];

  if (rows.length === 0) {
    const emptyMessage = hasActiveAdminFilters() ? "조건에 맞는 학생이 없습니다." : "학생 데이터가 없습니다.";
    elements.adminStudentRows.innerHTML = `
      <tr>
        <td colspan="4" class="empty-row">${escapeHtml(emptyMessage)}</td>
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

  if (
    event.target.closest("[data-admin-room-input]") ||
    event.target.closest("[data-admin-grade-input]") ||
    event.target.closest("[data-admin-name-input]")
  ) {
    flushAdminProfileUpdate(row);
  }
}

function handleAdminStudentFieldBlur(event) {
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
