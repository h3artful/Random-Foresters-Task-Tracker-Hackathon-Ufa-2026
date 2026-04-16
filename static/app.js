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
  activeTaskTab: "tasks",
  taskTitleSearch: "",
  dashboard: null,
  historyByTask: {},
  duplicateReview: null,
  manualTimeResolver: null,
  dragTaskId: null,
  taskDetailsTaskId: null,
};

const els = {
  authSection: document.getElementById("authSection"),
  appSection: document.getElementById("appSection"),
  sessionInfo: document.getElementById("sessionInfo"),
  refreshBtn: document.getElementById("refreshBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  loginForm: document.getElementById("loginForm"),
  projectCreateForm: document.getElementById("projectCreateForm"),
  userCreateForm: document.getElementById("userCreateForm"),
  userManagementList: document.getElementById("userManagementList"),
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
  taskTitleSearch: document.getElementById("taskTitleSearch"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  taskTabActive: document.getElementById("taskTabActive"),
  taskTabArchive: document.getElementById("taskTabArchive"),
  taskList: document.getElementById("taskList"),
  dashboardSummary: document.getElementById("dashboardSummary"),
  globalMessage: document.getElementById("globalMessage"),
  duplicateReviewModal: document.getElementById("duplicateReviewModal"),
  duplicateReviewMessage: document.getElementById("duplicateReviewMessage"),
  duplicateReviewDetails: document.getElementById("duplicateReviewDetails"),
  duplicateReviewViewBtn: document.getElementById("duplicateReviewViewBtn"),
  duplicateReviewApproveBtn: document.getElementById("duplicateReviewApproveBtn"),
  duplicateReviewRejectBtn: document.getElementById("duplicateReviewRejectBtn"),
  manualTimeModal: document.getElementById("manualTimeModal"),
  manualTimeAutoHint: document.getElementById("manualTimeAutoHint"),
  manualTimeDays: document.getElementById("manualTimeDays"),
  manualTimeHours: document.getElementById("manualTimeHours"),
  manualTimeMinutes: document.getElementById("manualTimeMinutes"),
  manualTimeSummary: document.getElementById("manualTimeSummary"),
  manualTimeComment: document.getElementById("manualTimeComment"),
  manualTimeCancelBtn: document.getElementById("manualTimeCancelBtn"),
  manualTimeAutoBtn: document.getElementById("manualTimeAutoBtn"),
  manualTimeApplyBtn: document.getElementById("manualTimeApplyBtn"),
  developerWorkloadModal: document.getElementById("developerWorkloadModal"),
  developerWorkloadTitle: document.getElementById("developerWorkloadTitle"),
  developerWorkloadSummary: document.getElementById("developerWorkloadSummary"),
  developerWorkloadList: document.getElementById("developerWorkloadList"),
  developerWorkloadCloseBtn: document.getElementById("developerWorkloadCloseBtn"),
  taskDetailsModal: document.getElementById("taskDetailsModal"),
  taskDetailsTitle: document.getElementById("taskDetailsTitle"),
  taskDetailsMeta: document.getElementById("taskDetailsMeta"),
  taskDetailsDescription: document.getElementById("taskDetailsDescription"),
  taskCommentsList: document.getElementById("taskCommentsList"),
  taskCommentForm: document.getElementById("taskCommentForm"),
  taskCommentInput: document.getElementById("taskCommentInput"),
  taskCommentSubmitBtn: document.getElementById("taskCommentSubmitBtn"),
  taskDetailsCloseBtn: document.getElementById("taskDetailsCloseBtn"),
};

const NEXT_STATUS = {
  open: "selected",
  selected: "in_progress",
  in_progress: "ready_for_acceptance",
  ready_for_acceptance: "closed",
  closed: null,
};

const TASK_STATUSES = ["open", "selected", "in_progress", "ready_for_acceptance", "closed"];
const TAKEN_TASK_STATUSES = new Set(["selected", "in_progress", "ready_for_acceptance"]);
const BOARD_COLUMNS = [
  { status: "open", title: "BACKLOG" },
  { status: "selected", title: "TO DO" },
  { status: "in_progress", title: "IN PROGRESS" },
  { status: "ready_for_acceptance", title: "REVIEW / QA" },
  { status: "closed", title: "DONE" },
];

function isManager() {
  return state.currentUser?.role === "manager";
}

function isAdmin() {
  return state.currentUser?.role === "admin";
}

function isManagerLike() {
  return isManager() || isAdmin();
}

function currentProject() {
  if (!state.selectedProjectId) return null;
  return state.projects.find((item) => item.id === state.selectedProjectId) || null;
}

function getDevelopers() {
  return state.users.filter((item) => item.role === "developer" || item.role === "admin");
}

function getProjectDevelopers() {
  const selectedProject = currentProject();
  if (!selectedProject) return [];
  return state.members
    .map((item) => item.user)
    .filter((item) => item.role === "developer" || item.role === "admin");
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

function isArchiveTab() {
  return state.activeTaskTab === "archive";
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
  state.activeTaskTab = "tasks";
  state.taskTitleSearch = "";
  state.historyByTask = {};
  state.duplicateReview = null;
  state.dragTaskId = null;
  state.taskDetailsTaskId = null;
  els.taskTitleSearch.value = "";
  localStorage.removeItem(TOKEN_KEY);
  renderAuthState();
  renderWorkspace();
  els.duplicateReviewModal.classList.add("hidden");
  closeManualTimeModal(null);
  els.developerWorkloadModal.classList.add("hidden");
  els.taskDetailsModal.classList.add("hidden");
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
    item.classList.toggle("hidden", !loggedIn || !isManagerLike());
  });
}

async function loadUsers() {
  if (!isManagerLike()) {
    state.users = [];
    return;
  }
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
      archived: isArchiveTab(),
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
      closeDeveloperWorkloadModal();
      closeTaskDetailsModal();
      state.selectedProjectId = project.id;
      state.historyByTask = {};
      await loadProjectContext();
      await loadTasks();
      renderWorkspace();
    });
    els.projectList.appendChild(item);
  }
}

function closeDeveloperWorkloadModal() {
  els.developerWorkloadModal.classList.add("hidden");
  els.developerWorkloadSummary.textContent = "";
  els.developerWorkloadList.innerHTML = "";
}

function closeTaskDetailsModal() {
  state.taskDetailsTaskId = null;
  els.taskDetailsModal.classList.add("hidden");
  els.taskDetailsTitle.textContent = "Задача";
  els.taskDetailsMeta.textContent = "";
  els.taskDetailsDescription.textContent = "";
  els.taskCommentsList.innerHTML = "";
  els.taskCommentInput.value = "";
}

function renderTaskComments(comments) {
  els.taskCommentsList.innerHTML = "";
  if (!comments.length) {
    els.taskCommentsList.innerHTML = '<div class="muted">Комментариев пока нет</div>';
    return;
  }

  for (const comment of comments) {
    const item = document.createElement("article");
    item.className = "comment-item";

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    const createdAt = new Date(comment.created_at).toLocaleString();
    meta.textContent = `${createdAt} | ${comment.author.name} (${comment.author.role})`;

    const body = document.createElement("div");
    body.className = "comment-body";
    body.textContent = comment.content;

    item.appendChild(meta);
    item.appendChild(body);
    els.taskCommentsList.appendChild(item);
  }
}

async function loadTaskCommentsForModal(taskId) {
  els.taskCommentsList.innerHTML = '<div class="muted">Загрузка комментариев...</div>';
  try {
    const comments = await api(`/tasks/${taskId}/comments`);
    if (state.taskDetailsTaskId !== taskId) {
      return;
    }
    renderTaskComments(comments);
  } catch (error) {
    if (state.taskDetailsTaskId !== taskId) {
      return;
    }
    els.taskCommentsList.innerHTML = `<div class="muted">${error.message}</div>`;
  }
}

function bindTaskOpenHandler(card, taskId) {
  card.classList.add("task-card-clickable");
  card.addEventListener("click", async (event) => {
    if (event.target.closest("button, select, textarea, input, label, .history-box")) {
      return;
    }
    if (state.dragTaskId) {
      return;
    }
    await openTaskDetailsModal(taskId);
  });
}

async function openTaskDetailsModal(taskId) {
  state.taskDetailsTaskId = taskId;
  els.taskDetailsTitle.textContent = "Загрузка задачи...";
  els.taskDetailsMeta.textContent = "";
  els.taskDetailsDescription.textContent = "";
  els.taskCommentsList.innerHTML = "";
  els.taskCommentInput.value = "";
  els.taskDetailsModal.classList.remove("hidden");

  try {
    const task = await api(`/tasks/${taskId}`);
    if (state.taskDetailsTaskId !== taskId) {
      return;
    }

    els.taskDetailsTitle.textContent = `#${task.id} ${task.title}`;
    els.taskDetailsMeta.textContent = `Статус: ${task.status} | Приоритет: ${task.priority} | Тип: ${task.type} | Исполнитель: ${task.assignee ? task.assignee.name : "-"} | Spent: ${formatSpentSummary(task)}`;
    els.taskDetailsDescription.textContent = task.description || "Без описания";
    await loadTaskCommentsForModal(taskId);
  } catch (error) {
    showMessage(error.message, "error");
    closeTaskDetailsModal();
  }
}

function renderDeveloperWorkloadList(tasks) {
  els.developerWorkloadList.innerHTML = "";
  if (!tasks.length) {
    els.developerWorkloadList.innerHTML = '<div class="muted">Сейчас нет взятых задач</div>';
    return;
  }

  for (const task of tasks) {
    const item = document.createElement("article");
    item.className = "workload-item";

    const title = document.createElement("div");
    title.className = "workload-item-title";
    title.textContent = `#${task.id} ${task.title}`;

    const meta = document.createElement("div");
    meta.className = "tiny muted";
    meta.textContent = `Статус: ${task.status} | Приоритет: ${task.priority} | Тип: ${task.type}`;

    const sprint = document.createElement("div");
    sprint.className = "tiny muted";
    sprint.textContent = `Спринт: ${task.sprint ? task.sprint.name : "-"}`;

    item.appendChild(title);
    item.appendChild(meta);
    item.appendChild(sprint);
    els.developerWorkloadList.appendChild(item);
  }
}

async function openDeveloperWorkloadModal(user) {
  if (!state.selectedProjectId) {
    return;
  }

  els.developerWorkloadTitle.textContent = `Загруженность: ${user.name}`;
  els.developerWorkloadSummary.textContent = "Загрузка...";
  els.developerWorkloadList.innerHTML = "";
  els.developerWorkloadModal.classList.remove("hidden");

  try {
    const assignedTasks = await api("/tasks", {
      query: {
        project_id: state.selectedProjectId,
        assignee_id: user.id,
      },
    });
    const takenTasks = assignedTasks.filter((task) => TAKEN_TASK_STATUSES.has(task.status));
    const selectedCount = takenTasks.filter((task) => task.status === "selected").length;
    const inProgressCount = takenTasks.filter((task) => task.status === "in_progress").length;
    const reviewCount = takenTasks.filter((task) => task.status === "ready_for_acceptance").length;

    els.developerWorkloadSummary.textContent =
      `Взято задач: ${takenTasks.length} (selected: ${selectedCount}, in_progress: ${inProgressCount}, ready_for_acceptance: ${reviewCount})`;
    renderDeveloperWorkloadList(takenTasks);
  } catch (error) {
    els.developerWorkloadSummary.textContent = "Не удалось загрузить загруженность";
    els.developerWorkloadList.innerHTML = `<div class="muted">${error.message}</div>`;
  }
}

function renderUserManagement() {
  if (!els.userManagementList) {
    return;
  }

  els.userManagementList.innerHTML = "";
  if (!isManagerLike()) {
    return;
  }

  if (!state.users.length) {
    els.userManagementList.innerHTML = '<div class="muted">Пользователи не загружены</div>';
    return;
  }

  for (const user of state.users) {
    const node = document.createElement("div");
    node.className = "member-item";
    node.innerHTML = `<strong>${user.name}</strong><div class="tiny muted">${user.login} | ${user.role}</div>`;
    els.userManagementList.appendChild(node);
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
      const isDeveloperMember = member.user.role === "developer";
      node.className = `member-item${isDeveloperMember ? " member-item-clickable" : ""}`;
      if (isDeveloperMember) {
        const title = document.createElement("div");
        title.textContent = `${member.user.name} (${member.user.role})`;
        const hint = document.createElement("div");
        hint.className = "tiny muted";
        hint.textContent = "Нажми, чтобы посмотреть загруженность";
        node.appendChild(title);
        node.appendChild(hint);
        node.addEventListener("click", async () => {
          await openDeveloperWorkloadModal(member.user);
        });
      } else {
        node.textContent = `${member.user.name} (${member.user.role})`;
      }
      els.memberList.appendChild(node);
    }
  }

  const memberIds = new Set(state.members.map((item) => item.user.id));
  const candidates = state.users.filter(
    (item) => (item.role === "developer" || item.role === "admin") && !memberIds.has(item.id),
  );
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

function renderTaskTabs() {
  const archiveSelected = isArchiveTab();
  els.taskTabActive.classList.toggle("active", !archiveSelected);
  els.taskTabArchive.classList.toggle("active", archiveSelected);
  els.taskTabActive.setAttribute("aria-selected", String(!archiveSelected));
  els.taskTabArchive.setAttribute("aria-selected", String(archiveSelected));
}

function getAllowedStatusOptions(task) {
  if (isAdmin()) {
    return TASK_STATUSES;
  }

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

function getTaskById(taskId) {
  return state.tasks.find((task) => task.id === taskId) || null;
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function parseUtcLikeDateToMillis(value) {
  if (!value) {
    return Number.NaN;
  }

  const raw = String(value).trim();
  if (!raw) {
    return Number.NaN;
  }

  const isoBase = raw.includes("T") ? raw : raw.replace(" ", "T");
  const hasTimezone = /[zZ]$|[+\-]\d{2}:\d{2}$/.test(isoBase);
  const normalized = hasTimezone ? isoBase : `${isoBase}Z`;
  return Date.parse(normalized);
}

function getLiveTrackedSeconds(task) {
  const baseTracked = Number(task.tracked_seconds || 0);
  if (task.status !== "in_progress" || !task.in_progress_started_at) {
    return baseTracked;
  }

  const startedAtTs = parseUtcLikeDateToMillis(task.in_progress_started_at);
  if (Number.isNaN(startedAtTs)) {
    return baseTracked;
  }

  const elapsed = Math.max(0, Math.floor((Date.now() - startedAtTs) / 1000));
  return baseTracked + elapsed;
}

function formatSpentSummary(task) {
  const trackedText = formatDuration(getLiveTrackedSeconds(task));
  if (task.reported_seconds == null) {
    return `auto: ${trackedText} | manual: -`;
  }

  const comment = task.reported_comment ? ` (${task.reported_comment})` : "";
  return `auto: ${trackedText} | manual: ${formatDuration(task.reported_seconds)}${comment}`;
}

function getManualTimeMinutes() {
  const days = Number(els.manualTimeDays.value || 0);
  const hours = Number(els.manualTimeHours.value || 0);
  const minutes = Number(els.manualTimeMinutes.value || 0);
  return (days * 24 * 60) + (hours * 60) + minutes;
}

function updateManualTimeSummary() {
  const days = Number(els.manualTimeDays.value || 0);
  const hours = Number(els.manualTimeHours.value || 0);
  const minutes = Number(els.manualTimeMinutes.value || 0);
  const totalMinutes = getManualTimeMinutes();

  if (totalMinutes === 0) {
    els.manualTimeSummary.textContent = "Будет использован только автотрекинг.";
    return;
  }

  els.manualTimeSummary.textContent =
    `Выбрано вручную: ${days}d ${hours}h ${minutes}m (${totalMinutes} мин)`;
}

function closeManualTimeModal(result = null) {
  els.manualTimeModal.classList.add("hidden");
  if (state.manualTimeResolver) {
    const resolver = state.manualTimeResolver;
    state.manualTimeResolver = null;
    resolver(result);
  }
}

function openManualTimeModal(task) {
  return new Promise((resolve) => {
    state.manualTimeResolver = resolve;
    els.manualTimeDays.value = "0";
    els.manualTimeHours.value = "0";
    els.manualTimeMinutes.value = "0";
    els.manualTimeComment.value = "";
    els.manualTimeAutoHint.textContent = `Автотрекинг сейчас: ${formatDuration(getLiveTrackedSeconds(task))}`;
    updateManualTimeSummary();
    els.manualTimeModal.classList.remove("hidden");
  });
}

async function prepareStatusPayload(task, targetStatus) {
  const payload = { status: targetStatus };
  if (targetStatus !== "ready_for_acceptance") {
    return payload;
  }

  const manualInput = await openManualTimeModal(task);
  if (manualInput === null) {
    showMessage("Перевод задачи отменен", "info");
    return null;
  }

  if (!manualInput.useManual) {
    return payload;
  }

  payload.reported_spent_minutes = manualInput.minutes;
  if (manualInput.comment) {
    payload.reported_spent_comment = manualInput.comment;
  }

  return payload;
}

function canMoveTaskToStatus(task, targetStatus) {
  if (!task || task.status === targetStatus) {
    return false;
  }
  return getAllowedStatusOptions(task).includes(targetStatus);
}

function clearBoardDropMarkers() {
  document.querySelectorAll(".board-dropzone").forEach((dropzone) => {
    dropzone.classList.remove("is-drop-allowed", "is-drop-blocked");
  });
  document.querySelectorAll(".board-task-card").forEach((card) => {
    card.classList.remove("is-dragging");
  });
}

async function moveTaskToStatus(task, targetStatus) {
  const payload = await prepareStatusPayload(task, targetStatus);
  if (!payload) {
    return;
  }

  await api(`/tasks/${task.id}/status`, {
    method: "PATCH",
    body: payload,
  });
  showMessage("Статус обновлен", "success");
  state.historyByTask[task.id] = null;
  await loadProjectContext();
  await loadTasks();
  renderWorkspace();
}

function createHistoryControls(task) {
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

  return { historyToggle, historyBox };
}

function renderArchiveTaskList(tasks) {
  for (const task of tasks) {
    const card = document.createElement("article");
    card.className = "task-card";
    bindTaskOpenHandler(card, task.id);
    card.innerHTML = `
      <div class="task-head">
        <h3>${task.title}</h3>
        <div class="badges">
          <span class="badge status-${task.status}">${task.status}</span>
          <span class="badge">${task.type}</span>
          <span class="badge">${task.priority}</span>
        </div>
      </div>
      <div class="task-meta">
        <div>Creator: ${task.creator.name}</div>
        <div>Assignee: ${task.assignee ? task.assignee.name : "-"}</div>
        <div>Sprint: ${task.sprint ? task.sprint.name : "-"}</div>
        <div>Spent: ${formatSpentSummary(task)}</div>
        <div>Архивировано: ${new Date(task.archived_at).toLocaleString()}${task.archived_by ? ` (${task.archived_by.name})` : ""}</div>
        <div>${task.description || "Без описания"}</div>
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "task-actions";

    if (isManagerLike()) {
      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.className = "secondary";
      restoreButton.textContent = "Вернуть из архива";
      restoreButton.addEventListener("click", async () => {
        restoreButton.disabled = true;
        try {
          await api(`/tasks/${task.id}/restore`, { method: "POST" });
          showMessage("Задача восстановлена из архива", "success");
          state.historyByTask[task.id] = null;
          await loadProjectContext();
          await loadTasks();
          renderWorkspace();
        } catch (error) {
          restoreButton.disabled = false;
          showMessage(error.message, "error");
        }
      });
      actions.appendChild(restoreButton);
    }

    const historyControls = createHistoryControls(task);
    actions.appendChild(historyControls.historyToggle);
    card.appendChild(actions);
    card.appendChild(historyControls.historyBox);
    els.taskList.appendChild(card);
  }
}

function createBoardTaskCard(task, developers) {
  const card = document.createElement("article");
  card.className = "board-task-card";
  card.dataset.taskId = String(task.id);
  bindTaskOpenHandler(card, task.id);

  const top = document.createElement("div");
  top.className = "board-task-top";

  const title = document.createElement("h3");
  title.className = "board-task-title";
  title.textContent = task.title;

  const dragHandle = document.createElement("button");
  dragHandle.type = "button";
  dragHandle.className = "board-drag-handle secondary";
  const canDrag = getAllowedStatusOptions(task).some((statusValue) => statusValue !== task.status);
  dragHandle.textContent = canDrag ? "DRAG" : "LOCK";
  dragHandle.draggable = canDrag;
  dragHandle.title = canDrag ? "Перетащи карточку в другую колонку" : "Для этой задачи переходы недоступны";

  if (canDrag) {
    dragHandle.addEventListener("dragstart", (event) => {
      state.dragTaskId = task.id;
      card.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(task.id));
      }
    });
    dragHandle.addEventListener("dragend", () => {
      state.dragTaskId = null;
      clearBoardDropMarkers();
    });
  }

  top.appendChild(title);
  top.appendChild(dragHandle);

  const meta = document.createElement("div");
  meta.className = "board-task-meta";
  meta.innerHTML = `
    <div>#${task.id} • ${task.type}</div>
    <div>Assignee: ${task.assignee ? task.assignee.name : "-"}</div>
    <div>Sprint: ${task.sprint ? task.sprint.name : "-"}</div>
    <div>Spent: ${formatSpentSummary(task)}</div>
  `;

  const badges = document.createElement("div");
  badges.className = "badges";
  badges.innerHTML = `
    <span class="badge status-${task.status}">${task.status}</span>
    <span class="badge">${task.priority}</span>
  `;

  const actions = document.createElement("div");
  actions.className = "board-task-actions";

  if (isManagerLike()) {
    const assignBlock = document.createElement("label");
    assignBlock.className = "board-inline-field";
    assignBlock.textContent = "Назначить";

    const assignSelect = document.createElement("select");
    assignSelect.appendChild(optionList(developers, (user) => user.id, (user) => user.name));
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

  if (isManagerLike() && task.status === "closed") {
    const archiveButton = document.createElement("button");
    archiveButton.type = "button";
    archiveButton.className = "secondary";
    archiveButton.textContent = "В архив";
    archiveButton.addEventListener("click", async () => {
      archiveButton.disabled = true;
      try {
        await api(`/tasks/${task.id}/archive`, { method: "POST" });
        showMessage("Задача отправлена в архив", "success");
        state.historyByTask[task.id] = null;
        await loadProjectContext();
        await loadTasks();
        renderWorkspace();
      } catch (error) {
        archiveButton.disabled = false;
        showMessage(error.message, "error");
      }
    });
    actions.appendChild(archiveButton);
  }

  const historyControls = createHistoryControls(task);
  actions.appendChild(historyControls.historyToggle);

  card.appendChild(top);
  card.appendChild(meta);
  card.appendChild(badges);
  card.appendChild(actions);
  card.appendChild(historyControls.historyBox);
  return card;
}

function renderScrumBoard(tasks) {
  const board = document.createElement("div");
  board.className = "scrum-board";

  const developers = getProjectDevelopers();
  const tasksByStatus = {};
  for (const statusValue of TASK_STATUSES) {
    tasksByStatus[statusValue] = [];
  }
  for (const task of tasks) {
    if (!tasksByStatus[task.status]) {
      tasksByStatus[task.status] = [];
    }
    tasksByStatus[task.status].push(task);
  }

  for (const column of BOARD_COLUMNS) {
    const section = document.createElement("section");
    section.className = `board-column status-${column.status}`;

    const header = document.createElement("div");
    header.className = "board-column-header";
    header.innerHTML = `<span>${column.title}</span><span class="board-column-count">${tasksByStatus[column.status].length}</span>`;

    const dropzone = document.createElement("div");
    dropzone.className = "board-dropzone";
    dropzone.dataset.status = column.status;

    dropzone.addEventListener("dragover", (event) => {
      const taskId = state.dragTaskId || Number(event.dataTransfer?.getData("text/plain") || "0");
      const draggedTask = getTaskById(taskId);
      if (!draggedTask) {
        return;
      }
      const allowed = canMoveTaskToStatus(draggedTask, column.status);
      dropzone.classList.toggle("is-drop-allowed", allowed);
      dropzone.classList.toggle("is-drop-blocked", !allowed);
      if (allowed) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      }
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("is-drop-allowed", "is-drop-blocked");
    });

    dropzone.addEventListener("drop", async (event) => {
      event.preventDefault();
      const taskId = state.dragTaskId || Number(event.dataTransfer?.getData("text/plain") || "0");
      const draggedTask = getTaskById(taskId);
      state.dragTaskId = null;
      clearBoardDropMarkers();
      if (!draggedTask) {
        return;
      }
      if (!canMoveTaskToStatus(draggedTask, column.status)) {
        showMessage("Для этой роли переход в выбранный статус недоступен", "error");
        return;
      }
      try {
        await moveTaskToStatus(draggedTask, column.status);
      } catch (error) {
        showMessage(error.message, "error");
      }
    });

    const columnTasks = tasksByStatus[column.status];
    if (!columnTasks.length) {
      const empty = document.createElement("div");
      empty.className = "board-empty";
      empty.textContent = "Нет задач";
      dropzone.appendChild(empty);
    } else {
      for (const task of columnTasks) {
        dropzone.appendChild(createBoardTaskCard(task, developers));
      }
    }

    section.appendChild(header);
    section.appendChild(dropzone);
    board.appendChild(section);
  }

  els.taskList.appendChild(board);
}

function renderTaskList() {
  els.taskList.innerHTML = "";

  if (!state.selectedProjectId) {
    els.taskList.innerHTML = '<div class="muted">Сначала выбери проект</div>';
    return;
  }

  const normalizedSearch = state.taskTitleSearch.trim().toLocaleLowerCase();
  const filteredTasks = normalizedSearch
    ? state.tasks.filter((task) => task.title.toLocaleLowerCase().includes(normalizedSearch))
    : state.tasks;

  if (!filteredTasks.length) {
    els.taskList.innerHTML = normalizedSearch
      ? '<div class="muted">Поиск по заголовку не дал результатов</div>'
      : isArchiveTab()
        ? '<div class="muted">В архиве задач по текущим фильтрам нет</div>'
        : '<div class="muted">Задач не найдено по текущим фильтрам</div>';
    return;
  }

  if (isArchiveTab()) {
    renderArchiveTaskList(filteredTasks);
    return;
  }
  renderScrumBoard(filteredTasks);
}

function renderWorkspace() {
  renderProjectList();
  renderUserManagement();
  renderMemberBlock();
  renderSprintBlock();
  renderDashboard();
  renderTaskSelectors();
  renderTaskTabs();
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
        login: String(formData.get("login") || ""),
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

els.userCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isManagerLike()) return;

  const formData = new FormData(els.userCreateForm);
  try {
    const response = await api("/users", {
      method: "POST",
      body: {
        name: String(formData.get("name") || ""),
        login: String(formData.get("login") || ""),
        password: String(formData.get("password") || ""),
        role: String(formData.get("role") || "developer"),
      },
    });
    els.userCreateForm.reset();
    await loadUsers();
    renderUserManagement();
    showMessage(`Пользователь ${response.name} (${response.login}) создан`, "success");
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
  if (!isManagerLike()) return;

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
  if (!isManagerLike() || !state.selectedProjectId) return;

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
  if (!isManagerLike() || !state.selectedProjectId) return;

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
  if (!isManagerLike() || !state.selectedProjectId) return;

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

[els.manualTimeDays, els.manualTimeHours, els.manualTimeMinutes].forEach((slider) => {
  slider.addEventListener("input", () => {
    updateManualTimeSummary();
  });
});

els.manualTimeCancelBtn.addEventListener("click", () => {
  closeManualTimeModal(null);
});

els.manualTimeAutoBtn.addEventListener("click", () => {
  closeManualTimeModal({ useManual: false, minutes: 0, comment: "" });
});

els.manualTimeApplyBtn.addEventListener("click", () => {
  const minutes = getManualTimeMinutes();
  const comment = String(els.manualTimeComment.value || "").trim();
  if (minutes < 0 || !Number.isInteger(minutes)) {
    showMessage("Время должно быть неотрицательным целым значением", "error");
    return;
  }
  closeManualTimeModal({ useManual: true, minutes, comment });
});

els.manualTimeModal.addEventListener("click", (event) => {
  if (event.target === els.manualTimeModal) {
    closeManualTimeModal(null);
  }
});

els.developerWorkloadCloseBtn.addEventListener("click", () => {
  closeDeveloperWorkloadModal();
});

els.developerWorkloadModal.addEventListener("click", (event) => {
  if (event.target === els.developerWorkloadModal) {
    closeDeveloperWorkloadModal();
  }
});

els.taskDetailsCloseBtn.addEventListener("click", () => {
  closeTaskDetailsModal();
});

els.taskDetailsModal.addEventListener("click", (event) => {
  if (event.target === els.taskDetailsModal) {
    closeTaskDetailsModal();
  }
});

els.taskCommentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.taskDetailsTaskId) {
    return;
  }

  const content = String(els.taskCommentInput.value || "").trim();
  if (!content) {
    showMessage("Комментарий не может быть пустым", "error");
    return;
  }

  els.taskCommentSubmitBtn.disabled = true;
  try {
    await api(`/tasks/${state.taskDetailsTaskId}/comments`, {
      method: "POST",
      body: { content },
    });
    els.taskCommentInput.value = "";
    await loadTaskCommentsForModal(state.taskDetailsTaskId);
    showMessage("Комментарий добавлен", "success");
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    els.taskCommentSubmitBtn.disabled = false;
  }
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

els.taskTitleSearch.addEventListener("input", (event) => {
  state.taskTitleSearch = String(event.target.value || "");
  renderTaskList();
});

els.taskTabActive.addEventListener("click", async () => {
  if (state.activeTaskTab === "tasks") return;
  state.activeTaskTab = "tasks";
  try {
    await loadTasks();
    renderWorkspace();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

els.taskTabArchive.addEventListener("click", async () => {
  if (state.activeTaskTab === "archive") return;
  state.activeTaskTab = "archive";
  try {
    await loadTasks();
    renderWorkspace();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  if (!els.taskDetailsModal.classList.contains("hidden")) {
    closeTaskDetailsModal();
  }
  if (!els.developerWorkloadModal.classList.contains("hidden")) {
    closeDeveloperWorkloadModal();
  }
  if (!els.duplicateReviewModal.classList.contains("hidden")) {
    closeDuplicateReviewModal();
  }
  if (!els.manualTimeModal.classList.contains("hidden")) {
    closeManualTimeModal(null);
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
