(function () {
  const PARENT_ROLE = "parent";
  const PARENT_SAVED_PASSWORD_KEY = "gisook.parentPassword.v1";
  const PARENT_MODE_LABEL = "\ud559\ubd80\ubaa8 \ubaa8\ub4dc";
  const PARENT_LOGIN_TITLE = "\ud559\ubd80\ubaa8 \ube44\ubc00\ubc88\ud638";
  const PARENT_LOGIN_DESCRIPTION = "\ud559\ubd80\ubaa8 \ubaa8\ub4dc\uc5d0 \ub4e4\uc5b4\uac00\ub824\uba74 \ube44\ubc00\ubc88\ud638\ub97c \uc785\ub825\ud558\uc138\uc694.";
  const PARENT_PASSWORD_PLACEHOLDER = "\ube44\ubc00\ubc88\ud638";
  const PARENT_ENTER_LABEL = "\uc785\uc7a5";
  const PARENT_CANCEL_LABEL = "\ucde8\uc18c";
  const PARENT_PAGE_TITLE = "\uc774\ubc88 \uc8fc \uc678\ubc15 \uc124\uc815";
  const PARENT_PAGE_DESCRIPTION = "\uc790\ub140 \uc774\ub984\uc744 \uac80\uc0c9\ud55c \ub4a4 \uc678\ubc15 \ub0a0\uc9dc\ub97c \uccb4\ud06c\ud558\uc138\uc694.";
  const PARENT_SEARCH_LABEL = "\uc790\ub140 \uc774\ub984 \uac80\uc0c9";
  const PARENT_SEARCH_PLACEHOLDER = "\ud559\uc0dd \uc774\ub984 \uc785\ub825";
  const PARENT_LOAD_LABEL = "\uc870\ud68c";
  const PARENT_SELECT_STUDENT_LABEL = "\ud559\uc0dd\uc744 \uc120\ud0dd\ud558\uc138\uc694.";
  const PARENT_NO_RESULT_LABEL = "\uac80\uc0c9 \uacb0\uacfc \uc5c6\uc74c";
  const PARENT_SAVED_LABEL = "\uc800\uc7a5\ud588\uc2b5\ub2c8\ub2e4.";
  const PARENT_SAVING_LABEL = "\uc790\ub3d9 \uc800\uc7a5 \uc911...";
  const PARENT_AUTOSAVE_HINT_LABEL = "\uccb4\ud06c\ud558\uba74 \uc790\ub3d9\uc73c\ub85c \uc800\uc7a5\ub429\ub2c8\ub2e4.";
  const PARENT_SERVER_RESTART_LABEL = "\uc11c\ubc84\ub97c \uc7ac\uc2dc\uc791\ud574\uc57c \ud559\ubd80\ubaa8 \ubaa8\ub4dc\uac00 \uc801\uc6a9\ub429\ub2c8\ub2e4.";
  const PARENT_PAST_LABEL = "\uc9c0\ub09c \ub0a0\uc9dc";
  const PARENT_TODAY_LABEL = "\uc624\ub298";
  const PARENT_SELECTED_LABEL = "\uc120\ud0dd\ub41c \ud559\uc0dd";
  const PARENT_WEEK_LABEL = "\uc678\ubc15 \ub0a0\uc9dc";

  const parentState = {
    people: [],
    weekDays: [],
    selectedName: "",
    selectedDates: new Set(),
  };
  let parentAutoSaveTimerId = null;
  let parentSavedLoginInProgress = false;

  const originalApplyRoleMode = typeof applyRoleMode === "function" ? applyRoleMode : null;
  const originalSwitchTab = typeof switchTab === "function" ? switchTab : null;
  const originalLoadProtectedData = typeof loadProtectedData === "function" ? loadProtectedData : null;
  const originalShowAuthGate = typeof showAuthGate === "function" ? showAuthGate : null;
  const originalLogout = typeof logout === "function" ? logout : null;

  setupParentModeUi();
  wrapExistingAppFunctions();

  document.addEventListener("DOMContentLoaded", () => {
    setupParentModeUi();
    bindParentModeEvents();
    queueSavedParentLoginAttempt();
  });

  function setupParentModeUi() {
    const authBox = document.querySelector(".auth-box");
    const loginButton = document.querySelector("#loginButton");
    const tabs = document.querySelector(".tabs");
    const adminTab = document.querySelector("#adminTab");

    if (authBox && loginButton && !document.querySelector("#parentModeButton")) {
      loginButton.insertAdjacentHTML(
        "afterend",
        `<button id="parentModeButton" class="parent-mode-entry-button" type="button">${PARENT_MODE_LABEL}</button>`,
      );
    }

    if (!document.querySelector("#parentPasswordModal")) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
          <div id="parentPasswordModal" class="parent-modal hidden" role="dialog" aria-modal="true">
            <div class="parent-modal-card">
              <div class="parent-modal-title">${PARENT_LOGIN_TITLE}</div>
              <div class="parent-modal-description">${PARENT_LOGIN_DESCRIPTION}</div>
              <input id="parentPasswordInput" type="password" placeholder="${PARENT_PASSWORD_PLACEHOLDER}" autocomplete="current-password" />
              <div id="parentLoginMessage" class="parent-login-message"></div>
              <div class="parent-modal-actions">
                <button id="parentLoginCancelButton" type="button">${PARENT_CANCEL_LABEL}</button>
                <button id="parentLoginSubmitButton" type="button">${PARENT_ENTER_LABEL}</button>
              </div>
            </div>
          </div>
        `,
      );
    }

    if (tabs && !document.querySelector("#parentTabButton")) {
      const button = document.createElement("button");
      button.id = "parentTabButton";
      button.className = "tab-button hidden";
      button.type = "button";
      button.textContent = PARENT_MODE_LABEL;
      tabs.insertBefore(button, document.querySelector("#adminTabButton") || null);
    }

    if (adminTab && !document.querySelector("#parentTab")) {
      adminTab.insertAdjacentHTML(
        "beforebegin",
        `
          <section id="parentTab" class="tab-panel hidden">
            <div class="parent-panel">
              <div class="parent-panel-header">
                <div>
                  <div class="parent-panel-eyebrow">${PARENT_MODE_LABEL}</div>
                  <div class="parent-panel-title">${PARENT_PAGE_TITLE}</div>
                  <div class="parent-panel-description">${PARENT_PAGE_DESCRIPTION}</div>
                </div>
                <div id="parentSelectedSummary" class="parent-selected-summary">${PARENT_SELECT_STUDENT_LABEL}</div>
              </div>
              <div class="parent-search-area">
                <label class="parent-search-label" for="parentStudentSearchInput">
                  <span>${PARENT_SEARCH_LABEL}</span>
                  <input id="parentStudentSearchInput" type="search" placeholder="${PARENT_SEARCH_PLACEHOLDER}" autocomplete="off" />
                </label>
                <button id="parentStudentLoadButton" type="button">${PARENT_LOAD_LABEL}</button>
              </div>
              <div id="parentStudentResults" class="parent-student-results"></div>
              <div class="parent-week-title">${PARENT_WEEK_LABEL}</div>
              <div id="parentWeekGrid" class="parent-week-grid"></div>
              <div class="parent-save-row">
                <div id="parentOvernightMessage" class="parent-overnight-message">${PARENT_AUTOSAVE_HINT_LABEL}</div>
              </div>
            </div>
          </section>
        `,
      );
    }
  }

  function wrapExistingAppFunctions() {
    if (typeof originalApplyRoleMode === "function") {
      applyRoleMode = function () {
        originalApplyRoleMode();
        applyParentRoleMode();
      };
    }

    if (typeof originalSwitchTab === "function") {
      switchTab = function (tabName) {
        if (isParentRole()) {
          setParentTabActive();
          return;
        }

        originalSwitchTab(tabName);
        applyParentRoleMode();
      };
    }

    if (typeof originalLoadProtectedData === "function") {
      loadProtectedData = async function () {
        await originalLoadProtectedData();
        if (isParentRole()) {
          await loadParentOvernightData(parentState.selectedName);
          applyParentRoleMode();
        }
      };
    }

    if (typeof originalShowAuthGate === "function") {
      showAuthGate = function () {
        originalShowAuthGate();
        queueSavedParentLoginAttempt();
      };
    }

    if (typeof originalLogout === "function") {
      logout = async function () {
        clearSavedParentPassword();
        await originalLogout();
      };
    }
  }

  function isParentRole() {
    return typeof state !== "undefined" && state.userRole === PARENT_ROLE;
  }

  function bindParentModeEvents() {
    document.querySelector("#parentModeButton")?.addEventListener("click", showParentPasswordModal);
    document.querySelector("#parentLoginCancelButton")?.addEventListener("click", hideParentPasswordModal);
    document.querySelector("#parentLoginSubmitButton")?.addEventListener("click", loginAsParent);
    document.querySelector("#parentPasswordInput")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loginAsParent();
      }
    });
    document.querySelector("#parentPasswordModal")?.addEventListener("click", (event) => {
      if (event.target?.id === "parentPasswordModal") {
        hideParentPasswordModal();
      }
    });
    document.querySelector("#parentTabButton")?.addEventListener("click", () => {
      if (typeof switchTab === "function") {
        switchTab("parent");
      }
    });
    document.querySelector("#parentStudentSearchInput")?.addEventListener("input", renderParentStudentResults);
    document.querySelector("#parentStudentLoadButton")?.addEventListener("click", loadSelectedParentStudent);
    document.querySelector("#parentStudentResults")?.addEventListener("click", handleParentStudentResultClick);
    document.querySelector("#parentWeekGrid")?.addEventListener("change", handleParentDateChange);
  }

  function showParentPasswordModal() {
    clearParentLoginMessage();
    const modal = document.querySelector("#parentPasswordModal");
    const input = document.querySelector("#parentPasswordInput");
    modal?.classList.remove("hidden");
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  function hideParentPasswordModal() {
    document.querySelector("#parentPasswordModal")?.classList.add("hidden");
    clearParentLoginMessage();
  }

  function getSavedParentPassword() {
    return String(localStorage.getItem(PARENT_SAVED_PASSWORD_KEY) || "");
  }

  function saveParentPassword(password) {
    const value = String(password || "");
    if (value) {
      localStorage.setItem(PARENT_SAVED_PASSWORD_KEY, value);
    }
  }

  function clearSavedParentPassword() {
    localStorage.removeItem(PARENT_SAVED_PASSWORD_KEY);
  }

  function queueSavedParentLoginAttempt() {
    window.setTimeout(attemptSavedParentLogin, 120);
  }

  async function attemptSavedParentLogin() {
    const password = getSavedParentPassword();
    if (!password || parentSavedLoginInProgress || (typeof state !== "undefined" && state.authenticated)) {
      return;
    }

    parentSavedLoginInProgress = true;
    try {
      const status = await fetchJson("/api/auth/status", {}, { allowUnauthorized: true });
      if (status.authenticated) {
        return;
      }

      await loginParentWithPassword(password, { remember: false, silent: true });
    } catch (_error) {
      clearSavedParentPassword();
    } finally {
      parentSavedLoginInProgress = false;
    }
  }

  async function loginAsParent() {
    const passwordInput = document.querySelector("#parentPasswordInput");
    const password = String(passwordInput?.value || "");
    if (!password) {
      setParentLoginMessage(PARENT_PASSWORD_PLACEHOLDER);
      return;
    }

    try {
      await loginParentWithPassword(password, { remember: true, silent: false });
    } catch (error) {
      setParentLoginMessage(error.message);
    }
  }

  async function loginParentWithPassword(password, { remember = false } = {}) {
    const options = await fetchJson("/api/auth/options", {}, { allowUnauthorized: true });
    if (!options.parentModeEnabled) {
      throw new Error(PARENT_SERVER_RESTART_LABEL);
    }

    const payload = await fetchJson(
      "/api/auth/parent-login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      },
      { allowUnauthorized: true },
    );
    hideParentPasswordModal();
    if (remember) {
      saveParentPassword(password);
    }
    if (typeof clearAuthMessage === "function") {
      clearAuthMessage();
    }
    await finishLogin(payload.role || PARENT_ROLE, payload.loginName || PARENT_MODE_LABEL);
  }

  function setParentLoginMessage(message) {
    const messageBox = document.querySelector("#parentLoginMessage");
    if (messageBox) {
      messageBox.textContent = message || "";
    }
  }

  function clearParentLoginMessage() {
    setParentLoginMessage("");
  }

  function applyParentRoleMode() {
    setupParentModeUi();
    const isParent = isParentRole();
    const parentTabButton = document.querySelector("#parentTabButton");
    const parentTab = document.querySelector("#parentTab");

    parentTabButton?.classList.add("hidden");
    parentTabButton?.classList.toggle("is-active", false);
    parentTab?.classList.toggle("hidden", !isParent);

    if (!isParent) {
      restoreNonParentControls();
      parentTab?.classList.toggle("is-active", false);
      return;
    }

    document.querySelector("#roleBadge").textContent = PARENT_MODE_LABEL;
    hideParentOnlyUnavailableControls();
    setParentTabActive();
    renderParentPage();
  }

  function restoreNonParentControls() {
    const isWarden = typeof state !== "undefined" && state.userRole === "warden";
    const dashboardTabButton = document.querySelector("#dashboardTabButton");
    const dashboardTab = document.querySelector("#dashboardTab");
    dashboardTabButton?.classList.toggle("hidden", !isWarden);
    dashboardTab?.classList.toggle("hidden", !isWarden);
    if (!isWarden) {
      dashboardTabButton?.classList.toggle("is-active", false);
      dashboardTab?.classList.toggle("is-active", false);
    }

    [
      "#settingsTabButton",
      "#passwordTabButton",
      "#settingsTab",
      "#passwordTab",
    ].forEach((selector) => {
      document.querySelector(selector)?.classList.toggle("hidden", isWarden);
    });
  }

  function hideParentOnlyUnavailableControls() {
    [
      "#settingsTabButton",
      "#overnightTabButton",
      "#dashboardTabButton",
      "#passwordTabButton",
      "#messagesTabButton",
      "#adminTabButton",
      "#offlineChangeTabButton",
      "#returnLogTabButton",
    ].forEach((selector) => {
      const element = document.querySelector(selector);
      element?.classList.add("hidden");
      element?.classList.toggle("is-active", false);
    });

    [
      "#settingsTab",
      "#overnightTab",
      "#dashboardTab",
      "#passwordTab",
      "#messagesTab",
      "#adminTab",
      "#offlineChangeTab",
      "#returnLogTab",
    ].forEach((selector) => {
      const element = document.querySelector(selector);
      element?.classList.add("hidden");
      element?.classList.toggle("is-active", false);
    });

    ["#nameInput", "#loadUserButton", "#saveUserButton"].forEach((selector) => {
      const element = document.querySelector(selector);
      element?.classList.add("hidden");
      if (element && "disabled" in element) {
        element.disabled = true;
      }
    });
  }

  function setParentTabActive() {
    if (typeof state !== "undefined") {
      state.activeTab = "parent";
    }
    const parentTabButton = document.querySelector("#parentTabButton");
    const parentTab = document.querySelector("#parentTab");
    hideParentOnlyUnavailableControls();
    parentTabButton?.classList.add("hidden");
    parentTabButton?.classList.toggle("is-active", false);
    parentTab?.classList.remove("hidden");
    parentTab?.classList.toggle("is-active", true);
  }

  async function loadParentOvernightData(name = "") {
    if (!isParentRole()) {
      return;
    }

    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    const payload = await fetchJson(`/api/parent/overnights${query}`);
    parentState.people = Array.isArray(payload.people) ? payload.people : [];
    parentState.weekDays = Array.isArray(payload.weekDays) ? payload.weekDays : [];
    parentState.selectedName = String(payload.selectedName || "");
    parentState.selectedDates = new Set(Array.isArray(payload.selectedDates) ? payload.selectedDates : []);
    renderParentPage();
  }

  function renderParentPage() {
    renderParentStudentResults();
    renderParentSelectedSummary();
    renderParentWeekGrid();
  }

  function renderParentSelectedSummary() {
    const summary = document.querySelector("#parentSelectedSummary");
    if (!summary) {
      return;
    }

    summary.textContent = parentState.selectedName
      ? `${PARENT_SELECTED_LABEL}: ${parentState.selectedName}`
      : PARENT_SELECT_STUDENT_LABEL;
  }

  function renderParentStudentResults() {
    const results = document.querySelector("#parentStudentResults");
    const input = document.querySelector("#parentStudentSearchInput");
    if (!results || !input) {
      return;
    }

    const query = String(input.value || "").trim();
    if (!query) {
      results.innerHTML = "";
      return;
    }

    const matches = parentState.people
      .filter((person) => String(person.name || "").includes(query))
      .slice(0, 10);

    if (matches.length === 0) {
      results.innerHTML = `<div class="parent-student-empty">${PARENT_NO_RESULT_LABEL}</div>`;
      return;
    }

    results.innerHTML = matches
      .map((person) => {
        const selected = person.name === parentState.selectedName ? " is-active" : "";
        const meta = `${person.room || ""}\ud638 / ${person.grade || ""}\ud559\ub144`;
        return `
          <button class="parent-student-result${selected}" type="button" data-parent-student="${safeHtml(person.name)}">
            <strong>${safeHtml(person.name)}</strong>
            <span>${safeHtml(meta)}</span>
          </button>
        `;
      })
      .join("");
  }

  async function loadSelectedParentStudent() {
    const input = document.querySelector("#parentStudentSearchInput");
    const query = String(input?.value || "").trim();
    const exact = parentState.people.find((person) => person.name === query);
    const partial = parentState.people.find((person) => person.name.includes(query));
    const person = exact || partial;

    if (!person) {
      setParentOvernightMessage(PARENT_NO_RESULT_LABEL, true);
      return;
    }

    await selectParentStudent(person.name);
  }

  async function handleParentStudentResultClick(event) {
    const button = event.target.closest("[data-parent-student]");
    if (!button) {
      return;
    }

    await selectParentStudent(String(button.dataset.parentStudent || ""));
  }

  async function selectParentStudent(name) {
    const input = document.querySelector("#parentStudentSearchInput");
    if (input) {
      input.value = name;
    }

    clearParentOvernightMessage();
    await loadParentOvernightData(name);
  }

  function renderParentWeekGrid() {
    const grid = document.querySelector("#parentWeekGrid");
    if (!grid) {
      return;
    }

    if (!parentState.selectedName) {
      grid.innerHTML = `<div class="parent-week-empty">${PARENT_SELECT_STUDENT_LABEL}</div>`;
      return;
    }

    grid.innerHTML = parentState.weekDays
      .map((day) => {
        const checked = parentState.selectedDates.has(day.targetDate);
        const disabled = Boolean(day.isPast);
        const statusText = day.isToday ? PARENT_TODAY_LABEL : disabled ? PARENT_PAST_LABEL : "";
        return `
          <label class="parent-day-card${checked ? " is-checked" : ""}${disabled ? " is-disabled" : ""}">
            <input type="checkbox" data-parent-date="${safeHtml(day.targetDate)}"${checked ? " checked" : ""}${disabled ? " disabled" : ""} />
            <span class="parent-day-label">${safeHtml(day.label)}</span>
            <strong>${formatParentDate(day.targetDate)}</strong>
            <small>${safeHtml(statusText)}</small>
          </label>
        `;
      })
      .join("");
  }

  function handleParentDateChange(event) {
    const checkbox = event.target.closest("[data-parent-date]");
    if (!checkbox) {
      return;
    }

    const targetDate = String(checkbox.dataset.parentDate || "");
    if (checkbox.checked) {
      parentState.selectedDates.add(targetDate);
    } else {
      parentState.selectedDates.delete(targetDate);
    }
    renderParentWeekGrid();
    queueParentOvernightAutoSave();
  }

  function queueParentOvernightAutoSave() {
    if (parentAutoSaveTimerId !== null) {
      window.clearTimeout(parentAutoSaveTimerId);
    }

    setParentOvernightMessage(PARENT_SAVING_LABEL, false);
    parentAutoSaveTimerId = window.setTimeout(() => {
      parentAutoSaveTimerId = null;
      saveParentOvernights();
    }, 250);
  }

  async function saveParentOvernights() {
    if (!parentState.selectedName) {
      setParentOvernightMessage(PARENT_SELECT_STUDENT_LABEL, true);
      return;
    }

    try {
      const payload = await fetchJson("/api/parent/overnights", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: parentState.selectedName,
          dates: Array.from(parentState.selectedDates),
        }),
      });
      parentState.weekDays = Array.isArray(payload.weekDays) ? payload.weekDays : parentState.weekDays;
      parentState.selectedName = String(payload.selectedName || parentState.selectedName);
      parentState.selectedDates = new Set(Array.isArray(payload.selectedDates) ? payload.selectedDates : []);
      setParentOvernightMessage(PARENT_SAVED_LABEL, false);
      renderParentPage();
      if (typeof refreshDashboard === "function") {
        await refreshDashboard();
      }
    } catch (error) {
      setParentOvernightMessage(error.message, true);
    }
  }

  function setParentOvernightMessage(message, isError) {
    const messageBox = document.querySelector("#parentOvernightMessage");
    if (!messageBox) {
      return;
    }

    messageBox.textContent = message || "";
    messageBox.classList.toggle("error", Boolean(isError));
  }

  function clearParentOvernightMessage() {
    setParentOvernightMessage("", false);
  }

  function formatParentDate(dateKey) {
    const parts = String(dateKey || "").split("-");
    if (parts.length !== 3) {
      return safeHtml(dateKey || "");
    }

    return `${parts[1]}.${parts[2]}`;
  }

  function safeHtml(value) {
    if (typeof escapeHtml === "function") {
      return escapeHtml(value);
    }

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
