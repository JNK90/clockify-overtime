dayjs.extend(window.dayjs_plugin_weekday);

const apiUrl = 'https://api.clockify.me/api/v1';
const temporalRe = /PT(\d{1,2}H)?(\d{1,2}M)?(\d{1,2}S)?/;

const triggerBtn = document.querySelector('#trigger-btn');
triggerBtn.addEventListener('click', async () => {
  await calculateOvertimeAsync();
})

const apiKeyInput = document.querySelector('#api-key');
let apiKey;

const startInput = document.querySelector('#start');
const endInput = document.querySelector('#end');

const totalWorkDaysOut = document.querySelector('#total-work-days');
const totalTimeToWorkOut = document.querySelector('#total-time-to-work');
const totalHoursWorkedOut = document.querySelector('#total-hours-worked');
const overtimeOut = document.querySelector('#overtime');

async function calculateOvertimeAsync() {
  // todo as parameters
  apiKey = apiKeyInput.value;
  const start = dayjs(startInput.value);
  const end = endInput.value ? dayjs(endInput.value) : dayjs();
  const workingDays = [1, 2, 3, 4, 5];
  const workingHoursPerDay = 6.6;

  const totalWorkDays = getTotalWorkingDays(start, end, workingDays);
  totalWorkDaysOut.innerText = totalWorkDays

  const totalTimeToWork = totalWorkDays * workingHoursPerDay;
  totalTimeToWorkOut.innerText = totalTimeToWork;

  const { userId, workspaceId } = await getUserAndWorkspaceIdAsync();

  const clockifyTimes = await getClockifyTimesAsync(start, end, workspaceId, userId);
  const totalHoursWorked = clockifyTimes.reduce((a, b) => a + b, 0);
  totalHoursWorkedOut.innerText = totalHoursWorked;

  const overtime = totalHoursWorked - totalTimeToWork;
  overtimeOut.innerText = overtime;
}

async function getUserAndWorkspaceIdAsync() {
  const response = await fetch(`${apiUrl}/user`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  });

  const result = await response.json();

  return { userId: result.id, workspaceId: result.defaultWorkspace };
}

async function getClockifyTimesAsync(start, end, workspaceId, userId) {
  const times = [];
  let page = 1;
  while (true) {
    const params = new URLSearchParams();
    params.append("start", start.add(-1, 'day').format('YYYY-MM-DDThh:mm:ssZ'));
    params.append("end", end.add(1, 'day').format('YYYY-MM-DDThh:mm:ssZ'));
    params.append("page", page);
    params.append("page-size", 200);

    const response = await fetch(`${apiUrl}/workspaces/${workspaceId}/user/${userId}/time-entries?${params}`, {
      headers: { 'x-api-key': apiKey },
    });
    const pagedTimes = await response.json();
    if (pagedTimes.length === 0) {
      break;
    }
    times.push(...pagedTimes.map((t) => calculateHours(t.timeInterval.duration)));
    page++;
  }
  return times;
}

function calculateHours(duration) {
  const [h, m, s] = duration
    .match(temporalRe)
    .slice(1)
    .map((x) => parseInt(x, 10) || 0);
  return h + m / 60 + s / 3600;
}

function getTotalWorkingDays(start, end, daysOfWeek) {
  const startDay = dayjs(start);
  const endDay = dayjs(end);
  const totalDays = endDay.diff(startDay, 'days') + 1;

  let numberOfWorkDays = 0;
  for (let i = 0; i < totalDays; i++) {
    const day = startDay.add(i, 'days');
    if (daysOfWeek.includes(day.weekday())) {
      numberOfWorkDays++;
    }
  }
  return numberOfWorkDays;
}