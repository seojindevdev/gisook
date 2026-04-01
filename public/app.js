const WEEKDAYS = [
  { key: "MON", label: "월" },
  { key: "TUE", label: "화" },
  { key: "WED", label: "수" },
  { key: "THU", label: "목" },
  { key: "FRI", label: "금" },
];
const HOURS = Array.from({ length: 10 }, (_, index) => String(index + 3));
const MINUTES = Array.from({ length: 61 }, (_, index) => String(index).padStart(2, "0"));
const MIN_ALLOWED_MINUTES = 15 * 60;
const MAX_ALLOWED_MINUTES = 24 * 60;
const AUTOSAVE_DELAY_MS = 400;

const state = {
  authenticated: false,
  people: [],
  selectedName: "",
  selectedRoom: "",
  selectedSlot: 0,
  intervals: [],
  overnights: [],
  selectedDay: getCurrentSeoulWeekdayKey(),
  activeTab: "settings",
  dashboardRooms: [],
  saveTimerId: null,
  saveRequestToken: 0,
  hasUnsavedChanges: false,
  refreshTimerId: null,
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  initialize();
});

function cacheElements() {
  elements.authGate = document.querySelector("#authGate");
  elements.appShell = document.querySelector("#appShell");
  elements.passwordInput = document.querySelector("#passwordInput");
  elements.loginButton = document.querySelector("#loginButton");
  elements.logoutButton = document.querySelector("#logoutButton");
  elements.authMessage = document.querySelector("#authMessage");
  elements.nameInput = document.querySelector("#nameInput");
  elements.nameSuggestions = document.querySelector("#nameSuggestions");
  elements.loadUserButton = document.querySelector("#loadUserButton");
  elements.saveUserButton = document.querySelector("#saveUserButton");
  elements.settingsTabButton = document.querySelector("#settingsTabButton");
  elements.overnightTabButton = document.querySelector("#overnightTabButton");
  elements.dashboardTabButton = document.querySelector("#dashboardTabButton");
  elements.settingsTab = document.querySelector("#settingsTab");
  elements.overnightTab = document.querySelector("#overnightTab");
  elements.dashboardTab = document.querySelector("#dashboardTab");
  elements.dayTabs = document.querySelector("#dayTabs");
  elements.addRowButton = document.querySelector("#addRowButton");
  elements.clearRowsButton = document.querySelector("#clearRowsButton");
  elements.clearOvernightButton = document.querySelector("#clearOvernightButton");
  elements.scheduleRows = document.querySelector("#scheduleRows");
  elements.overnightRows = document.querySelector("#overnightRows");
  elements.chartContainer = document.querySelector("#chartContainer");
  elements.overnightChartContainer = document.querySelector("#overnightChartContainer");
  elements.summaryLine = document.querySelector("#summaryLine");
  elements.dashboardBoard = document.querySelector("#dashboardBoard");
  elements.messageBox = document.querySelector("#messageBox");

  elements.chartTooltip = document.createElement("div");
  elements.chartTooltip.className = "chart-tooltip hidden";
  document.body.appendChild(elements.chartTooltip);
}

function bindEvents() {
  elements.loginButton.addEventListener("click", login);
  elements.logoutButton.addEventListener("click", logout);
  elements.passwordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      login();
    }
  });

  elements.loadUserButton.addEventListener("click", () => loadUser(getSelectedNameInput()));
  elements.saveUserButton.addEventListener("click", () => saveUser());

  elements.nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadUser(getSelectedNameInput());
    }
  });

  elements.settingsTabButton.addEventListener("click", () => switchTab("settings"));
  elements.overnightTabButton.addEventListener("click", () => switchTab("overnight"));
  elements.dashboardTabButton.addEventListener("click", () => switchTab("dashboard"));

  elements.dayTabs.addEventListener("click", handleDayButtonClick);

  elements.addRowButton.addEventListener("click", () => {
    const newRow = createEmptyRow();
    if (!newRow) {
      window.alert("같은 요일에 더 추가할 수 있는 빈 시간이 없습니다.");
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

  elements.chartContainer.addEventListener("mousemove", handleChartTooltipMove);
  elements.chartContainer.addEventListener("mouseleave", hideChartTooltip);
  elements.overnightChartContainer.addEventListener("mousemove", handleChartTooltipMove);
  elements.overnightChartContainer.addEventListener("mouseleave", hideChartTooltip);

  window.addEventListener("resize", debounce(renderChart, 120));
  window.addEventListener("pagehide", flushPendingSaveOnPageHide);
}

async function initialize() {
  renderDayButtons();
  renderScheduleRows();
  renderOvernightRows();
  renderChart();
  clearMessage();

  try {
    const response = await fetch("/api/config");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "설정을 불러오지 못했습니다.");
    }

    state.people = payload.people || [];
    renderNameOptions();

    const savedName = localStorage.getItem("selectedName");
    const initialName =
      state.people.find((person) => person.name === savedName)?.name || state.people[0]?.name || "";

    if (initialName) {
      elements.nameInput.value = initialName;
      await loadUser(initialName);
    }

    await refreshDashboard();
    window.setInterval(() => {
      refreshDashboard();
      renderChart();
    }, 30000);
  } catch (error) {
    setMessage(error.message, true);
  }
}

function switchTab(tabName) {
  state.activeTab = tabName;
  elements.settingsTabButton.classList.toggle("is-active", tabName === "settings");
  elements.overnightTabButton.classList.toggle("is-active", tabName === "overnight");
  elements.dashboardTabButton.classList.toggle("is-active", tabName === "dashboard");
  elements.settingsTab.classList.toggle("is-active", tabName === "settings");
  elements.overnightTab.classList.toggle("is-active", tabName === "overnight");
  elements.dashboardTab.classList.toggle("is-active", tabName === "dashboard");

  if (tabName !== "dashboard") {
    renderChart();
  }
}

function renderNameOptions() {
  elements.nameSuggestions.innerHTML = state.people
    .map((person) => `<option value="${escapeHtml(person.name)}"></option>`)
    .join("");
}

async function loadUser(name) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    setMessage("이름을 입력하세요.", true);
    return;
  }

  cancelAutoSave();

  try {
    const response = await fetch(`/api/users/${encodeURIComponent(trimmedName)}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "불러오기에 실패했습니다.");
    }

    state.selectedName = payload.name;
    state.selectedRoom = payload.room || "";
    state.selectedSlot = Number(payload.slot || 0);
    state.intervals = (payload.intervals || []).map((interval) => ({
      id: makeId(),
      day: interval.day,
      start: interval.start,
      end: interval.end,
      reason: interval.reason || "",
      outing: interval.outing === "X" ? "X" : "O",
      phone: interval.phone === "O" ? "O" : "X",
    }));
    state.overnights = normalizeOvernightsForUi(payload.overnights || []);
    state.hasUnsavedChanges = false;

    elements.nameInput.value = payload.name;
    localStorage.setItem("selectedName", payload.name);

    renderScheduleRows();
    renderOvernightRows();
    renderChart();
    clearMessage();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function saveUser(options = {}) {
  const { isAuto = false, keepalive = false } = options;
  const name = state.selectedName || getSelectedNameInput();
  if (!name) {
    setMessage("이름을 입력하세요.", true);
    return;
  }

  syncOvernightsFromDom();
  state.selectedName = name;
  state.hasUnsavedChanges = true;

  const requestToken = ++state.saveRequestToken;

  try {
    if (isAuto) {
      setMessage("자동 저장 중...");
    }

    const response = await fetch(`/api/users/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intervals: state.intervals.map((interval) => ({
          day: interval.day,
          start: interval.start,
          end: interval.end,
          reason: interval.reason || "",
          outing: interval.outing === "X" ? "X" : "O",
          phone: interval.phone === "O" ? "O" : "X",
        })),
        overnights: state.overnights
          .filter((overnight) => String(overnight.reason || "").trim())
          .map((overnight) => ({
            day: overnight.day,
            reason: overnight.reason || "",
          })),
      }),
      keepalive,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "저장에 실패했습니다.");
    }

    if (requestToken !== state.saveRequestToken) {
      return;
    }

    state.selectedName = payload.name;
    state.selectedRoom = payload.room || "";
    state.selectedSlot = Number(payload.slot || 0);
    elements.nameInput.value = payload.name;
    localStorage.setItem("selectedName", payload.name);

    if (!isAuto) {
      state.intervals = (payload.intervals || []).map((interval) => ({
        id: makeId(),
        day: interval.day,
        start: interval.start,
        end: interval.end,
        reason: interval.reason || "",
        outing: interval.outing === "X" ? "X" : "O",
        phone: interval.phone === "O" ? "O" : "X",
      }));
      state.overnights = normalizeOvernightsForUi(payload.overnights || []);
      renderScheduleRows();
      renderOvernightRows();
    }

    state.hasUnsavedChanges = false;
    setMessage(isAuto ? "자동 저장됨" : "저장됨");
    renderChart();
    await refreshDashboard();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function queueAutoSave() {
  if (!state.selectedName) {
    return;
  }

  state.hasUnsavedChanges = true;
  cancelAutoSave();
  setMessage("자동 저장 대기 중...");
  state.saveTimerId = window.setTimeout(() => {
    state.saveTimerId = null;
    saveUser({ isAuto: true });
  }, AUTOSAVE_DELAY_MS);
}

function cancelAutoSave() {
  if (!state.saveTimerId) {
    return;
  }

  window.clearTimeout(state.saveTimerId);
  state.saveTimerId = null;
}

function flushPendingSaveOnPageHide() {
  if (!state.selectedName || !state.hasUnsavedChanges) {
    return;
  }

  cancelAutoSave();
  saveUser({ isAuto: true, keepalive: true });
}

function handleDayButtonClick(event) {
  const button = event.target.closest(".day-button");
  if (!button) {
    return;
  }

  state.selectedDay = button.dataset.day;
  renderDayButtons();
  renderScheduleRows();
}

function renderDayButtons() {
  for (const button of elements.dayTabs.querySelectorAll(".day-button")) {
    button.classList.toggle("is-active", button.dataset.day === state.selectedDay);
  }
}

function handleScheduleChange(event) {
  const row = event.target.closest("tr[data-row-id]");
  if (!row) {
    return;
  }

  if (event.type === "input" && event.target.matches(".minute-input")) {
    return;
  }

  const interval = state.intervals.find((item) => item.id === row.dataset.rowId);
  if (!interval) {
    return;
  }

  const previous = { ...interval };
  let shouldRerenderRows = false;

  if (event.target.name?.startsWith("start")) {
    if (event.target.matches(".minute-input") && !isMinuteInputValid(row, "start")) {
      renderScheduleRows();
      renderChart();
      window.alert("분은 0부터 60까지 입력해야 합니다.");
      return;
    }

    interval.start = readTimeFromRow(
      row,
      "start",
      previous.start,
      interval.end,
      event.target.matches("select[name='startHour']"),
    );
    shouldRerenderRows = true;
  }

  if (event.target.name?.startsWith("end")) {
    if (event.target.matches(".minute-input") && !isMinuteInputValid(row, "end")) {
      renderScheduleRows();
      renderChart();
      window.alert("분은 0부터 60까지 입력해야 합니다.");
      return;
    }

    interval.end = readTimeFromRow(
      row,
      "end",
      previous.end,
      interval.start,
      event.target.matches("select[name='endHour']"),
    );
    shouldRerenderRows = true;
  }

  if (event.target.matches("input[name='reason']")) {
    interval.reason = event.target.value;
  }

  if (event.target.matches("input[name='outing']")) {
    interval.outing = event.target.checked ? "O" : "X";
  }

  if (event.target.matches("input[name='phone']")) {
    interval.phone = event.target.checked ? "O" : "X";
  }

  if (interval.outing !== "O" && interval.phone !== "O") {
    Object.assign(interval, previous);
    renderScheduleRows();
    renderChart();
    window.alert("외출 또는 폰 중 하나는 체크되어 있어야 합니다.");
    return;
  }

  if (isBlockedInterval(interval.start, interval.end)) {
    Object.assign(interval, previous);
    renderScheduleRows();
    renderChart();
    window.alert("나감 시간은 들어옴 시간보다 늦거나 같을 수 없습니다.");
    return;
  }

  if (hasIntervalOverlap(interval, state.intervals)) {
    Object.assign(interval, previous);
    renderScheduleRows();
    renderChart();
    window.alert("같은 요일의 스케줄 시간은 서로 겹칠 수 없습니다.");
    return;
  }

  if (shouldRerenderRows) {
    renderScheduleRows();
  }

  renderChart();
  queueAutoSave();
}

function handleScheduleDelete(event) {
  const button = event.target.closest("button[data-remove-id]");
  if (!button) {
    return;
  }

  state.intervals = state.intervals.filter((interval) => interval.id !== button.dataset.removeId);
  renderScheduleRows();
  renderChart();
  queueAutoSave();
}

function handleOvernightChange(event) {
  const input = event.target.closest("input[name='overnightReason']");
  if (!input) {
    return;
  }

  syncOvernightsFromDom();
  renderChart();
  queueAutoSave();
}

function handleOvernightCancel(event) {
  const button = event.target.closest("button[data-remove-overnight-day]");
  if (!button) {
    return;
  }

  state.overnights = state.overnights.filter((overnight) => overnight.day !== button.dataset.removeOvernightDay);
  renderOvernightRows();
  renderChart();
  queueAutoSave();
}

function renderScheduleRows() {
  const dayIntervals = state.intervals.filter((interval) => interval.day === state.selectedDay);

  if (dayIntervals.length === 0) {
    elements.scheduleRows.innerHTML = `
      <tr>
        <td colspan="6" class="empty-row">비어 있음</td>
      </tr>
    `;
    return;
  }

  elements.scheduleRows.innerHTML = dayIntervals
    .map(
      (interval) => `
        <tr data-row-id="${interval.id}">
          <td>${renderTimeControls("start", interval.start, interval.end)}</td>
          <td>${renderTimeControls("end", interval.end, interval.start)}</td>
          <td class="toggle-cell">
            <input type="checkbox" name="outing" class="toggle-checkbox" ${interval.outing === "O" ? "checked" : ""} />
          </td>
          <td class="toggle-cell">
            <input type="checkbox" name="phone" class="toggle-checkbox" ${interval.phone === "O" ? "checked" : ""} />
          </td>
          <td>
            <input
              type="text"
              name="reason"
              class="reason-input"
              value="${escapeHtml(interval.reason || "")}"
              placeholder="사유"
              maxlength="100"
            />
          </td>
          <td>
            <button type="button" class="remove-button" data-remove-id="${interval.id}">삭제</button>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderOvernightRows() {
  elements.overnightRows.innerHTML = WEEKDAYS.map((day) => {
    const overnight = state.overnights.find((item) => item.day === day.key);
    return `
      <tr data-day="${day.key}">
        <td>${day.label}</td>
        <td>
          <input
            type="text"
            name="overnightReason"
            class="reason-input"
            value="${escapeHtml(overnight?.reason || "")}"
            placeholder="사유"
            maxlength="100"
          />
        </td>
        <td>
          <button type="button" class="remove-button" data-remove-overnight-day="${day.key}">취소</button>
        </td>
      </tr>
    `;
  }).join("");
}

async function refreshDashboard() {
  try {
    const response = await fetch("/api/dashboard");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "현황을 불러오지 못했습니다.");
    }

    state.dashboardRooms = payload.rooms || [];
    elements.summaryLine.textContent =
      `전체 ${payload.totals.total} / 재실 ${payload.totals.present} / 외출 ${payload.totals.out} / 폰 ${payload.totals.phone} / 외박 ${payload.totals.overnight}`;
    renderDashboardBoard();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function renderDashboardBoard() {
  const leftRooms = state.dashboardRooms.slice(0, 7);
  const rightRooms = state.dashboardRooms.slice(7);
  elements.dashboardBoard.innerHTML = `
    <div class="board-column">${leftRooms.map(renderRoomCard).join("")}</div>
    <div class="board-column">${rightRooms.map(renderRoomCard).join("")}</div>
  `;
}

function renderRoomCard(room) {
  const visibleOccupants = room.occupants.filter((occupant) => !occupant.empty);
  return `
    <div class="room-card">
      <div class="room-title">${escapeHtml(room.room)}</div>
      ${visibleOccupants.map(renderRoomSlot).join("")}
    </div>
  `;
}

function renderRoomSlot(occupant) {
  const statusClass = occupant.empty
    ? "empty"
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

  return `
    <div class="room-slot">
      <div class="slot-number">${occupant.slot}</div>
      <div class="${wrapClass}">
        <div class="${nameClass}">${escapeHtml(nameLabel)}</div>
        ${popover}
      </div>
    </div>
  `;
}

function renderChart() {
  syncOvernightsFromDom();
  hideChartTooltip();

  const chartContainers = [elements.chartContainer, elements.overnightChartContainer];
  const width = Math.max(...chartContainers.map((container) => Math.max(container.clientWidth - 16, 680)));
  const height = 410;
  const margin = { top: 24, right: 16, bottom: 32, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const rowHeight = 68;
  const chartBottom = margin.top + rowHeight * WEEKDAYS.length;
  const now = getCurrentSeoulTimeParts();
  const nowMinutes = Number(now.hour) * 60 + Number(now.minute);
  const nowX = margin.left + (nowMinutes / 1440) * innerWidth;
  const nowLabelX = Math.min(Math.max(nowX, margin.left + 40), width - margin.right - 40);

  const grouped = WEEKDAYS.map((day) => ({
    ...day,
    overnights: state.overnights.filter(
      (overnight) => overnight.day === day.key && String(overnight.reason || "").trim(),
    ),
    intervals: state.intervals
      .filter((interval) => interval.day === day.key)
      .map((interval) => ({
        ...interval,
        startMinutes: timeToMinutes(interval.start),
        endMinutes: timeToMinutes(interval.end),
      }))
      .sort((left, right) => left.startMinutes - right.startMinutes),
  }));

  const grid = Array.from({ length: 13 }, (_, index) => index * 2)
    .map((hour) => {
      const x = margin.left + (hour / 24) * innerWidth;
      return `
        <line x1="${x}" y1="${margin.top}" x2="${x}" y2="${chartBottom}" stroke="#dddddd"></line>
        <text x="${x}" y="${height - 10}" text-anchor="middle" font-size="11" fill="#555555">
          ${escapeHtml(formatKoreanTime(`${String(hour).padStart(2, "0")}:00`, false))}
        </text>
      `;
    })
    .join("");

  const rows = grouped
    .map((day, index) => {
      const y = margin.top + index * rowHeight;
      const guideY = y + 33;
      const overnightReason = day.overnights
        .map((overnight) => String(overnight.reason || "").trim())
        .filter(Boolean)
        .join(" / ");
      const blocks = day.overnights.length > 0
        ? `
            <rect
              class="chart-block"
              x="${margin.left}"
              y="${y + 22}"
              width="${innerWidth}"
              height="22"
              fill="#f4b400"
              data-chart-kind="외박"
              data-chart-period="하루 전체"
              data-chart-reason="${escapeHtml(overnightReason || "없음")}"
            ></rect>
          `
        : day.intervals
            .map((interval) => {
              const startX = margin.left + (interval.startMinutes / 1440) * innerWidth;
              const endX = margin.left + (interval.endMinutes / 1440) * innerWidth;
              const barWidth = Math.max(endX - startX, 4);
              const kind = interval.outing === "O" ? "외출" : "폰";
              const fill = interval.outing === "O" ? "#d93025" : "#7e57c2";
              return `
                <rect
                  class="chart-block"
                  x="${startX}"
                  y="${y + 22}"
                  width="${barWidth}"
                  height="22"
                  fill="${fill}"
                  data-chart-kind="${kind}"
                  data-chart-period="${escapeHtml(`${formatKoreanTime(interval.start)} ~ ${formatKoreanTime(interval.end)}`)}"
                  data-chart-reason="${escapeHtml(interval.reason || "없음")}"
                ></rect>
              `;
            })
            .join("");

      return `
        <line x1="${margin.left}" y1="${guideY}" x2="${width - margin.right}" y2="${guideY}" stroke="#eeeeee"></line>
        <text x="${margin.left - 12}" y="${y + 37}" text-anchor="end" fill="#111111">${day.label}</text>
        ${blocks}
      `;
    })
    .join("");

  const chartMarkup = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}">
      ${grid}
      ${rows}
      <line x1="${nowX}" y1="${margin.top}" x2="${nowX}" y2="${chartBottom}" stroke="#d93025" stroke-width="2"></line>
      <text x="${nowLabelX}" y="${margin.top - 6}" fill="#d93025" font-size="12" text-anchor="middle">
        ${escapeHtml(formatKoreanTime(`${now.hour}:${now.minute}`))}
      </text>
    </svg>
  `;

  for (const container of chartContainers) {
    container.innerHTML = chartMarkup;
  }
}

function handleChartTooltipMove(event) {
  const block = event.target.closest("rect.chart-block");
  if (!block) {
    hideChartTooltip();
    return;
  }

  elements.chartTooltip.innerHTML = `
    <div>${escapeHtml(block.dataset.chartKind || "")}</div>
    <div>기간: ${escapeHtml(block.dataset.chartPeriod || "")}</div>
    <div>사유: ${escapeHtml(block.dataset.chartReason || "없음")}</div>
  `;
  elements.chartTooltip.classList.remove("hidden");
  positionTooltip(elements.chartTooltip, event.clientX, event.clientY);
}

function hideChartTooltip() {
  elements.chartTooltip.classList.add("hidden");
}

function positionTooltip(node, clientX, clientY) {
  const gap = 12;
  node.style.left = `${clientX + gap}px`;
  node.style.top = `${clientY + gap}px`;

  const rect = node.getBoundingClientRect();
  node.style.left = `${Math.max(8, Math.min(clientX + gap, window.innerWidth - rect.width - 8))}px`;
  node.style.top = `${Math.max(8, Math.min(clientY + gap, window.innerHeight - rect.height - 8))}px`;
}

function createEmptyRow() {
  const dayIntervals = state.intervals
    .filter((interval) => interval.day === state.selectedDay)
    .map((interval) => ({
      startMinutes: timeToMinutes(interval.start),
      endMinutes: timeToMinutes(interval.end),
    }))
    .sort((left, right) => left.startMinutes - right.startMinutes);

  let candidateStart = MIN_ALLOWED_MINUTES;
  const duration = 60;

  for (const interval of dayIntervals) {
    if (candidateStart < interval.startMinutes) {
      return makeRowFromMinutes(candidateStart, Math.min(candidateStart + duration, interval.startMinutes));
    }
    candidateStart = Math.max(candidateStart, interval.endMinutes);
  }

  if (candidateStart < MAX_ALLOWED_MINUTES) {
    return makeRowFromMinutes(candidateStart, Math.min(candidateStart + duration, MAX_ALLOWED_MINUTES));
  }

  return null;
}

function makeRowFromMinutes(startMinutes, endMinutes) {
  if (startMinutes >= endMinutes) {
    return null;
  }

  return {
    id: makeId(),
    day: state.selectedDay,
    start: minutesToTimeString(startMinutes),
    end: minutesToTimeString(endMinutes),
    reason: "",
    outing: "O",
    phone: "X",
  };
}

function hasIntervalOverlap(targetInterval, intervals) {
  const targetStart = timeToMinutes(targetInterval.start);
  const targetEnd = timeToMinutes(targetInterval.end);

  return intervals.some((interval) => {
    if (!interval || interval.id === targetInterval.id || interval.day !== targetInterval.day) {
      return false;
    }

    const intervalStart = timeToMinutes(interval.start);
    const intervalEnd = timeToMinutes(interval.end);
    return targetStart < intervalEnd && intervalStart < targetEnd;
  });
}

function normalizeOvernightsForUi(overnights) {
  return WEEKDAYS.map((day) => {
    const reasons = overnights
      .filter((overnight) => overnight.day === day.key)
      .map((overnight) => String(overnight.reason || "").trim())
      .filter(Boolean);
    return reasons.length > 0 ? { day: day.key, reason: reasons.join(" / ") } : null;
  }).filter(Boolean);
}

function readOvernightsFromDom() {
  return Array.from(elements.overnightRows.querySelectorAll("tr[data-day]"))
    .map((row) => {
      const day = String(row.dataset.day || "").trim().toUpperCase();
      const reason = String(row.querySelector("input[name='overnightReason']")?.value || "").trim().slice(0, 100);
      return day && reason ? { day, reason } : null;
    })
    .filter(Boolean);
}

function syncOvernightsFromDom() {
  state.overnights = readOvernightsFromDom();
}

function renderTimeControls(prefix, timeString, boundaryTime) {
  const parts = splitTime(timeString);
  const safeHour = HOURS.includes(parts.hour) ? parts.hour : HOURS[0];
  const safeMinuteOptions = getAvailableMinutes(safeHour);
  const safeMinute = safeMinuteOptions.includes(parts.minute) ? parts.minute : safeMinuteOptions[0];
  const safeParts = { hour: safeHour, minute: safeMinute };
  const hourOptions = HOURS.map((hour) => ({
    value: hour,
    label: `오후 ${hour}시`,
    selected: safeParts.hour === hour,
    disabled: !hasAnyAllowedMinute(prefix, hour, boundaryTime),
  }));
  const currentSelectionBlocked = !isAllowedTimeChoice(prefix, joinTimeParts(safeParts), boundaryTime);
  const minuteMax = safeParts.hour === "12" ? 0 : 60;

  return `
    <div class="time-selects">
      ${renderSelectControl(`${prefix}Hour`, hourOptions)}
      ${renderMinuteInputControl(`${prefix}Minute`, safeParts.minute, minuteMax, currentSelectionBlocked)}
    </div>
  `;
}

function renderSelectControl(name, options) {
  const selectedOption = options.find((option) => option.selected);
  const selectClass = selectedOption?.disabled ? "has-blocked-options" : "";
  return `
    <select name="${name}" class="${selectClass}">
      ${options
        .map(
          (option) => `
            <option
              value="${option.value}"
              ${option.selected ? "selected" : ""}
              ${option.disabled ? 'class="blocked-option" style="color:#d93025;"' : ""}
            >
              ${option.label}
            </option>
          `,
        )
        .join("")}
    </select>
  `;
}

function renderMinuteInputControl(name, minute, maxMinute, isBlocked) {
  return `
    <input
      type="number"
      name="${name}"
      class="minute-input${isBlocked ? " has-blocked-options" : ""}"
      min="0"
      max="${maxMinute}"
      step="1"
      inputmode="numeric"
      value="${Number(minute)}"
    />
  `;
}

function readTimeFromRow(row, prefix, fallbackTime, boundaryTime, autoAdjustHourSelection = false) {
  const fallbackParts = splitTime(fallbackTime || "15:00");
  const selectedHour = row.querySelector(`[name='${prefix}Hour']`)?.value || fallbackParts.hour;
  const hour = HOURS.includes(selectedHour) ? selectedHour : fallbackParts.hour;
  let minute = normalizeMinuteInputValue(
    row.querySelector(`[name='${prefix}Minute']`)?.value,
    fallbackParts.minute,
    hour === "12" ? 0 : 60,
  );

  if (autoAdjustHourSelection && boundaryTime) {
    const currentTime = joinTimeParts({ hour, minute });
    if (!isAllowedTimeChoice(prefix, currentTime, boundaryTime)) {
      const adjustedMinute = findClosestAllowedMinute(prefix, hour, boundaryTime, minute);
      if (adjustedMinute !== null) {
        minute = adjustedMinute;
        const minuteInput = row.querySelector(`[name='${prefix}Minute']`);
        if (minuteInput) {
          minuteInput.value = String(Number(minute));
        }
      }
    }
  }

  return joinTimeParts({ hour, minute });
}

function splitTime(timeString) {
  if (timeString === "24:00") {
    return { hour: "12", minute: "00" };
  }

  const [hourText = "00", minuteText = "00"] = String(timeString).split(":");
  const hourValue = Number(hourText);
  const minuteValue = Number(minuteText);
  return {
    hour: String(hourValue % 12 || 12),
    minute: String(minuteValue).padStart(2, "0"),
  };
}

function joinTimeParts(parts) {
  if (parts.hour === "12") {
    return "24:00";
  }

  const hourValue = Number(parts.hour);
  const minuteValue = Number(parts.minute);
  const totalMinutes = (hourValue % 12 + 12) * 60 + minuteValue;

  if (totalMinutes >= 1440) {
    return "24:00";
  }

  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function hasAnyAllowedMinute(prefix, hour, boundaryTime) {
  return getAvailableMinutes(hour).some((minute) =>
    isAllowedTimeChoice(prefix, joinTimeParts({ hour, minute }), boundaryTime),
  );
}

function findClosestAllowedMinute(prefix, hour, boundaryTime, preferredMinute) {
  const preferred = Number(preferredMinute);
  const allowedMinutes = getAvailableMinutes(hour)
    .filter((minute) => isAllowedTimeChoice(prefix, joinTimeParts({ hour, minute }), boundaryTime))
    .sort((left, right) => {
      const leftDistance = Math.abs(Number(left) - preferred);
      const rightDistance = Math.abs(Number(right) - preferred);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return Number(left) - Number(right);
    });

  return allowedMinutes[0] || null;
}

function isAllowedTimeChoice(prefix, candidateTime, boundaryTime) {
  const candidateMinutes = timeToMinutes(candidateTime);
  const boundaryMinutes = timeToMinutes(boundaryTime);

  if (candidateMinutes < MIN_ALLOWED_MINUTES || candidateMinutes > MAX_ALLOWED_MINUTES) {
    return false;
  }

  return prefix === "start"
    ? candidateMinutes < boundaryMinutes
    : candidateMinutes > boundaryMinutes;
}

function getAvailableMinutes(hour) {
  return hour === "12" ? ["00"] : MINUTES;
}

function normalizeMinuteInputValue(value, fallbackMinute, maxMinute) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  const fallback = Number.parseInt(String(fallbackMinute ?? "0").trim(), 10);
  const source = Number.isFinite(parsed) ? parsed : fallback;
  return String(Math.min(Math.max(source, 0), maxMinute)).padStart(2, "0");
}

function isMinuteInputValid(row, prefix) {
  const hour = row.querySelector(`[name='${prefix}Hour']`)?.value || HOURS[0];
  const maxMinute = hour === "12" ? 0 : 60;
  const minuteText = String(row.querySelector(`[name='${prefix}Minute']`)?.value || "").trim();
  if (!/^\d{1,2}$/.test(minuteText)) {
    return false;
  }

  const minuteValue = Number(minuteText);
  return minuteValue >= 0 && minuteValue <= maxMinute;
}

function timeToMinutes(timeString) {
  if (timeString === "24:00") {
    return 1440;
  }

  const [hours, minutes] = String(timeString).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTimeString(totalMinutes) {
  if (totalMinutes >= 1440) {
    return "24:00";
  }

  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function formatKoreanTime(timeString, includeMinutes = true) {
  if (timeString === "24:00") {
    return includeMinutes ? "오후 12시 0분" : "오후 12시";
  }

  const [hourText = "00", minuteText = "00"] = String(timeString).split(":");
  const hourValue = Number(hourText);
  const minuteValue = Number(minuteText);
  const hour12 = hourValue % 12 || 12;
  return includeMinutes ? `오후 ${hour12}시 ${minuteValue}분` : `오후 ${hour12}시`;
}

function getCurrentSeoulTimeParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  return parts.reduce(
    (accumulator, part) => {
      if (part.type === "hour" || part.type === "minute") {
        accumulator[part.type] = part.value;
      }
      return accumulator;
    },
    { hour: "00", minute: "00" },
  );
}

function getCurrentSeoulWeekdayKey() {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(new Date());

  const map = {
    Mon: "MON",
    Tue: "TUE",
    Wed: "WED",
    Thu: "THU",
    Fri: "FRI",
  };

  return map[weekday] || "MON";
}

function getSelectedNameInput() {
  return String(elements.nameInput.value || "").trim();
}

function makeId() {
  return `row-${Math.random().toString(36).slice(2, 10)}`;
}

function isBlockedInterval(startTime, endTime) {
  return timeToMinutes(startTime) >= timeToMinutes(endTime);
}

function setMessage(message, isError = false) {
  if (!message) {
    clearMessage();
    return;
  }

  elements.messageBox.textContent = message;
  elements.messageBox.className = isError ? "message-box error" : "message-box";
}

function clearMessage() {
  elements.messageBox.textContent = "";
  elements.messageBox.className = "message-box hidden";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function debounce(callback, wait) {
  let timerId = null;
  return (...args) => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => callback(...args), wait);
  };
}

async function fetchJson(url, fetchOptions = {}, options = {}) {
  const response = await fetch(url, fetchOptions);
  let payload = {};

  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }

  if (!response.ok) {
    const message = payload.message || "요청에 실패했습니다.";
    if (response.status === 401 && !options.allowUnauthorized) {
      handleUnauthorized(message);
    }
    throw new Error(message);
  }

  return payload;
}

function setAuthMessage(message) {
  elements.authMessage.textContent = message || "";
}

function clearAuthMessage() {
  setAuthMessage("");
}

function showAuthGate() {
  state.authenticated = false;
  elements.authGate.classList.remove("hidden");
  elements.appShell.classList.add("hidden");
  elements.passwordInput.focus();
}

function showAppShell() {
  elements.authGate.classList.add("hidden");
  elements.appShell.classList.remove("hidden");
}

function handleUnauthorized(message) {
  state.authenticated = false;
  cancelAutoSave();
  setAuthMessage(message || "비밀번호를 입력해야 접근할 수 있습니다.");
  showAuthGate();
}

async function restoreSession() {
  try {
    const payload = await fetchJson("/api/auth/status", {}, { allowUnauthorized: true });
    if (!payload.authenticated) {
      showAuthGate();
      return;
    }

    await finishLogin();
  } catch (error) {
    showAuthGate();
    setAuthMessage(error.message);
  }
}

async function finishLogin() {
  state.authenticated = true;
  showAppShell();
  await loadProtectedData();
}

async function loadProtectedData() {
  const payload = await fetchJson("/api/config");

  state.people = payload.people || [];
  renderNameOptions();

  const savedName = localStorage.getItem("selectedName");
  const initialName =
    state.people.find((person) => person.name === savedName)?.name || state.people[0]?.name || "";

  if (initialName) {
    elements.nameInput.value = initialName;
    await loadUser(initialName);
  } else {
    elements.nameInput.value = "";
    state.selectedName = "";
    state.selectedRoom = "";
    state.selectedSlot = 0;
    state.intervals = [];
    state.overnights = [];
    renderScheduleRows();
    renderOvernightRows();
    renderChart();
  }

  await refreshDashboard();

  if (!state.refreshTimerId) {
    state.refreshTimerId = window.setInterval(() => {
      if (!state.authenticated) {
        return;
      }

      refreshDashboard();
      renderChart();
    }, 30000);
  }
}

async function login() {
  const password = String(elements.passwordInput.value || "").trim();
  if (!password) {
    setAuthMessage("비밀번호를 입력하세요.");
    return;
  }

  try {
    await fetchJson(
      "/api/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      },
      { allowUnauthorized: true },
    );

    elements.passwordInput.value = "";
    clearAuthMessage();
    await finishLogin();
  } catch (error) {
    setAuthMessage(error.message);
  }
}

async function logout() {
  try {
    await fetchJson("/api/auth/logout", { method: "POST" }, { allowUnauthorized: true });
  } catch (_error) {
    // Ignore logout failures and clear the local view anyway.
  }

  state.authenticated = false;
  cancelAutoSave();
  showAuthGate();
  setAuthMessage("로그아웃되었습니다.");
}

async function initialize() {
  renderDayButtons();
  renderScheduleRows();
  renderOvernightRows();
  renderChart();
  clearMessage();
  clearAuthMessage();
  await restoreSession();
}

async function loadUser(name) {
  if (!state.authenticated) {
    handleUnauthorized("비밀번호를 입력해야 접근할 수 있습니다.");
    return;
  }

  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    setMessage("이름을 입력하세요.", true);
    return;
  }

  cancelAutoSave();

  try {
    const payload = await fetchJson(`/api/users/${encodeURIComponent(trimmedName)}`);

    state.selectedName = payload.name;
    state.selectedRoom = payload.room || "";
    state.selectedSlot = Number(payload.slot || 0);
    state.intervals = (payload.intervals || []).map((interval) => ({
      id: makeId(),
      day: interval.day,
      start: interval.start,
      end: interval.end,
      reason: interval.reason || "",
      outing: interval.outing === "X" ? "X" : "O",
      phone: interval.phone === "O" ? "O" : "X",
    }));
    state.overnights = normalizeOvernightsForUi(payload.overnights || []);
    state.hasUnsavedChanges = false;

    elements.nameInput.value = payload.name;
    localStorage.setItem("selectedName", payload.name);

    renderScheduleRows();
    renderOvernightRows();
    renderChart();
    clearMessage();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function saveUser(options = {}) {
  if (!state.authenticated) {
    handleUnauthorized("비밀번호를 입력해야 접근할 수 있습니다.");
    return;
  }

  const { isAuto = false, keepalive = false } = options;
  const name = state.selectedName || getSelectedNameInput();
  if (!name) {
    setMessage("이름을 입력하세요.", true);
    return;
  }

  syncOvernightsFromDom();
  state.selectedName = name;
  state.hasUnsavedChanges = true;

  const requestToken = ++state.saveRequestToken;

  try {
    if (isAuto) {
      setMessage("자동 저장 중...");
    }

    const payload = await fetchJson(`/api/users/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intervals: state.intervals.map((interval) => ({
          day: interval.day,
          start: interval.start,
          end: interval.end,
          reason: interval.reason || "",
          outing: interval.outing === "X" ? "X" : "O",
          phone: interval.phone === "O" ? "O" : "X",
        })),
        overnights: state.overnights
          .filter((overnight) => String(overnight.reason || "").trim())
          .map((overnight) => ({
            day: overnight.day,
            reason: overnight.reason || "",
          })),
      }),
      keepalive,
    });

    if (requestToken !== state.saveRequestToken) {
      return;
    }

    state.selectedName = payload.name;
    state.selectedRoom = payload.room || "";
    state.selectedSlot = Number(payload.slot || 0);
    elements.nameInput.value = payload.name;
    localStorage.setItem("selectedName", payload.name);

    if (!isAuto) {
      state.intervals = (payload.intervals || []).map((interval) => ({
        id: makeId(),
        day: interval.day,
        start: interval.start,
        end: interval.end,
        reason: interval.reason || "",
        outing: interval.outing === "X" ? "X" : "O",
        phone: interval.phone === "O" ? "O" : "X",
      }));
      state.overnights = normalizeOvernightsForUi(payload.overnights || []);
      renderScheduleRows();
      renderOvernightRows();
    }

    state.hasUnsavedChanges = false;
    setMessage(isAuto ? "자동 저장됨" : "저장됨");
    renderChart();
    await refreshDashboard();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function queueAutoSave() {
  if (!state.authenticated || !state.selectedName) {
    return;
  }

  state.hasUnsavedChanges = true;
  cancelAutoSave();
  setMessage("자동 저장 대기 중...");
  state.saveTimerId = window.setTimeout(() => {
    state.saveTimerId = null;
    saveUser({ isAuto: true });
  }, AUTOSAVE_DELAY_MS);
}

function flushPendingSaveOnPageHide() {
  if (!state.authenticated || !state.selectedName || !state.hasUnsavedChanges) {
    return;
  }

  cancelAutoSave();
  saveUser({ isAuto: true, keepalive: true });
}

async function refreshDashboard() {
  if (!state.authenticated) {
    return;
  }

  try {
    const payload = await fetchJson("/api/dashboard");
    state.dashboardRooms = payload.rooms || [];
    elements.summaryLine.textContent =
      `전체 ${payload.totals.total} / 재실 ${payload.totals.present} / 외출 ${payload.totals.out} / 폰 ${payload.totals.phone} / 외박 ${payload.totals.overnight}`;
    renderDashboardBoard();
  } catch (error) {
    setMessage(error.message, true);
  }
}
