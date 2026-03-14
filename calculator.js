dayjs.extend(window.dayjs_plugin_weekday);

const apiUrl = 'https://api.clockify.me/api/v1';
const temporalRe = /PT(\d{1,2}H)?(\d{1,2}M)?(\d{1,2}S)?/;
const holidayProjectId = '63dcf27783d3c529999f1304';

const triggerBtn = document.querySelector('#trigger-btn');
triggerBtn.addEventListener('click', async () => {
    await calculateOvertimeAsync();
});

const apiKeyInput = document.querySelector('#api-key');
let apiKey;

const startInput = document.querySelector('#start');
const endInput = document.querySelector('#end');
// preset dropdown (mon-fri / every-day / custom) and container for custom checkboxes
const presetSelect = document.querySelector('#working-days-preset');
const customDaysContainer = document.querySelector('#custom-days');
const workingDaysInputs = [
    document.querySelector('#working-day-mon'),
    document.querySelector('#working-day-tue'),
    document.querySelector('#working-day-wed'),
    document.querySelector('#working-day-thu'),
    document.querySelector('#working-day-fri'),
    document.querySelector('#working-day-sat'),
    document.querySelector('#working-day-sun'),
];
const workingHoursPerDayInput = document.querySelector('#working-hours-per-day');
const ptoInput = document.querySelector('#pto');

// apply selected preset by checking appropriate boxes and toggling visibility
function applyPreset(preset) {
    switch (preset) {
        case 'mon-fri':
            workingDaysInputs.forEach((inp) => {
                const v = Number.parseInt(inp.value, 10);
                inp.checked = v >= 1 && v <= 5;
            });
            customDaysContainer.style.display = 'none';
            break;
        case 'every-day':
            workingDaysInputs.forEach((inp) => (inp.checked = true));
            customDaysContainer.style.display = 'none';
            break;
        case 'custom':
            customDaysContainer.style.display = '';
            break;
        default:
            applyPreset('mon-fri');
    }
}

function loadSettings() {
    const today = dayjs();
    const startDefault = today.startOf('year');
    const endDefault = today;
    const workingHoursDefault = 7.6; // 38 hours per week
    const defaultWorkingDays = [1, 2, 3, 4, 5]; // Mon-Fri
    const defaultPto = 30;

    const storedStart = localStorage.getItem('start');
    startInput.value = storedStart || startDefault.format('YYYY-MM-DD');

    const storedEnd = localStorage.getItem('end');
    endInput.value = storedEnd || endDefault.format('YYYY-MM-DD');

    const storedHours = localStorage.getItem('workingHoursPerDay');
    workingHoursPerDayInput.value = storedHours !== null ? storedHours : workingHoursDefault;

    const storedPto = localStorage.getItem('pto');
    ptoInput.value = storedPto !== null ? storedPto : defaultPto;

    // load preset and working days
    const storedPreset = localStorage.getItem('workingDaysPreset') || 'mon-fri';
    presetSelect.value = storedPreset;

    if (storedPreset === 'custom') {
        const storedDays = localStorage.getItem('workingDays');
        const daysToCheck = storedDays ? JSON.parse(storedDays) : defaultWorkingDays;
        workingDaysInputs.forEach((input) => {
            const val = Number.parseInt(input.value, 10);
            input.checked = daysToCheck.includes(val);
        });
        customDaysContainer.style.display = '';
    } else {
        applyPreset(storedPreset);
    }
}

function saveSettings() {
    localStorage.setItem('start', startInput.value);
    localStorage.setItem('end', endInput.value);
    localStorage.setItem('workingHoursPerDay', workingHoursPerDayInput.value);
    localStorage.setItem('workingDaysPreset', presetSelect.value);
    const checkedDays = workingDaysInputs.filter((d) => d.checked).map((d) => Number.parseInt(d.value, 10));
    localStorage.setItem('workingDays', JSON.stringify(checkedDays));
}

[startInput, endInput, workingHoursPerDayInput, ...workingDaysInputs].forEach((el) => {
    el.addEventListener('change', saveSettings);
});

// respond to preset changes
presetSelect.addEventListener('change', () => {
    applyPreset(presetSelect.value);
    saveSettings();
});

loadSettings();

const totalWorkDaysOut = document.querySelector('#total-work-days');
const totalTimeToWorkOut = document.querySelector('#total-time-to-work');
const totalHoursWorkedOut = document.querySelector('#total-hours-worked');
const overtimeOut = document.querySelector('#overtime');
const holidayOut = document.querySelector('#holiday');
const holidayDetailsOut = document.querySelector('#holiday-details');

async function calculateOvertimeAsync() {
    saveSettings();

    apiKey = apiKeyInput.value;
    const start = dayjs(startInput.value);
    const end = endInput.value ? dayjs(endInput.value) : dayjs();
    const workingDays = workingDaysInputs.filter((d) => d.checked).map((d) => Number.parseInt(d.value));
    const workingHoursPerDay = workingHoursPerDayInput.value;

    const totalWorkDays = getTotalWorkingDays(start, end, workingDays);
    totalWorkDaysOut.innerText = totalWorkDays;

    const totalTimeToWork = totalWorkDays * workingHoursPerDay;
    totalTimeToWorkOut.innerText = totalTimeToWork;

    const { userId, workspaceId } = await getUserAndWorkspaceIdAsync();

    const clockifyEntries = await getClockifyEntriesAsync(start, end, workspaceId, userId);
    const workingHours = clockifyEntries.map((t) =>
        t.timeInterval.duration ? calculateHours(t.timeInterval.duration) : 0,
    );
    const totalHoursWorked = workingHours.reduce((a, b) => a + b, 0);
    totalHoursWorkedOut.innerText = totalHoursWorked;

    const overtime = totalHoursWorked - totalTimeToWork;
    overtimeOut.innerText = overtime;

    const usedHoliday = clockifyEntries.filter((t) => t.projectId === holidayProjectId);
    const usedHolidayHours = usedHoliday
        .map((t) => (t.timeInterval.duration ? calculateHours(t.timeInterval.duration) : 0))
        .reduce((a, b) => a + b, 0);
    holidayOut.innerText = usedHolidayHours / workingHoursPerDay;
    holidayDetailsOut.innerHTML = usedHoliday
        .map(
            (t) =>
                `<li>${dayjs(t.timeInterval.start).format('DD.MM.YY')}: ${calculateHours(t.timeInterval.duration)}</li>`,
        )
        .join('');
}

async function getUserAndWorkspaceIdAsync() {
  const response = await fetch(`${apiUrl}/user`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  });

  const result = await response.json();

  return { userId: result.id, workspaceId: result.defaultWorkspace };
}

async function getClockifyEntriesAsync(start, end, workspaceId, userId) {
    const times = [];
    let page = 1;
    while (true) {
        const params = new URLSearchParams();
        params.append('start', start.add(-1, 'day').format('YYYY-MM-DDThh:mm:ssZ'));
        params.append('end', end.add(1, 'day').format('YYYY-MM-DDThh:mm:ssZ'));
        params.append('page', page);
        params.append('page-size', 200);

        const response = await fetch(`${apiUrl}/workspaces/${workspaceId}/user/${userId}/time-entries?${params}`, {
            headers: { 'x-api-key': apiKey },
        });
        const pagedTimes = await response.json();
        if (pagedTimes.length === 0) {
            break;
        }
        times.push(...pagedTimes);
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
