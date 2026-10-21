// 我愛螢圃里 — 前端主程式
(() => {
  const CFG = window.ILY_CONFIG || {};
  const VILLAGE = '螢圃里';
  // 螢圃里里界 [lng, lat]，與後端 construction.gs 相同
  const BOUNDARY = [
    [121.51716, 25.02693], [121.517965, 25.026702], [121.518973, 25.026417], [121.518986, 25.026001],
    [121.519018, 25.025025], [121.519314, 25.024966], [121.519478, 25.024921], [121.519532, 25.024907],
    [121.51992, 25.024815], [121.520232, 25.02473], [121.520329, 25.024704], [121.520704, 25.024574],
    [121.520815, 25.024535], [121.520831, 25.024527], [121.521329, 25.024288], [121.521702, 25.024068],
    [121.521607, 25.023947], [121.521474, 25.023779], [121.521383, 25.023663], [121.521083, 25.023684],
    [121.520568, 25.023719], [121.519031, 25.023825], [121.519025, 25.023825], [121.519013, 25.023826],
    [121.518597, 25.023845], [121.517561, 25.023891], [121.517459, 25.023896], [121.517414, 25.023898],
    [121.517408, 25.023898], [121.516808, 25.023925], [121.516736, 25.0242], [121.516587, 25.024766],
    [121.516555, 25.024888], [121.516352, 25.025661], [121.516346, 25.025682], [121.516254, 25.026032],
    [121.516247, 25.026059], [121.516225, 25.026143], [121.516096, 25.026633], [121.515926, 25.02728],
    [121.51716, 25.02693],
  ];
  const WEEK = ['日', '一', '二', '三', '四', '五', '六', '日']; // index 0 與 7 都是週日

  const state = { sheets: null, youbike: null, parking: null, liveError: false, liveFetchedAt: 0 };

  // ---------- 小工具 ----------
  const $ = (sel) => document.querySelector(sel);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isoDay = (d) => (d.getDay() === 0 ? 7 : d.getDay());
  const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
  const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const daysOf = (s) => String(s ?? '').split(',').map(Number).filter(Boolean);
  const dayNames = (s) => {
    const days = daysOf(s);
    return days.length ? `週${days.map((d) => WEEK[d]).join('、')}` : '需預約';
  };
  const distText = (item) => (item.in_village ? '里內' : `離里界 ${item.distance_m}m`);
  // '2026-10-15 13:31:52' 或 '2026-10-15 13:31' → '13:31'
  const hhmm = (s) => (String(s ?? '').match(/(\d{1,2}:\d{2})(?::\d{2})?$/) || [])[1] || '';

  async function fetchJson(url) {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  function showNotice(html) {
    const el = $('#notice');
    el.innerHTML = html;
    el.hidden = false;
  }

  // ---------- 垃圾車 ----------
  // 找下一個還沒離開的停靠點；今天沒有就往後找收運日
  function nextGarbage(stops) {
    const now = new Date();
    const today = isoDay(now);
    const nm = nowMin();
    for (let offset = 0; offset < 8; offset++) {
      const day = ((today - 1 + offset) % 7) + 1;
      const list = stops
        .filter((s) => daysOf(s.collect_days).includes(day) && (offset > 0 || toMin(s.leave_time) >= nm))
        .sort((a, b) => toMin(a.arrive_time) - toMin(b.arrive_time));
      if (list.length) return { offset, day, list };
    }
    return null;
  }

  function villageStops() {
    const stops = state.sheets?.garbage || [];
    const mine = stops.filter((s) => s.village === VILLAGE);
    return mine.length ? mine : stops;
  }

  // 首頁「垃圾車」小卡：下一班時間＋地點＋倒數；點了跳到垃圾回收頁
  function renderHomeGarbage() {
    const el = $('#home-garbage');
    if (!state.sheets) return;
    const next = nextGarbage(villageStops());
    if (!next) { el.innerHTML = '<div class="label">垃圾車<span class="go">›</span></div><div class="sub">目前沒有垃圾車資料</div>'; return; }

    const [first] = next.list;
    const today = isoDay(new Date());
    const collectsToday = villageStops().some((s) => daysOf(s.collect_days).includes(today));
    const nextDay = next.offset === 1 ? '明天' : `週${WEEK[next.day]}`;

    // 今天停收（臺北市週三、週日）：蓋一個「休」字，下面告訴他下一班
    if (!collectsToday) {
      el.innerHTML = `
        <div class="label">今天垃圾車<span class="go">›</span></div>
        <div class="rest-row">
          <span class="rest-stamp" aria-hidden="true">休</span>
          <span class="tile-place">週${WEEK[today]}停收</span>
        </div>
        <div class="sub">下一班 <b>${nextDay} ${esc(first.arrive_time)}</b><br>${esc(first.stop_name)}</div>`;
      return;
    }

    let when;
    if (next.offset === 0) {
      const wait = toMin(first.arrive_time) - nowMin();
      when = wait > 0
        ? `還有 <b>${wait >= 60 ? `${Math.floor(wait / 60)} 小時 ${wait % 60} 分` : `${wait} 分鐘`}</b>`
        : `<b>車子現在在這裡</b>`;
    } else {
      when = `今天已收完・<b>${nextDay}</b>`;
    }

    el.innerHTML = `
      <div class="label">下一班垃圾車<span class="go">›</span></div>
      <div class="big">${esc(first.arrive_time)}</div>
      <div class="tile-place">${esc(first.stop_name)}</div>
      <div class="sub">${when}</div>`;
  }

  function renderGarbageView() {
    const stops = state.sheets?.garbage || [];
    const today = isoDay(new Date());
    const nm = nowMin();
    const collectsToday = stops.some((s) => daysOf(s.collect_days).includes(today));
    $('#garbage-hint').textContent = collectsToday
      ? `今天週${WEEK[today]}有收運，已經離開的停靠點會變淡。`
      : `今天週${WEEK[today]}停收，以下是收運日的時間。`;

    const villages = [...new Set(stops.map((s) => s.village))]
      .sort((a, b) => (a === VILLAGE ? -1 : b === VILLAGE ? 1 : a.localeCompare(b, 'zh-Hant')));
    $('#garbage-list').innerHTML = villages.map((v) => {
      const rows = stops.filter((s) => s.village === v)
        .sort((a, b) => toMin(a.arrive_time) - toMin(b.arrive_time))
        .map((s) => {
          const past = collectsToday && toMin(s.leave_time) < nm;
          return `<div class="row${past ? ' past' : ''}">
            <div class="when">${esc(s.arrive_time)}</div>
            <div class="main"><div class="title">${esc(s.stop_name)}</div>
              <div class="desc">${esc(s.route_name)} ${esc(s.trip)}・停到 ${esc(s.leave_time)}・${dayNames(s.collect_days)}</div>
              ${s.note ? `<div class="desc">${esc(s.note)}</div>` : ''}</div>
          </div>`;
        }).join('');
      // 停收日整張清單反灰
      return `<div class="group-title">${esc(v)}</div><article class="card${collectsToday ? '' : ' rest-day'}">${rows}</article>`;
    }).join('') || '<p class="muted">目前沒有垃圾車資料</p>';
  }

  // ---------- 資源回收 ----------
  function renderRecycleView() {
    const today = isoDay(new Date());
    const rows = [...(state.sheets?.recycle_schedule || [])].sort((a, b) => a.sort_order - b.sort_order);
    $('#recycle-list').innerHTML = `<div class="list">${rows.map((r) => {
      const isToday = daysOf(r.days).includes(today);
      return `<article class="card">
        <div class="row"><div class="main">
          <div class="title">${esc(r.category)}</div>
          <div class="chips"><span class="chip${isToday ? ' solid' : ''}">${dayNames(r.days)}${isToday ? '・今天收' : ''}</span></div>
          <p class="desc" style="margin-top:6px">${esc(r.items)}</p>
          ${r.not_accepted ? `<details><summary>不收的東西</summary>${esc(r.not_accepted)}</details>` : ''}
          ${r.note ? `<p class="desc" style="margin-top:4px">※ ${esc(r.note)}</p>` : ''}
        </div></div>
      </article>`;
    }).join('')}</div>`;
  }

  // ---------- 施工 ----------
  function renderWork() {
    const items = [...(state.sheets?.construction || [])]
      .sort((a, b) => (b.in_village - a.in_village) || (a.distance_m - b.distance_m));
    const inside = items.filter((w) => w.in_village);
    $('#home-work').innerHTML = `
      <div class="label">施工<span class="go">›</span></div>
      <div class="big">${inside.length}<small>件在里內</small></div>
      <div class="sub">${items.length - inside.length ? `周邊另有 ${items.length - inside.length} 件` : '周邊沒有其他施工'}</div>`;

    $('#work-list').innerHTML = items.length ? `<div class="list">${items.map((w) => `
      <article class="card">
        <div class="chips" style="margin-top:0"><span class="chip${w.in_village ? ' solid' : ''}">${distText(w)}</span><span class="chip">${esc(w.status)}</span></div>
        <div class="title serif" style="margin-top:6px;font-weight:700">${esc(w.title)}</div>
        <div class="desc muted">${esc(w.start_time)} ～ ${esc(w.end_time)}</div>
        ${w.work_hours ? `<div class="desc muted">施工時段：${esc(w.work_hours)}</div>` : ''}
        <details><summary>施工路段</summary>${esc(w.location_desc)}<br>施工單位：${esc(w.contractor)}</details>
      </article>`).join('')}</div>` : '<p class="muted">今天里內與周邊沒有施工。</p>';
  }

  // ---------- 交通（即時） ----------
  // 後端標記 stale（資料源超過 30 分鐘沒更新，或用的是備援資料）時顯示的時間：今天只寫時分，否則加上月/日
  function staleWhen(s) {
    const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}:\d{2})/);
    if (!m) return hhmm(s);
    const d = new Date();
    const today = +m[1] === d.getFullYear() && +m[2] === d.getMonth() + 1 && +m[3] === d.getDate();
    return today ? m[4] : `${+m[2]}/${+m[3]} ${m[4]}`;
  }
  const staleNote = (s) => `⚠ 市府資料停在 ${staleWhen(s)}，數字可能不準`;

  function setUpdated(el, list, scope) {
    const first = list?.[0];
    el.classList.toggle('stale-note', !!first?.stale);
    el.textContent = !first ? '' : first.stale ? staleNote(first.updated_at) : `更新於 ${hhmm(first.updated_at)}・${scope}`;
  }

  function renderLive() {
    const bikes = state.youbike;
    const lots = state.parking;

    // 首頁小卡：附近全部站點／停車場的合計（範圍同交通頁），點卡片跳到交通頁對應區塊
    const bikeStale = bikes?.[0]?.stale;
    const rentSum = (bikes || []).reduce((n, b) => n + b.available_rent, 0);
    const returnSum = (bikes || []).reduce((n, b) => n + b.available_return, 0);
    $('#home-bike').innerHTML = bikes
      ? `<div class="label">YouBike<span class="go">›</span></div><div class="big${bikeStale ? ' is-stale' : ''}">${rentSum}<small>可借</small></div>
         <div class="sub">空位 ${returnSum}・附近 ${bikes.length} 站合計${bikeStale ? '<br>⚠ 資料延遲' : ''}</div>`
      : `<div class="label">YouBike</div><div class="sub">${state.liveError ? '暫時無法取得' : '載入中…'}</div>`;

    const withData = (lots || []).filter((p) => p.available_car !== null);
    const free = withData.reduce((n, p) => n + p.available_car, 0);
    const parkStale = lots?.[0]?.stale;
    $('#home-park').innerHTML = lots
      ? `<div class="label">停車<span class="go">›</span></div><div class="big${parkStale ? ' is-stale' : ''}">${free}<small>空位</small></div>
         <div class="sub">附近 ${withData.length} 座計時停車場合計${parkStale ? '<br>⚠ 資料延遲' : ''}</div>`
      : `<div class="label">停車</div><div class="sub">${state.liveError ? '暫時無法取得' : '載入中…'}</div>`;

    // 交通頁
    setUpdated($('#bike-updated'), bikes, '里內與里界外 100m 內的站點');
    renderBikeList();

    setUpdated($('#park-updated'), lots, '里內與里界外 200m 內的計時停車場');
    renderParkList();

    updateLiveMarkers();
  }

  // ---------- 停車場排序（同 YouBike：空位由多到少；停車場由近到遠；未提供即時資料的永遠排最後） ----------
  const PARK_SORT_KEY = 'ily.parkSort';
  const PARK_SORTS = { distance: { label: '停車場' }, free: { label: '空位' } };
  const parkSort = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PARK_SORT_KEY));
      if (saved && PARK_SORTS[saved.key]) return { key: saved.key };
    } catch (err) { /* 無痕模式或停用儲存時用預設 */ }
    return { key: 'free' };
  })();

  function sortedParking() {
    const byDistance = (a, b) => (b.in_village - a.in_village) || (a.distance_m - b.distance_m);
    const noData = (p) => (p.available_car === null ? 1 : 0);
    return [...state.parking].sort((a, b) => (noData(a) - noData(b))
      || (parkSort.key === 'free' ? (b.available_car - a.available_car) : 0)
      || byDistance(a, b));
  }

  function renderParkList() {
    if (!state.parking) {
      $('#park-list').innerHTML = '<p class="muted">暫時無法取得，稍後會自動重試。</p>';
      return;
    }
    const head = (key, cls) => {
      const on = parkSort.key === key;
      return `<button class="sort-btn ${cls}${on ? ' on' : ''}" data-park-sort="${key}" aria-pressed="${on}">${PARK_SORTS[key].label}${on ? ' ▼' : ''}</button>`;
    };
    $('#park-list').innerHTML = `<article class="card${state.parking[0]?.stale ? ' is-stale' : ''}">
      <div class="row sort-head">${head('distance', 'main')}${head('free', 'count')}</div>
      ${sortedParking().map((p) => `
      <div class="row">
        <div class="main"><div class="title">${esc(p.name)}</div>
          <div class="desc">${esc(p.address)}・${distText(p)}</div>
          <details><summary>收費與電話</summary>${esc(p.fee)}<br>營業：${esc(p.service_time)}${p.tel ? `<br>電話：${esc(p.tel)}` : ''}</details>
        </div>
        ${p.available_car === null
          ? `<div class="count muted">—<small>未提供即時資料</small></div>`
          : `<div class="count${p.available_car === 0 ? ' zero' : ''}">${p.available_car}<small>/ ${p.total_car} 格</small></div>`}
      </div>`).join('')}</article>`;
  }

  $('#park-list').addEventListener('click', (e) => {
    const key = e.target.closest('[data-park-sort]')?.dataset.parkSort;
    if (!key || key === parkSort.key) return;
    parkSort.key = key;
    try { localStorage.setItem(PARK_SORT_KEY, JSON.stringify(parkSort)); } catch (err) { /* 存不了就只在這次有效 */ }
    renderParkList();
  });

  // ---------- YouBike 排序（點欄位標題切換，選擇存在瀏覽器） ----------
  // 只有一個方向：可借、空位由多到少；站點由近到遠（里內優先）
  const BIKE_SORT_KEY = 'ily.bikeSort';
  const BIKE_SORTS = {
    distance: { label: '站點' },
    rent: { label: '可借', field: 'available_rent' },
    return: { label: '空位', field: 'available_return' },
  };
  const bikeSort = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BIKE_SORT_KEY));
      if (saved && BIKE_SORTS[saved.key]) return { key: saved.key };
    } catch (err) { /* 無痕模式或停用儲存時用預設 */ }
    return { key: 'rent' };
  })();

  function sortedBikes() {
    const byDistance = (a, b) => (b.in_village - a.in_village) || (a.distance_m - b.distance_m);
    const { field } = BIKE_SORTS[bikeSort.key];
    return [...state.youbike].sort((a, b) => (field ? (b[field] - a[field]) || byDistance(a, b) : byDistance(a, b)));
  }

  function renderBikeList() {
    if (!state.youbike) {
      $('#bike-list').innerHTML = '<p class="muted">暫時無法取得，稍後會自動重試。</p>';
      return;
    }
    const head = (key, cls) => {
      const on = bikeSort.key === key;
      return `<button class="sort-btn ${cls}${on ? ' on' : ''}" data-bike-sort="${key}" aria-pressed="${on}">${BIKE_SORTS[key].label}${on ? ' ▼' : ''}</button>`;
    };
    $('#bike-list').innerHTML = `<article class="card${state.youbike[0]?.stale ? ' is-stale' : ''}">
      <div class="row sort-head">${head('distance', 'main')}${head('rent', 'count')}${head('return', 'count')}</div>
      ${sortedBikes().map((b) => `
      <div class="row">
        <div class="main"><div class="title">${esc(b.name)}</div><div class="desc">${esc(b.address)}・${distText(b)}</div></div>
        <div class="count${b.available_rent === 0 ? ' zero' : ''}">${b.available_rent}</div>
        <div class="count${b.available_return === 0 ? ' zero' : ''}">${b.available_return}</div>
      </div>`).join('')}</article>`;
  }

  $('#bike-list').addEventListener('click', (e) => {
    const key = e.target.closest('[data-bike-sort]')?.dataset.bikeSort;
    if (!key || key === bikeSort.key) return;
    bikeSort.key = key;
    try { localStorage.setItem(BIKE_SORT_KEY, JSON.stringify(bikeSort)); } catch (err) { /* 存不了就只在這次有效 */ }
    renderBikeList();
  });

  async function loadLive() {
    if (!CFG.API_URL) return;
    state.liveFetchedAt = Date.now();
    const [bike, park] = await Promise.allSettled([
      fetchJson(`${CFG.API_URL}?sheet=youbike`),
      fetchJson(`${CFG.API_URL}?sheet=parking`),
    ]);
    if (bike.status === 'fulfilled') state.youbike = bike.value.youbike;
    if (park.status === 'fulfilled') state.parking = park.value.parking;
    state.liveError = bike.status === 'rejected' || park.status === 'rejected';
    renderLive();
  }

  // ---------- 公共廁所（只在地圖上顯示） ----------
  // 環保局分類改成住戶看得懂的說法
  const TOILET_CATEGORY = { 綜合零售賣場: '超商・賣場', 連鎖餐飲店: '餐廳', 機關: '公有公廁', 交通: '捷運・車站', 文化育樂場所: '藝文場館' };
  const toiletCategory = (c) => TOILET_CATEGORY[c] || c;
  const toiletExtras = (t) => [t.accessible > 0 && '♿ 無障礙', t.family > 0 && '👶 親子'].filter(Boolean).join('・');
  const navUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

  // ---------- 公佈欄（螢圃里公布欄、區公所 RSS、自己發的公告） ----------
  const NEWS_SHOW = 5;
  let newsExpanded = false;
  const shortDate = (s) => { const m = String(s).match(/^\d{4}-(\d{2})-(\d{2})/); return m ? `${+m[1]}/${+m[2]}` : ''; };

  function renderNews() {
    const el = $('#home-news');
    const items = state.news;
    if (!items) { el.innerHTML = '<div class="board-title">公佈欄</div><p class="muted">載入中…</p>'; return; }
    if (!items.length) { el.innerHTML = '<div class="board-title">公佈欄</div><p class="muted">目前沒有新公告</p>'; return; }

    const shown = newsExpanded ? items : items.slice(0, NEWS_SHOW);
    const row = (n) => {
      const title = n.link
        ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>`
        : esc(n.title);
      return `<li class="news src-${esc(n.source)}${n.pinned ? ' pinned' : ''}">
        <div class="news-meta"><span class="chip${n.source === 'notice' ? ' solid' : ''}">${n.pinned ? '📌 ' : ''}${esc(n.source_label)}</span><span class="muted">${shortDate(n.date)}</span></div>
        <div class="news-title">${title}</div>
        ${n.summary ? `<div class="news-sum">${esc(n.summary)}</div>` : ''}
      </li>`;
    };
    el.innerHTML = `
      <div class="board-title">公佈欄${items[0]?.stale ? '<span class="muted" style="font-size:calc(12px * var(--fs));font-weight:400">（暫時無法更新，顯示上次內容）</span>' : ''}</div>
      <ul class="news-list">${shown.map(row).join('')}</ul>
      ${items.length > NEWS_SHOW ? `<button class="more" data-news-more>${newsExpanded ? '收合' : `看更多（共 ${items.length} 則）`}</button>` : ''}`;
  }

  $('#home-news').addEventListener('click', (e) => {
    if (!e.target.closest('[data-news-more]')) return;
    newsExpanded = !newsExpanded;
    renderNews();
  });

  async function loadNews() {
    try {
      state.news = (await fetchJson(`${CFG.API_URL}?sheet=news`)).news;
    } catch (err) {
      if (!state.news) state.news = [];
    }
    renderNews();
  }

  // ---------- 通訊錄 ----------
  // ---------- 我需要：需求型店家 ----------
  // 日常型（吃喝、超商）之後放首頁依時段輪替，不列在這裡；其餘分類依「臨時最常需要」排序、改成住戶的說法
  const DAILY_CATEGORIES = ['餐廳小吃', '早餐店', '咖啡店', '超商'];
  const NEED_GROUPS = [
    { icon: '🔧', title: '修繕・水電五金', cats: ['五金水電建材'] },
    { icon: '🛵', title: '機車・汽車', cats: ['汽機車與維修'] },
    { icon: '👕', title: '洗衣・改衣服', cats: ['洗衣修改'] },
    { icon: '💊', title: '藥局・藥妝', cats: ['藥局藥妝'] },
    { icon: '✂️', title: '剪髮・美容', cats: ['美髮美容'] },
    { icon: '🐾', title: '寵物', cats: ['寵物'] },
    { icon: '🛋️', title: '二手家具・家電', cats: ['二手家具家電'] },
    { icon: '🍳', title: '餐飲設備', cats: ['餐飲設備'] },
    { icon: '🏦', title: '銀行・郵局', cats: ['銀行郵局'] },
    { icon: '🏃', title: '運動', cats: ['運動'] },
    { icon: '🍞', title: '食品雜貨・烘焙', cats: ['食品雜貨烘焙'] },
    { icon: '🧋', title: '飲料店', cats: ['飲料店'] },
    { icon: '🛍️', title: '其他店家', cats: ['其他零售'] },
  ];

  // 店家的撥號、地圖按鈕（我需要、首頁推薦共用）
  function storeTel(s) {
    // phone 填「沒查到」之類的文字時不顯示撥號按鈕（要有數字才算電話）
    if (!/\d{6,}/.test(String(s.phone || '').replace(/\D/g, ''))) return '';
    // 有兩支電話（用 ; 分隔）時，撥號按鈕撥第一支
    const firstTel = String(s.phone).split(/[;；、]/)[0];
    return `<a class="tel" href="tel:${esc(firstTel.replace(/[\s-]/g, '').replace('#', ','))}">${esc(firstTel.trim())}</a>`;
  }
  const storeMap = (s) => (s.map_url ? `<a class="nav-btn" href="${esc(s.map_url)}" target="_blank" rel="noopener">地圖 ›</a>` : '');
  const storeActions = (s) => storeTel(s) + storeMap(s);

  // ---------- 首頁：依時段推薦日常型店家 ----------
  // 只在這三個時段出現，只挑「現在有開」的店，隨機 EAT_PICK 家；超商不推薦
  const MEALS = [
    { key: 'breakfast', title: '早餐吃什麼', icon: '🍳', from: '07:00', to: '10:00', cats: ['早餐店', '咖啡店'] },
    { key: 'lunch', title: '午餐吃什麼', icon: '🍜', from: '11:00', to: '13:00', cats: ['餐廳小吃'] },
    { key: 'dinner', title: '晚餐吃什麼', icon: '🍲', from: '18:00', to: '20:00', cats: ['餐廳小吃'] },
  ];
  const EAT_PICK = 4;
  const DAY_CODES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  // opening_hours（格式見 schema.md）→ [{ days: [1..7], spans: [[開, 關], …] }]，時間用分鐘；關門早於開門＝營業到隔天
  function parseHours(text) {
    const rules = [];
    for (const part of String(text || '').split(';').map((p) => p.trim()).filter(Boolean)) {
      const m = part.match(/^([A-Za-z,\-]+)\s+(.+)$/);
      if (!m) return null;
      const days = [];
      for (const seg of m[1].split(',')) {
        const [a, b] = seg.split('-').map((d) => DAY_CODES.indexOf(d) + 1);
        if (!a || (seg.includes('-') && !b)) return null;
        for (let d = a; d <= (b || a); d++) days.push(d);
      }
      const spans = m[2].split(',').map((t) => t.trim().match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/));
      if (spans.some((t) => !t)) return null;
      rules.push({ days, spans: spans.map((t) => [toMin(t[1]), toMin(t[2])]) });
    }
    return rules.length ? rules : null;
  }

  // 現在有開 → 回傳今天打烊時間（分鐘，可能 > 1440 表示隔天），沒開 → null
  function openUntil(rules, day, min) {
    const yesterday = day === 1 ? 7 : day - 1;
    for (const r of rules) {
      for (const [open, close] of r.spans) {
        const overnight = close <= open;
        if (r.days.includes(day) && min >= open && (overnight || min < close)) return overnight ? close + 1440 : close;
        if (overnight && r.days.includes(yesterday) && min < close) return close;
      }
    }
    return null;
  }

  const minText = (m) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
  let eatPicks = { meal: '', ids: [] };

  function renderHomeEat(reshuffle = false) {
    const el = $('#home-eat');
    const now = new Date();
    const nm = nowMin();
    const meal = MEALS.find((m) => nm >= toMin(m.from) && nm < toMin(m.to));
    const open = !meal ? [] : (state.sheets?.stores || [])
      .filter((s) => meal.cats.includes(s.category))
      .map((s) => ({ s, rules: parseHours(s.opening_hours) }))
      .filter(({ rules }) => rules)
      .map(({ s, rules }) => ({ s, until: openUntil(rules, isoDay(now), nm) }))
      .filter(({ until }) => until !== null);
    if (!open.length) { el.hidden = true; eatPicks = { meal: '', ids: [] }; return; }

    // 同一個時段內保留上次挑的店（每 30 秒重算時不會一直換），按「換一批」或換時段才重抽
    const byId = Object.fromEntries(open.map((o) => [o.s.store_id, o]));
    let ids = eatPicks.meal === meal.key ? eatPicks.ids.filter((id) => byId[id]) : [];
    if (reshuffle || ids.length < Math.min(EAT_PICK, open.length)) {
      const pool = open.map((o) => o.s.store_id).sort(() => Math.random() - 0.5);
      const unseen = pool.filter((id) => !ids.includes(id));
      // 換一批：盡量換成這次沒出現的店；補位：保留原本的，再補新的
      ids = (reshuffle ? [...unseen, ...ids] : [...ids, ...unseen]).slice(0, EAT_PICK);
    }
    eatPicks = { meal: meal.key, ids };

    el.innerHTML = `
      <div class="eat-head"><div class="board-title eat-title">${meal.icon} ${meal.title}</div>
        ${open.length > EAT_PICK ? '<button class="eat-more" data-eat-shuffle aria-label="換一批" title="換一批">↻</button>' : ''}</div>
      <div class="eat-list">${ids.map((id) => byId[id]).sort((a, b) => a.until - b.until).map(({ s, until }) => {
        // 早打烊的排上面；第一列：店名＋電話，第二列：營業時間、地址＋地圖
        const closing = until - nm <= 30;
        const extra = [`<span class="${closing ? 'eat-closing' : ''}">${closing ? '快打烊・' : ''}營業到 ${minText(until)}</span>`, s.address ? esc(s.address.replace(/^臺北市中正區(螢圃里)?/, '')) : '']
          .filter(Boolean).join('・');
        return `<div class="eat-row">
          <div class="title">${esc(s.name)}</div><div class="eat-act">${storeTel(s)}</div>
          <div class="desc">${extra}</div><div class="eat-act">${storeMap(s)}</div>
        </div>`;
      }).join('')}</div>
      <p class="eat-note">※ 營業時間以店家實際公告為準</p>`;
    el.hidden = false;
  }

  $('#home-eat').addEventListener('click', (e) => { if (e.target.closest('[data-eat-shuffle]')) renderHomeEat(true); });

  // 下拉選單選的分類（'' = 全部），存在瀏覽器，下次打開沿用
  const NEED_KEY = 'ily.needGroup';
  let needSelected = (() => { try { return localStorage.getItem(NEED_KEY) || ''; } catch (err) { return ''; } })();

  function renderNeeds() {
    const stores = (state.sheets?.stores || []).filter((s) => !DAILY_CATEGORIES.includes(s.category));
    const known = NEED_GROUPS.flatMap((g) => g.cats);
    // 之後試算表新增了沒對應到的分類，自動歸到「其他店家」
    const groups = NEED_GROUPS.map((g) => ({
      ...g,
      items: stores.filter((s) => g.cats.includes(s.category) || (g.title === '其他店家' && !known.includes(s.category))),
    })).filter((g) => g.items.length);
    if (needSelected && !groups.some((g) => g.title === needSelected)) needSelected = '';

    $('#need-select').innerHTML = `<option value="">全部分類（${stores.length}）</option>`
      + groups.map((g) => `<option value="${esc(g.title)}"${g.title === needSelected ? ' selected' : ''}>${g.icon} ${esc(g.title)}（${g.items.length}）</option>`).join('');

    const shown = needSelected ? groups.filter((g) => g.title === needSelected) : groups;
    $('#need-list').innerHTML = shown.map((g) => `
      <div class="group-title">${g.icon} ${esc(g.title)}</div>
      <article class="card">${[...g.items].sort((a, b) => (b.in_village - a.in_village) || String(a.address).localeCompare(String(b.address), 'zh-Hant')).map((s) => {
        // note 裡的「登記名稱：…」是給你核對用的，不顯示給住戶
        const note = String(s.note || '').startsWith('登記名稱') ? '' : s.note;
        const extra = [s.address, s.opening_hours, note].filter(Boolean).map(esc).join('・');
        return `<div class="row">
          <div class="main"><div class="title">${esc(s.name)}</div>${extra ? `<div class="desc">${extra}</div>` : ''}</div>
          <div class="row-actions">${storeActions(s)}</div>
        </div>`;
      }).join('')}</article>`).join('') || '<p class="muted">目前沒有店家資料</p>';
  }

  $('#need-select').addEventListener('change', (e) => {
    needSelected = e.target.value;
    try { localStorage.setItem(NEED_KEY, needSelected); } catch (err) { /* 存不了就只在這次有效 */ }
    renderNeeds();
  });

  function renderContacts() {
    const rows = [...(state.sheets?.contacts || [])].sort((a, b) => a.sort_order - b.sort_order);
    const groups = [...new Set(rows.map((c) => c.category))];
    $('#contact-list').innerHTML = groups.map((g) => `
      <div class="group-title">${esc(g)}</div>
      <article class="card">${rows.filter((c) => c.category === g).map((c) => {
        const telHref = String(c.phone).replace(/-/g, '').replace('#', ',');
        const extra = [c.address, c.service_hours, c.note].filter(Boolean).map(esc).join('・');
        return `<div class="row">
          <div class="main"><div class="title">${esc(c.name)}</div>${extra ? `<div class="desc">${extra}</div>` : ''}</div>
          <a class="tel" href="tel:${esc(telHref)}">${esc(c.phone)}</a>
        </div>`;
      }).join('')}</article>`).join('') || '<p class="muted">目前沒有通訊錄資料</p>';
  }

  // ---------- 地圖 ----------
  let map = null;
  let layers = null; // { garbage, bike, park, work }，每類一個圖層，可個別開關
  const pin = (lat, lng, color, html) => L.circleMarker([lat, lng], {
    radius: 7, color: '#fffaf0', weight: 2, fillColor: color, fillOpacity: 1,
  }).bindPopup(html);

  // 一次只顯示一種類別；預設都不顯示，免得地圖太雜。再按一次目前的類別＝收起來
  const LAYER_NAMES = ['garbage', 'bike', 'park', 'work', 'toilet'];
  let shownLayer = null;

  function syncMapFilter() {
    document.querySelectorAll('#map-filter [data-layer]').forEach((btn) => {
      const name = btn.dataset.layer;
      const on = shownLayer === name;
      btn.setAttribute('aria-pressed', String(on));
      if (layers) {
        btn.querySelector('.n').textContent = layers[name].getLayers().length;
        if (on) layers[name].addTo(map); else layers[name].remove();
      }
    });
    $('#map-hint').hidden = shownLayer !== null;
  }

  $('#map-filter').addEventListener('click', (e) => {
    const name = e.target.closest('[data-layer]')?.dataset.layer;
    if (!name) return;
    shownLayer = shownLayer === name ? null : name;
    syncMapFilter();
  });
  syncMapFilter();

  function initMap() {
    if (map || !window.L) return;
    map = L.map('map', { zoomControl: true });
    // OSM 圖磚依瀏覽器送出的 Referer 判斷來源：直接雙擊 html（file://）沒有 Referer 會被擋，
    // 用本機伺服器（啟動本機網站.bat）或 GitHub Pages 開啟就正常
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    if (location.protocol === 'file:') {
      showNotice('地圖底圖在直接開啟檔案時會被 OpenStreetMap 擋下，請改用 <code>啟動本機網站.bat</code> 開啟（網址會是 http://localhost:8000）。');
    }
    const boundary = L.polygon(BOUNDARY.map(([lng, lat]) => [lat, lng]), {
      color: '#a3412b', weight: 3, fillColor: '#a3412b', fillOpacity: 0.08,
    }).addTo(map);
    map.fitBounds(boundary.getBounds(), { padding: [30, 30] });

    layers = Object.fromEntries(LAYER_NAMES.map((n) => [n, L.layerGroup()]));
    updateGarbageMarkers();
    (state.sheets?.construction || []).forEach((w) => L.marker([w.lat, w.lng], {
      icon: L.divIcon({ className: 'badge-icon', iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -12],
        html: '<div class="map-badge work"><span class="k">🚧</span></div>' }),
    }).bindPopup(`<b>${esc(w.title)}</b><br>${esc(w.start_time)} ～ ${esc(w.end_time)}`).addTo(layers.work));
    (state.sheets?.toilets || []).forEach((t) => L.marker([t.lat, t.lng], {
      icon: L.divIcon({ className: 'badge-icon', iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -12],
        html: '<div class="map-badge toilet"><span class="k">🚻</span></div>' }),
    }).bindPopup(`<b>${esc(t.name)}</b><br>${esc(toiletCategory(t.category))}・${t.seats} 座${toiletExtras(t) ? `・${toiletExtras(t)}` : ''}`
      + `<br><a href="${navUrl(t)}" target="_blank" rel="noopener">開啟導航 ›</a>`).addTo(layers.toilet));
    updateLiveMarkers();
  }

  // 垃圾車停靠點狀態（依時刻表推算，不是 GPS）：
  // here 停靠中、soon 15 分鐘內到、past 今天已離開、later 今天稍晚／今天不收
  const SOON_MIN = 15;
  function garbageStatus(s) {
    if (!daysOf(s.collect_days).includes(isoDay(new Date()))) return 'later';
    const nm = nowMin();
    const arrive = toMin(s.arrive_time);
    if (nm >= arrive && nm <= toMin(s.leave_time)) return 'here';
    if (nm > toMin(s.leave_time)) return 'past';
    return arrive - nm <= SOON_MIN ? 'soon' : 'later';
  }

  const truckIcon = window.L?.divIcon({
    className: 'truck-icon', html: '<div class="truck-pin">🚛</div>', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -16],
  });
  let garbageSignature = '';

  // 只有在某個停靠點狀態改變時才重畫，避免每 30 秒把使用者開著的彈出視窗關掉
  function updateGarbageMarkers() {
    if (!layers) return;
    const stops = state.sheets?.garbage || [];
    const statuses = stops.map(garbageStatus);
    const signature = statuses.join(',');
    if (signature === garbageSignature) return;
    garbageSignature = signature;

    layers.garbage.clearLayers();
    const label = { here: '🚛 預計停靠中（依時刻表）', soon: '即將到達', past: '今天已離開', later: '' };
    stops.forEach((s, i) => {
      const status = statuses[i];
      const html = `<b>${esc(s.stop_name)}</b><br>${esc(s.arrive_time)}～${esc(s.leave_time)}・${esc(s.route_name)}`
        + (label[status] ? `<br><span class="pop-status ${status}">${label[status]}</span>` : '');
      let marker;
      if (status === 'here') {
        marker = L.marker([s.lat, s.lng], { icon: truckIcon, zIndexOffset: 1000 }).bindPopup(html);
      } else {
        const style = {
          soon: { radius: 9, color: '#a3412b', weight: 3, fillColor: '#e8572f', fillOpacity: 1 },
          past: { radius: 6, color: '#fffaf0', weight: 1.5, fillColor: '#a3412b', fillOpacity: 0.3, opacity: 0.5 },
          later: { radius: 7, color: '#fffaf0', weight: 2, fillColor: '#a3412b', fillOpacity: 1 },
        }[status];
        marker = L.circleMarker([s.lat, s.lng], style).bindPopup(html);
      }
      marker.addTo(layers.garbage);
    });
  }

  // 地圖上直接顯示數字的徽章（YouBike 可借數、停車場空位數）；點開仍有完整說明
  // iconSize 設 0、由 CSS 置中，徽章寬度就能隨數字位數自動伸縮
  const badge = (lat, lng, cls, label, num, popup) => L.marker([lat, lng], {
    icon: L.divIcon({
      className: 'badge-icon', iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -12],
      html: `<div class="map-badge ${cls}"><span class="k">${label}</span><span class="num">${num}</span></div>`,
    }),
  }).bindPopup(popup);

  function updateLiveMarkers() {
    if (!layers) return;
    layers.bike.clearLayers();
    layers.park.clearLayers();
    const staleLine = (x) => (x.stale ? `<br><span class="pop-status past">${staleNote(x.updated_at)}</span>` : '');
    (state.youbike || []).forEach((b) => badge(b.lat, b.lng,
      `bike${b.available_rent === 0 ? ' zero' : ''}${b.stale ? ' stale' : ''}`, '🚲', b.available_rent,
      `<b>YouBike ${esc(b.name)}</b><br>可借 ${b.available_rent}・空位 ${b.available_return}${staleLine(b)}`).addTo(layers.bike));
    (state.parking || []).forEach((p) => {
      const none = p.available_car === null;
      badge(p.lat, p.lng, `park${none ? ' nodata' : p.available_car === 0 ? ' zero' : ''}${p.stale ? ' stale' : ''}`, 'P', none ? '—' : p.available_car,
        `<b>${esc(p.name)}</b><br>${none ? '未提供即時資料' : `剩 ${p.available_car} / ${p.total_car} 格`}${staleLine(p)}`).addTo(layers.park);
    });
    syncMapFilter();
  }

  // ---------- 頁籤 ----------
  const TABS = ['home', 'garbage', 'transport', 'map', 'needs', 'contacts'];
  // ---------- 長輩模式（字體放大） ----------
  // html.large 讓 CSS 的 --fs 變 1.25；選擇存在瀏覽器，index.html 的 <head> 會在畫面出來前先套用
  const FONT_KEY = 'ily.fontLarge';
  const fsBtn = $('#fs-toggle');
  function syncFontButton() {
    const large = document.documentElement.classList.contains('large');
    fsBtn.setAttribute('aria-pressed', String(large));
    fsBtn.textContent = large ? '一般' : '大字';
    fsBtn.title = large ? '改回一般字體' : '把字放大';
  }
  fsBtn.addEventListener('click', () => {
    const large = document.documentElement.classList.toggle('large');
    try { localStorage.setItem(FONT_KEY, large ? '1' : '0'); } catch (err) { /* 存不了就只在這次有效 */ }
    syncFontButton();
    map?.invalidateSize(); // 版面高度變了，地圖重新計算大小
  });
  syncFontButton();

  function showTab() {
    const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
    TABS.forEach((t) => { $(`#view-${t}`).hidden = t !== tab; });
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
    if (tab === 'map' && state.sheets) {
      initMap();
      map?.invalidateSize();
    }
    const target = pendingScroll && document.getElementById(pendingScroll);
    pendingScroll = null;
    if (target) target.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
  }

  // 首頁小卡點了跳到對應頁籤（data-tab），有 data-go 的再捲到該區塊
  let pendingScroll = null;
  function goTo(tab, sectionId) {
    pendingScroll = sectionId || null;
    if (location.hash === `#${tab}`) showTab(); else location.hash = tab;
  }
  document.querySelectorAll('[data-tab].link-tile').forEach((tile) => {
    const go = () => goTo(tile.dataset.tab, tile.dataset.go);
    tile.addEventListener('click', go);
    tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  // 標題「我愛螢圃里」＝回首頁；已在首頁時網址不變、不會觸發切換，直接捲回最上面
  $('.home-link').addEventListener('click', () => { if (location.hash === '#home') window.scrollTo(0, 0); });

  // ---------- 停水停電通知 ----------
  // 只看里內（in_village）、還沒結束的；載入完成後跳出視窗，要手動關閉。
  // 勾「今天不再跳出」就記住今天看過哪幾則，今天之內不再跳；有新的一則還是會跳。首頁提示條一直都在，點了可再打開。
  const OUTAGE_SKIP_KEY = 'ily.outageSkip';
  const pad2 = (n) => String(n).padStart(2, '0');
  const localStamp = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  // '2026-10-22 22:00' → { md: '10/22（四）', time: '22:00', day: '2026-10-22' }
  const parseStamp = (s) => {
    const m = String(s ?? '').match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return { md: `${+m[2]}/${+m[3]}（${WEEK[d.getDay()]}）`, time: `${pad2(m[4])}:${m[5]}`, day: `${m[1]}-${pad2(m[2])}-${pad2(m[3])}` };
  };

  function activeOutages() {
    const now = localStamp(new Date());
    return (state.sheets?.outage || [])
      .filter((o) => o.in_village === true && String(o.end_time) >= now)
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  }

  function outageWhen(o) {
    const s = parseStamp(o.start_time);
    const e = parseStamp(o.end_time);
    if (!s || !e) return esc(o.time_desc || `${o.start_time} – ${o.end_time}`);
    // 時段不拆行；跨日時「到 10/23（五）06:00」另起一段
    return e.day === s.day
      ? `${s.md}<span class="nw">${s.time} – ${e.time}</span>`
      : `${s.md}<span class="nw">${s.time}</span> – ${e.md}<span class="nw">${e.time}</span>`;
  }
  const isOngoing = (o) => String(o.start_time) <= localStamp(new Date());

  function renderOutages() {
    const list = activeOutages();
    const bar = $('#outage-bar');
    if (!list.length) { bar.hidden = true; return list; }
    const types = [...new Set(list.map((o) => o.type))].join('、');
    bar.textContent = `⚠️ 里內近期有${types}（${list.length} 則），點我看時間 ›`;
    bar.hidden = false;
    $('#outage-list').innerHTML = list.map((o) => `
      <div class="outage-item">
        <div><span class="outage-type ${o.source === 'water' ? 'water' : ''}">${esc(o.type)}</span>${isOngoing(o) ? '<span class="outage-now">進行中</span>' : ''}</div>
        <div class="outage-when">${outageWhen(o)}</div>
        ${o.title ? `<div class="outage-what">${esc(o.title)}${o.time_desc && o.source === 'water' ? `・${esc(o.time_desc)}` : ''}</div>` : ''}
        ${o.area_desc ? `<div class="outage-area">範圍：${esc(o.area_desc)}</div>` : ''}
        ${o.official_url ? `<a class="outage-link" href="${esc(o.official_url)}" target="_blank" rel="noopener">看官方公告 ›</a>` : ''}
      </div>`).join('');
    return list;
  }

  function openOutageModal() {
    $('#outage-skip').checked = false;
    $('#outage-modal').hidden = false;
    document.body.classList.add('modal-open');
    $('#outage-ok').focus();
  }

  function closeOutageModal() {
    if ($('#outage-skip').checked) {
      const ids = activeOutages().map((o) => o.outage_id);
      try { localStorage.setItem(OUTAGE_SKIP_KEY, JSON.stringify({ day: localStamp(new Date()).slice(0, 10), ids })); } catch (err) { /* 存不了就只在這次有效 */ }
    }
    $('#outage-modal').hidden = true;
    document.body.classList.remove('modal-open');
  }

  // 載入完成時呼叫：有今天還沒選「不再跳出」的停水停電就跳出視窗
  function maybeShowOutages() {
    const list = renderOutages();
    if (!list.length) return;
    let skip = null;
    try { skip = JSON.parse(localStorage.getItem(OUTAGE_SKIP_KEY)); } catch (err) { /* 讀不到就當沒選過 */ }
    const today = localStamp(new Date()).slice(0, 10);
    const skipped = skip && skip.day === today ? skip.ids || [] : [];
    if (list.some((o) => !skipped.includes(o.outage_id))) openOutageModal();
  }

  $('#outage-ok').addEventListener('click', closeOutageModal);
  $('#outage-bar').addEventListener('click', openOutageModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#outage-modal').hidden) closeOutageModal(); });

  // ---------- 啟動 ----------
  function renderSheets() {
    renderHomeGarbage();
    renderHomeEat();
    renderGarbageView();
    renderRecycleView();
    renderWork();
    renderContacts();
    renderNeeds();
  }

  // ---------- 首次載入畫面 ----------
  // 資料 SPLASH_DELAY 內就到：完全不顯示，避免閃一下；
  // 有顯示：至少顯示 SPLASH_MIN（讓印章蓋完、文字出來、花瓣飄一段），再淡出、內容浮上來。只在第一次打開時出現。
  const SPLASH_DELAY = 300;
  const SPLASH_MIN = 2000;
  const splash = $('#splash');
  let splashShownAt = 0;
  const splashTimer = setTimeout(() => { splash.hidden = false; splashShownAt = Date.now(); }, SPLASH_DELAY);

  // 回傳 Promise：載入畫面完全消失後才 resolve（停水停電視窗等它收掉再跳）
  function hideSplash() {
    clearTimeout(splashTimer);
    if (!splashShownAt) { splash.remove(); return Promise.resolve(); }
    const wait = Math.max(0, SPLASH_MIN - (Date.now() - splashShownAt));
    return new Promise((resolve) => setTimeout(() => {
      splash.classList.add('leaving');
      document.querySelector('main').classList.add('enter');
      setTimeout(() => { splash.remove(); resolve(); }, 550);
    }, wait));
  }

  // 頁尾投稿連結：config.js 有填網址的才顯示
  function setupContribute() {
    let any = false;
    [['#form-store', CFG.FORM_STORE_URL], ['#form-feedback', CFG.FORM_FEEDBACK_URL]].forEach(([sel, url]) => {
      if (!url) return;
      $(sel).href = url;
      $(sel).hidden = false;
      any = true;
    });
    $('#contribute').hidden = !any;
  }

  async function start() {
    setupContribute();
    const d = new Date();
    // 年份包在 .yr 裡，最窄的手機（≤340px）會隱藏年份
    $('#today').innerHTML = `<span class="yr">${d.getFullYear()}/</span>${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）`;
    window.addEventListener('hashchange', showTab);
    showTab();

    if (!CFG.API_URL) {
      hideSplash();
      showNotice('尚未設定 API 網址：請打開 <code>config.js</code>，把 Apps Script 部署後的 <code>/exec</code> 網址填進 <code>API_URL</code>。');
      return;
    }

    loadLive();
    renderNews();
    loadNews();
    setInterval(() => { if (!document.hidden) loadNews(); }, 30 * 60 * 1000); // 公告不常變，30 分鐘更新一次
    try {
      state.sheets = await fetchJson(CFG.API_URL);
      renderSheets();
      if (location.hash === '#map') showTab();
    } catch (err) {
      showNotice('資料載入失敗，請稍後重新整理。');
    }
    hideSplash().then(maybeShowOutages); // 成功或失敗都要收掉載入畫面

    // 頁面開著時定期更新即時資料；切到背景就暫停，回來時立刻補抓
    const every = CFG.LIVE_REFRESH_MS || 60000;
    setInterval(() => { if (!document.hidden) loadLive(); }, every);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - state.liveFetchedAt > every) loadLive();
    });
    // 倒數分鐘每 30 秒重算（不重抓資料）
    // 推薦店家也一起重算：時段開始／結束、店家打烊時自動更新
    setInterval(() => { if (!document.hidden) { renderHomeGarbage(); updateGarbageMarkers(); renderHomeEat(); } }, 30000);
    document.querySelectorAll('[data-refresh]').forEach((b) => b.addEventListener('click', loadLive));
  }

  start();
})();
