require('dotenv').config();
const axios = require('axios');
const dayjs = require('dayjs');
const weekday = require('dayjs/plugin/weekday');

dayjs.extend(weekday);
const temporalRe = /PT(\d{1,2}H)?(\d{1,2}M)?(\d{1,2}S)?/;

// const workspaceId = '639df8772e6cf741bcac9bde';
// const userId = '6315f0e6ac989c527226410d';
const apiKey = process.env.API_KEY;
const apiUrl = 'https://api.clockify.me/api/v1';

async function main() {
  // todo as parameters
  const start = dayjs('2025-01-01');
  const end = dayjs();
  const workingDays = [1, 2, 3, 4, 5];
  const workingOursPerDay = 6.6;

  const totalWorkDays = getTotalWorkingDays(start, end, workingDays);
  console.log(`Total working days: ${totalWorkDays}`);

  const totalTimeToWork = totalWorkDays * workingOursPerDay;
  console.log(`Total time to work: ${totalTimeToWork} hours`);

  const { userId, workspaceId } = await getUserAndWorkspaceIdAsync();

  const clockifyTimes = await getClockifyTimesAsync(start, end, workspaceId, userId);
  const totalHoursWorked = clockifyTimes.reduce((a, b) => a + b, 0);
  console.log(`Total hours worked: ${totalHoursWorked} hours`);

  const overtime = totalHoursWorked - totalTimeToWork;
  console.log(`Overtime: ${overtime} hours`);
}

async function getUserAndWorkspaceIdAsync() {
  const response = await axios.get('user', {
    baseURL: apiUrl,
    headers: { 'x-api-key': apiKey },
  });

  return { userId: response.data.id, workspaceId: response.data.defaultWorkspace };
}

async function getClockifyTimesAsync(start, end, workspaceId, userId) {
  const times = [];
  let page = 1;
  while (true) {
    const pagedTimes = await axios.get(`/workspaces/${workspaceId}/user/${userId}/time-entries`, {
      baseURL: apiUrl,
      headers: { 'x-api-key': apiKey },
      params: {
        start: start.format('YYYY-MM-DDThh:mm:ssZ'),
        end: end.add(1, 'day').format('YYYY-MM-DDThh:mm:ssZ'),
        page,
        'page-size': 200,
      },
    });
    if (pagedTimes.data.length === 0) {
      break;
    }
    times.push(...pagedTimes.data.map((t) => calculateHours(t.timeInterval.duration)));
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

main();
