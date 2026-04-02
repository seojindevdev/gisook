function canToggleAttendanceForOccupant(occupant) {
  if (!state.dashboardAttendanceMode || !occupant || occupant.empty || isAttendanceUnavailableForOccupant(occupant)) {
    return false;
  }

  if (state.userRole === "warden") {
    return true;
  }

  return state.userRole === "student" && occupant.name === state.loginName;
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
  const buttonLabel =
    state.userRole === "warden" ? `${occupant.name} 출석 상태 변경` : `${occupant.name} 내 출석 상태 변경`;
  const nameMarkup = occupant.empty
    ? `<div class="${nameClass}"></div>`
    : canToggle
      ? `<button type="button" class="${nameClass} slot-name-button" data-attendance-name="${escapeHtml(occupant.name)}" aria-label="${escapeHtml(buttonLabel)}">${escapeHtml(nameLabel)}</button>`
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

async function toggleAttendanceByName(name) {
  try {
    const targetName = String(name || "").trim();
    if (!targetName) {
      return;
    }

    const occupant = findDashboardOccupantByName(targetName);
    if (!occupant) {
      setMessage("출석 대상을 찾을 수 없습니다.", true);
      return;
    }

    if (!canToggleAttendanceForOccupant(occupant)) {
      if (isAttendanceUnavailableForOccupant(occupant)) {
        setMessage("외출 또는 외박 중인 학생은 출석 체크를 바꿀 수 없습니다.", true);
      }
      return;
    }

    const store = getFrontendAttendanceStore();
    if (store.marks[targetName]) {
      delete store.marks[targetName];
    } else {
      store.marks[targetName] = true;
    }

    state.dashboardRooms = applyFrontendAttendanceMarks(state.dashboardRooms);
    renderDashboardSummary();
    renderDashboardBoard();

    const checked = Boolean(store.marks[targetName]);
    const message = state.userRole === "warden"
      ? `${targetName} 출석을 ${checked ? "체크했습니다." : "해제했습니다."}`
      : checked
        ? "출석 체크했습니다."
        : "출석 체크를 해제했습니다.";
    setMessage(message);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function toggleAttendanceForCurrentUser() {
  await toggleAttendanceByName(state.loginName);
}

function handleDashboardBoardClick(event) {
  const button = event.target.closest("[data-attendance-name]");
  if (!button) {
    return;
  }

  event.preventDefault();
  const name = String(button.dataset.attendanceName || "").trim();
  if (!name) {
    return;
  }

  toggleAttendanceByName(name);
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
  getFrontendAttendanceStore();
  elements.roleBadge.textContent = isWarden ? "사감 모드" : `학생 모드${state.loginName ? ` (${state.loginName})` : ""}`;
  elements.adminTabButton.classList.toggle("hidden", !isWarden);
  elements.adminTab.classList.toggle("hidden", !isWarden);
  elements.messageComposer.classList.toggle("hidden", isWarden);
  elements.messageSenderInput.disabled = !isWarden;

  updateAttendanceModeTabVisibility();

  if (!isWarden && state.activeTab === "admin") {
    switchTab("settings");
  } else {
    updateUserControlsVisibility();
  }

  renderMessagesScope();
}
