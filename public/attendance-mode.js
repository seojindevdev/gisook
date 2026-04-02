function ensureExtendedState() {
  if (!Object.prototype.hasOwnProperty.call(state, "userRole")) {
    state.userRole = "student";
  }
  if (!Object.prototype.hasOwnProperty.call(state, "loginName")) {
    state.loginName = "";
  }
  if (!Object.prototype.hasOwnProperty.call(state, "messages")) {
    state.messages = [];
  }
  if (!Object.prototype.hasOwnProperty.call(state, "messageSenderName")) {
    state.messageSenderName = "";
  }
  if (!Object.prototype.hasOwnProperty.call(state, "authNames")) {
    state.authNames = [];
  }
  if (!Object.prototype.hasOwnProperty.call(state, "wardenName")) {
    state.wardenName = "사감";
  }
  if (!Object.prototype.hasOwnProperty.call(state, "roomChoices")) {
    state.roomChoices = [];
  }
  if (!Object.prototype.hasOwnProperty.call(state, "slotChoices")) {
    state.slotChoices = [];
  }
  if (!Object.prototype.hasOwnProperty.call(state, "dashboardAttendanceMode")) {
    state.dashboardAttendanceMode = localStorage.getItem("dashboardAttendanceMode") === "1";
  }
  if (!Object.prototype.hasOwnProperty.call(state, "dashboardAttendanceDateKey")) {
    state.dashboardAttendanceDateKey = "";
  }
}

function cacheElements() {
  ensureExtendedState();

  elements.authGate = document.querySelector("#authGate");
  elements.appShell = document.querySelector("#appShell");
  elements.authNameInput = document.querySelector("#authNameInput");
  elements.passwordInput = document.querySelector("#passwordInput");
  elements.loginButton = document.querySelector("#loginButton");
  elements.logoutButton = document.querySelector("#logoutButton");
  elements.authMessage = document.querySelector("#authMessage");
  elements.nameInput = document.querySelector("#nameInput");
  elements.loadUserButton = document.querySelector("#loadUserButton");
  elements.saveUserButton = document.querySelector("#saveUserButton");
  elements.roleBadge = document.querySelector("#roleBadge");
  elements.settingsTabButton = document.querySelector("#settingsTabButton");
  elements.overnightTabButton = document.querySelector("#overnightTabButton");
  elements.dashboardTabButton = document.querySelector("#dashboardTabButton");
  elements.passwordTabButton = document.querySelector("#passwordTabButton");
  elements.messagesTabButton = document.querySelector("#messagesTabButton");
  elements.adminTabButton = document.querySelector("#adminTabButton");
  elements.settingsTab = document.querySelector("#settingsTab");
  elements.overnightTab = document.querySelector("#overnightTab");
  elements.dashboardTab = document.querySelector("#dashboardTab");
  elements.passwordTab = document.querySelector("#passwordTab");
  elements.messagesTab = document.querySelector("#messagesTab");
  elements.adminTab = document.querySelector("#adminTab");
  elements.dayTabs = document.querySelector("#dayTabs");
  elements.addRowButton = document.querySelector("#addRowButton");
  elements.clearRowsButton = document.querySelector("#clearRowsButton");
  elements.clearOvernightButton = document.querySelector("#clearOvernightButton");
  elements.scheduleRows = document.querySelector("#scheduleRows");
  elements.overnightRows = document.querySelector("#overnightRows");
  elements.chartContainer = document.querySelector("#chartContainer");
  elements.overnightChartContainer = document.querySelector("#overnightChartContainer");
  elements.dashboardFilters = document.querySelector("#dashboardFilters");
  elements.dashboardAttendanceModeInput = document.querySelector("#dashboardAttendanceModeInput");
  elements.summaryLine = document.querySelector("#summaryLine");
  elements.dashboardBoard = document.querySelector("#dashboardBoard");
  elements.currentPasswordInput = document.querySelector("#currentPasswordInput");
  elements.newPasswordInput = document.querySelector("#newPasswordInput");
  elements.confirmPasswordInput = document.querySelector("#confirmPasswordInput");
  elements.changePasswordButton = document.querySelector("#changePasswordButton");
  elements.messageComposer = document.querySelector("#messageComposer");
  elements.messageSenderInput = document.querySelector("#messageSenderInput");
  elements.wardenMessageInput = document.querySelector("#wardenMessageInput");
  elements.sendWardenMessageButton = document.querySelector("#sendWardenMessageButton");
  elements.messagesScopeLabel = document.querySelector("#messagesScopeLabel");
  elements.messageRows = document.querySelector("#messageRows");
  elements.adminNameInput = document.querySelector("#adminNameInput");
  elements.adminRoomInput = document.querySelector("#adminRoomInput");
  elements.adminSlotInput = document.querySelector("#adminSlotInput");
  elements.adminGradeInput = document.querySelector("#adminGradeInput");
  elements.adminPasswordInput = document.querySelector("#adminPasswordInput");
  elements.adminAddButton = document.querySelector("#adminAddButton");
  elements.adminStudentRows = document.querySelector("#adminStudentRows");
  elements.messageBox = document.querySelector("#messageBox");

  if (elements.dashboardAttendanceModeInput) {
    elements.dashboardAttendanceModeInput.checked = Boolean(state.dashboardAttendanceMode);
  }

  elements.chartTooltip = document.createElement("div");
  elements.chartTooltip.className = "chart-tooltip hidden";
  document.body.appendChild(elements.chartTooltip);
}

function bindEvents() {
  elements.loginButton.addEventListener("click", login);
  elements.logoutButton.addEventListener("click", logout);
  elements.authNameInput.addEventListener("change", () => {
    localStorage.setItem("authSelectedName", String(elements.authNameInput.value || "").trim());
  });
  elements.passwordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      login();
    }
  });

  elements.loadUserButton.addEventListener("click", () => loadUser(getSelectedNameInput()));
  if (elements.saveUserButton) {
    elements.saveUserButton.addEventListener("click", () => saveUser());
  }
  elements.nameInput.addEventListener("change", () => {
    loadUser(getSelectedNameInput());
  });
  elements.nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadUser(getSelectedNameInput());
    }
  });

  elements.settingsTabButton.addEventListener("click", () => switchTab("settings"));
  elements.overnightTabButton.addEventListener("click", () => switchTab("overnight"));
  elements.dashboardTabButton.addEventListener("click", () => switchTab("dashboard"));
  elements.passwordTabButton.addEventListener("click", () => switchTab("password"));
  elements.messagesTabButton.addEventListener("click", () => switchTab("messages"));
  elements.adminTabButton.addEventListener("click", () => switchTab("admin"));

  elements.dayTabs.addEventListener("click", handleDayButtonClick);
  elements.dashboardFilters.addEventListener("click", handleDashboardFilterClick);
  if (elements.dashboardAttendanceModeInput) {
    elements.dashboardAttendanceModeInput.addEventListener("change", handleDashboardAttendanceModeChange);
  }
  elements.dashboardBoard.addEventListener("click", handleDashboardBoardClick);

  elements.addRowButton.addEventListener("click", () => {
    const newRow = createEmptyRow();
    if (!newRow) {
      window.alert("같은 요일에 추가할 수 있는 빈 시간이 없습니다.");
      return;
    }

    state.intervals.push(newRow);
    renderScheduleRows();
    renderChart();
    queueAutoSave();
  });

  elements.clearRowsButton.addEventListener("click", () => {
    state.intervals = state.intervals.filter((interval) => interval.day !== state.selectedDay);
    renderScheduleRows();
    renderChart();
    queueAutoSave();
  });

  elements.clearOvernightButton.addEventListener("click", () => {
    state.overnights = [];
    renderOvernightRows();
    renderChart();
    queueAutoSave();
  });

  elements.scheduleRows.addEventListener("change", handleScheduleChange);
  elements.scheduleRows.addEventListener("input", handleScheduleChange);
  elements.scheduleRows.addEventListener("click", handleScheduleDelete);

  elements.overnightRows.addEventListener("input", handleOvernightChange);
  elements.overnightRows.addEventListener("click", handleOvernightCancel);

  elements.messageSenderInput.addEventListener("change", () => {
    state.messageSenderName = getSelectedMessageSender();
    if (state.userRole === "warden") {
      localStorage.setItem("messageSenderName", state.messageSenderName);
    }
    loadMessages();
  });
  elements.sendWardenMessageButton.addEventListener("click", sendWardenMessage);
  elements.changePasswordButton.addEventListener("click", changeOwnPassword);
  elements.adminAddButton.addEventListener("click", addStudent);
  elements.adminStudentRows.addEventListener("click", handleAdminStudentAction);
  elements.adminStudentRows.addEventListener("change", handleAdminStudentFieldChange);

  elements.chartContainer.addEventListener("mousemove", handleChartTooltipMove);
  elements.chartContainer.addEventListener("mouseleave", hideChartTooltip);
  elements.overnightChartContainer.addEventListener("mousemove", handleChartTooltipMove);
  elements.overnightChartContainer.addEventListener("mouseleave", hideChartTooltip);

  window.addEventListener("resize", debounce(renderChart, 120));
  window.addEventListener("pagehide", flushPendingSaveOnPageHide);
}

async function refreshDashboard() {
  try {
    const payload = await fetchJson("/api/dashboard");
    state.dashboardRooms = payload.rooms || [];
    state.dashboardAttendanceDateKey = payload.attendanceDateKey || "";
    updateDashboardFilterButtons();
    renderDashboardSummary();
    renderDashboardBoard();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function handleDashboardAttendanceModeChange() {
  state.dashboardAttendanceMode = Boolean(elements.dashboardAttendanceModeInput.checked);
  localStorage.setItem("dashboardAttendanceMode", state.dashboardAttendanceMode ? "1" : "0");
  if (state.dashboardAttendanceMode && ["OUT", "OVERNIGHT"].includes(state.dashboardFilter)) {
    state.dashboardFilter = "ALL";
  }
  updateDashboardFilterButtons();
  renderDashboardSummary();
  renderDashboardBoard();
}

function updateDashboardFilterButtons() {
  elements.dashboardFilters.querySelectorAll("[data-dashboard-filter]").forEach((button) => {
    const filter = String(button.dataset.dashboardFilter || "");
    const hideForAttendance = state.dashboardAttendanceMode && (filter === "OUT" || filter === "OVERNIGHT");
    button.classList.toggle("hidden", hideForAttendance);
    button.classList.toggle("is-active", !hideForAttendance && filter === state.dashboardFilter);
  });
}

function handleDashboardBoardClick(event) {
  const button = event.target.closest("[data-attendance-name]");
  if (!button) {
    return;
  }

  event.preventDefault();
  const name = String(button.dataset.attendanceName || "").trim();
  if (!name || name !== state.loginName || state.userRole !== "student") {
    return;
  }

  toggleAttendanceForCurrentUser();
}

async function toggleAttendanceForCurrentUser() {
  try {
    const payload = await fetchJson("/api/attendance/toggle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    await refreshDashboard();
    setMessage(payload.checked ? "출석체크했습니다." : "출석체크를 해제했습니다.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

function renderDashboardSummary() {
  const allUsers = state.dashboardRooms
    .flatMap((room) => room.occupants)
    .filter((occupant) => !occupant.empty);

  if (state.dashboardAttendanceMode) {
    const attendanceCount = allUsers.filter((user) => user.attendanceChecked).length;
    elements.summaryLine.textContent = `현재 출석 ${attendanceCount} / ${allUsers.length}`;
    return;
  }

  const visibleCount = getFilteredDashboardRooms().flatMap((room) => room.occupants).length;
  const total = allUsers.length;
  const present = allUsers.filter((user) => !user.isOut && !user.isPhoneOnly && !user.isOvernight).length;
  const out = allUsers.filter((user) => user.isOut).length;
  const phone = allUsers.filter((user) => user.isPhoneOnly).length;
  const overnight = allUsers.filter((user) => user.isOvernight).length;
  const visiblePrefix = state.dashboardFilter === "ALL" ? "" : `표시 ${visibleCount} / `;
  elements.summaryLine.textContent = `${visiblePrefix}전체 ${total} / 재실 ${present} / 외출 ${out} / 폰 ${phone} / 외박 ${overnight}`;
}

function canToggleAttendanceForOccupant(occupant) {
  return (
    state.dashboardAttendanceMode &&
    state.userRole === "student" &&
    !occupant.empty &&
    occupant.name === state.loginName
  );
}

function renderRoomSlot(occupant) {
  const isAttendanceMode = Boolean(state.dashboardAttendanceMode);
  const statusClass = occupant.empty
    ? "empty"
    : isAttendanceMode
      ? occupant.attendanceChecked
        ? "attendance-in"
        : "attendance-out"
      : occupant.isOvernight
        ? "overnight"
        : occupant.isOut
          ? "out"
          : occupant.isPhoneOnly
            ? "phone"
            : "in";

  const popover = occupant.empty
    ? ""
    : occupant.isOvernight
      ? `
          <div class="dashboard-popover">
            <div>외박</div>
            <div>사유: ${escapeHtml(occupant.currentOvernight?.reason || "없음")}</div>
          </div>
        `
      : occupant.isOut || occupant.isPhoneOnly
        ? `
            <div class="dashboard-popover">
              <div>${escapeHtml(occupant.isOut ? "외출" : "폰")}</div>
              <div>사유: ${escapeHtml(occupant.currentInterval?.reason || "없음")}</div>
              <div>폰: ${escapeHtml(occupant.currentInterval?.phone || "X")}</div>
            </div>
          `
        : "";

  const wrapClass = popover ? "slot-name-wrap has-popover" : "slot-name-wrap";
  const nameLabel = occupant.empty ? "" : occupant.name;
  const nameClass = occupant.empty ? `slot-name ${statusClass} blank` : `slot-name ${statusClass}`;
  const gradeLabel = occupant.empty || !Number.isInteger(occupant.grade) ? "" : String(occupant.grade);
  const canToggle = canToggleAttendanceForOccupant(occupant);
  const nameMarkup = occupant.empty
    ? `<div class="${nameClass}"></div>`
    : canToggle
      ? `<button type="button" class="${nameClass} slot-name-button" data-attendance-name="${escapeHtml(occupant.name)}">${escapeHtml(nameLabel)}</button>`
      : `<div class="${nameClass}">${escapeHtml(nameLabel)}</div>`;

  return `
    <div class="room-slot">
      <div class="slot-number">${gradeLabel}</div>
      <div class="${wrapClass}">
        ${nameMarkup}
        ${popover}
      </div>
    </div>
  `;
}

function shouldShowSaveButton() {
  return false;
}

function updateUserControlsVisibility() {
  const showUserPicker = shouldShowUserPicker();
  elements.nameInput.classList.toggle("hidden", !showUserPicker);
  elements.loadUserButton.classList.toggle("hidden", !showUserPicker);

  elements.nameInput.disabled = !showUserPicker;
  elements.loadUserButton.disabled = !showUserPicker;

  if (elements.saveUserButton) {
    elements.saveUserButton.classList.add("hidden");
    elements.saveUserButton.disabled = true;
  }
}

function buildAdminRoomOptions(selectedRoom = "") {
  return state.roomChoices
    .map((room) => {
      const isSelected = room === selectedRoom ? " selected" : "";
      return `<option value="${escapeHtml(room)}"${isSelected}>${escapeHtml(room)}호</option>`;
    })
    .join("");
}

function getNextAvailableAdminRoom() {
  for (const room of state.roomChoices) {
    const occupancy = state.people.filter((person) => person.room === room).length;
    if (occupancy < 4) {
      return room;
    }
  }

  return "";
}

function buildAdminGradeOptions(selectedGrade = 1) {
  return [1, 2, 3]
    .map((grade) => {
      const isSelected = Number(selectedGrade) === grade ? " selected" : "";
      return `<option value="${grade}"${isSelected}>${grade}학년</option>`;
    })
    .join("");
}

let attendanceModeAdminDraftStudents = [];

function createAdminDraftStudent() {
  return {
    id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    room: getNextAvailableAdminRoom() || state.roomChoices[0] || "201",
    grade: 1,
  };
}

function syncAdminDraftStudentsFromDom() {
  const rows = Array.from(elements.adminStudentRows?.querySelectorAll("[data-admin-draft-id]") || []);
  if (rows.length === 0) {
    return;
  }

  adminDraftStudents = rows.map((row) => ({
    id: String(row.dataset.adminDraftId || ""),
    name: String(row.querySelector("[data-admin-draft-name]")?.value || "").trim(),
    room: String(row.querySelector("[data-admin-draft-room]")?.value || "201").trim(),
    grade: Number(row.querySelector("[data-admin-draft-grade]")?.value || 1),
  }));
}

function renderAdminDraftStudentRow(draft) {
  return `
    <tr data-admin-draft-id="${escapeHtml(draft.id)}" class="admin-draft-row">
      <td><input type="text" class="text-input" data-admin-draft-name placeholder="이름" value="${escapeHtml(draft.name || "")}" /></td>
      <td>
        <select class="text-input" data-admin-draft-room>
          ${buildAdminRoomOptions(String(draft.room || getNextAvailableAdminRoom() || state.roomChoices[0] || "201"))}
        </select>
      </td>
      <td>
        <select data-admin-draft-grade>
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

function populateAdminControls() {
  adminDraftStudents = adminDraftStudents.map((draft) => ({
    ...draft,
    room: String(draft.room || "201"),
    grade: [1, 2, 3].includes(Number(draft.grade)) ? Number(draft.grade) : 1,
  }));
}

function renderAdminStudentRows() {
  const people = [...state.people].sort((left, right) => {
    if (left.room !== right.room) {
      return left.room.localeCompare(right.room);
    }
    if (Number(left.slot) !== Number(right.slot)) {
      return Number(left.slot) - Number(right.slot);
    }
    return left.name.localeCompare(right.name, "ko");
  });

  const rows = [
    ...adminDraftStudents.map(renderAdminDraftStudentRow),
    ...people.map(
      (person) => `
        <tr data-admin-name="${escapeHtml(person.name)}">
          <td>${escapeHtml(person.name)}</td>
          <td>
            <select class="text-input" data-admin-room-input="${escapeHtml(person.name)}">
              ${buildAdminRoomOptions(String(person.room || state.roomChoices[0] || ""))}
            </select>
          </td>
          <td>
            <select data-admin-grade-input="${escapeHtml(person.name)}">
              ${buildAdminGradeOptions(Number(person.grade || 1))}
            </select>
          </td>
          <td><button type="button" data-admin-delete="${escapeHtml(person.name)}">삭제</button></td>
        </tr>
      `,
    ),
  ];

  if (rows.length === 0) {
    elements.adminStudentRows.innerHTML = `
      <tr>
        <td colspan="4" class="empty-row">학생 데이터가 없습니다.</td>
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
  adminDraftStudents.unshift(createAdminDraftStudent());
  renderAdminStudentRows();
  elements.adminStudentRows.querySelector("[data-admin-draft-name]")?.focus();
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
  const draft = adminDraftStudents.find((candidate) => candidate.id === draftId);
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
    adminDraftStudents = adminDraftStudents.filter((candidate) => candidate.id !== draftId);
    await loadProtectedData();
    switchTab("admin");
    setMessage("학생을 추가했습니다.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

function cancelDraftStudentById(draftId) {
  syncAdminDraftStudentsFromDom();
  adminDraftStudents = adminDraftStudents.filter((candidate) => candidate.id !== draftId);
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

function shouldHideOutingTabs() {
  return false;
}

function resolveVisibleTab(tabName) {
  return tabName === "admin" && state.userRole !== "warden" ? "settings" : tabName;
}

function updateAttendanceModeTabVisibility() {
  const hidden = shouldHideOutingTabs();
  elements.settingsTabButton.classList.toggle("hidden", hidden);
  elements.overnightTabButton.classList.toggle("hidden", hidden);
}

function handleDashboardAttendanceModeChange() {
  state.dashboardAttendanceMode = Boolean(elements.dashboardAttendanceModeInput.checked);
  localStorage.setItem("dashboardAttendanceMode", state.dashboardAttendanceMode ? "1" : "0");

  if (shouldHideOutingTabs() && ["settings", "overnight"].includes(state.activeTab)) {
    switchTab("dashboard");
  } else {
    updateAttendanceModeTabVisibility();
    updateUserControlsVisibility();
  }

  renderDashboardSummary();
  renderDashboardBoard();
}

function shouldShowUserPicker() {
  return !shouldHideOutingTabs() && state.userRole === "warden" && ["settings", "overnight"].includes(state.activeTab);
}

function shouldShowSaveButton() {
  return !shouldHideOutingTabs() && ["settings", "overnight"].includes(state.activeTab);
}

function updateUserControlsVisibility() {
  const showUserPicker = shouldShowUserPicker();
  const showSaveButton = shouldShowSaveButton();

  elements.nameInput.classList.toggle("hidden", !showUserPicker);
  elements.loadUserButton.classList.toggle("hidden", !showUserPicker);
  elements.saveUserButton.classList.toggle("hidden", !showSaveButton);

  elements.nameInput.disabled = !showUserPicker;
  elements.loadUserButton.disabled = !showUserPicker;
  elements.saveUserButton.disabled = !showSaveButton;
}

function switchTab(tabName) {
  ensureExtendedState();
  const nextTab = resolveVisibleTab(tabName);
  state.activeTab = nextTab;

  elements.settingsTabButton.classList.toggle("is-active", nextTab === "settings");
  elements.overnightTabButton.classList.toggle("is-active", nextTab === "overnight");
  elements.dashboardTabButton.classList.toggle("is-active", nextTab === "dashboard");
  elements.passwordTabButton.classList.toggle("is-active", nextTab === "password");
  elements.messagesTabButton.classList.toggle("is-active", nextTab === "messages");
  elements.adminTabButton.classList.toggle("is-active", nextTab === "admin");

  elements.settingsTab.classList.toggle("is-active", nextTab === "settings");
  elements.overnightTab.classList.toggle("is-active", nextTab === "overnight");
  elements.dashboardTab.classList.toggle("is-active", nextTab === "dashboard");
  elements.passwordTab.classList.toggle("is-active", nextTab === "password");
  elements.messagesTab.classList.toggle("is-active", nextTab === "messages");
  elements.adminTab.classList.toggle("is-active", nextTab === "admin");

  updateAttendanceModeTabVisibility();
  updateUserControlsVisibility();

  if (nextTab !== "dashboard") {
    renderChart();
  }
}

function applyRoleMode() {
  const isWarden = state.userRole === "warden";
  elements.roleBadge.textContent = isWarden ? "사감 모드" : `학생 모드${state.loginName ? ` (${state.loginName})` : ""}`;
  elements.adminTabButton.classList.toggle("hidden", !isWarden);
  elements.adminTab.classList.toggle("hidden", !isWarden);
  elements.messageComposer.classList.toggle("hidden", isWarden);
  elements.messageSenderInput.disabled = !isWarden;

  updateAttendanceModeTabVisibility();

  if (!isWarden && state.activeTab === "admin") {
    switchTab("settings");
  } else if (shouldHideOutingTabs() && ["settings", "overnight"].includes(state.activeTab)) {
    switchTab("dashboard");
  } else {
    updateUserControlsVisibility();
  }

  renderMessagesScope();
}

function renderRoomCard(room) {
  return `
    <div class="room-card">
      <div class="room-title">${escapeHtml(room.room)}</div>
      <div class="room-slot room-slot-header">
        <div class="slot-number">학년</div>
        <div class="slot-name-wrap">이름</div>
      </div>
      ${room.occupants.map(renderRoomSlot).join("")}
    </div>
  `;
}

function renderRoomCardFourColumnOverride(room) {
  const columnCount = Math.max(1, Math.min(4, room.occupants.length || 1));

  return `
    <div class="room-card">
      <div class="room-title">${escapeHtml(room.room)}</div>
      <div class="room-slots-grid" style="grid-template-columns: repeat(${columnCount}, minmax(0, 1fr));">
        ${room.occupants.map(renderRoomSlot).join("")}
      </div>
    </div>
  `;
}

function renderRoomSlot(occupant) {
  const isAttendanceMode = Boolean(state.dashboardAttendanceMode);
  const isAttendanceUnavailable = isAttendanceUnavailableForOccupant(occupant);
  const statusClass = occupant.empty
    ? "empty"
    : isAttendanceMode
      ? isAttendanceUnavailable
        ? "attendance-disabled"
        : occupant.attendanceChecked
          ? "attendance-in"
          : "attendance-out"
      : occupant.isOvernight
        ? "overnight"
        : occupant.isOut
          ? "out"
          : occupant.isPhoneOnly
            ? "phone"
            : "in";

  const popover = occupant.empty
    ? ""
    : occupant.isOvernight
      ? `
          <div class="dashboard-popover">
            <div>외박</div>
            <div>사유: ${escapeHtml(occupant.currentOvernight?.reason || "없음")}</div>
          </div>
        `
      : occupant.isOut || occupant.isPhoneOnly
        ? `
            <div class="dashboard-popover">
              <div>${escapeHtml(occupant.isOut ? "외출" : "폰")}</div>
              <div>사유: ${escapeHtml(occupant.currentInterval?.reason || "없음")}</div>
              <div>폰 ${escapeHtml(occupant.currentInterval?.phone || "X")}</div>
            </div>
          `
        : "";

  const wrapClass = popover ? "slot-name-wrap has-popover" : "slot-name-wrap";
  const nameLabel = occupant.empty ? "" : occupant.name;
  const nameClass = occupant.empty ? `slot-name ${statusClass} blank` : `slot-name ${statusClass}`;
  const gradeLabel = occupant.empty || !Number.isInteger(occupant.grade) ? "" : `${occupant.grade}학년`;
  const canToggle = canToggleAttendanceForOccupant(occupant);
  const nameMarkup = occupant.empty
    ? `<div class="${nameClass}"></div>`
    : canToggle
      ? `<button type="button" class="${nameClass} slot-name-button" data-attendance-name="${escapeHtml(occupant.name)}">${escapeHtml(nameLabel)}</button>`
      : `<div class="${nameClass}">${escapeHtml(nameLabel)}</div>`;

  return `
    <div class="room-slot">
      <div class="slot-grade">${escapeHtml(gradeLabel)}</div>
      <div class="${wrapClass}">
        ${nameMarkup}
        ${popover}
      </div>
    </div>
  `;
}

function normalizeAttendanceModeAdminDraftRoom(room) {
  const normalizedRoom = String(room || "").trim();
  if (state.roomChoices.includes(normalizedRoom)) {
    return normalizedRoom;
  }

  return getNextAvailableAdminRoom() || state.roomChoices[0] || "201";
}

function createAdminDraftStudent() {
  return {
    id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    room: normalizeAttendanceModeAdminDraftRoom(""),
    grade: 1,
  };
}

function populateAdminControls() {
  attendanceModeAdminDraftStudents = attendanceModeAdminDraftStudents.map((draft) => ({
    ...draft,
    room: normalizeAttendanceModeAdminDraftRoom(draft.room),
    grade: [1, 2, 3].includes(Number(draft.grade)) ? Number(draft.grade) : 1,
  }));
}

function renderAdminDraftStudentRow(draft) {
  return `
    <tr data-admin-draft-id="${escapeHtml(draft.id)}" class="admin-draft-row">
      <td><input type="text" class="text-input" data-admin-draft-name placeholder="이름" value="${escapeHtml(draft.name || "")}" /></td>
      <td>
        <select class="text-input" data-admin-draft-room>
          ${buildAdminRoomOptions(normalizeAttendanceModeAdminDraftRoom(draft.room))}
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

function syncAdminDraftStudentsFromDom() {
  const rows = Array.from(elements.adminStudentRows?.querySelectorAll("[data-admin-draft-id]") || []);
  if (rows.length === 0) {
    return;
  }

  attendanceModeAdminDraftStudents = rows.map((row) => ({
    id: String(row.dataset.adminDraftId || ""),
    name: String(row.querySelector("[data-admin-draft-name]")?.value || "").trim(),
    room: String(row.querySelector("[data-admin-draft-room]")?.value || normalizeAttendanceModeAdminDraftRoom("")).trim(),
    grade: Number(row.querySelector("[data-admin-draft-grade]")?.value || 1),
  }));
}

function renderAdminStudentRows() {
  const people = [...state.people].sort((left, right) => {
    if (left.room !== right.room) {
      return left.room.localeCompare(right.room);
    }
    if (Number(left.slot) !== Number(right.slot)) {
      return Number(left.slot) - Number(right.slot);
    }
    return left.name.localeCompare(right.name, "ko");
  });

  const rows = [
    ...attendanceModeAdminDraftStudents.map(renderAdminDraftStudentRow),
    ...people.map(
      (person) => `
        <tr data-admin-name="${escapeHtml(person.name)}">
          <td>${escapeHtml(person.name)}</td>
          <td>
            <select class="text-input" data-admin-room-input="${escapeHtml(person.name)}">
              ${buildAdminRoomOptions(String(person.room || state.roomChoices[0] || ""))}
            </select>
          </td>
          <td>
            <select class="text-input" data-admin-grade-input="${escapeHtml(person.name)}">
              ${buildAdminGradeOptions(Number(person.grade || 1))}
            </select>
          </td>
          <td>
            <div class="admin-cell-actions">
              <button type="button" data-admin-delete="${escapeHtml(person.name)}">삭제</button>
            </div>
          </td>
        </tr>
      `,
    ),
  ];

  if (rows.length === 0) {
    elements.adminStudentRows.innerHTML = `
      <tr>
        <td colspan="4" class="empty-row">학생 데이터가 없습니다.</td>
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
  attendanceModeAdminDraftStudents.unshift(draft);
  renderAdminStudentRows();
  elements.adminStudentRows.querySelector(`[data-admin-draft-id="${CSS.escape(draft.id)}"] [data-admin-draft-name]`)?.focus();
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
  const draft = attendanceModeAdminDraftStudents.find((candidate) => candidate.id === draftId);
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
    attendanceModeAdminDraftStudents = attendanceModeAdminDraftStudents.filter((candidate) => candidate.id !== draftId);
    await loadProtectedData();
    switchTab("admin");
    setMessage("학생을 추가했습니다.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

function cancelDraftStudentById(draftId) {
  syncAdminDraftStudentsFromDom();
  attendanceModeAdminDraftStudents = attendanceModeAdminDraftStudents.filter((candidate) => candidate.id !== draftId);
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

function normalizeAdminDraftRoom(room) {
  const normalizedRoom = String(room || "").trim();
  if (state.roomChoices.includes(normalizedRoom)) {
    return normalizedRoom;
  }

  return getNextAvailableAdminRoom() || state.roomChoices[0] || "201";
}

function createAdminDraftStudent() {
  return {
    id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    room: normalizeAdminDraftRoom(""),
    grade: 1,
  };
}

function populateAdminControls() {
  adminDraftStudents = adminDraftStudents.map((draft) => ({
    ...draft,
    room: normalizeAdminDraftRoom(draft.room),
    grade: [1, 2, 3].includes(Number(draft.grade)) ? Number(draft.grade) : 1,
  }));
}

function renderAdminDraftStudentRow(draft) {
  return `
    <tr data-admin-draft-id="${escapeHtml(draft.id)}" class="admin-draft-row">
      <td><input type="text" class="text-input" data-admin-draft-name placeholder="이름" value="${escapeHtml(draft.name || "")}" /></td>
      <td>
        <select class="text-input" data-admin-draft-room>
          ${buildAdminRoomOptions(normalizeAdminDraftRoom(draft.room))}
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
  const people = [...state.people].sort((left, right) => {
    if (left.room !== right.room) {
      return left.room.localeCompare(right.room);
    }
    if (Number(left.slot) !== Number(right.slot)) {
      return Number(left.slot) - Number(right.slot);
    }
    return left.name.localeCompare(right.name, "ko");
  });

  const rows = [
    ...adminDraftStudents.map(renderAdminDraftStudentRow),
    ...people.map(
      (person) => `
        <tr data-admin-name="${escapeHtml(person.name)}">
          <td>${escapeHtml(person.name)}</td>
          <td>
            <select class="text-input" data-admin-room-input="${escapeHtml(person.name)}">
              ${buildAdminRoomOptions(String(person.room || state.roomChoices[0] || ""))}
            </select>
          </td>
          <td>
            <select class="text-input" data-admin-grade-input="${escapeHtml(person.name)}">
              ${buildAdminGradeOptions(Number(person.grade || 1))}
            </select>
          </td>
          <td><button type="button" data-admin-delete="${escapeHtml(person.name)}">삭제</button></td>
        </tr>
      `,
    ),
  ];

  if (rows.length === 0) {
    elements.adminStudentRows.innerHTML = `
      <tr>
        <td colspan="4" class="empty-row">학생 데이터가 없습니다.</td>
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
  adminDraftStudents.unshift(draft);
  renderAdminStudentRows();
  elements.adminStudentRows.querySelector(`[data-admin-draft-id="${CSS.escape(draft.id)}"] [data-admin-draft-name]`)?.focus();
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
  const draft = adminDraftStudents.find((candidate) => candidate.id === draftId);
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
    adminDraftStudents = adminDraftStudents.filter((candidate) => candidate.id !== draftId);
    await loadProtectedData();
    switchTab("admin");
    setMessage("학생을 추가했습니다.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

function cancelDraftStudentById(draftId) {
  syncAdminDraftStudentsFromDom();
  adminDraftStudents = adminDraftStudents.filter((candidate) => candidate.id !== draftId);
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

function shouldHideOutingTabs() {
  return false;
}

function resolveVisibleTab(tabName) {
  return tabName === "admin" && state.userRole !== "warden" ? "settings" : tabName;
}

function updateDashboardFilterButtons() {
  elements.dashboardFilters.querySelectorAll("[data-dashboard-filter]").forEach((button) => {
    const filter = String(button.dataset.dashboardFilter || "");
    const hideForAttendance = state.dashboardAttendanceMode && (filter === "OUT" || filter === "OVERNIGHT");
    button.classList.toggle("hidden", hideForAttendance);
    button.classList.toggle("is-active", !hideForAttendance && filter === state.dashboardFilter);
  });
}

function updateAttendanceModeTabVisibility() {
  elements.settingsTabButton.classList.remove("hidden");
  elements.overnightTabButton.classList.remove("hidden");
  updateDashboardFilterButtons();
}

function handleDashboardAttendanceModeChange() {
  state.dashboardAttendanceMode = Boolean(elements.dashboardAttendanceModeInput.checked);
  localStorage.setItem("dashboardAttendanceMode", state.dashboardAttendanceMode ? "1" : "0");
  if (state.dashboardAttendanceMode && ["OUT", "OVERNIGHT"].includes(state.dashboardFilter)) {
    state.dashboardFilter = "ALL";
  }
  updateAttendanceModeTabVisibility();
  renderDashboardSummary();
  renderDashboardBoard();
}

function shouldShowUserPicker() {
  return state.userRole === "warden" && ["settings", "overnight"].includes(state.activeTab);
}

function shouldShowSaveButton() {
  return false;
}

function updateUserControlsVisibility() {
  const showUserPicker = shouldShowUserPicker();
  elements.nameInput.classList.toggle("hidden", !showUserPicker);
  elements.loadUserButton.classList.toggle("hidden", !showUserPicker);

  elements.nameInput.disabled = !showUserPicker;
  elements.loadUserButton.disabled = !showUserPicker;

  if (elements.saveUserButton) {
    elements.saveUserButton.classList.add("hidden");
    elements.saveUserButton.disabled = true;
  }
}

function switchTab(tabName) {
  ensureExtendedState();
  const nextTab = resolveVisibleTab(tabName);
  state.activeTab = nextTab;

  elements.settingsTabButton.classList.toggle("is-active", nextTab === "settings");
  elements.overnightTabButton.classList.toggle("is-active", nextTab === "overnight");
  elements.dashboardTabButton.classList.toggle("is-active", nextTab === "dashboard");
  elements.passwordTabButton.classList.toggle("is-active", nextTab === "password");
  elements.messagesTabButton.classList.toggle("is-active", nextTab === "messages");
  elements.adminTabButton.classList.toggle("is-active", nextTab === "admin");

  elements.settingsTab.classList.toggle("is-active", nextTab === "settings");
  elements.overnightTab.classList.toggle("is-active", nextTab === "overnight");
  elements.dashboardTab.classList.toggle("is-active", nextTab === "dashboard");
  elements.passwordTab.classList.toggle("is-active", nextTab === "password");
  elements.messagesTab.classList.toggle("is-active", nextTab === "messages");
  elements.adminTab.classList.toggle("is-active", nextTab === "admin");

  updateAttendanceModeTabVisibility();
  updateUserControlsVisibility();

  if (nextTab !== "dashboard") {
    renderChart();
  }
}

function applyRoleMode() {
  const isWarden = state.userRole === "warden";
  elements.roleBadge.textContent = isWarden ? "사감 모드" : `학생 모드${state.loginName ? ` (${state.loginName})` : ""}`;
  elements.adminTabButton.classList.toggle("hidden", !isWarden);
  elements.adminTab.classList.toggle("hidden", !isWarden);
  elements.messageComposer.classList.toggle("hidden", isWarden);
  elements.messageSenderInput.disabled = !isWarden;

  if (!isWarden && state.activeTab === "admin") {
    switchTab("settings");
  } else {
    updateAttendanceModeTabVisibility();
    updateUserControlsVisibility();
  }

  renderMessagesScope();
}
function getFrontendAttendanceSessionKey() {
  return `${String(state.userRole || "")}:${String(state.loginName || "")}`;
}

function getFrontendAttendanceDateKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getFrontendAttendanceStore() {
  if (!state.frontendAttendance || typeof state.frontendAttendance !== "object" || Array.isArray(state.frontendAttendance)) {
    state.frontendAttendance = {
      sessionKey: "",
      dateKey: "",
      marks: {},
    };
  }

  if (!state.frontendAttendance.marks || typeof state.frontendAttendance.marks !== "object" || Array.isArray(state.frontendAttendance.marks)) {
    state.frontendAttendance.marks = {};
  }

  const nextSessionKey = getFrontendAttendanceSessionKey();
  const nextDateKey = getFrontendAttendanceDateKey();
  if (state.frontendAttendance.sessionKey !== nextSessionKey || state.frontendAttendance.dateKey !== nextDateKey) {
    state.frontendAttendance = {
      sessionKey: nextSessionKey,
      dateKey: nextDateKey,
      marks: {},
    };
  }

  return state.frontendAttendance;
}

function isAttendanceUnavailableForOccupant(occupant) {
  return Boolean(
    occupant &&
      !occupant.empty &&
      (occupant.isOut || occupant.isPhoneOnly || occupant.isOvernight),
  );
}

function applyFrontendAttendanceMarks(rooms) {
  const { marks } = getFrontendAttendanceStore();

  return (rooms || []).map((room) => ({
    ...room,
    occupants: (room.occupants || []).map((occupant) => {
      if (!occupant) {
        return occupant;
      }

      if (occupant.empty) {
        return {
          ...occupant,
          attendanceChecked: false,
        };
      }

      return {
        ...occupant,
        attendanceChecked: !isAttendanceUnavailableForOccupant(occupant) && Boolean(marks[occupant.name]),
      };
    }),
  }));
}

function findDashboardOccupantByName(name) {
  return state.dashboardRooms
    .flatMap((room) => room.occupants || [])
    .find((occupant) => !occupant.empty && occupant.name === name);
}

function getDashboardAttendanceScopeLabel() {
  if (state.dashboardFilter === "GRADE_1") {
    return "1학년";
  }

  if (state.dashboardFilter === "GRADE_2") {
    return "2학년";
  }

  if (state.dashboardFilter === "GRADE_3") {
    return "3학년";
  }

  if (state.dashboardFilter === "OUT") {
    return "외출";
  }

  if (state.dashboardFilter === "OVERNIGHT") {
    return "외박";
  }

  return "전체";
}

async function refreshDashboard() {
  try {
    const payload = await fetchJson("/api/dashboard");
    const store = getFrontendAttendanceStore();
    state.dashboardRooms = applyFrontendAttendanceMarks(payload.rooms || []);
    state.dashboardAttendanceDateKey = store.dateKey;
    updateDashboardFilterButtons();
    renderDashboardSummary();
    renderDashboardBoard();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function toggleAttendanceForCurrentUser() {
  try {
    const store = getFrontendAttendanceStore();
    const occupant = findDashboardOccupantByName(state.loginName);

    if (!occupant) {
      setMessage("출석 대상을 찾을 수 없습니다.", true);
      return;
    }

    if (isAttendanceUnavailableForOccupant(occupant)) {
      setMessage("외출 또는 외박 중에는 출석 체크를 할 수 없습니다.", true);
      return;
    }

    if (store.marks[state.loginName]) {
      delete store.marks[state.loginName];
    } else {
      store.marks[state.loginName] = true;
    }

    state.dashboardRooms = applyFrontendAttendanceMarks(state.dashboardRooms);
    renderDashboardSummary();
    renderDashboardBoard();
    setMessage(store.marks[state.loginName] ? "출석 체크했습니다." : "출석 체크를 해제했습니다.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

function renderDashboardSummary() {
  const allUsers = state.dashboardRooms
    .flatMap((room) => room.occupants)
    .filter((occupant) => !occupant.empty);

  if (state.dashboardAttendanceMode) {
    const visibleUsers = getFilteredDashboardRooms()
      .flatMap((room) => room.occupants)
      .filter((occupant) => !occupant.empty);
    const attendanceTargets = visibleUsers.filter((user) => !isAttendanceUnavailableForOccupant(user));
    const attendanceCount = attendanceTargets.filter((user) => user.attendanceChecked).length;
    elements.summaryLine.textContent = `${getDashboardAttendanceScopeLabel()} 출석 ${attendanceCount} / ${attendanceTargets.length}`;
    return;
  }

  const visibleCount = getFilteredDashboardRooms().flatMap((room) => room.occupants).length;
  const total = allUsers.length;
  const present = allUsers.filter((user) => !user.isOut && !user.isPhoneOnly && !user.isOvernight).length;
  const out = allUsers.filter((user) => user.isOut).length;
  const phone = allUsers.filter((user) => user.isPhoneOnly).length;
  const overnight = allUsers.filter((user) => user.isOvernight).length;
  const visiblePrefix = state.dashboardFilter === "ALL" ? "" : `표시 ${visibleCount} / `;
  elements.summaryLine.textContent = `${visiblePrefix}전체 ${total} / 재실 ${present} / 외출 ${out} / 폰 ${phone} / 외박 ${overnight}`;
}

function canToggleAttendanceForOccupant(occupant) {
  return (
    state.dashboardAttendanceMode &&
    state.userRole === "student" &&
    !occupant.empty &&
    !isAttendanceUnavailableForOccupant(occupant) &&
    occupant.name === state.loginName
  );
}

function renderRoomSlot(occupant) {
  const isAttendanceMode = Boolean(state.dashboardAttendanceMode);
  const isAttendanceUnavailable = isAttendanceUnavailableForOccupant(occupant);
  const statusClass = occupant.empty
    ? "empty"
    : isAttendanceMode
      ? isAttendanceUnavailable
        ? "attendance-disabled"
        : occupant.attendanceChecked
          ? "attendance-in"
          : "attendance-out"
      : occupant.isOvernight
        ? "overnight"
        : occupant.isOut
          ? "out"
          : occupant.isPhoneOnly
            ? "phone"
            : "in";

  const popover = occupant.empty
    ? ""
    : occupant.isOvernight
      ? `
          <div class="dashboard-popover">
            <div>외박</div>
            <div>사유: ${escapeHtml(occupant.currentOvernight?.reason || "없음")}</div>
          </div>
        `
      : occupant.isOut || occupant.isPhoneOnly
        ? `
            <div class="dashboard-popover">
              <div>${escapeHtml(occupant.isOut ? "외출" : "폰")}</div>
              <div>사유: ${escapeHtml(occupant.currentInterval?.reason || "없음")}</div>
              <div>폰: ${escapeHtml(occupant.currentInterval?.phone || "X")}</div>
            </div>
          `
        : "";

  const wrapClass = popover ? "slot-name-wrap has-popover" : "slot-name-wrap";
  const nameLabel = occupant.empty ? "" : occupant.name;
  const nameClass = occupant.empty ? `slot-name ${statusClass} blank` : `slot-name ${statusClass}`;
  const gradeLabel = occupant.empty || !Number.isInteger(occupant.grade) ? "" : String(occupant.grade);
  const canToggle = canToggleAttendanceForOccupant(occupant);
  const nameMarkup = occupant.empty
    ? `<div class="${nameClass}"></div>`
    : canToggle
      ? `<button type="button" class="${nameClass} slot-name-button" data-attendance-name="${escapeHtml(occupant.name)}">${escapeHtml(nameLabel)}</button>`
      : `<div class="${nameClass}">${escapeHtml(nameLabel)}</div>`;

  return `
    <div class="room-slot">
      <div class="slot-number">${gradeLabel}</div>
      <div class="${wrapClass}">
        ${nameMarkup}
        ${popover}
      </div>
    </div>
  `;
}

function shouldHideOutingTabs() {
  return false;
}

function resolveVisibleTab(tabName) {
  return tabName === "admin" && state.userRole !== "warden" ? "settings" : tabName;
}

function updateDashboardFilterButtons() {
  elements.dashboardFilters.querySelectorAll("[data-dashboard-filter]").forEach((button) => {
    const filter = String(button.dataset.dashboardFilter || "");
    const hideForAttendance = state.dashboardAttendanceMode && (filter === "OUT" || filter === "OVERNIGHT");
    button.classList.toggle("hidden", hideForAttendance);
    button.classList.toggle("is-active", !hideForAttendance && filter === state.dashboardFilter);
  });
}

function updateAttendanceModeTabVisibility() {
  elements.settingsTabButton.classList.remove("hidden");
  elements.overnightTabButton.classList.remove("hidden");
  updateDashboardFilterButtons();
}

function handleDashboardAttendanceModeChange() {
  getFrontendAttendanceStore();
  state.dashboardAttendanceMode = Boolean(elements.dashboardAttendanceModeInput.checked);
  localStorage.setItem("dashboardAttendanceMode", state.dashboardAttendanceMode ? "1" : "0");

  if (state.dashboardAttendanceMode && ["OUT", "OVERNIGHT"].includes(state.dashboardFilter)) {
    state.dashboardFilter = "ALL";
  }

  updateAttendanceModeTabVisibility();
  updateUserControlsVisibility();
  renderDashboardSummary();
  renderDashboardBoard();
}

function shouldShowUserPicker() {
  return !shouldHideOutingTabs() && state.userRole === "warden" && ["settings", "overnight"].includes(state.activeTab);
}

function shouldShowSaveButton() {
  return false;
}

function updateUserControlsVisibility() {
  const showUserPicker = shouldShowUserPicker();

  elements.nameInput.classList.toggle("hidden", !showUserPicker);
  elements.loadUserButton.classList.toggle("hidden", !showUserPicker);

  elements.nameInput.disabled = !showUserPicker;
  elements.loadUserButton.disabled = !showUserPicker;

  if (elements.saveUserButton) {
    elements.saveUserButton.classList.add("hidden");
    elements.saveUserButton.disabled = true;
  }
}

function switchTab(tabName) {
  ensureExtendedState();
  const nextTab = resolveVisibleTab(tabName);
  state.activeTab = nextTab;

  elements.settingsTabButton.classList.toggle("is-active", nextTab === "settings");
  elements.overnightTabButton.classList.toggle("is-active", nextTab === "overnight");
  elements.dashboardTabButton.classList.toggle("is-active", nextTab === "dashboard");
  elements.passwordTabButton.classList.toggle("is-active", nextTab === "password");
  elements.messagesTabButton.classList.toggle("is-active", nextTab === "messages");
  elements.adminTabButton.classList.toggle("is-active", nextTab === "admin");

  elements.settingsTab.classList.toggle("is-active", nextTab === "settings");
  elements.overnightTab.classList.toggle("is-active", nextTab === "overnight");
  elements.dashboardTab.classList.toggle("is-active", nextTab === "dashboard");
  elements.passwordTab.classList.toggle("is-active", nextTab === "password");
  elements.messagesTab.classList.toggle("is-active", nextTab === "messages");
  elements.adminTab.classList.toggle("is-active", nextTab === "admin");

  updateAttendanceModeTabVisibility();
  updateUserControlsVisibility();

  if (nextTab !== "dashboard") {
    renderChart();
  }
}

function applyRoleMode() {
  const isWarden = state.userRole === "warden";
  getFrontendAttendanceStore();
  elements.roleBadge.textContent = isWarden ? "사감 모드" : `학생 모드${state.loginName ? ` (${state.loginName})` : ""}`;
  elements.adminTabButton.classList.toggle("hidden", !isWarden);
  elements.adminTab.classList.toggle("hidden", !isWarden);
  elements.messageComposer.classList.toggle("hidden", isWarden);
  elements.messageSenderInput.disabled = !isWarden;

  updateAttendanceModeTabVisibility();

  if (!isWarden && state.activeTab === "admin") {
    switchTab("settings");
  } else if (shouldHideOutingTabs() && ["settings", "overnight"].includes(state.activeTab)) {
    switchTab("dashboard");
  } else {
    updateUserControlsVisibility();
  }

  renderMessagesScope();
}
