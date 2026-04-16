const API_BASE = "/api";
const TOKEN_KEY = "hackathon_task_tracker_token";

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  currentUser: null,
  users: [],
  projects: [],
  selectedProjectId: null,
  members: [],
  sprints: [],
  tasks: [],
  dashboard: null,
  historyByTask: {},
  duplicateReview: null,
};

const els = {
  authSection: document.getElementById("authSection"),
  appSection: document.getElementById("appSection"),
  sessionInfo: document.getElementById("sessionInfo"),
  refreshBtn: document.getElementById("refreshBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  projectCreateForm: document.getElementById("projectCreateForm"),
  projectList: document.getElementById("projectList"),
  selectedProjectName: document.getElementById("selectedProjectName"),
  memberForm: document.getElementById("memberForm"),
  memberUserSelect: document.getElementById("memberUserSelect"),
  memberList: document.getElementById("memberList"),
  sprintForm: document.getElementById("sprintForm"),
  sprintList: document.getElementById("sprintList"),
  taskCreateForm: document.getElementById("taskCreateForm"),
  taskAssigneeSelect: document.getElementById("taskAssigneeSelect"),
  taskSprintSelect: document.getElementById("taskSprintSelect"),
  filterForm: document.getElementById("filterForm"),
  statusFilter: document.getElementById("statusFilter"),
  typeFilter: document.getElementById("typeFilter"),
  priorityFilter: document.getElementById("priorityFilter"),
  assigneeFilter: document.getElementById("assigneeFilter"),
  sprintFilter: document.getElementById("sprintFilter"),
  searchFilter: document.getElementById("searchFilter"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  taskList: document.getElementById("taskList"),
  dashboardSummary: document.getElementById("dashboardSummary"),
  globalMessage: document.getElementById("globalMessage"),
  duplicateReviewModal: document.getElementById("duplicateReviewModal"),
  duplicateReviewMessage: document.getElementById("duplicateReviewMessage"),
  duplicateReviewDetails: document.getElementById("duplicateReviewDetails"),
  duplicateReviewViewBtn: document.getElementById("duplicateReviewViewBtn"),
  duplicateReviewApproveBtn: document.getElementById("duplicateReviewApproveBtn"),
  duplicateReviewRejectBtn: document.getElementById("duplicateReviewRejectBtn"),
};

const NEXT_STATUS = {
  open: "selected",
  selected: "in_progress",
  in_progress: "ready_for_acceptance",
  ready_for_acceptance: "closed",
  closed: null,
};

function isManager() {
  return state.currentUser?.role === "manager";
}

function currentProject() {
  if (!state.selectedProjectId) return null;
  return state.projects.find((item) => item.id === state.selectedProjectId) || null;
}

function getDevelopers() {
  return state.users.filter((item) => item.role === "developer");
}

function getProjectDevelopers() {
  const selectedProject = currentProject();
  if (!selectedProject) return [];
  return state.members.map((item) => item.user).filter((item) => item.role === "developer");
}

function showMessage(text, type = "info") {
  const node = els.globalMessage;
  node.textContent = text;
  node.className = `toast ${type}`;
  node.classList.remove("hidden");
  window.clearTimeout(showMessage._timer);
  showMessage._timer = window.setTimeout(() => {
    node.classList.add("hidden");
  }, 2800);
}

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function api(path, options = {}) {
  const method = options.method || "GET";
  const headers = { ...(options.headers || {}) };
  const query = options.query || {};

  const url = new URL(`${window.location.origin}${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  let body;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), { method, headers, body });
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
    }
    let errorPayload = null;
    let detail = "Request failed";
    try {
      errorPayload = await response.json();
      if (typeof errorPayload?.detail === "string") {
        detail = errorPayload.detail;
      } else if (typeof errorPayload?.detail?.message === "string") {
        detail = errorPayload.detail.message;
      } else if (typeof errorPayload?.message === "string") {
        detail = errorPayload.message;
      }
    } catch (_) {
      // no-op
    }
    throw new ApiError(detail, response.status, errorPayload);
  }

  if (response.status === 204) return null;
  return response.json();
}

function setSession(token, user) {
  state.token = token;
  state.currentUser = user;
  localStorage.setItem(TOKEN_KEY, token);
  renderAuthState();
}

function clearSession() {
  state.token = "";
  state.currentUser = null;
  state.projects = [];
  state.users = [];
  state.tasks = [];
  state.sprints = [];
  state.members = [];
  state.dashboard = null;
  state.selectedProjectId = null;
  state.historyByTask = {};
  state.duplicateReview = null;
  localStorage.removeItem(TOKEN_KEY);
  renderAuthState();
  renderWorkspace();
  els.duplicateReviewModal.classList.add("hidden");
}

function renderAuthState() {
  const loggedIn = Boolean(state.token && state.currentUser);

  els.authSection.classList.toggle("hidden", loggedIn);
  els.appSection.classList.toggle("hidden", !loggedIn);
  els.refreshBtn.classList.toggle("hidden", !loggedIn);
  els.logoutBtn.classList.toggle("hidden", !loggedIn);

  if (loggedIn) {
    els.sessionInfo.textContent = `${state.currentUser.name} (${state.currentUser.role})`;
  } else {
    els.sessionInfo.textContent = "Не авторизован";
  }

  document.querySelectorAll(".manager-only").forEach((item) => {
    item.classList.toggle("hidden", !loggedIn || !isManager());
  });
}

async function loadUsers() {
  state.users = await api("/users");
}

async function loadProjects() {
  state.projects = await api("/projects");
  if (!state.projects.length) {
    state.selectedProjectId = null;
    return;
  }

  if (!state.selectedProjectId || !state.projects.some((item) => item.id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0].id;
  }
}

async function loadProjectContext() {
  if (!state.selectedProjectId) {
    state.members = [];
    state.sprints = [];
    state.dashboard = null;
    return;
  }

  const projectId = state.selectedProjectId;
  const [members, sprints, dashboard] = await Promise.all([
    api(`/projects/${projectId}/members`),
    api(`/projects/${projectId}/sprints`),
    api("/dashboard/summary", { query: { project_id: projectId } }),
  ]);

  state.members = members;
  state.sprints = sprints;
  state.dashboard = dashboard;
}

function readTaskFilters() {
  return {
    status: els.statusFilter.value,
    type: els.typeFilter.value,
    priority: els.priorityFilter.value,
    assignee_id: els.assigneeFilter.value,
    sprint_id: els.sprintFilter.value,
    search: els.searchFilter.value.trim(),
  };
}

async function loadTasks() {
  const filters = readTaskFilters();
  state.tasks = await api("/tasks", {
    query: {
      project_id: state.selectedProjectId,
      status: filters.status,
      type: filters.type,
      priority: filters.priority,
      assignee_id: filters.assignee_id,
      sprint_id: filters.sprint_id,
      search: filters.search,
    },
  });
}

async function refreshWorkspace() {
  await Promise.all([loadUsers(), loadProjects()]);
  await loadProjectContext();
  await loadTasks();
  renderWorkspace();
}

function optionList(items, getValue, getLabel, includeEmpty = false, emptyLabel = "-") {
  const fragment = document.createDocumentFragment();
  if (includeEmpty) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = emptyLabel;
    fragment.appendChild(empty);
  }

  for (const item of items) {
    const option = document.createElement("option");
    option.value = String(getValue(item));
    option.textContent = getLabel(item);
    fragment.appendChild(option);
  }

  return fragment;
}

function renderProjectList() {
  els.projectList.innerHTML = "";

  if (!state.projects.length) {
    els.projectList.innerHTML = '<div class="muted">Пока нет проектов</div>';
    return;
  }

  for (const project of state.projects) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `project-item ${project.id === state.selectedProjectId ? "active" : ""}`;
    item.innerHTML = `<strong>${project.name}</strong><div class="tiny muted">${project.description || "без описания"}</div>`;
    item.addEventListener("click", async () => {
      state.selectedProjectId = project.id;
      state.historyByTask = {};
      await loadProjectContext();
      await loadTasks();
      renderWorkspace();
    });
    els.projectList.appendChild(item);
  }
}

function renderMemberBlock() {
  els.memberList.innerHTML = "";

  const selected = currentProject();
  els.selectedProjectName.textContent = selected ? `Текущий: ${selected.name}` : "Проект не выбран";

  if (!selected) {
    els.memberList.innerHTML = '<div class="muted">Выбери проект</div>';
    els.memberUserSelect.innerHTML = "";
    return;
  }

  if (!state.members.length) {
    els.memberList.innerHTML = '<div class="muted">В проекте пока нет участников</div>';
  } else {
    for (const member of state.members) {
      const node = document.createElement("div");
      node.className = "member-item";
      node.textContent = `${member.user.name} (${member.user.role})`;
      els.memberList.appendChild(node);
    }
  }

  const memberIds = new Set(state.members.map((item) => item.user.id));
  const candidates = state.users.filter((item) => item.role === "developer" && !memberIds.has(item.id));
  els.memberUserSelect.innerHTML = "";
  els.memberUserSelect.appendChild(optionList(candidates, (u) => u.id, (u) => `${u.name} (${u.role})`, true, "-- выбрать --"));
}

function renderSprintBlock() {
  els.sprintList.innerHTML = "";
  if (!state.selectedProjectId) {
    els.sprintList.innerHTML = '<div class="muted">Выбери проект</div>';
    return;
  }

  if (!state.sprints.length) {
    els.sprintList.innerHTML = '<div class="muted">Спринтов пока нет</div>';
  } else {
    for (const sprint of state.sprints) {
      const node = document.createElement("div");
      node.className = "sprint-item";
      node.innerHTML = `<strong>${sprint.name}</strong><div class="tiny muted">${sprint.status} | ${sprint.start_date} -> ${sprint.end_date}</div><div class="tiny">${sprint.goal || "без цели"}</div>`;
      els.sprintList.appendChild(node);
    }
  }
}

function renderDashboard() {
  els.dashboardSummary.innerHTML = "";

  if (!state.selectedProjectId) {
    els.dashboardSummary.innerHTML = '<div class="muted">Выбери проект, чтобы увидеть summary</div>';
    return;
  }

  if (!state.dashboard) {
    els.dashboardSummary.innerHTML = '<div class="muted">Данные не загружены</div>';
    return;
  }

  const total = document.createElement("div");
  total.className = "metric";
  total.innerHTML = `<h3>Total tasks</h3><strong>${state.dashboard.total_tasks}</strong>`;
  els.dashboardSummary.appendChild(total);

  const statusBox = document.createElement("div");
  statusBox.className = "metric";
  statusBox.innerHTML = `<h3>By status</h3>${Object.entries(state.dashboard.by_status)
    .map(([key, value]) => `<div>${key}: <strong>${value}</strong></div>`)
    .join("") || "<div>empty</div>"}`;
  els.dashboardSummary.appendChild(statusBox);

  const typeBox = document.createElement("div");
  typeBox.className = "metric";
  typeBox.innerHTML = `<h3>By type</h3>${Object.entries(state.dashboard.by_type)
    .map(([key, value]) => `<div>${key}: <strong>${value}</strong></div>`)
    .join("") || "<div>empty</div>"}`;
  els.dashboardSummary.appendChild(typeBox);
}

function renderTaskSelectors() {
  const projectSelected = Boolean(state.selectedProjectId);

  const sprintOptions = optionList(state.sprints, (s) => s.id, (s) => `${s.name} (${s.status})`, true, "без спринта");
  els.taskSprintSelect.innerHTML = "";
  els.taskSprintSelect.appendChild(sprintOptions);

  const developers = getProjectDevelopers();
  els.taskAssigneeSelect.innerHTML = "";
  els.taskAssigneeSelect.appendChild(optionList(developers, (u) => u.id, (u) => u.name, true, "без исполнителя"));

  els.sprintFilter.innerHTML = "";
  els.sprintFilter.appendChild(optionList(state.sprints, (s) => s.id, (s) => s.name, true, "all"));

  els.assigneeFilter.innerHTML = "";
  els.assigneeFilter.appendChild(optionList(developers, (u) => u.id, (u) => u.name, true, "all"));

  if (!projectSelected) {
    els.taskCreateForm.querySelectorAll("input, textarea, select, button").forEach((item) => {
      item.disabled = true;
    });
    els.sprintForm.querySelectorAll("input, textarea, select, button").forEach((item) => {
      item.disabled = true;
    });
    els.memberForm.querySelectorAll("input, select, button").forEach((item) => {
      item.disabled = true;
    });
  } else {
    els.taskCreateForm.querySelectorAll("input, textarea, select, button").forEach((item) => {
      item.disabled = false;
    });
    els.sprintForm.querySelectorAll("input, textarea, select, button").forEach((item) => {
      item.disabled = false;
    });
    els.memberForm.querySelectorAll("input, select, button").forEach((item) => {
      item.disabled = false;
    });
  }
}

function getAllowedStatusOptions(task) {
  const current = task.status;
  const next = NEXT_STATUS[current];
  if (!next) return [current];

  if (isManager()) {
    if (next === "selected" || next === "closed") {
      return [current, next];
    }
    return [current];
  }

  const allowedForDeveloper = new Set(["selected", "in_progress", "ready_for_acceptance"]);
  if (!allowedForDeveloper.has(next)) {
    return [current];
  }

  if (next === "selected") {
    if (task.assignee_id && task.assignee_id !== state.currentUser.id) {
      return [current];
    }
    return [current, next];
  }

  if (task.assignee_id !== state.currentUser.id) {
    return [current];
  }
  return [current, next];
}

async function loadTaskHistory(taskId) {
  if (state.historyByTask[taskId]) {
    return state.historyByTask[taskId];
  }
  const history = await api(`/tasks/${taskId}/history`);
  state.historyByTask[taskId] = history;
  return history;
}

function renderTaskList() {
  els.taskList.innerHTML = "";

  if (!state.selectedProjectId) {
    els.taskList.innerHTML = '<div class="muted">Сначала выбери проект</div>';
    return;
  }

  if (!state.tasks.length) {
    els.taskList.innerHTML = '<div class="muted">Задач не найдено по текущим фильтрам</div>';
    return;
  }

  const developers = getProjectDevelopers();

  for (const task of state.tasks) {
    const card = document.createElement("article");
    card.className = "task-card";

    const head = document.createElement("div");
    head.className = "task-head";
    head.innerHTML = `<h3>${task.title}</h3>`;

    const badges = document.createElement("div");
    badges.className = "badges";
    badges.innerHTML = `
      <span class="badge status-${task.status}">${task.status}</span>
      <span class="badge">${task.type}</span>
      <span class="badge">${task.priority}</span>
    `;
    head.appendChild(badges);

    const meta = document.createElement("div");
    meta.className = "task-meta";
    meta.innerHTML = `
      <div>Creator: ${task.creator.name}</div>
      <div>Assignee: ${task.assignee ? task.assignee.name : "-"}</div>
      <div>Sprint: ${task.sprint ? task.sprint.name : "-"}</div>
      <div>${task.description || "Без описания"}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const statusBlock = document.createElement("label");
    statusBlock.textContent = "Статус";
    const statusSelect = document.createElement("select");
    const availableStatuses = getAllowedStatusOptions(task);
    for (const statusValue of availableStatuses) {
      const option = document.createElement("option");
      option.value = statusValue;
      option.textContent = statusValue;
      if (task.status === statusValue) {
        option.selected = true;
      }
      statusSelect.appendChild(option);
    }
    statusSelect.disabled = availableStatuses.length <= 1;
    statusSelect.addEventListener("change", async () => {
      try {
        await api(`/tasks/${task.id}/status`, {
          method: "PATCH",
          body: { status: statusSelect.value },
        });
        showMessage("Статус обновлен", "success");
        state.historyByTask[task.id] = null;
        await loadProjectContext();
        await loadTasks();
        renderWorkspace();
      } catch (error) {
        statusSelect.value = task.status;
        showMessage(error.message, "error");
      }
    });
    statusBlock.appendChild(statusSelect);
    actions.appendChild(statusBlock);

    if (isManager()) {
      const assignBlock = document.createElement("label");
      assignBlock.textContent = "Назначить";
      const assignSelect = document.createElement("select");
      assignSelect.appendChild(optionList(developers, (u) => u.id, (u) => u.name));
      if (task.assignee_id) {
        assignSelect.value = String(task.assignee_id);
      }
      assignSelect.disabled = task.status === "closed" || developers.length === 0;
      assignSelect.addEventListener("change", async () => {
        try {
          await api(`/tasks/${task.id}/assign`, {
            method: "PATCH",
            body: { assignee_id: Number(assignSelect.value) },
          });
          showMessage("Исполнитель обновлен", "success");
          state.historyByTask[task.id] = null;
          await loadTasks();
          renderTaskList();
        } catch (error) {
          showMessage(error.message, "error");
        }
      });
      assignBlock.appendChild(assignSelect);
      actions.appendChild(assignBlock);
    }

    const historyToggle = document.createElement("button");
    historyToggle.type = "button";
    historyToggle.className = "secondary";
    historyToggle.textContent = "История";

    const historyBox = document.createElement("div");
    historyBox.className = "history-box hidden";

    historyToggle.addEventListener("click", async () => {
      if (!historyBox.classList.contains("hidden")) {
        historyBox.classList.add("hidden");
        return;
      }

      historyBox.innerHTML = '<div class="muted">Загрузка...</div>';
      historyBox.classList.remove("hidden");
      try {
        const history = await loadTaskHistory(task.id);
        if (!history.length) {
          historyBox.innerHTML = '<div class="muted">История пока пустая</div>';
          return;
        }

        historyBox.innerHTML = "";
        for (const item of history) {
          const line = document.createElement("div");
          line.className = "history-item";
          const actorName = item.actor ? item.actor.name : "system";
          const time = new Date(item.created_at).toLocaleString();
          line.textContent = `${time} | ${actorName} | ${item.action} | ${item.details}`;
          historyBox.appendChild(line);
        }
      } catch (error) {
        historyBox.innerHTML = `<div class="muted">${error.message}</div>`;
      }
    });

    actions.appendChild(historyToggle);

    card.appendChild(head);
    card.appendChild(meta);
    card.appendChild(actions);
    card.appendChild(historyBox);

    els.taskList.appendChild(card);
  }
}

function renderWorkspace() {
  renderProjectList();
  renderMemberBlock();
  renderSprintBlock();
  renderDashboard();
  renderTaskSelectors();
  renderTaskList();
}

function closeDuplicateReviewModal() {
  state.duplicateReview = null;
  els.duplicateReviewModal.classList.add("hidden");
  els.duplicateReviewDetails.classList.add("hidden");
  els.duplicateReviewDetails.innerHTML = "";
  els.duplicateReviewApproveBtn.disabled = true;
}

function openDuplicateReviewModal(reviewDetail, formPayload) {
  state.duplicateReview = {
    taskId: reviewDetail.task_id,
    similarityPercent: reviewDetail.similarity_percent,
    formPayload,
    viewed: false,
  };
  els.duplicateReviewMessage.textContent =
    reviewDetail.message || "Найдена похожая задача. Проверь найденный дубль и прими решение.";
  els.duplicateReviewDetails.classList.add("hidden");
  els.duplicateReviewDetails.innerHTML = "";
  els.duplicateReviewApproveBtn.disabled = true;
  els.duplicateReviewModal.classList.remove("hidden");
}

function buildTaskCreatePayload(formData) {
  const assigneeRaw = String(formData.get("assignee_id") || "");
  const sprintRaw = String(formData.get("sprint_id") || "");
  return {
    title: String(formData.get("title") || ""),
    description: String(formData.get("description") || ""),
    type: String(formData.get("type") || "feature"),
    priority: String(formData.get("priority") || "medium"),
    assignee_id: assigneeRaw ? Number(assigneeRaw) : null,
    sprint_id: sprintRaw ? Number(sprintRaw) : null,
  };
}

async function createTask(payload) {
  const createdTask = await api(`/projects/${state.selectedProjectId}/tasks`, {
    method: "POST",
    body: payload,
  });

  els.taskCreateForm.reset();
  await loadProjectContext();
  await loadTasks();
  renderWorkspace();
  return createdTask;
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(els.loginForm);

  try {
    const response = await api("/auth/login", {
      method: "POST",
      body: {
        email: String(formData.get("email") || ""),
        password: String(formData.get("password") || ""),
      },
    });
    setSession(response.access_token, response.user);
    els.loginForm.reset();
    await refreshWorkspace();
    showMessage("Вход выполнен", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

els.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(els.registerForm);

  try {
    const response = await api("/auth/register", {
      method: "POST",
      body: {
        name: String(formData.get("name") || ""),
        email: String(formData.get("email") || ""),
        password: String(formData.get("password") || ""),
        role: String(formData.get("role") || "developer"),
      },
    });
    els.registerForm.reset();
    showMessage(`Пользователь ${response.name} создан с ролью ${response.role}`, "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

els.logoutBtn.addEventListener("click", () => {
  clearSession();
  showMessage("Сессия завершена", "success");
});

els.refreshBtn.addEventListener("click", async () => {
  try {
    await refreshWorkspace();
    showMessage("Данные обновлены", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

els.projectCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isManager()) return;

  const formData = new FormData(els.projectCreateForm);
  try {
    await api("/projects", {
      method: "POST",
      body: {
        name: String(formData.get("name") || ""),
        description: String(formData.get("description") || ""),
      },
    });
    els.projectCreateForm.reset();
    await refreshWorkspace();
    showMessage("Проект создан", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

els.memberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isManager() || !state.selectedProjectId) return;

  const formData = new FormData(els.memberForm);
  const userId = Number(formData.get("user_id"));
  if (!userId) {
    showMessage("Выбери пользователя", "error");
    return;
  }

  try {
    await api(`/projects/${state.selectedProjectId}/members`, {
      method: "POST",
      body: { user_id: userId },
    });
    await refreshWorkspace();
    showMessage("Участник добавлен", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

els.sprintForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isManager() || !state.selectedProjectId) return;

  const formData = new FormData(els.sprintForm);
  try {
    await api(`/projects/${state.selectedProjectId}/sprints`, {
      method: "POST",
      body: {
        name: String(formData.get("name") || ""),
        goal: String(formData.get("goal") || ""),
        start_date: String(formData.get("start_date") || ""),
        end_date: String(formData.get("end_date") || ""),
        status: String(formData.get("status") || "planned"),
      },
    });
    els.sprintForm.reset();
    await loadProjectContext();
    await loadTasks();
    renderWorkspace();
    showMessage("Спринт создан", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

els.taskCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isManager() || !state.selectedProjectId) return;

  const formData = new FormData(els.taskCreateForm);
  const payload = buildTaskCreatePayload(formData);

  try {
    await createTask(payload);
    showMessage("Задача создана", "success");
  } catch (error) {
    if (error instanceof ApiError && error.payload?.detail?.code === "duplicate_review_required") {
      openDuplicateReviewModal(error.payload.detail, payload);
      return;
    }
    showMessage(error.message, "error");
  }
});

els.duplicateReviewViewBtn.addEventListener("click", async () => {
  if (!state.duplicateReview) return;

  try {
    const task = await api(`/tasks/${state.duplicateReview.taskId}`);
    els.duplicateReviewDetails.innerHTML = `
      <div><strong>#${task.id} ${task.title}</strong></div>
      <div class="muted">Тип: ${task.type}, Приоритет: ${task.priority}, Статус: ${task.status}</div>
      <div>${task.description || "Без описания"}</div>
    `;
    els.duplicateReviewDetails.classList.remove("hidden");
    state.duplicateReview.viewed = true;
    els.duplicateReviewApproveBtn.disabled = false;
  } catch (error) {
    showMessage(error.message, "error");
  }
});

els.duplicateReviewApproveBtn.addEventListener("click", async () => {
  if (!state.duplicateReview || !state.duplicateReview.viewed) {
    return;
  }

  try {
    await createTask({
      ...state.duplicateReview.formPayload,
      duplicate_review_confirmed: true,
      duplicate_review_task_id: state.duplicateReview.taskId,
    });
    closeDuplicateReviewModal();
    showMessage("Задача создана после проверки похожей", "warning");
  } catch (error) {
    if (error instanceof ApiError && error.payload?.detail?.code === "duplicate_review_required") {
      openDuplicateReviewModal(error.payload.detail, state.duplicateReview.formPayload);
      return;
    }
    showMessage(error.message, "error");
  }
});

els.duplicateReviewRejectBtn.addEventListener("click", () => {
  closeDuplicateReviewModal();
  showMessage("Создание задачи отменено", "info");
});

els.filterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await loadTasks();
    renderTaskList();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

els.clearFiltersBtn.addEventListener("click", async () => {
  els.filterForm.reset();
  try {
    await loadTasks();
    renderTaskList();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

async function bootstrap() {
  renderAuthState();
  if (!state.token) {
    return;
  }

  try {
    state.currentUser = await api("/auth/me");
    renderAuthState();
    await refreshWorkspace();
  } catch (error) {
    clearSession();
    showMessage(error.message, "error");
  }
}

bootstrap();
