const STORAGE_KEY = "doorsync-state-v1";
const SESSION_KEY = "doorsync-session-v1";

let state = normalizeState(loadState());
let session = loadSession();
let activeRole = session ? session.role : "student";
let selectedStudentId = session?.role === "student" ? session.userId : "STU-002";
let selectedProfessorId = session?.role === "professor" ? session.userId : "PROF-001";
let selectedPersonnelId = session?.role === "personnel" ? session.userId : "PERS-001";

const views = {
  student: document.querySelector("#studentView"),
  professor: document.querySelector("#professorView"),
  personnel: document.querySelector("#personnelView"),
};

const titles = {
  student: ["Student view", "Classroom status"],
  professor: ["Professor view", "Availability and unlock requests"],
  personnel: ["Personnel view", "Request queue"],
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return structuredClone(DOORSYNC_SEED);
  }

  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(DOORSYNC_SEED);
  }
}

function normalizeState(nextState) {
  nextState.demoMode = nextState.demoMode === true;
  if (!Array.isArray(nextState.studentEnrollments)) {
    nextState.studentEnrollments = structuredClone(DOORSYNC_SEED.studentEnrollments);
  }
  if (!Array.isArray(nextState.classSchedules)) {
    nextState.classSchedules = structuredClone(DOORSYNC_SEED.classSchedules);
  }
  const seededByEmail = new Map(
    ["students", "professors", "personnel"].flatMap((key) =>
      DOORSYNC_SEED[key].map((item) => [item.Email.toLowerCase(), item]),
    ),
  );

  ["students", "professors", "personnel"].forEach((key) => {
    nextState[key] = nextState[key].map((item) => ({
      ...item,
      Password:
        item.Password ||
        seededByEmail.get(item.Email.toLowerCase())?.Password ||
        "doorsync123",
    }));
  });

  return nextState;
}

function loadSession() {
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveSession() {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function byId(collection, key, id) {
  return collection.find((item) => item[key] === id);
}

function formatTime(value) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function minutesAgo(value) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hr ago" : `${hours} hrs ago`;
}

function makeBadge(status) {
  const className = status.toLowerCase();
  return `<span class="badge ${className}">${status}</span>`;
}

function notify(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

function addActivity(type, message, professorId = null) {
  state.activity.unshift({
    id: `ACT-${String(state.activity.length + 1).padStart(3, "0")}`,
    type,
    message,
    ProfessorID: professorId,
    timestamp: new Date().toISOString(),
  });
}

function roleCollection(role) {
  if (role === "student") {
    return {
      items: state.students,
      idKey: "StudentID",
      subtitle: (student) => `${student.Course} · ${student.YearLevel}`,
    };
  }

  if (role === "professor") {
    return {
      items: state.professors,
      idKey: "ProfessorID",
      subtitle: (professor) => professor.Department,
    };
  }

  return {
    items: state.personnel,
    idKey: "PersonnelID",
    subtitle: (personnel) => personnel.AssignedBuilding,
  };
}

function findUserByCredentials(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  const roles = ["student", "professor", "personnel"];

  for (const role of roles) {
    const collection = roleCollection(role);
    const user = collection.items.find(
      (item) =>
        item.Email.toLowerCase() === normalizedEmail && item.Password === password,
    );

    if (user) {
      return {
        role,
        userId: user[collection.idKey],
      };
    }
  }

  return null;
}

function currentUser() {
  if (!session) return null;
  const collection = roleCollection(session.role);
  return byId(collection.items, collection.idKey, session.userId);
}

function currentUserName() {
  return currentUser()?.FullName || "Demo user";
}

function applySession() {
  const hasSession = Boolean(session);
  document.querySelector("#loginScreen").classList.toggle("hidden", hasSession);
  document.querySelector("#appShell").classList.toggle("hidden", !hasSession);

  if (!hasSession) {
    document.querySelector("#loginEmail").focus();
    return;
  }

  activeRole = session.role;
  if (session.role === "student") selectedStudentId = session.userId;
  if (session.role === "professor") selectedProfessorId = session.userId;
  if (session.role === "personnel") selectedPersonnelId = session.userId;

  setRole(session.role);
}

function visibleRequests() {
  if (session?.role === "personnel") return state.unlockRequests;
  if (session?.role === "professor") {
    return state.unlockRequests.filter((request) => request.ProfessorID === session.userId);
  }
  return [];
}

function renderShell() {
  document.querySelector("#signedInPanel").classList.toggle("hidden", session?.role === "professor");
  document.querySelector("#demoControls").classList.toggle("hidden", session?.role !== "professor");
  document.querySelector("#pendingRequestSummary").classList.toggle("hidden", activeRole === "student");
  document.querySelector("#availableProfessorSummary").classList.toggle("hidden", session?.role !== "student");
  document.querySelector("#lockedRoomCount").textContent = (activeRole === "student" ? studentRooms() : state.rooms).filter(
    (room) => room.CurrentStatus === "Locked",
  ).length;
  document.querySelector("#pendingRequestLabel").textContent = session?.role === "professor" ? "My Pending Requests" : "Pending Requests";
  document.querySelector("#pendingRequestCount").textContent = visibleRequests().filter(
    (request) => request.Status === "Pending",
  ).length;
  document.querySelector("#availableProfessorCount").textContent = state.professors.filter(
    (professor) => professor.CurrentStatus === "Available",
  ).length;

  document.querySelector("#roleEyebrow").textContent = titles[activeRole][0];
  document.querySelector("#pageTitle").textContent = titles[activeRole][1];
  document.querySelector("#signedInUser").innerHTML = `
    <strong>${currentUserName()}</strong>
    <span>${activeRole.charAt(0).toUpperCase() + activeRole.slice(1)}</span>
  `;

  const now = new Date();
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(now);
  document.querySelector("#timeLabel").textContent = new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

function studentClasses() {
  return DoorSyncSchedule.studentClasses(state.classSchedules, state.studentEnrollments, selectedStudentId);
}

function studentRooms() {
  const roomIds = new Set(studentClasses().map((item) => item.RoomID));
  return state.rooms.filter((room) => roomIds.has(room.RoomID));
}

function renderStudent() {
  const classes = studentClasses();
  const filter = document.querySelector("#studentRoomFilter").value || "all";
  const sort = document.querySelector("#studentRoomSort").value || "status";
  const rooms = studentRooms().filter((room) => filter === "all" || room.CurrentStatus === filter).sort((a, b) => {
    if (sort === "name" || a.CurrentStatus === b.CurrentStatus) {
      return a.RoomName.localeCompare(b.RoomName);
    }

    return a.CurrentStatus === "Locked" ? -1 : 1;
  });

  document.querySelector("#studentRooms").innerHTML =
    rooms.length === 0
      ? `<div class="empty-state">${classes.length ? "No classrooms match this status." : "No classes assigned yet."}</div>`
      : rooms
          .map(
            (room) => `
        <article class="room-status-card">
          <div class="card-topline">
            <h4>${room.RoomName}</h4>
            ${makeBadge(room.CurrentStatus)}
          </div>
          <p class="room-building">${room.Building}</p>
          <div class="student-class-list">${classes.filter((item) => item.RoomID === room.RoomID).map((item) => {
            const professor = byId(state.professors, "ProfessorID", item.ProfessorID);
            const days = item.Days.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ");
            const time = (value) => DoorSyncSchedule.clock(new Date(`2000-01-01T${value}:00+08:00`));
            return `<p><strong>${item.Subject}</strong><br>${professor?.FullName || "Unassigned"}<span class="student-inline-schedule"><br>${days} · ${time(item.StartTime)} - ${time(item.EndTime)}</span></p>`;
          }).join("")}</div>
          <div class="student-schedule-column">${classes.filter((item) => item.RoomID === room.RoomID).map((item) => {
            const days = item.Days.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ");
            const time = (value) => DoorSyncSchedule.clock(new Date(`2000-01-01T${value}:00+08:00`));
            return `<p>${days} · ${time(item.StartTime)} - ${time(item.EndTime)}</p>`;
          }).join("")}</div>
          <div class="card-meta">
            <span>Updated ${formatTime(room.StatusUpdatedAt)}</span>
          </div>
        </article>
      `,
          )
          .join("");

  const professors = [...state.professors].sort((a, b) => {
    if (a.CurrentStatus === b.CurrentStatus) {
      return a.FullName.localeCompare(b.FullName);
    }

    return a.CurrentStatus === "Available" ? -1 : 1;
  });

  document.querySelector("#studentProfessors").innerHTML =
    professors.length === 0
      ? `<div class="empty-state">No professor records yet.</div>`
      : professors
          .map(
            (professor) => `
        <article class="card professor-card">
          <div class="card-topline">
            <h4>${professor.FullName}</h4>
            ${makeBadge(professor.CurrentStatus)}
          </div>
          <p class="professor-department"><span class="faculty-field-label">Department</span>${professor.Department}</p>
          <p class="professor-email"><span class="faculty-field-label">Email</span>${professor.Email}</p>
          <div class="card-meta">
            <span><span class="faculty-field-label">Last Updated</span>${formatTime(professor.StatusUpdatedAt)}</span>
          </div>
        </article>
      `,
          )
          .join("");
}

function renderSchedule() {
  const now = new Date();
  document.querySelector("#demoModeToggle").checked = state.demoMode;
  document.querySelector("#demoModeStatus").textContent = state.demoMode
    ? "Demo mode: any locked room, any time. Room statuses stay unchanged."
    : "15-minute request window enforced.";
  document.querySelector("#requestPolicy").textContent = state.demoMode
    ? "Choose any locked room, regardless of your class schedule. Personnel must confirm the unlock."
    : "Requests open 15 minutes before class and close when class starts. Philippine time (UTC+8).";
  const lessons = DoorSyncSchedule.occurrences(state.classSchedules, selectedProfessorId, now);
  document.querySelector("#requestTargetLabel").textContent = state.demoMode ? "Locked room" : "Scheduled class";
  const upcoming = state.demoMode
    ? state.rooms.filter((room) => room.CurrentStatus === "Locked").map((room) => ({ ...room, key: room.RoomID }))
    : lessons.filter((lesson) => lesson.start > now);
  const select = document.querySelector("#roomSelect");
  const previous = select.value;
  const checkAccess = (item) => state.demoMode
    ? DoorSyncSchedule.roomEligibility(item?.RoomID, state.rooms, state.unlockRequests)
    : DoorSyncSchedule.eligibility(item, state.rooms, state.unlockRequests, now);
  const eligible = upcoming.find((item) => checkAccess(item).allowed);
  const options = upcoming.length ? upcoming.map((lesson) => {
    const room = byId(state.rooms, "RoomID", lesson.RoomID);
    if (state.demoMode) {
      const pending = !checkAccess(lesson).allowed;
      return `<option value="${room.RoomID}" ${pending ? "disabled" : ""}>${room.RoomName} - ${room.Building}${pending ? " - Request pending" : " - Locked"}</option>`;
    }
    return `<option value="${lesson.key}">${DoorSyncSchedule.day(lesson.start)}, ${DoorSyncSchedule.clock(lesson.start)} - ${room?.RoomName || lesson.RoomID} - ${lesson.Subject}</option>`;
  }).join("") : `<option value="">${state.demoMode ? "No locked rooms" : "No upcoming classes"}</option>`;
  if (select.dataset.options !== options) {
    select.innerHTML = options;
    select.dataset.options = options;
  }
  select.value = upcoming.some((lesson) => lesson.key === previous) ? previous : (eligible || upcoming[0])?.key || "";
  select.disabled = !upcoming.length;
  const selected = upcoming.find((lesson) => lesson.key === select.value);
  const access = checkAccess(selected);
  document.querySelector("#notifyPersonnel").disabled = session?.role !== "professor" || !access.allowed;
  document.querySelector("#requestWindowStatus").textContent = selected
    ? state.demoMode ? `${access.reason}. This sends a request only; the room remains locked.` : `${access.reason}. Request window: ${DoorSyncSchedule.day(selected.start)}, ${DoorSyncSchedule.clock(selected.opens)} to ${DoorSyncSchedule.clock(selected.start)} (class start).`
    : state.demoMode ? "No locked rooms. Personnel can mark a room locked to demonstrate another request." : "No scheduled classes in the next seven days.";
  if (selected && access.reason === "Room already unlocked") {
    document.querySelector("#requestWindowStatus").textContent = "This room is currently marked unlocked. Personnel can mark it locked again before the next unlock request.";
  }

  document.querySelector("#professorSchedule").innerHTML = lessons.length ? lessons.map((lesson) => {
    const room = byId(state.rooms, "RoomID", lesson.RoomID);
    const access = DoorSyncSchedule.eligibility(lesson, state.rooms, state.unlockRequests, now);
    const label = now >= lesson.end ? "Finished" : now >= lesson.start ? "In class" : now < lesson.opens ? "Upcoming" : access.reason;
    return `<article class="schedule-item${access.allowed ? " schedule-open" : ""}">
      <div><strong>${DoorSyncSchedule.day(lesson.start)}</strong><p>${DoorSyncSchedule.clock(lesson.start)} - ${DoorSyncSchedule.clock(lesson.end)}</p></div>
      <div><h4>${lesson.Subject}</h4><p>${room?.RoomName || lesson.RoomID} · ${room?.Building || ""}</p></div>
      <div><span class="badge ${access.allowed ? "available" : "schedule-label"}">${label}</span><p>Requests ${DoorSyncSchedule.clock(lesson.opens)} - ${DoorSyncSchedule.clock(lesson.start)}</p></div>
    </article>`;
  }).join("") : '<div class="empty-state">No classes scheduled.</div>';
}

function renderProfessor() {
  renderSchedule();
  const professor = byId(
    state.professors,
    "ProfessorID",
    selectedProfessorId,
  );
  document.querySelector("#professorName").textContent = professor.FullName;

  document.querySelector("#setAvailable").setAttribute("aria-pressed", professor.CurrentStatus === "Available");
  document.querySelector("#setOccupied").setAttribute("aria-pressed", professor.CurrentStatus === "Occupied");
  document.querySelector("#selectedProfessorStatus").innerHTML = `
    ${makeBadge(professor.CurrentStatus)}
    <span>Updated ${formatTime(professor.StatusUpdatedAt)}</span>
  `;

  document.querySelector("#professorActivity").innerHTML = state.activity
    .filter((item) => session?.role === "professor" && item.ProfessorID === session.userId)
    .slice(0, 8)
    .map(
      (item) => `
        <article class="timeline-item">
          <span class="timeline-dot"></span>
          <div>
            <strong>${item.message}</strong>
            <p>${formatTime(item.timestamp)}</p>
          </div>
        </article>
      `,
    )
    .join("") || '<div class="empty-state">No recent activity for your account.</div>';
}

function renderPersonnel() {
  const pending = visibleRequests().filter((request) => request.Status === "Pending");
  document.querySelector("#pendingRequests").innerHTML =
    pending.length === 0
      ? `<div class="empty-state">No pending requests.</div>`
      : pending.map(renderRequestCard).join("");

  renderRoomStatusLists();

  const completed = visibleRequests()
    .filter((request) => request.Status === "Completed")
    .sort((a, b) => new Date(b.CompletedAt) - new Date(a.CompletedAt));
  document.querySelector("#completedRequests").innerHTML = completed
    .map(renderCompletedCard)
    .join("");

}

function renderRoomStatusLists() {
  const lockedRooms = state.rooms.filter((room) => room.CurrentStatus === "Locked");
  document.querySelector("#lockedRooms").innerHTML = lockedRooms.length
    ? lockedRooms.map(renderRoomStatusCard).join("")
    : '<div class="empty-state">No locked rooms right now.</div>';
  const unlockedRooms = state.rooms.filter((room) => room.CurrentStatus === "Unlocked");
  document.querySelector("#unlockedRooms").innerHTML =
    unlockedRooms.length === 0
      ? `<div class="empty-state">No unlocked rooms right now.</div>`
      : unlockedRooms.map(renderRoomStatusCard).join("");
}

function renderRoomStatusCard(room) {
  return `
    <article class="request-card">
      <div>
        <div class="card-topline">
          ${makeBadge(room.CurrentStatus)}
          <span>Updated ${formatTime(room.StatusUpdatedAt)}</span>
        </div>
        <h4>${room.RoomName}</h4>
        <p>${room.Building}</p>
      </div>
      ${room.CurrentStatus === "Unlocked" ? `<div class="request-actions">
        <button class="status-action warning" type="button" data-lock-room="${room.RoomID}">Mark locked</button>
      </div>` : ""}
    </article>
  `;
}

function renderRequestCard(request) {
  const room = byId(state.rooms, "RoomID", request.RoomID);
  const professor = byId(state.professors, "ProfessorID", request.ProfessorID);
  const personnel = byId(state.personnel, "PersonnelID", request.PersonnelID);
  const assignmentText = personnel
    ? `Routed to ${personnel.FullName}`
    : "Visible in the shared personnel queue";
  return `
    <article class="request-card">
      <div>
        <div class="card-topline">
          ${makeBadge(room.CurrentStatus)}
          <span>Flagged ${minutesAgo(request.FlaggedAt)}</span>
        </div>
        <h4>${room.RoomName}</h4>
        <p>${room.Building} · flagged by ${professor.FullName}</p>
        <p>${assignmentText}</p>
      </div>
      <div class="request-actions">
        <button class="primary-button" type="button" data-resolve="${request.RequestID}">Mark unlocked</button>
      </div>
    </article>
  `;
}

function renderCompletedCard(request) {
  const room = byId(state.rooms, "RoomID", request.RoomID);
  const professor = byId(state.professors, "ProfessorID", request.ProfessorID);
  return `
    <article class="request-card muted">
      <div>
        <div class="card-topline">
          ${makeBadge("Completed")}
          <span>${formatTime(request.CompletedAt)}</span>
        </div>
        <h4>${room.RoomName}</h4>
        <p>Requested by ${professor.FullName}</p>
      </div>
    </article>
  `;
}

function setRole(role) {
  if (session && role !== session.role) return;
  activeRole = role;
  Object.entries(views).forEach(([key, element]) => {
    element.classList.toggle("active", key === role);
  });
  document.querySelectorAll(".role-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.role === role);
    button.classList.toggle("hidden", Boolean(session) && button.dataset.role !== role);
  });
  render();
}

function setProfessorStatus(status) {
  const id = selectedProfessorId;
  const professor = byId(state.professors, "ProfessorID", id);
  professor.CurrentStatus = status;
  professor.StatusUpdatedAt = new Date().toISOString();
  addActivity("professor", `${professor.FullName} set status to ${status}.`, professor.ProfessorID);
  saveState();
  render();
  notify(`Status updated to ${status}.`);
}

function createUnlockRequest() {
  if (session?.role !== "professor") return;
  const now = new Date();
  const target = document.querySelector("#roomSelect").value;
  const lesson = state.demoMode ? null : DoorSyncSchedule.occurrences(state.classSchedules, session.userId, now)
    .find((item) => item.key === target);
  const roomId = state.demoMode ? target : lesson?.RoomID;
  const access = state.demoMode
    ? DoorSyncSchedule.roomEligibility(roomId, state.rooms, state.unlockRequests)
    : DoorSyncSchedule.eligibility(lesson, state.rooms, state.unlockRequests, now);
  if (!access.allowed) {
    renderSchedule();
    notify(access.reason);
    return;
  }
  const professor = byId(
    state.professors,
    "ProfessorID",
    session.userId,
  );
  const room = byId(state.rooms, "RoomID", roomId);
  const existingRequest = state.unlockRequests.find(
    (request) => request.RoomID === room.RoomID && request.Status === "Pending",
  );

  if (existingRequest) {
    notify(`${room.RoomName} already has a pending unlock request.`);
    return;
  }

  const personnel = state.personnel.find((person) => person.AssignedBuilding === room.Building);
  const nextNumber = state.unlockRequests.length + 1;
  const request = {
    RequestID: `REQ-${String(nextNumber).padStart(3, "0")}`,
    RoomID: room.RoomID,
    ProfessorID: professor.ProfessorID,
    ScheduleID: lesson?.ScheduleID || null,
    ClassDate: lesson?.date || null,
    DemoRequest: state.demoMode,
    PersonnelID: personnel ? personnel.PersonnelID : "",
    FlaggedAt: new Date().toISOString(),
    CompletedAt: null,
    Status: "Pending",
  };

  state.unlockRequests.unshift(request);
  addActivity("request", `${room.RoomName} was flagged by ${professor.FullName}.`, professor.ProfessorID);
  saveState();
  render();
  notify("Request sent to personnel and is awaiting unlock.");
}

function resolveRequest(requestId) {
  const request = byId(state.unlockRequests, "RequestID", requestId);
  const room = byId(state.rooms, "RoomID", request.RoomID);
  const resolverId = session?.role === "personnel" ? selectedPersonnelId : request.PersonnelID;
  const personnel = byId(state.personnel, "PersonnelID", resolverId);
  request.PersonnelID = resolverId;
  request.Status = "Completed";
  request.CompletedAt = new Date().toISOString();
  room.CurrentStatus = "Unlocked";
  room.StatusUpdatedAt = request.CompletedAt;
  addActivity("room", `${room.RoomName} was marked unlocked by ${personnel?.FullName || currentUserName()}.`, request.ProfessorID);
  saveState();
  render();
  notify(`${room.RoomName} marked unlocked.`);
}

function lockRoom(roomId) {
  const room = byId(state.rooms, "RoomID", roomId);
  room.CurrentStatus = "Locked";
  room.StatusUpdatedAt = new Date().toISOString();
  addActivity("room", `${room.RoomName} was marked locked by ${currentUserName()}.`);
  saveState();
  render();
  notify(`${room.RoomName} marked locked.`);
}

function render() {
  renderShell();
  renderStudent();
  renderProfessor();
  renderPersonnel();
}

document.querySelectorAll(".role-tab").forEach((button) => {
  button.addEventListener("click", () => setRole(button.dataset.role));
});

function setPasswordVisibility(visible) {
  document.querySelector("#loginPassword").type = visible ? "text" : "password";
  const label = visible ? "Hide password" : "Show password";
  const toggle = document.querySelector("#passwordToggle");
  toggle.setAttribute("aria-label", label);
  toggle.setAttribute("title", label);
  document.querySelector("#passwordToggleIcon").setAttribute("src", visible ? "eye-off.svg" : "eye.svg");
}

document.querySelector("#passwordToggle").addEventListener("click", () => {
  setPasswordVisibility(document.querySelector("#loginPassword").type === "password");
});
document.querySelector("#loginForm").addEventListener("reset", () => setPasswordVisibility(false));

document.querySelector("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const loginError = document.querySelector("#loginError");
  const email = document.querySelector("#loginEmail").value;
  const password = document.querySelector("#loginPassword").value;
  const matchedSession = findUserByCredentials(email, password);

  if (!matchedSession) {
    loginError.textContent = "Email or password does not match a DoorSync account.";
    return;
  }

  loginError.textContent = "";
  setPasswordVisibility(false);
  document.querySelector("#loginPassword").value = "";
  session = matchedSession;
  saveSession();
  applySession();
  notify(`Signed in as ${currentUserName()}.`);
});

document.querySelector("#setAvailable").addEventListener("click", () => setProfessorStatus("Available"));
document.querySelector("#setOccupied").addEventListener("click", () => setProfessorStatus("Occupied"));
document.querySelector("#notifyPersonnel").addEventListener("click", createUnlockRequest);
document.querySelector("#roomSelect").addEventListener("change", renderSchedule);
document.querySelector("#studentRoomFilter").addEventListener("change", renderStudent);
document.querySelector("#studentRoomSort").addEventListener("change", renderStudent);
document.querySelector("#demoModeToggle").addEventListener("change", (event) => {
  if (session?.role !== "professor") return;
  state.demoMode = event.target.checked;
  saveState();
  renderSchedule();
  notify(state.demoMode ? "Demo mode enabled. Request any locked room without a class schedule." : "Demo mode disabled. Class schedule and 15-minute window restored.");
});

document.querySelector("#personnelView").addEventListener("click", (event) => {
  const resolveButton = event.target.closest("[data-resolve]");
  if (resolveButton) {
    resolveRequest(resolveButton.dataset.resolve);
  }

  const lockButton = event.target.closest("[data-lock-room]");
  if (lockButton) {
    lockRoom(lockButton.dataset.lockRoom);
  }
});

document.querySelector("#resetData").addEventListener("click", () => {
  state = normalizeState(structuredClone(DOORSYNC_SEED));
  saveState();
  render();
  notify("Demo data reset.");
});

const mobileViewport = window.matchMedia("(max-width: 900px)");
const sidebar = document.querySelector("#dashboardSidebar");
const mainContent = document.querySelector(".main-content");
const openSidebarButton = document.querySelector("#openSidebar");
let mobileMenuOpen = false;

function setMobileMenu(open, restoreFocus = true) {
  mobileMenuOpen = open && mobileViewport.matches && Boolean(session);
  document.body.classList.toggle("mobile-menu-open", mobileMenuOpen);
  openSidebarButton.setAttribute("aria-expanded", String(mobileMenuOpen));
  sidebar.inert = mobileViewport.matches && !mobileMenuOpen;
  mainContent.inert = mobileMenuOpen;
  if (mobileMenuOpen) {
    sidebar.setAttribute("role", "dialog");
    sidebar.setAttribute("aria-modal", "true");
    sidebar.setAttribute("aria-label", "Dashboard menu");
    document.querySelector("#closeSidebar").focus();
  } else {
    sidebar.removeAttribute("role");
    sidebar.removeAttribute("aria-modal");
    sidebar.removeAttribute("aria-label");
    if (restoreFocus && mobileViewport.matches) openSidebarButton.focus();
  }
}

openSidebarButton.addEventListener("click", () => setMobileMenu(true));
document.querySelector("#closeSidebar").addEventListener("click", () => setMobileMenu(false));
document.querySelector("#sidebarBackdrop").addEventListener("click", () => setMobileMenu(false));
mobileViewport.addEventListener("change", () => setMobileMenu(false, false));
document.addEventListener("keydown", (event) => {
  if (!mobileMenuOpen || document.querySelector("#logoutDialog").open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    setMobileMenu(false);
  }
  if (event.key === "Tab") {
    const controls = [...sidebar.querySelectorAll("button, input, select, a[href], [tabindex='0']")]
      .filter((element) => !element.disabled && element.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
setMobileMenu(false, false);

document.querySelector("#logoutButton").addEventListener("click", () => {
  document.querySelector("#logoutDialog").showModal();
});

document.querySelector("#cancelLogout").addEventListener("click", () => {
  document.querySelector("#logoutDialog").close();
});

document.querySelector("#confirmLogout").addEventListener("click", () => {
  document.querySelector("#logoutDialog").close();
  session = null;
  setMobileMenu(false, false);
  saveSession();
  document.querySelector("#loginForm").reset();
  setPasswordVisibility(false);
  document.querySelector("#loginError").textContent = "";
  document.querySelector("#toast").classList.remove("visible");
  applySession();
});

applySession();
setInterval(renderShell, 30000);
setInterval(() => {
  if (session?.role === "professor") renderSchedule();
}, 1000);
