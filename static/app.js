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
  developerDashboard: null,
  historyByTask: {},
  taskEstimatesById: {},
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
  developerDashboardSummary: document.getElementById("developerDashboardSummary"),
  developerDashboardList: document.getElementById("developerDashboardList"),
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
  { status: "open", title: "БЭКЛОГ" },
  { status: "selected", title: "К ВЫПОЛНЕНИЮ" },
  { status: "in_progress", title: "В РАБОТЕ" },
  { status: "ready_for_acceptance", title: "ПРОВЕРКА" },
  { status: "closed", title: "ГОТОВО" },
];
const ROLE_LABELS = {
  developer: "Разработчик",
  manager: "Менеджер",
  admin: "Администратор",
};
const USER_ROLE_ORDER = {
  admin: 0,
  manager: 1,
  developer: 2,
};
const SPRINT_STATUS_LABELS = {
  planned: "Запланирован",
  active: "Активный",
  completed: "Завершён",
};
const TASK_TYPE_LABELS = {
  feature: "Фича",
  bug: "Баг",
  tech_debt: "Техдолг",
  documentation: "Документация",
};
const TASK_STATUS_LABELS = {
  open: "Открыта",
  selected: "Выбрана",
  in_progress: "В работе",
  ready_for_acceptance: "На проверке",
  closed: "Закрыта",
};
const PRIORITY_LABELS = {
  Trivial: "Тривиальный",
  Minor: "Незначительный",
  Low: "Низкий",
  Medium: "Средний",
  Major: "Крупный",
  High: "Высокий",
  Critical: "Критический",
  Blocker: "Блокирующий",
};

function labelByMap(value, labels, fallback = "-") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return labels[value] || value;
}

function formatRole(role) {
  return labelByMap(role, ROLE_LABELS);
}

function formatSprintStatus(status) {
  return labelByMap(status, SPRINT_STATUS_LABELS);
}

function formatTaskType(type) {
  return labelByMap(type, TASK_TYPE_LABELS);
}

function formatTaskStatus(status) {
  return labelByMap(status, TASK_STATUS_LABELS);
}

function formatPriority(priority) {
  return labelByMap(priority, PRIORITY_LABELS);
}

function isManager() {
  return state.currentUser?.role === "manager";
}

function isAdmin() {
  return state.currentUser?.role === "admin";
}

function isDeveloper() {
  return state.currentUser?.role === "developer";
}

function isManagerLike() {
  return isManager() || isAdmin();
}

function isTaskAssignedToCurrentUser(task) {
  return Boolean(state.currentUser && task.assignee_id && task.assignee_id === state.currentUser.id);
}

function currentProject() {
  if (!state.selectedProjectId) return null;
  return state.projects.find((item) => item.id === state.selectedProjectId) || null;
}

function projectNameById(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (project) {
    return project.name;
  }
  return `Проект #${projectId}`;
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
    let detail = "Ошибка запроса";
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
  state.developerDashboard = null;
  state.selectedProjectId = null;
  state.activeTaskTab = "tasks";
  state.taskTitleSearch = "";
  state.historyByTask = {};
  state.taskEstimatesById = {};
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
    els.sessionInfo.textContent = `${state.currentUser.name} (${formatRole(state.currentUser.role)})`;
  } else {
    els.sessionInfo.textContent = "Не авторизован";
  }

  document.querySelectorAll(".manager-only").forEach((item) => {
    item.classList.toggle("hidden", !loggedIn || !isManagerLike());
  });
  document.querySelectorAll(".developer-only").forEach((item) => {
    item.classList.toggle("hidden", !loggedIn || !isDeveloper());
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

async function loadDeveloperDashboard() {
  if (!state.currentUser || !isDeveloper()) {
    state.developerDashboard = null;
    return;
  }

  try {
    state.developerDashboard = await api("/dashboard/developer");
  } catch (_) {
    state.developerDashboard = null;
  }
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
  await loadTaskEstimates();
  await loadDeveloperDashboard();
}

async function loadTaskEstimates() {
  state.taskEstimatesById = {};
  if (!isManagerLike() || !state.selectedProjectId) {
    return;
  }

  const filters = readTaskFilters();
  try {
    const estimates = await api("/tasks/estimates", {
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
    state.taskEstimatesById = Object.fromEntries(
      estimates.map((item) => [item.task_id, item]),
    );
  } catch (_) {
    state.taskEstimatesById = {};
  }
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
    meta.textContent = `${createdAt} | ${comment.author.name} (${formatRole(comment.author.role)})`;

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

    let estimate = null;
    if (isManagerLike()) {
      estimate = state.taskEstimatesById[task.id] || null;
      if (!estimate) {
        try {
          estimate = await api(`/tasks/${task.id}/estimate`);
          if (estimate) {
            state.taskEstimatesById[task.id] = estimate;
          }
        } catch (_) {
          estimate = null;
        }
      }
    }

    const estimateText = isManagerLike() ? ` | Оценка ML: ${formatMlEstimate(estimate)}` : "";
    els.taskDetailsTitle.textContent = `#${task.id} ${task.title}`;
    els.taskDetailsMeta.textContent =
      `Статус: ${formatTaskStatus(task.status)} | Приоритет: ${formatPriority(task.priority)} | Тип: ${formatTaskType(task.type)} | Исполнитель: ${task.assignee ? task.assignee.name : "-"} | Затраченное время: ${formatSpentSummary(task)}${estimateText}`;
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

  const tasksByProject = new Map();
  for (const task of tasks) {
    const bucket = tasksByProject.get(task.project_id) || [];
    bucket.push(task);
    tasksByProject.set(task.project_id, bucket);
  }

  const sortedProjects = Array.from(tasksByProject.entries()).sort((left, right) =>
    projectNameById(left[0]).localeCompare(projectNameById(right[0]), "ru"),
  );

  for (const [projectId, projectTasks] of sortedProjects) {
    const group = document.createElement("section");
    group.className = "workload-project-group";

    const header = document.createElement("div");
    header.className = "workload-project-title";
    header.textContent = `${projectNameById(projectId)}: ${projectTasks.length}`;
    group.appendChild(header);

    for (const task of projectTasks) {
      const item = document.createElement("article");
      item.className = "workload-item";

      const title = document.createElement("div");
      title.className = "workload-item-title";
      title.textContent = `#${task.id} ${task.title}`;

      const meta = document.createElement("div");
      meta.className = "tiny muted";
      meta.textContent = `Статус: ${formatTaskStatus(task.status)} | Приоритет: ${formatPriority(task.priority)} | Тип: ${formatTaskType(task.type)}`;

      const sprint = document.createElement("div");
      sprint.className = "tiny muted";
      sprint.textContent = `Спринт: ${task.sprint ? task.sprint.name : "-"}`;

      item.appendChild(title);
      item.appendChild(meta);
      item.appendChild(sprint);
      group.appendChild(item);
    }

    els.developerWorkloadList.appendChild(group);
  }
}

async function openDeveloperWorkloadModal(user) {
  if (!isManagerLike()) {
    showMessage("Просмотр загруженности разработчиков доступен только manager/admin", "error");
    return;
  }

  els.developerWorkloadTitle.textContent = `Загруженность: ${user.name}`;
  els.developerWorkloadSummary.textContent = "Загрузка...";
  els.developerWorkloadList.innerHTML = "";
  els.developerWorkloadModal.classList.remove("hidden");

  try {
    const assignedTasks = await api("/tasks", {
      query: {
        assignee_id: user.id,
      },
    });
    const takenTasks = assignedTasks.filter((task) => TAKEN_TASK_STATUSES.has(task.status));
    const selectedCount = takenTasks.filter((task) => task.status === "selected").length;
    const inProgressCount = takenTasks.filter((task) => task.status === "in_progress").length;
    const reviewCount = takenTasks.filter((task) => task.status === "ready_for_acceptance").length;
    const projectsInLoad = new Set(takenTasks.map((task) => task.project_id)).size;

    els.developerWorkloadSummary.textContent =
      `Взято задач: ${takenTasks.length} в ${projectsInLoad} проектах (${formatTaskStatus("selected")}: ${selectedCount}, ${formatTaskStatus("in_progress")}: ${inProgressCount}, ${formatTaskStatus("ready_for_acceptance")}: ${reviewCount})`;
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

  const sortedUsers = [...state.users].sort((left, right) => {
    const leftOrder = USER_ROLE_ORDER[left.role] ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = USER_ROLE_ORDER[right.role] ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    const nameDiff = left.name.localeCompare(right.name, "ru");
    if (nameDiff !== 0) {
      return nameDiff;
    }
    return left.login.localeCompare(right.login, "ru");
  });

  for (const user of sortedUsers) {
    const node = document.createElement("div");
    const isDeveloper = user.role === "developer";
    node.className = `member-item${isDeveloper ? " member-item-clickable" : ""}`;

    const title = document.createElement("strong");
    title.textContent = user.name;

    const meta = document.createElement("div");
    meta.className = "tiny muted";
    meta.textContent = `${user.login} | ${formatRole(user.role)}`;

    node.appendChild(title);
    node.appendChild(meta);

    if (isDeveloper) {
      const hint = document.createElement("div");
      hint.className = "tiny muted";
      hint.textContent = "Нажми, чтобы посмотреть загруженность по всем проектам";
      node.appendChild(hint);
      node.addEventListener("click", async () => {
        await openDeveloperWorkloadModal(user);
      });
    }

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
    const canInspectDeveloperWorkload = isManagerLike();
    for (const member of state.members) {
      const node = document.createElement("div");
      const isDeveloperMember = member.user.role === "developer";
      const isClickableDeveloper = isDeveloperMember && canInspectDeveloperWorkload;
      node.className = `member-item${isClickableDeveloper ? " member-item-clickable" : ""}`;
      if (isClickableDeveloper) {
        const title = document.createElement("div");
        title.textContent = `${member.user.name} (${formatRole(member.user.role)})`;
        const hint = document.createElement("div");
        hint.className = "tiny muted";
        hint.textContent = "Нажми, чтобы посмотреть загруженность по всем проектам";
        node.appendChild(title);
        node.appendChild(hint);
        node.addEventListener("click", async () => {
          await openDeveloperWorkloadModal(member.user);
        });
      } else {
        node.textContent = `${member.user.name} (${formatRole(member.user.role)})`;
      }
      els.memberList.appendChild(node);
    }
  }

  const memberIds = new Set(state.members.map((item) => item.user.id));
  const candidates = state.users.filter(
    (item) => (item.role === "developer" || item.role === "admin") && !memberIds.has(item.id),
  );
  els.memberUserSelect.innerHTML = "";
  els.memberUserSelect.appendChild(
    optionList(candidates, (u) => u.id, (u) => `${u.name} (${formatRole(u.role)})`, true, "-- выбрать --"),
  );
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
      node.innerHTML = `<strong>${sprint.name}</strong><div class="tiny muted">${formatSprintStatus(sprint.status)} | ${sprint.start_date} -> ${sprint.end_date}</div><div class="tiny">${sprint.goal || "без цели"}</div>`;
      els.sprintList.appendChild(node);
    }
  }
}

function renderDashboard() {
  els.dashboardSummary.innerHTML = "";

  if (!state.selectedProjectId) {
    els.dashboardSummary.innerHTML = '<div class="muted">Выбери проект, чтобы увидеть сводку</div>';
    return;
  }

  if (!state.dashboard) {
    els.dashboardSummary.innerHTML = '<div class="muted">Данные не загружены</div>';
    return;
  }

  const total = document.createElement("div");
  total.className = "metric";
  total.innerHTML = `<h3>Всего задач</h3><strong>${state.dashboard.total_tasks}</strong>`;
  els.dashboardSummary.appendChild(total);

  const statusBox = document.createElement("div");
  statusBox.className = "metric";
  statusBox.innerHTML = `<h3>По статусам</h3>${Object.entries(state.dashboard.by_status)
    .map(([key, value]) => `<div>${formatTaskStatus(key)}: <strong>${value}</strong></div>`)
    .join("") || "<div>пусто</div>"}`;
  els.dashboardSummary.appendChild(statusBox);

  const typeBox = document.createElement("div");
  typeBox.className = "metric";
  typeBox.innerHTML = `<h3>По типам</h3>${Object.entries(state.dashboard.by_type)
    .map(([key, value]) => `<div>${formatTaskType(key)}: <strong>${value}</strong></div>`)
    .join("") || "<div>пусто</div>"}`;
  els.dashboardSummary.appendChild(typeBox);
}

function formatStatusBreakdown(byStatus) {
  const pieces = TASK_STATUSES.filter((statusValue) => Number(byStatus?.[statusValue] || 0) > 0).map(
    (statusValue) => `${formatTaskStatus(statusValue)}: ${byStatus[statusValue]}`,
  );
  return pieces.join(" | ");
}

function renderDeveloperDashboard() {
  if (!els.developerDashboardSummary || !els.developerDashboardList) {
    return;
  }

  els.developerDashboardSummary.innerHTML = "";
  els.developerDashboardList.innerHTML = "";

  if (!state.currentUser) {
    els.developerDashboardSummary.innerHTML = '<div class="muted">Нужна авторизация</div>';
    return;
  }

  if (!state.developerDashboard) {
    els.developerDashboardSummary.innerHTML = '<div class="muted">Данные не загружены</div>';
    return;
  }

  const dashboard = state.developerDashboard;

  const total = document.createElement("div");
  total.className = "metric";
  total.innerHTML = `<h3>Мои задачи</h3><strong>${dashboard.total_tasks}</strong>`;
  els.developerDashboardSummary.appendChild(total);

  const active = document.createElement("div");
  active.className = "metric";
  active.innerHTML = `<h3>Активные</h3><strong>${dashboard.active_tasks}</strong>`;
  els.developerDashboardSummary.appendChild(active);

  const projects = document.createElement("div");
  projects.className = "metric";
  projects.innerHTML = `<h3>Проекты</h3><strong>${dashboard.by_project.length}</strong>`;
  els.developerDashboardSummary.appendChild(projects);

  const statusBox = document.createElement("div");
  statusBox.className = "metric";
  statusBox.innerHTML = `<h3>По статусам</h3>${Object.entries(dashboard.by_status)
    .map(([statusValue, count]) => `<div>${formatTaskStatus(statusValue)}: <strong>${count}</strong></div>`)
    .join("") || "<div>пусто</div>"}`;
  els.developerDashboardSummary.appendChild(statusBox);

  const tasks = dashboard.tasks || [];
  if (!tasks.length) {
    els.developerDashboardList.innerHTML = '<div class="muted">Назначенных задач пока нет</div>';
    return;
  }

  const taskBucketsByProject = new Map();
  for (const task of tasks) {
    const bucket = taskBucketsByProject.get(task.project_id) || [];
    bucket.push(task);
    taskBucketsByProject.set(task.project_id, bucket);
  }

  const projectMetaById = new Map(dashboard.by_project.map((item) => [item.project_id, item]));
  const sortedProjectIds = Array.from(taskBucketsByProject.keys()).sort((left, right) => {
    const leftName = projectMetaById.get(left)?.project_name || projectNameById(left);
    const rightName = projectMetaById.get(right)?.project_name || projectNameById(right);
    return leftName.localeCompare(rightName, "ru");
  });

  for (const projectId of sortedProjectIds) {
    const projectTasks = taskBucketsByProject.get(projectId) || [];
    const projectMeta = projectMetaById.get(projectId);
    const projectName = projectMeta?.project_name || projectNameById(projectId);
    const statusBreakdown = formatStatusBreakdown(projectMeta?.by_status || {});

    const group = document.createElement("section");
    group.className = "workload-project-group";

    const header = document.createElement("div");
    header.className = "workload-project-title";
    header.textContent = `${projectName}: ${projectTasks.length}`;
    group.appendChild(header);

    if (statusBreakdown) {
      const headerMeta = document.createElement("div");
      headerMeta.className = "tiny muted";
      headerMeta.textContent = statusBreakdown;
      group.appendChild(headerMeta);
    }

    for (const task of projectTasks) {
      const item = document.createElement("article");
      item.className = "workload-item task-card-clickable";

      const title = document.createElement("div");
      title.className = "workload-item-title";
      title.textContent = `#${task.id} ${task.title}`;

      const meta = document.createElement("div");
      meta.className = "tiny muted";
      meta.textContent = `Статус: ${formatTaskStatus(task.status)} | Приоритет: ${formatPriority(task.priority)} | Тип: ${formatTaskType(task.type)}`;

      const details = document.createElement("div");
      details.className = "tiny muted";
      details.textContent = `Спринт: ${task.sprint ? task.sprint.name : "-"} | Затраченное время: ${formatSpentSummary(task)}`;

      item.appendChild(title);
      item.appendChild(meta);
      item.appendChild(details);
      item.addEventListener("click", async () => {
        await openTaskDetailsModal(task.id);
      });
      group.appendChild(item);
    }

    els.developerDashboardList.appendChild(group);
  }
}

function renderTaskSelectors() {
  const projectSelected = Boolean(state.selectedProjectId);

  const sprintOptions = optionList(
    state.sprints,
    (s) => s.id,
    (s) => `${s.name} (${formatSprintStatus(s.status)})`,
    true,
    "без спринта",
  );
  els.taskSprintSelect.innerHTML = "";
  els.taskSprintSelect.appendChild(sprintOptions);

  const developers = getProjectDevelopers();
  els.taskAssigneeSelect.innerHTML = "";
  els.taskAssigneeSelect.appendChild(optionList(developers, (u) => u.id, (u) => u.name, true, "без исполнителя"));

  els.sprintFilter.innerHTML = "";
  els.sprintFilter.appendChild(optionList(state.sprints, (s) => s.id, (s) => s.name, true, "Все"));

  els.assigneeFilter.innerHTML = "";
  els.assigneeFilter.appendChild(optionList(developers, (u) => u.id, (u) => u.name, true, "Все"));

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
    return `${hours} ч ${minutes} мин`;
  }
  if (minutes > 0) {
    return `${minutes} мин ${secs} с`;
  }
  return `${secs} с`;
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
    return `авто: ${trackedText} | вручную: -`;
  }

  const comment = task.reported_comment ? ` (${task.reported_comment})` : "";
  return `авто: ${trackedText} | вручную: ${formatDuration(task.reported_seconds)}${comment}`;
}

function formatMlEstimate(estimate) {
  const pluralRu = (value, one, few, many) => {
    const abs = Math.abs(value);
    const mod100 = abs % 100;
    const mod10 = abs % 10;
    if (mod100 >= 11 && mod100 <= 14) {
      return many;
    }
    if (mod10 === 1) {
      return one;
    }
    if (mod10 >= 2 && mod10 <= 4) {
      return few;
    }
    return many;
  };

  if (!estimate) {
    return "-";
  }

  const rawHours = Number(estimate.hours);
  if (!Number.isFinite(rawHours) || rawHours <= 0) {
    return "меньше часа";
  }

  let remainingHours = Math.round(rawHours);
  if (remainingHours <= 0) {
    return "меньше часа";
  }

  const HOURS_IN_MONTH = 24 * 30;
  const HOURS_IN_WEEK = 24 * 7;
  const HOURS_IN_DAY = 24;

  const months = Math.floor(remainingHours / HOURS_IN_MONTH);
  remainingHours -= months * HOURS_IN_MONTH;

  const weeks = Math.floor(remainingHours / HOURS_IN_WEEK);
  remainingHours -= weeks * HOURS_IN_WEEK;

  const days = Math.floor(remainingHours / HOURS_IN_DAY);
  remainingHours -= days * HOURS_IN_DAY;

  const parts = [];
  if (months > 0) {
    parts.push(`${months} ${pluralRu(months, "месяц", "месяца", "месяцев")}`);
  }
  if (weeks > 0) {
    parts.push(`${weeks} ${pluralRu(weeks, "неделя", "недели", "недель")}`);
  }
  if (days > 0) {
    parts.push(`${days} ${pluralRu(days, "день", "дня", "дней")}`);
  }
  if (remainingHours > 0) {
    parts.push(`${remainingHours} ${pluralRu(remainingHours, "час", "часа", "часов")}`);
  }

  if (!parts.length) {
    return "меньше часа";
  }

  return `~${parts.join(" ")}`;
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
    `Выбрано вручную: ${days} д ${hours} ч ${minutes} мин (${totalMinutes} мин)`;
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
        const actorName = item.actor ? item.actor.name : "система";
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
    const estimate = state.taskEstimatesById[task.id];
    const estimateLine = isManagerLike() ? `<div>Оценка ML: ${formatMlEstimate(estimate)}</div>` : "";
    const card = document.createElement("article");
    card.className = "task-card";
    if (isTaskAssignedToCurrentUser(task)) {
      card.classList.add("task-assigned-to-me");
    }
    bindTaskOpenHandler(card, task.id);
    card.innerHTML = `
      <div class="task-head">
        <h3>${task.title}</h3>
        <div class="badges">
          <span class="badge status-${task.status}">${formatTaskStatus(task.status)}</span>
          <span class="badge">${formatTaskType(task.type)}</span>
          <span class="badge">${formatPriority(task.priority)}</span>
        </div>
      </div>
      <div class="task-meta">
        <div>Автор: ${task.creator.name}</div>
        <div>Исполнитель: ${task.assignee ? task.assignee.name : "-"}</div>
        <div>Спринт: ${task.sprint ? task.sprint.name : "-"}</div>
        <div>Затраченное время: ${formatSpentSummary(task)}</div>
        ${estimateLine}
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
  if (isTaskAssignedToCurrentUser(task)) {
    card.classList.add("board-task-assigned-to-me");
  }
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
  dragHandle.textContent = canDrag ? "ПЕРЕТАЩИТЬ" : "БЛОК";
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

  const estimate = state.taskEstimatesById[task.id];
  const estimateLine = isManagerLike() ? `<div>Оценка ML: ${formatMlEstimate(estimate)}</div>` : "";
  const meta = document.createElement("div");
  meta.className = "board-task-meta";
  meta.innerHTML = `
    <div>#${task.id} • ${formatTaskType(task.type)}</div>
    <div>Исполнитель: ${task.assignee ? task.assignee.name : "-"}</div>
    <div>Спринт: ${task.sprint ? task.sprint.name : "-"}</div>
    <div>Затраченное время: ${formatSpentSummary(task)}</div>
    ${estimateLine}
  `;

  const badges = document.createElement("div");
  badges.className = "badges";
  badges.innerHTML = `
    <span class="badge status-${task.status}">${formatTaskStatus(task.status)}</span>
    <span class="badge">${formatPriority(task.priority)}</span>
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
  renderDeveloperDashboard();
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
    priority: String(formData.get("priority") || "Medium"),
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
      <div class="muted">Тип: ${formatTaskType(task.type)}, Приоритет: ${formatPriority(task.priority)}, Статус: ${formatTaskStatus(task.status)}</div>
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
