const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const schedule = require("./schedule.js");
const seed = vm.runInNewContext(`${fs.readFileSync("data.js", "utf8")}\nDOORSYNC_SEED`);
const at = (time) => new Date(`2026-10-02T${time}+08:00`);
const rooms = [{ RoomID: "RM-201", CurrentStatus: "Locked" }];
const lesson = schedule.occurrences(seed.classSchedules, "PROF-001", at("07:00:00"))[0];

test("15-minute window includes opening but excludes class start", () => {
  for (const [time, allowed] of [["07:44:59", false], ["07:45:00", true], ["07:59:59", true], ["08:00:00", false], ["09:00:00", false]]) {
    assert.equal(schedule.eligibility(lesson, rooms, [], at(time)).allowed, allowed, time);
  }
});

test("demo bypasses only timing and switching it off restores the window", () => {
  for (const time of ["06:00:00", "08:00:00", "18:00:00"]) {
    assert.equal(schedule.eligibility(lesson, rooms, [], at(time), true).allowed, true);
    assert.equal(schedule.eligibility(lesson, rooms, [], at(time), false).allowed, false);
  }
  assert.equal(schedule.eligibility(undefined, rooms, [], at("06:00:00"), true).allowed, false);
  assert.equal(schedule.eligibility(lesson, rooms, [{ RoomID: "RM-201", Status: "Pending" }], at("06:00:00"), true).allowed, false);
  assert.equal(schedule.eligibility(lesson, [{ RoomID: "RM-201", CurrentStatus: "Unlocked" }], [], at("06:00:00"), true).allowed, false);
});

test("students receive only enrolled classes and unknown students receive none", () => {
  const expected = { "STU-001": ["RM-201", "RM-202"], "STU-002": ["RM-110", "RM-202"], "STU-003": ["RM-105", "RM-201"], "STU-004": ["RM-105", "RM-201"] };
  for (const [studentId, roomIds] of Object.entries(expected)) {
    const classes = schedule.studentClasses(seed.classSchedules, seed.studentEnrollments, studentId);
    assert.deepEqual([...new Set(classes.map((item) => item.RoomID))].sort(), roomIds);
  }
  assert.equal(schedule.studentClasses(seed.classSchedules, seed.studentEnrollments, "unknown").length, 0);
  assert.equal(schedule.studentClasses(seed.classSchedules, [], "STU-001").length, 0);
});
test("schedule uses Manila dates and professor ownership", () => {
  assert.equal(lesson.date, "2026-10-02");
  assert.equal(lesson.start.toISOString(), "2026-10-02T00:00:00.000Z");
  assert.equal(schedule.occurrences(seed.classSchedules, "unknown", at("07:45:00")).length, 0);
  const saturday = schedule.occurrences(seed.classSchedules, "PROF-001", new Date("2026-10-02T16:00:00Z"));
  assert.equal(saturday[0].date, "2026-10-05");
});
test("pending, completed class requests and unlocked rooms cannot be requested", () => {
  const now = at("07:50:00");
  assert.equal(schedule.eligibility(lesson, [{ RoomID: "RM-201", CurrentStatus: "Unlocked" }], [], now).allowed, false);
  assert.equal(schedule.eligibility(lesson, rooms, [{ RoomID: "RM-201", Status: "Pending" }], now).allowed, false);
  assert.equal(schedule.eligibility(lesson, rooms, [{ ScheduleID: lesson.ScheduleID, ClassDate: lesson.date, Status: "Completed" }], now).allowed, false);
  assert.equal(schedule.eligibility(undefined, rooms, [], now).allowed, false);
});
test("sample schedules have valid references and no room or professor overlaps", () => {
  for (const item of seed.classSchedules) {
    assert.ok(seed.professors.some((p) => p.ProfessorID === item.ProfessorID));
    assert.ok(seed.rooms.some((r) => r.RoomID === item.RoomID));
    assert.ok(item.StartTime < item.EndTime);
    for (const other of seed.classSchedules) {
      if (item === other || !item.Days.some((day) => other.Days.includes(day))) continue;
      if (item.RoomID !== other.RoomID && item.ProfessorID !== other.ProfessorID) continue;
      assert.ok(item.EndTime <= other.StartTime || other.EndTime <= item.StartTime);
    }
  }
});

test("request handler enforces ownership and time, migrates saved data, and saves class linkage", () => {
  let current = at("07:45:00");
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [current.getTime()])); }
    static now() { return current.getTime(); }
  }
  const nodes = new Map();
  const node = (key) => {
    if (!nodes.has(key)) nodes.set(key, { value: "", dataset: {}, classList: { toggle(name, value) { this[name] = value; }, add() {}, remove() {} },
      handlers: {}, attributes: {}, addEventListener(type, handler) { this.handlers[type] = handler; }, setAttribute(name, value) { this.attributes[name] = value; }, focus() {}, reset() {}, showModal() { this.open = true; }, close() { this.open = false; } });
    return nodes.get(key);
  };
  const oldState = JSON.parse(JSON.stringify(seed));
  delete oldState.classSchedules;
  delete oldState.studentEnrollments;
  delete oldState.demoMode;
  oldState.unlockRequests = [];
  const storage = new Map([["doorsync-state-v1", JSON.stringify(oldState)],
    ["doorsync-session-v1", JSON.stringify({ role: "professor", userId: "PROF-001" })]]);
  const context = vm.createContext({ Date: Clock, Intl, structuredClone, setInterval() {},
    window: { clearTimeout() {}, setTimeout() {} },
    document: { querySelector: node, querySelectorAll: () => [] },
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
  });
  vm.runInContext(fs.readFileSync("data.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("schedule.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("app.js", "utf8"), context);
  assert.equal(vm.runInContext("state.classSchedules.length", context), 6);
  assert.equal(vm.runInContext("state.studentEnrollments.length", context), 8);
  assert.equal(vm.runInContext("state.demoMode", context), false);
  assert.equal(nodes.has("#sidebarToggle"), false);
  assert.equal(nodes.has("#sidebarReopen"), false);
  node("#loginPassword").type = "password";
  node("#loginPassword").value = "test-password";
  node("#passwordToggle").handlers.click();
  assert.equal(node("#loginPassword").type, "text");
  assert.equal(node("#passwordToggle").attributes["aria-label"], "Hide password");
  assert.equal(node("#passwordToggleIcon").attributes.src, "eye-off.svg");
  node("#passwordToggle").handlers.click();
  assert.equal(node("#loginPassword").type, "password");
  assert.equal(node("#passwordToggle").attributes["aria-label"], "Show password");
  assert.equal(node("#loginPassword").value, "test-password");
  node("#passwordToggle").handlers.click();
  node("#loginForm").handlers.reset();
  assert.equal(node("#loginPassword").type, "password");
  const unchangedRooms = vm.runInContext("JSON.stringify(state.rooms)", context);
  for (const checked of [true, false]) {
    node("#demoModeToggle").handlers.change({ target: { checked } });
    assert.equal(vm.runInContext("JSON.stringify(state.rooms)", context), unchangedRooms);
    assert.equal(vm.runInContext("state.unlockRequests.length", context), 0);
    assert.equal(vm.runInContext("state.demoMode", context), checked);
  }
  const attempt = (key, time) => {
    current = at(time);
    node("#roomSelect").value = key;
    vm.runInContext("createUnlockRequest()", context);
    return vm.runInContext("state.unlockRequests.length", context);
  };
  assert.equal(attempt("SCH-001:2026-10-02", "07:44:59"), 0);
  assert.equal(attempt("SCH-003:2026-10-02", "09:45:00"), 0);
  assert.equal(attempt("SCH-001:2026-10-02", "08:00:00"), 0);
  assert.equal(attempt("SCH-001:2026-10-02", "07:45:00"), 1);
  assert.equal(attempt("SCH-001:2026-10-02", "07:46:00"), 1);
  const saved = JSON.parse(storage.get("doorsync-state-v1"));
  assert.equal(saved.unlockRequests[0].ScheduleID, "SCH-001");
  assert.equal(saved.unlockRequests[0].RoomID, "RM-201");
  assert.equal(saved.unlockRequests[0].ClassDate, "2026-10-02");
  assert.equal(saved.unlockRequests[0].Status, "Pending");
  assert.equal(saved.rooms.find((room) => room.RoomID === "RM-201").CurrentStatus, "Locked");
  vm.runInContext("state.unlockRequests = []; state.demoMode = true", context);
  assert.equal(attempt("SCH-003:2026-10-02", "18:00:00"), 0);
  const beforeDemo = vm.runInContext("JSON.stringify(state.rooms)", context);
  assert.equal(attempt("RM-105", "18:00:00"), 1);
  assert.equal(vm.runInContext("JSON.stringify(state.rooms)", context), beforeDemo);
  assert.equal(attempt("RM-105", "18:00:00"), 1);
  assert.equal(attempt("RM-202", "18:00:00"), 1);
  assert.equal(attempt("unknown-room", "18:00:00"), 1);
  assert.equal(JSON.parse(storage.get("doorsync-state-v1")).unlockRequests[0].DemoRequest, true);
  assert.equal(JSON.parse(storage.get("doorsync-state-v1")).unlockRequests[0].ScheduleID, null);
  assert.match(node("#pendingRequests").innerHTML, /Room 105/);
  vm.runInContext("session = {role: 'personnel', userId: 'PERS-001'}; selectedPersonnelId = 'PERS-001'; resolveRequest(state.unlockRequests[0].RequestID)", context);
  assert.equal(vm.runInContext("state.rooms.find(r => r.RoomID === 'RM-105').CurrentStatus", context), "Unlocked");
  assert.match(node("#unlockedRooms").innerHTML, /Room 105/);
  assert.doesNotMatch(node("#lockedRooms").innerHTML, /Room 105/);
  vm.runInContext("lockRoom('RM-105'); session = {role: 'professor', userId: 'PROF-001'}", context);
  assert.match(node("#lockedRooms").innerHTML, /Room 105/);
  assert.doesNotMatch(node("#unlockedRooms").innerHTML, /Room 105/);
  assert.equal(attempt("RM-105", "18:00:00"), 2);
  vm.runInContext("state.unlockRequests = []; state.demoMode = false", context);
  assert.equal(attempt("RM-105", "18:00:00"), 0);
  assert.equal(attempt("SCH-001:2026-10-02", "18:00:00"), 0);
  vm.runInContext("session = {role: 'student', userId: 'STU-002'}; applySession()", context);
  assert.match(node("#studentRooms").innerHTML, /Room 110/);
  assert.doesNotMatch(node("#studentRooms").innerHTML, /Room 201|Room 105/);
  assert.equal(node("#lockedRoomCount").textContent, 0);
  vm.runInContext("state.studentEnrollments = []; render()", context);
  assert.match(node("#studentRooms").innerHTML, /No classes assigned/);
  vm.runInContext(`
    state.unlockRequests = [
      {RequestID: 'OWN', ProfessorID: 'PROF-001', RoomID: 'RM-201', Status: 'Pending'},
      {RequestID: 'OTHER', ProfessorID: 'PROF-002', RoomID: 'RM-202', Status: 'Pending'}
    ];
    state.activity = [
      {ProfessorID: 'PROF-001', message: 'Own activity', timestamp: new Date().toISOString()},
      {ProfessorID: 'PROF-002', message: 'Other activity', timestamp: new Date().toISOString()},
      {message: 'Legacy unowned activity', timestamp: new Date().toISOString()}
    ];
    session = {role: 'professor', userId: 'PROF-001'}; applySession();
  `, context);
  assert.equal(node("#pendingRequestCount").textContent, 1);
  assert.match(node("#professorActivity").innerHTML, /Own activity/);
  assert.doesNotMatch(node("#professorActivity").innerHTML, /Other activity|Legacy unowned activity/);
  assert.doesNotMatch(node("#pendingRequests").innerHTML, /Liza Fernandez/);
  vm.runInContext("session = {role: 'professor', userId: 'PROF-002'}; applySession()", context);
  assert.equal(node("#pendingRequestCount").textContent, 1);
  assert.match(node("#professorActivity").innerHTML, /Other activity/);
  assert.doesNotMatch(node("#professorActivity").innerHTML, /Own activity/);
  vm.runInContext("session = {role: 'personnel', userId: 'PERS-001'}; applySession()", context);
  assert.equal(node("#pendingRequestCount").textContent, 2);
  assert.match(node("#pendingRequests").innerHTML, /Ramon Cruz/);
  assert.match(node("#pendingRequests").innerHTML, /Liza Fernandez/);
  for (const role of ["student", "professor", "personnel"]) {
    vm.runInContext(`session = {role: '${role}', userId: '${{student: "STU-001", professor: "PROF-001", personnel: "PERS-001"}[role]}'}; saveSession()`, context);
    vm.runInContext("applySession()", context);
    assert.equal(node("#availableProfessorSummary").classList.hidden, role !== "student");
    assert.equal(node("#signedInPanel").classList.hidden, role === "professor");
    if (role === "professor") assert.equal(node("#professorName").textContent, "Dr. Ramon Cruz");
    assert.equal(nodes.has("#professorSelect"), false);
    const savedSession = storage.get("doorsync-session-v1");
    const savedState = storage.get("doorsync-state-v1");
    node("#logoutButton").handlers.click();
    assert.equal(node("#logoutDialog").open, true);
    assert.equal(storage.get("doorsync-session-v1"), savedSession);
    node("#cancelLogout").handlers.click();
    assert.equal(node("#logoutDialog").open, false);
    assert.equal(storage.get("doorsync-session-v1"), savedSession);
    node("#logoutButton").handlers.click();
    node("#confirmLogout").handlers.click();
    assert.equal(node("#logoutDialog").open, false);
    assert.equal(vm.runInContext("session", context), null);
    assert.equal(storage.has("doorsync-session-v1"), false);
    assert.equal(storage.get("doorsync-state-v1"), savedState);
    assert.equal(node("#loginPassword").type, "password");
  }
});
