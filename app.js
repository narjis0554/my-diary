// Supabase 대시보드 → Project Settings → API Keys 에서 복사 (둘 다 공개해도 되는 값, 보호는 DB 보안 규칙이 담당)
const SUPABASE_URL = 'https://dbkfmhnmxujxrovwcxzz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6eDub42yktGjB_ckyjJkRA_g1Ru4XgA';

const sb = SUPABASE_URL && SUPABASE_ANON_KEY
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const $ = id => document.getElementById(id);
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

const state = {
  me: null,                       // 내 프로필 { id, name, avatar_url, color }
  tab: 'calendar',
  month: firstOfMonth(new Date()),
  selected: ymd(new Date()),      // 캘린더에서 고른 날짜
  events: [],
  hidden: new Set(),              // 캘린더에서 끈 사람 id
  editing: null,                  // 수정 중인 일정
  diaryDate: ymd(new Date()),
  water: 0,                       // 마신 물 (ml)
  mood: null,
};
const WATER_STEP = 500;           // −/+ 한 번에 바뀌는 양 (ml), 💧 하나
const WATER_MAX = 10000;
let monthSeq = 0;
let diarySeq = 0;

// ── 날짜 도우미 (모두 'YYYY-MM-DD' 문자열로 다룸) ──
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function dateLabel(s) {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
}
function timeLabel(e) {
  if (!e.start_time) return '종일';
  const start = e.start_time.slice(0, 5);
  return e.end_time ? `${start}–${e.end_time.slice(0, 5)}` : start;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function avatar(p, cls = '') {
  return p?.avatar_url
    ? `<img class="${cls}" src="${escapeHtml(p.avatar_url)}" alt="" referrerpolicy="no-referrer">`
    : '';
}
const textOrNull = s => (s || '').trim() || null;

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

// ── 로그인 ──
function showGate(note) {
  state.me = null;
  $('gate').hidden = false;
  $('tabs').hidden = true;
  $('user').hidden = true;
  $('calendar').hidden = true;
  $('diary').hidden = true;
  $('gate-note').hidden = !note;
  $('gate-note').textContent = note || '';
  $('login').disabled = !sb;
}

async function enterApp(user) {
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const meta = user.user_metadata || {};
  state.me = data || { id: user.id, name: meta.full_name || user.email, avatar_url: meta.avatar_url, color: '#0f7a5c' };

  const pic = $('user-pic');
  pic.hidden = !state.me.avatar_url;
  if (state.me.avatar_url) pic.src = state.me.avatar_url;
  $('user-name').textContent = state.me.name;

  $('gate').hidden = true;
  $('tabs').hidden = false;
  $('user').hidden = false;
  showTab(state.tab);
}

function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('calendar').hidden = tab !== 'calendar';
  $('diary').hidden = tab !== 'diary';
  if (tab === 'calendar') loadMonth();
  else loadDiary();
}

// ── 📅 캘린더 ──
function gridRange() {
  const first = state.month;
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const end = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  end.setDate(end.getDate() + (6 - end.getDay()));
  return [ymd(start), ymd(end)];
}

const visibleEvents = () => state.events.filter(e => !state.hidden.has(e.user_id));

async function loadMonth() {
  renderMonth();
  renderDay();
  const seq = ++monthSeq;
  const [from, to] = gridRange();
  const { data, error } = await sb
    .from('events')
    .select('*, profiles(name, avatar_url, color)')
    .gte('date', from)
    .lte('date', to)
    .order('date')
    .order('start_time', { nullsFirst: true });
  if (seq !== monthSeq) return;
  if (error) return toast('일정을 불러오지 못했어요: ' + error.message);
  state.events = data;
  renderPeople();
  renderMonth();
  renderDay();
}

function renderPeople() {
  const people = new Map([[state.me.id, state.me]]);
  for (const e of state.events) if (!people.has(e.user_id)) people.set(e.user_id, { id: e.user_id, ...e.profiles });
  $('people').innerHTML = [...people.values()].map(p => `
    <label class="person">
      <input type="checkbox" data-id="${escapeHtml(p.id)}" ${state.hidden.has(p.id) ? '' : 'checked'}>
      <span class="dot" style="background:${escapeHtml(p.color)}"></span>
      ${escapeHtml(p.id === state.me.id ? '나' : p.name)}
    </label>`).join('');
}

function renderMonth() {
  const m = state.month;
  $('month-title').textContent = `${m.getFullYear()}년 ${m.getMonth() + 1}월`;
  const [from, to] = gridRange();
  const today = ymd(new Date());
  const byDate = {};
  for (const e of visibleEvents()) (byDate[e.date] ||= []).push(e);

  let html = '';
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const date = parseYmd(d);
    const list = byDate[d] || [];
    const cls = ['day',
      date.getMonth() !== m.getMonth() && 'outside',
      date.getDay() === 0 && 'sun',
      d === today && 'today',
      d === state.selected && 'selected'].filter(Boolean).join(' ');
    const chips = list.slice(0, 3).map(e => `
      <span class="chip"><span class="dot" style="background:${escapeHtml(e.profiles?.color)}"></span><span class="label">${escapeHtml(e.title)}</span></span>`).join('');
    const more = list.length > 3 ? `<span class="more">+${list.length - 3}</span>` : '';
    const dots = list.slice(0, 6).map(e => `<span class="dot" style="background:${escapeHtml(e.profiles?.color)}"></span>`).join('');
    html += `
      <button type="button" class="${cls}" data-date="${d}" aria-label="${dateLabel(d)}, 일정 ${list.length}개">
        <span class="day-num">${date.getDate()}</span>${chips}${more}<span class="dots">${dots}</span>
      </button>`;
  }
  $('month-grid').innerHTML = html;
}

function renderDay() {
  $('day-title').textContent = dateLabel(state.selected);
  const list = visibleEvents().filter(e => e.date === state.selected);
  $('day-events').innerHTML = list.length ? list.map(e => {
    const mine = e.user_id === state.me.id;
    return `
      <li class="event" style="--c:${escapeHtml(e.profiles?.color)}">
        <div class="event-top">
          <span class="event-time">${timeLabel(e)}</span>
          <span class="event-title">${escapeHtml(e.title)}</span>
        </div>
        <div class="event-meta">
          ${avatar(e.profiles)}
          <span>${escapeHtml(mine ? '나' : e.profiles?.name)} · ${e.is_public ? '🌐 공개' : '🔒 나만 보기'}</span>
          ${mine ? `<button type="button" class="btn-ghost event-edit" data-id="${e.id}">수정</button>` : ''}
        </div>
        ${e.memo ? `<p class="event-memo">${escapeHtml(e.memo)}</p>` : ''}
      </li>`;
  }).join('') : '<li class="empty">이 날은 일정이 없어요.</li>';
}

function selectDate(d) {
  state.selected = d;
  const date = parseYmd(d);
  if (date.getMonth() !== state.month.getMonth() || date.getFullYear() !== state.month.getFullYear()) {
    state.month = firstOfMonth(date);
    loadMonth();
  } else {
    renderMonth();
    renderDay();
  }
}

function moveMonth(n) {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + n, 1);
  state.selected = ymd(state.month);
  loadMonth();
}

// ── 일정 추가/수정 창 ──
// 시간 칸은 항상 입력 가능: 시간을 적으면 '종일'이 풀리고, '종일'을 켜면 시간이 지워짐
function onAllDayChange() {
  const f = $('event-form');
  if (f.all_day.checked) {
    f.start_time.value = '';
    f.end_time.value = '';
  }
}
function onTimeInput() {
  const f = $('event-form');
  if (f.start_time.value || f.end_time.value) f.all_day.checked = false;
}

function openEventDialog(e) {
  state.editing = e || null;
  const f = $('event-form');
  f.reset();
  $('event-dialog-title').textContent = e ? '일정 수정' : '일정 추가';
  f.title.value = e?.title || '';
  f.date.value = e?.date || state.selected;
  f.all_day.checked = !e?.start_time;
  f.start_time.value = e?.start_time?.slice(0, 5) || '';
  f.end_time.value = e?.end_time?.slice(0, 5) || '';
  f.memo.value = e?.memo || '';
  f.e_public.value = String(!!e?.is_public);
  $('delete-event').hidden = !e;
  $('event-dialog').showModal();
}

async function saveEvent(ev) {
  ev.preventDefault();
  const f = $('event-form');
  const allDay = f.all_day.checked;
  const start = allDay ? null : f.start_time.value || null;
  const end = allDay || !start ? null : f.end_time.value || null;
  if (end && end < start) return toast('끝 시간이 시작 시간보다 빨라요.');
  const row = {
    title: f.title.value.trim(),
    date: f.date.value,
    start_time: start,
    end_time: end,
    memo: textOrNull(f.memo.value),
    is_public: f.e_public.value === 'true',
  };
  if (!row.title) return toast('제목을 적어주세요.');

  const saveBtn = f.querySelector('[type=submit]');
  saveBtn.disabled = true;
  const { error } = state.editing
    ? await sb.from('events').update(row).eq('id', state.editing.id)
    : await sb.from('events').insert({ ...row, user_id: state.me.id });
  saveBtn.disabled = false;
  if (error) return toast('저장하지 못했어요: ' + error.message);

  $('event-dialog').close();
  toast(state.editing ? '일정을 고쳤어요.' : '일정을 추가했어요.');
  state.month = firstOfMonth(parseYmd(row.date));
  state.selected = row.date;
  loadMonth();
}

async function deleteEvent() {
  if (!state.editing || !confirm('이 일정을 삭제할까요?')) return;
  const { error } = await sb.from('events').delete().eq('id', state.editing.id);
  if (error) return toast('삭제하지 못했어요: ' + error.message);
  $('event-dialog').close();
  toast('일정을 삭제했어요.');
  loadMonth();
}

// ── 📔 다이어리 ──
function renderWater() {
  const drops = Math.ceil(state.water / WATER_STEP);
  $('water-count').textContent = state.water.toLocaleString('ko-KR');
  $('water-cups').textContent = '💧'.repeat(Math.min(drops, 12)) + (drops > 12 ? ' …' : '');
}
function renderMood() {
  document.querySelectorAll('#moods button').forEach(b => {
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(b.dataset.mood === state.mood));
  });
}

function fillDiary(entry) {
  const f = $('diary-form');
  for (const k of ['breakfast', 'lunch', 'dinner', 'snack', 'exercise', 'note']) f[k].value = entry?.[k] || '';
  f.exercise_min.value = entry?.exercise_min ?? '';
  f.d_public.value = String(!!entry?.is_public);
  state.water = entry?.water_ml || 0;
  state.mood = entry?.mood || null;
  renderWater();
  renderMood();
}

async function loadDiary() {
  const d = state.diaryDate;
  $('diary-title').textContent = dateLabel(d) + (d === ymd(new Date()) ? ' · 오늘' : '');
  const seq = ++diarySeq;
  const [mine, others] = await Promise.all([
    sb.from('diary').select('*').eq('user_id', state.me.id).eq('date', d).maybeSingle(),
    sb.from('diary').select('*, profiles(name, avatar_url, color)').eq('date', d).neq('user_id', state.me.id)
      .order('updated_at', { ascending: false }),
  ]);
  if (seq !== diarySeq) return;
  if (mine.error || others.error) toast('기록을 불러오지 못했어요: ' + (mine.error || others.error).message);
  fillDiary(mine.data);
  renderOthers(others.data || []);
}

function renderOthers(list) {
  $('others').innerHTML = list.length ? list.map(r => {
    const rows = [
      ['아침', r.breakfast], ['점심', r.lunch], ['저녁', r.dinner], ['간식', r.snack],
      ['물', r.water_ml ? `💧 ${r.water_ml.toLocaleString('ko-KR')}ml` : ''],
      ['운동', [r.exercise, r.exercise_min ? r.exercise_min + '분' : ''].filter(Boolean).join(' · ')],
    ].filter(([, v]) => v);
    return `
      <article class="panel other" style="--c:${escapeHtml(r.profiles?.color)}">
        <div class="other-head">${avatar(r.profiles)}${escapeHtml(r.profiles?.name)}<span class="mood">${escapeHtml(r.mood || '')}</span></div>
        ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>` : ''}
        ${r.note ? `<p class="note-line">${escapeHtml(r.note)}</p>` : ''}
      </article>`;
  }).join('') : '<p class="empty">이 날 공개된 다른 사람의 기록이 없어요.</p>';
}

async function saveDiary(ev) {
  ev.preventDefault();
  const f = $('diary-form');
  const min = f.exercise_min.value === '' ? null : Math.max(0, Math.min(1440, Math.round(+f.exercise_min.value)));
  const row = {
    user_id: state.me.id,
    date: state.diaryDate,
    breakfast: textOrNull(f.breakfast.value),
    lunch: textOrNull(f.lunch.value),
    dinner: textOrNull(f.dinner.value),
    snack: textOrNull(f.snack.value),
    water_ml: state.water,
    exercise: textOrNull(f.exercise.value),
    exercise_min: min,
    mood: state.mood,
    note: textOrNull(f.note.value),
    is_public: f.d_public.value === 'true',
    updated_at: new Date().toISOString(),
  };
  const saveBtn = f.querySelector('[type=submit]');
  saveBtn.disabled = true;
  const { error } = await sb.from('diary').upsert(row, { onConflict: 'user_id,date' });
  saveBtn.disabled = false;
  if (error) return toast('저장하지 못했어요: ' + error.message);
  toast(row.is_public ? '저장했어요. 다른 사람도 볼 수 있어요 🌐' : '저장했어요. 나만 볼 수 있어요 🔒');
}

function moveDiary(n) {
  state.diaryDate = n === 0 ? ymd(new Date()) : addDays(state.diaryDate, n);
  loadDiary();
}

// ── 이벤트 연결 ──
function bindUi() {
  $('login').addEventListener('click', () => {
    sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  });
  $('logout').addEventListener('click', () => sb.auth.signOut());
  $('tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (b) showTab(b.dataset.tab);
  });

  $('prev-month').addEventListener('click', () => moveMonth(-1));
  $('next-month').addEventListener('click', () => moveMonth(1));
  $('this-month').addEventListener('click', () => selectDate(ymd(new Date())));
  $('month-grid').addEventListener('click', e => {
    const b = e.target.closest('.day');
    if (b) selectDate(b.dataset.date);
  });
  $('people').addEventListener('change', e => {
    const id = e.target.dataset.id;
    if (e.target.checked) state.hidden.delete(id);
    else state.hidden.add(id);
    renderMonth();
    renderDay();
  });
  $('add-event').addEventListener('click', () => openEventDialog(null));
  $('day-events').addEventListener('click', e => {
    const b = e.target.closest('.event-edit');
    if (b) openEventDialog(state.events.find(x => x.id === b.dataset.id));
  });

  $('event-form').addEventListener('submit', saveEvent);
  $('event-form').all_day.addEventListener('change', onAllDayChange);
  $('event-form').start_time.addEventListener('input', onTimeInput);
  $('event-form').end_time.addEventListener('input', onTimeInput);
  $('cancel-event').addEventListener('click', () => $('event-dialog').close());
  $('delete-event').addEventListener('click', deleteEvent);

  $('prev-day').addEventListener('click', () => moveDiary(-1));
  $('next-day').addEventListener('click', () => moveDiary(1));
  $('today').addEventListener('click', () => moveDiary(0));
  $('water-minus').addEventListener('click', () => { state.water = Math.max(0, state.water - WATER_STEP); renderWater(); });
  $('water-plus').addEventListener('click', () => { state.water = Math.min(WATER_MAX, state.water + WATER_STEP); renderWater(); });
  $('moods').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.mood = state.mood === b.dataset.mood ? null : b.dataset.mood;
    renderMood();
  });
  $('diary-form').addEventListener('submit', saveDiary);
}

// ── 시작 ──
bindUi();
if (!sb) {
  showGate('Supabase 연결 정보가 아직 설정되지 않았어요.');
} else {
  // 로그인 상태가 바뀔 때마다 화면 전환 (콜백 안에서 바로 DB를 부르면 멈출 수 있어 setTimeout으로 넘김)
  let currentUserId;
  sb.auth.onAuthStateChange((_event, session) => {
    const id = session?.user.id ?? null;
    if (id === currentUserId) return;
    currentUserId = id;
    setTimeout(() => (session ? enterApp(session.user) : showGate()), 0);
  });
}
