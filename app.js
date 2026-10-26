'use strict';
(() => {
/* ============ tiện ích ============ */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const pd = s => new Date(s + 'T00:00:00');
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const todayD = () => new Date(new Date().toDateString());
const daysTo = s => Math.round((pd(s) - todayD()) / 864e5);
const fmtD = s => s.slice(8) + '/' + s.slice(5, 7);
const fmtH = h => (Math.round(h * 10) / 10).toString().replace('.', ',') + 'h';
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const HOURS = [0, 0.5, 1.5, 3, 5, 8];            // công sức (1-5) → giờ gợi ý

/* ============ dữ liệu ============ */
let tasks = LS.get('bap.tasks', null) || LS.get('taskmatrix.v1', []);
let plan  = LS.get('bap.plan', []);
let SET   = Object.assign({ cap: 6, days: [1, 2, 3, 4, 5] }, LS.get('bap.set', {}));
/* dữ liệu cũ: mục kế hoạch nhập tay chưa gắn việc → tạo việc ẩn tương ứng để mọi mục đều có chi tiết */
plan.filter(e => !e.taskId).forEach(e => {
  const t = { id: uid(), title: e.title, desc: e.note || '', noA: true, hid: true, urgent: null, important: null, aI: true, aE: true, impact: 3, effort: 2,
    due: '', done: !!e.done, doneAt: e.doneAt || '', hrs: e.hours || 0 };
  tasks.push(t); e.taskId = t.id; e.note = '';
});
const save = () => { LS.set('bap.tasks', tasks); LS.set('bap.plan', plan); };
const saveSet = () => LS.set('bap.set', SET);

/* ============ ma trận 4 ô ============ */
const quadOf = t => t.noA ? -1 : (t.urgent == null || t.important == null) ? 0 : (t.important ? (t.urgent ? 1 : 2) : (t.urgent ? 3 : 4));
const QMETA = {
  1: ['🔥 Làm ngay', 'Gấp + Quan trọng'],
  2: ['📅 Lên lịch', 'Quan trọng, chưa gấp'],
  3: ['🤝 Ủy quyền / làm nhanh', 'Gấp, ít quan trọng'],
  4: ['🗑 Loại bỏ / để sau', 'Không gấp, ít quan trọng'],
  0: ['🤔 Cần nghĩ thêm', 'Chưa rõ gấp hoặc quan trọng — hãy quyết định rồi kéo vào ô']
};

/* ============ 80/20: chỉ xét việc ma trận xác nhận là quan trọng (ô 1, 2) ============ */
function pareto() {
  const act = tasks.filter(t => !t.done && (quadOf(t) === 1 || quadOf(t) === 2));
  const lev = t => t.impact / t.effort;
  const sorted = [...act].sort((a, b) => lev(b) - lev(a) || b.impact - a.impact);
  const total = sorted.reduce((s, t) => s + t.impact, 0);
  let cum = 0, done = false; const vital = new Set();
  sorted.forEach(t => { if (done) return; vital.add(t.id); cum += t.impact; if (total && cum / total >= 0.8) done = true; });
  return { sorted, total, vital };
}

/* ============ tri thức vai trò BA ============
   u/i: true|false = ảnh hưởng gấp/quan trọng · force = đè cả hạn chót xa · luật đứng trước thắng luật đứng sau */
const BA_RULES = [
 {re:/dev (đang )?(chờ|hỏi)|đang bị (chặn|block)|blocker|block(ed)?\b|chặn (dev|test|team)|trả lời (câu hỏi|thắc mắc) (của )?(dev|qa|tester)/i,
  u:true,i:true,force:1,why:'đang chặn dev/QA — mỗi giờ chờ là lãng phí cả team',tip:'Trả lời/chốt trong ngày, ghi lại quyết định vào tài liệu để không bị hỏi lại.'},
 {re:/sự cố|lỗi (production|prod|nghiêm trọng)|hotfix|khách (phàn nàn|khiếu nại)/i,
  u:true,i:true,force:1,why:'sự cố ảnh hưởng khách hàng/vận hành',tip:'Xác nhận phạm vi ảnh hưởng trước, rồi phối hợp dev xử lý.'},
 {re:/go-?live|release|nghiệm thu|\buat\b|demo (cho )?(khách|kh)|ký duyệt|sign-?off|phê duyệt/i,
  u:true,i:true,why:'mốc bàn giao/nghiệm thu — liên quan trực tiếp tới cam kết với khách',tip:'Rà checklist tiêu chí chấp nhận (acceptance criteria) và chuẩn bị kịch bản trước 1 ngày.'},
 {re:/change request|\bcr\b|thay đổi (yêu cầu|phạm vi)|scope|phạm vi/i,
  i:true,why:'thay đổi phạm vi — tác động chi phí và tiến độ',tip:'Đánh giá ảnh hưởng (effort, tiến độ, liên đới) trước khi đồng ý với khách.'},
 {re:/\bfrd\b|\burd\b|\bbrd\b|\bsrs\b|\bstor(y|ies)\b|use?r? ?stor(y|ies)|\bus\s?-?\d*\b|\bepic\b|\bac\b|đặc tả|sơ đồ luồng|use ?case|acceptance|tiêu chí chấp nhận|phân tích yêu cầu|bóc tách yêu cầu|wireframe|mockup|prototype/i,
  i:true,why:'sản phẩm cốt lõi của BA (tài liệu yêu cầu/đặc tả)',tip:'Chia nhỏ và xin xác nhận (OK) từng phần, không viết cả tài liệu một lượt rồi mới hỏi.'},
 {re:/phỏng vấn|workshop|khảo sát|làm rõ yêu cầu|chốt yêu cầu|thu thập yêu cầu|stakeholder|họp (với )?(khách|kh|sếp)/i,
  i:true,why:'làm việc với stakeholder — nguồn của mọi yêu cầu đúng',tip:'Chuẩn bị sẵn danh sách câu hỏi mở và gửi agenda trước buổi họp.'},
 {re:/review (tài liệu|frd|urd|spec|story)|rà soát (tài liệu|yêu cầu)|test ?case|kịch bản (test|kiểm thử)|hỗ trợ (test|qa)/i,
  i:true,why:'chất lượng đầu ra — lỗi yêu cầu sửa muộn tốn gấp nhiều lần',tip:'Làm trước khi dev code xong; lỗi yêu cầu phát hiện muộn đắt gấp nhiều lần.'},
 {re:/backlog|grooming|refine|ưu tiên hóa|lập kế hoạch sprint|sprint planning|roadmap/i,
  i:true,u:false,why:'chuẩn bị backlog/kế hoạch — việc quan trọng nhưng thường bị trì hoãn',tip:'Đặt khung giờ cố định mỗi tuần (time-block), tránh bị việc gấp lấn mất.'},
 {re:/template|mẫu tài liệu|quy trình|cải tiến|nghiên cứu|tìm hiểu|học |đào tạo|training|chứng chỉ|cbap|domain|nghiệp vụ mới|tự động hóa/i,
  i:true,u:false,why:'đầu tư năng lực/quy trình — quan trọng, ít khi gấp',tip:'Lên lịch 1–2 khung giờ/tuần, đừng chờ rảnh mới làm.'},
 {re:/daily|stand-?up|họp (định kỳ|team|nội bộ|tuần)|weekly|sync/i,
  u:true,i:false,why:'họp định kỳ — có giờ cố định nhưng ít khi tự tạo giá trị',tip:'Nếu không cần quyết định gì thì ủy quyền/xin biên bản; nếu đi thì chuẩn bị 3 ý để nói.'},
 {re:/log ?time|timesheet|chấm công|cập nhật (redmine|jira|issue|trạng thái|tiến độ)|báo cáo (daily|ngày|tuần)|daily report|điền (form|biểu mẫu)/i,
  u:true,i:false,why:'việc hành chính/báo cáo định kỳ — cần làm nhưng giá trị thấp',tip:'Gộp vào một khung giờ cuối ngày (batch), không làm rải rác trong giờ tập trung.'},
 {re:/định dạng|format|đặt tên file|sắp xếp (thư mục|file)|dọn (file|thư mục|bàn)|đánh số|căn lề|sửa (lỗi chính tả|font)/i,
  i:false,why:'việc lặt vặt/trình bày — không làm thay đổi kết quả',tip:'Có thể nhờ người khác hoặc làm gộp lúc rảnh; cân nhắc bỏ nếu không ai cần.'},
 {re:/email (lặt vặt|thông báo)|đọc (tin|news)|lướt|họp (không|chưa) có agenda|cc\b/i,
  i:false,why:'ít giá trị với mục tiêu dự án',tip:'Cân nhắc bỏ hoặc đọc lướt theo lô.'}
];
const KW_URG = /gấp|khẩn|ngay|hôm nay|asap|urgent|deadline/i;

function suggest(t) {
  const why = []; let urgent, important, tip = '';
  const days = t.due ? daysTo(t.due) : null;
  const hits = BA_RULES.filter(r => r.re.test(t.title));
  const rU = hits.find(r => r.u !== undefined), rI = hits.find(r => r.i !== undefined), forced = hits.find(r => r.force);
  /* Gấp: hạn gần > chặn/sự cố > hạn xa > luật BA > mặc định */
  if (days !== null && days <= 2) { urgent = true; why.push(days < 0 ? 'đã quá hạn' : `hạn còn ${days} ngày`); }
  else if (forced) urgent = true;
  else if (days !== null && days > 7) { urgent = false; why.push(`hạn còn ${days} ngày (chưa vội)`); }
  else if (rU) urgent = rU.u;
  else if (KW_URG.test(t.title)) { urgent = true; why.push('tên việc có từ khóa khẩn'); }
  else if (days !== null) { urgent = false; why.push(`hạn còn ${days} ngày`); }
  else { urgent = false; why.push('không có hạn chót'); }
  /* Quan trọng: tác động cao > luật BA > tác động thấp > hiệu quả */
  if (t.impact >= 4) { important = true; why.push(`tác động ${t.impact}/5`); }
  else if (rI) important = rI.i;
  else if (t.impact <= 2) { important = false; why.push(`tác động thấp ${t.impact}/5`); }
  else if (t.impact / t.effort >= 1) { important = true; why.push('hiệu quả ≥ 1 (tác động ≥ công sức)'); }
  else { important = false; why.push('tác động vừa nhưng tốn công sức'); }
  [forced, rU, rI, ...hits].filter(Boolean).forEach(r => { if (!why.includes(r.why)) why.push(r.why); if (!tip) tip = r.tip; });
  return { urgent, important, why: why.join('; '), tip };
}
/* đoán tác động & công sức từ tên việc khi người dùng không nhập */
function estI(t) {
  const hits = BA_RULES.filter(r => r.re.test(t.title));
  let v = 3;
  if (hits.some(r => r.force)) v = 5;
  else if (hits.some(r => r.i === true)) v = 4;
  else if (hits.some(r => r.i === false)) v = 1;
  if (/khách|hợp đồng|doanh thu|kpi|nghiệm thu|go-?live/i.test(t.title)) v = Math.min(5, v + 1);
  return v;
}
function estE(t) {
  const s = t.title;
  if (/log ?time|daily|email|trả lời|cập nhật|format|định dạng|đặt tên|dọn|gửi|nhắn|nhắc|điền/i.test(s)) return 1;
  if (/\bstor(y|ies)\b|use?r? ?stor(y|ies)|\bus\s?-?\d*\b|\bepic\b/i.test(s)) return 3;
  if (/\bfrd\b|\burd\b|\bbrd\b|\bsrs\b|đặc tả|phân tích|workshop|khảo sát|nghiên cứu|học |viết|thiết kế|roadmap|sơ đồ|wireframe|prototype|test ?case/i.test(s)) return 4;
  if (/review|rà soát|họp|phỏng vấn|backlog|demo|chuẩn bị|làm rõ/i.test(s)) return 3;
  return 2;
}
function placeAuto(t) { const s = suggest(t); t.urgent = s.urgent; t.important = s.important; t.note = s.why; t.tip = s.tip; }

function addTask(title, o, autoplace) {
  if (!title) return;
  const t = { id: uid(), title, desc: o.desc || '', noA: !!o.noA, urgent: o.urgent ?? null, important: o.important ?? null, due: o.due || '', done: false,
    aI: o.impact == null || o.impact === 'auto', aE: o.effort == null || o.effort === 'auto' };
  t.impact = t.aI ? 3 : +o.impact; t.effort = t.aE ? 2 : +o.effort;
  if (t.aI) t.impact = estI(t); if (t.aE) t.effort = estE(t);
  if (autoplace && !t.noA && (t.urgent == null || t.important == null)) {
    const s = suggest(t);
    if (t.urgent == null) t.urgent = s.urgent; if (t.important == null) t.important = s.important;
    t.note = s.why; t.tip = s.tip;
  }
  tasks.push(t);
  return t;
}
const hOf = x => x.hrs || HOURS[x.effort] || 1;
const qcls = q => q == null ? '' : q < 0 ? 'cn' : 'c' + q;
const DOWN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
function recText(r) {
  if (!r || !r.freq) return '';
  const n = r.n || 1;
  if (r.freq === 'daily') return n > 1 ? `Mỗi ${n} ngày` : 'Hằng ngày';
  if (r.freq === 'weekly') { const d = (r.dows || []).slice().sort((a, b) => (a || 7) - (b || 7)).map(x => DOWN[x]).join(', '); return (n > 1 ? `Mỗi ${n} tuần` : 'Hằng tuần') + (d ? ' (' + d + ')' : ''); }
  if (r.freq === 'monthly') return (n > 1 ? `Mỗi ${n} tháng` : 'Hằng tháng') + (r.dom ? ` ngày ${r.dom}` : '');
  return n > 1 ? `Mỗi ${n} năm` : 'Hằng năm';
}

/* ============ việc lặp định kỳ: sinh các mục kế hoạch theo lịch lặp ============ */
const monOf = k => { const d = pd(k); return ymd(addD(d, -((d.getDay() + 6) % 7))); };
function recDates(r, f, t) {
  const out = [], start = r.start || T0, from = f > start ? f : start, to = r.until && r.until < t ? r.until : t;
  if (from > to) return out;
  const st = pd(start), n = Math.max(1, r.n || 1), skip = r.skip || [];
  for (let d = pd(from), i = 0; ymd(d) <= to && i < 4000; d = addD(d, 1), i++) {
    const k = ymd(d); let ok = false;
    if (r.freq === 'daily') ok = Math.round((d - st) / 864e5) % n === 0;
    else if (r.freq === 'weekly') {
      const wk = Math.floor(Math.round((pd(monOf(k)) - pd(monOf(start))) / 864e5) / 7);
      ok = wk % n === 0 && (r.dows && r.dows.length ? r.dows : [st.getDay()]).includes(d.getDay());
    } else if (r.freq === 'monthly') {
      const months = (d.getFullYear() - st.getFullYear()) * 12 + d.getMonth() - st.getMonth(), last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      ok = months % n === 0 && d.getDate() === Math.min(r.dom || st.getDate(), last);
    } else if (r.freq === 'yearly') ok = (d.getFullYear() - st.getFullYear()) % n === 0 && d.getMonth() === st.getMonth() && d.getDate() === st.getDate();
    if (ok && !skip.includes(k)) out.push(k);
  }
  return out;
}
function materialize(f, t) {
  const have = new Set(plan.filter(e => e.ro).map(e => e.taskId + '|' + e.ro)); let changed = false;
  tasks.forEach(x => {
    if (!x.rec || !x.rec.freq || x.done) return;
    recDates(x.rec, f, t).forEach(k => {
      if (have.has(x.id + '|' + k)) return;
      plan.push({ id: uid(), taskId: x.id, title: x.title, date: k, ro: k, hours: x.rec.hours || timeHours(x.ts, x.te) || hOf(x), ts: x.ts || '', te: x.te || '', note: '', status: 'todo', done: false, doneAt: '' }); changed = true;
    });
  });
  if (changed) LS.set('bap.plan', plan);
}
/* xóa các lần lặp tương lai chưa làm (khi sửa/bỏ lịch lặp) */
const dropFuture = id => { plan = plan.filter(e => !(e.taskId === id && e.ro && !e.done && e.date >= T0)); };

/* ============ vẽ: trang Ma trận ============ */
function dueInfo(t) {
  if (!t.due) return '';
  const d = daysTo(t.due), lbl = t.due.split('-').reverse().join('/');
  if (d < 0) return `<span class="late">⏰ quá hạn ${-d} ngày (${lbl})</span>`;
  if (d === 0) return '<span class="late">⏰ hôm nay</span>';
  return `<span>⏰ ${lbl} (còn ${d} ngày)</span>`;
}
const flag = (v, y, n) => v == null ? '?' : (v ? y : n);
function sugHTML(t) {
  if (t.done) return '';
  const s = suggest(t), q = quadOf({ urgent: s.urgent, important: s.important });
  if (q === quadOf(t)) return '';
  return `<div class="sug">💡 Gợi ý: <b>${QMETA[q][0]}</b> — ${esc(s.why)} <button data-apply="${t.id}">Áp dụng</button>${s.tip ? `<div class="tip">👉 ${esc(s.tip)}</div>` : ''}</div>`;
}
function cardHTML(t, vital) {
  const sel = f => {
    const a = f === 'impact' ? t.aI : t.aE;
    return `<select data-id="${t.id}" data-f="${f}" title="${a ? 'Máy tự đoán — chọn số để tự đặt' : 'Bạn đã đặt'}"><option value="auto" ${a ? 'selected' : ''}>🤖 ${t[f]}</option>${[1,2,3,4,5].map(i => `<option ${!a && i === t[f] ? 'selected' : ''}>${i}</option>`).join('')}</select>`;
  };
  const auto = t.note && !t.done && t.urgent != null ? `<div class="sug">🤖 ${esc(t.note)}${t.tip ? `<div class="tip">👉 ${esc(t.tip)}</div>` : ''}</div>` : '';
  return `<div class="card c${quadOf(t)} ${t.done ? 'done' : ''}" draggable="true" data-id="${t.id}">
    <div class="row"><input type="checkbox" data-done="${t.id}" ${t.done ? 'checked' : ''}>
      <div class="t">${vital.has(t.id) && !t.done ? '<span class="star" title="Nhóm 20% tạo 80% giá trị">⭐</span> ' : ''}${esc(t.title)}</div>
      <button class="edit" data-tedit="${t.id}" title="Chi tiết: mô tả, hạn chót, lặp lại">✎</button><button class="x" data-del="${t.id}" title="Xóa">×</button></div>
    ${t.desc ? `<div class="desc">${esc(t.desc)}</div>` : ''}
    <div class="meta">
      <span class="chip ${t.urgent ? 'y' : 'n'}" data-tog="${t.id}" data-f="urgent">${flag(t.urgent, 'Gấp', 'Không gấp')}</span>
      <span class="chip imp ${t.important ? 'y' : 'n'}" data-tog="${t.id}" data-f="important">${flag(t.important, 'Quan trọng', 'Ít quan trọng')}</span>
      <span class="score">Tác động ${sel('impact')}</span><span class="score">Công sức ${sel('effort')}</span>
      ${stChip(t, 'data-tstcycle')}${t.rec ? `<span class="rectag" title="Việc lặp định kỳ">🔁 ${recText(t.rec)}</span>` : ''}${dueInfo(t)}</div>${auto || sugHTML(t)}</div>`;
}
function renderMatrix() {
  const { vital } = pareto();
  $$('.quad').forEach(el => {
    const q = +el.dataset.q;
    const items = tasks.filter(t => quadOf(t) === q).sort((a, b) => a.done - b.done || (b.impact / b.effort) - (a.impact / a.effort));
    const open = items.filter(t => !t.done).length;
    el.innerHTML = `<div class="qh"><div class="ti"><b>${QMETA[q][0]}</b><small>${QMETA[q][1]}</small></div>${q === 0 && open ? '<button class="applyall" data-applyall>💡 Áp dụng gợi ý cho tất cả</button>' : ''}<span class="badge">${open}</span></div>
      <div class="list">${items.map(t => cardHTML(t, vital)).join('') || '<div class="empty">Trống — kéo việc vào đây</div>'}</div>`;
  });
}

/* ============ vẽ: trang 80/20 ============ */
function chart(sorted, total, vital) {
  const N = sorted.length; if (!N) return '<div class="empty">Chưa có việc quan trọng để vẽ biểu đồ.</div>';
  const W = Math.max(360, N * 56 + 60), H = 210, pl = 34, pb = 44, pt = 14, iw = W - pl - 10, ih = H - pb - pt, bw = Math.min(40, iw / N * .6);
  let cum = 0, pts = [], bars = '';
  sorted.forEach((t, i) => {
    const x = pl + iw / N * (i + .5); cum += t.impact;
    pts.push([x, pt + ih * (1 - cum / total)]);
    const h = ih * t.impact / 5;
    bars += `<rect x="${x - bw / 2}" y="${pt + ih - h}" width="${bw}" height="${h}" rx="4" class="${vital.has(t.id) ? 'bv' : 'bn'}"/><text x="${x}" y="${H - pb + 14}" text-anchor="middle" class="ax">${i + 1}</text>`;
  });
  const y80 = pt + ih * .2;
  return `<svg viewBox="0 0 ${W} ${H}" class="pchart" role="img" aria-label="Biểu đồ Pareto"><line x1="${pl}" x2="${W - 10}" y1="${y80}" y2="${y80}" class="l80"/><text x="${W - 12}" y="${y80 - 4}" text-anchor="end" class="ax">80%</text>${bars}<polyline points="${pts.map(p => p.join(',')).join(' ')}" class="cl"/>${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" class="cd"/>`).join('')}<line x1="${pl}" x2="${pl}" y1="${pt}" y2="${pt + ih}" class="axl"/><text x="${pl - 6}" y="${pt + 8}" text-anchor="end" class="ax">100%</text><text x="${pl - 6}" y="${pt + ih}" text-anchor="end" class="ax">0</text></svg><div class="sub">Cột = tác động (xanh lá = nhóm ⭐), đường = % cộng dồn. Số dưới cột trùng số thứ tự trong bảng bên dưới.</div>`;
}
function renderPareto() {
  const { sorted, total, vital } = pareto();
  const n = sorted.length, k = vital.size;
  const vI = sorted.filter(t => vital.has(t.id)).reduce((s, t) => s + t.impact, 0);
  const rest = tasks.filter(t => !t.done && quadOf(t) >= 0 && quadOf(t) !== 1 && quadOf(t) !== 2);
  $('#kpis').innerHTML = n
    ? `<div class="kpi"><b>${k}/${n}</b><span>việc trọng tâm trên tổng số việc quan trọng (${Math.round(k / n * 100)}%)</span></div>
       <div class="kpi"><b>${Math.round(vI / total * 100)}%</b><span>tổng tác động mà nhóm ⭐ mang lại</span></div>
       <div class="kpi"><b>${rest.length}</b><span>việc không tính vào 80/20 (ô khác)</span></div>`
    : '<div class="kpi"><b>0</b><span>Chưa có việc quan trọng (ô 🔥 và 📅) để phân tích 80/20.</span></div>';
  $('#chart').innerHTML = chart(sorted, total, vital);
  let cum = 0;
  const why = { 3: 'Ủy quyền hoặc làm gộp một lượt', 4: 'Cân nhắc bỏ hoặc để sau', 0: 'Cần quyết định gấp/quan trọng trước' };
  $('#plist').innerHTML = sorted.map((t, i) => {
    cum += t.impact; const isV = vital.has(t.id);
    const last = isV && !(sorted[i + 1] && vital.has(sorted[i + 1].id));
    return `<div class="pr ${isV ? 'vital' : ''} ${last ? 'cut' : ''}"><span>${isV ? '⭐' : i + 1}</span>
      <div><div>${esc(t.title)}</div><div class="sub">${QMETA[quadOf(t)][0]} · hiệu quả ${(t.impact / t.effort).toFixed(1)}</div></div>
      <div class="bar" title="Cộng dồn ${Math.round(cum / total * 100)}%"><i style="width:${t.impact / 5 * 100}%"></i><i class="cum" style="width:${cum / total * 100}%"></i></div>
      <span class="sub">T${t.impact} / C${t.effort}</span></div>`;
  }).join('') + (rest.length ? '<h4>Không tính vào 80/20 (ma trận chưa xác nhận là quan trọng)</h4>' + rest.map(t => {
    const q = quadOf(t);
    return `<div class="pr"><span>–</span><div><div>${esc(t.title)}</div><div class="sub">${QMETA[q][0]}</div></div><div class="sub">👉 ${why[q]}</div><span class="sub">T${t.impact} / C${t.effort}</span></div>`;
  }).join('') : '');
}

/* ============ khoảng thời gian dùng chung (Kế hoạch & Báo cáo) ============ */
const MODES = [['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng'], ['year', 'Năm'], ['range', 'Khoảng']];
const T0 = ymd(new Date());
const ST = LS.get('bap.view', null) || {};
['plan', 'report'].forEach((k, i) => { ST[k] = Object.assign({ mode: i ? 'month' : 'week', from: '', to: '' }, ST[k] || {}, { anchor: T0 }); });
const saveView = () => LS.set('bap.view', ST);
function rangeOf(s) {
  const a = pd(s.anchor);
  if (s.mode === 'day') return [s.anchor, s.anchor];
  if (s.mode === 'week') { const m = addD(a, -((a.getDay() + 6) % 7)); return [ymd(m), ymd(addD(m, 6))]; }
  if (s.mode === 'month') return [ymd(new Date(a.getFullYear(), a.getMonth(), 1)), ymd(new Date(a.getFullYear(), a.getMonth() + 1, 0))];
  if (s.mode === 'year') return [a.getFullYear() + '-01-01', a.getFullYear() + '-12-31'];
  let f = s.from || s.anchor, t = s.to || f; if (t < f) { const x = f; f = t; t = x; } return [f, t];
}
const longD = s => DOW[pd(s).getDay()] + ', ' + fmtD(s) + '/' + s.slice(0, 4);
function labelOf(s) {
  const [f, t] = rangeOf(s);
  if (s.mode === 'day') return longD(f);
  if (s.mode === 'week') return fmtD(f) + ' – ' + fmtD(t) + '/' + t.slice(0, 4);
  if (s.mode === 'month') return 'Tháng ' + f.slice(5, 7) + '/' + f.slice(0, 4);
  if (s.mode === 'year') return 'Năm ' + f.slice(0, 4);
  return fmtD(f) + '/' + f.slice(0, 4) + ' – ' + fmtD(t) + '/' + t.slice(0, 4);
}
function shiftP(s, dir) {
  const a = pd(s.anchor);
  if (s.mode === 'range') {
    const [f, t] = rangeOf(s), len = Math.round((pd(t) - pd(f)) / 864e5) + 1;
    s.from = ymd(addD(pd(f), dir * len)); s.to = ymd(addD(pd(t), dir * len)); s.anchor = s.from; return;
  }
  if (s.mode === 'day') s.anchor = ymd(addD(a, dir));
  else if (s.mode === 'week') s.anchor = ymd(addD(a, 7 * dir));
  else if (s.mode === 'month') s.anchor = ymd(new Date(a.getFullYear(), a.getMonth() + dir, 1));
  else s.anchor = ymd(new Date(a.getFullYear() + dir, 0, 1));
}
function pbarHTML(k) {
  const s = ST[k], [f, t] = rangeOf(s);
  return `<div class="seg">${MODES.map(([m, l]) => `<button class="${s.mode === m ? 'on' : ''}" data-pm="${k}:${m}">${l}</button>`).join('')}</div>
    <div class="nav"><button data-pn="${k}:-1" title="Trước">◀</button><b>${labelOf(s)}</b><button data-pn="${k}:1" title="Sau">▶</button><button data-pt="${k}">Hôm nay</button></div>
    ${s.mode === 'range'
      ? `<div class="rng">Từ <input type="date" data-pr="${k}:from" value="${f}"> đến <input type="date" data-pr="${k}:to" value="${t}"></div>`
      : `<div class="rng">Đi tới <input type="date" data-pa="${k}" value="${s.anchor}"></div>`}`;
}
const datesIn = (f, t, max = 400) => { const out = []; for (let d = pd(f), i = 0; ymd(d) <= t && i < max; d = addD(d, 1), i++) out.push(ymd(d)); return out; };
/* ============ vẽ: trang Kế hoạch (người dùng tự nhập) ============ */
let showAll = false;
/* kho việc: open = đang mở · pinned = ghim cố định bên trái (tắt ghim → hiện nổi, tự đóng sau khi dùng) */
const BK = Object.assign({ open: true, pinned: true }, LS.get('bap.bk', {}));
const saveBK = () => LS.set('bap.bk', BK);
function applyBK(n) {
  $('#planLayout').className = 'plan-layout' + (BK.open ? (BK.pinned ? '' : ' float') : ' nobk');
  $('#bkToggle').textContent = BK.open ? '◂ Ẩn kho việc' : `📥 Kho việc${n != null ? ' (' + n + ')' : ''}`;
  $('#bkToggle').classList.toggle('open', BK.open);
  $('#bkPin').classList.toggle('on', BK.pinned);
  $('#bkPin').title = BK.pinned ? 'Đang ghim cố định — bấm để chuyển sang hiện nổi (tiết kiệm diện tích)' : 'Chưa ghim (hiện nổi) — bấm để ghim cố định bên trái';
}
const isWork = d => SET.days.includes(d.getDay());
const nextWork = d => { let x = new Date(d); for (let i = 0; i < 14 && !isWork(x); i++) x = addD(x, 1); return x; };
const taskOf = id => tasks.find(t => t.id === id);
/* ----- trạng thái công việc ----- */
const STATUS = { todo: ['Chưa bắt đầu', '○'], doing: ['Đang làm', '◐'], wait: ['Chờ / vướng', '⏸'], done: ['Hoàn thành', '✔'] };
const STORDER = ['todo', 'doing', 'wait', 'done'];
const stOf = o => o.status || (o.done ? 'done' : 'todo');
const setStatus = (o, s) => { o.status = s; o.done = s === 'done'; o.doneAt = o.done ? (o.doneAt || ymd(new Date())) : ''; };
const setDone = (o, v) => setStatus(o, v ? 'done' : (stOf(o) === 'done' ? 'todo' : stOf(o)));
const stChip = (o, attr) => `<span class="st st-${stOf(o)}" ${attr}="${o.id}" title="Bấm để đổi trạng thái">${STATUS[stOf(o)][1]} ${STATUS[stOf(o)][0]}</span>`;
/* đổi trạng thái của một việc → các mục kế hoạch của việc (không lặp) đi theo */
function setTaskStatus(x, s) { setStatus(x, s); if (!x.rec) plan.filter(p => p.taskId === x.id).forEach(p => setStatus(p, s)); }
function syncTask(taskId) {
  const x = taskOf(taskId); if (!x || x.rec) return;
  const es = plan.filter(e => e.taskId === taskId); if (!es.length) return;
  setStatus(x, es.every(e => e.done) ? 'done' : es.some(e => stOf(e) === 'doing') ? 'doing' : es.some(e => stOf(e) === 'wait') ? 'wait' : (stOf(x) === 'done' ? 'todo' : stOf(x)));
}

/* ----- việc làm nhiều ngày: một mục kế hoạch có thể kéo dài từ ngày bắt đầu đến ngày kết thúc ----- */
/* giờ làm trong ngày (không bắt buộc): ts = từ giờ, te = đến giờ, dạng "HH:MM" */
const toMin = t => { const [h, m] = t.split(':'); return +h * 60 + +m; };
const timeHours = (a, b) => a && b && b > a ? (toMin(b) - toMin(a)) / 60 : 0;
const timeTxt = o => o.ts ? o.ts + (o.te ? '–' + o.te : '') : '';
const hrsOf = list => (list || []).reduce((s, i) => s + (i.h != null ? i.h : (i.hours || 0)), 0);
function entDates(e) {
  const end = e.end && e.end > e.date ? e.end : e.date;
  if (end === e.date) return [e.date];
  return datesIn(e.date, end, 120).filter((k, i) => i === 0 || isWork(pd(k)));      // chỉ tính các ngày làm việc
}
const partsOf = e => { const ds = entDates(e), h = (e.hours || 0) / ds.length; return ds.map((k, i) => ({ e, k, i: i + 1, n: ds.length, h })); };
function shiftEntry(e, nd) { const delta = Math.round((pd(nd) - pd(e.date)) / 864e5); if (e.end) e.end = ymd(addD(pd(e.end), delta)); e.date = nd; }
/* thứ tự trong một ngày: việc quan trọng + ⭐ 80/20 + hạn gần lên đầu; đang làm trước, chờ lùi xuống, đã xong xuống cuối */
function entRank(it, P) {
  const e = it.e, x = e.taskId && taskOf(e.taskId), q = x ? quadOf(x) : -1;
  let s = { 1: 0, 2: 100, '-1': 150, 3: 200, 4: 300, 0: 350 }[q] ?? 150;
  if (x) {
    if (P.vital.has(x.id)) s -= 40;
    s -= Math.min(10, x.impact / x.effort) * 3;
    if (x.due) { const d = daysTo(x.due); s -= d <= 0 ? 50 : d <= 2 ? 35 : d <= 7 ? 15 : 0; }
  }
  if (e.ts) s = -500 + toMin(e.ts) / 10;               // việc có giờ cố định: xếp theo giờ, nằm trên cùng
  const st = stOf(e);
  if (st === 'done') s += 1000; else if (st === 'wait') s += 60; else if (st === 'doing') s -= 10;
  return s;
}
function buildBy(P) {
  const by = {};
  plan.forEach(e => partsOf(e).forEach(p => (by[p.k] = by[p.k] || []).push(p)));
  Object.values(by).forEach(l => {
    l.sort((a, b) => entRank(a, P) - entRank(b, P));
    /* báo trùng giờ giữa các việc có giờ bắt đầu - kết thúc trong cùng ngày */
    const tm = l.filter(i => i.e.ts && i.e.te && !i.e.done).sort((a, b) => toMin(a.e.ts) - toMin(b.e.ts));
    for (let i = 1; i < tm.length; i++) if (toMin(tm[i].e.ts) < toMin(tm[i - 1].e.te)) tm[i].clash = tm[i - 1].clash = true;
  });
  return by;
}
const BG = [[1, '🔥 Làm ngay'], [2, '📅 Lên lịch'], [3, '🤝 Ủy quyền / làm gộp'], [4, '🗑 Để sau / bỏ'], [0, '🤔 Cần nghĩ thêm']];

function renderPlan() {
  const s = ST.plan, [f, t] = rangeOf(s), P = pareto();
  materialize(f, t);
  $('#pbarPlan').innerHTML = pbarHTML('plan');
  if (document.activeElement !== $('#setCap')) $('#setCap').value = SET.cap;
  $$('[data-day]').forEach(c => c.checked = SET.days.includes(+c.dataset.day));
  $('#bkAll').checked = showAll;

  /* kho việc, nhóm theo ô ma trận */
  const planned = {}; plan.forEach(e => { if (e.taskId && !e.done) (planned[e.taskId] = planned[e.taskId] || []).push(e.date); });
  const rank = x => (x.impact / x.effort) * -5 - (P.vital.has(x.id) ? 30 : 0) - (x.due ? Math.max(0, 25 - daysTo(x.due) * 3) : 0);
  const back = tasks.filter(x => !x.done && !x.hid).sort((a, b) => rank(a) - rank(b));
  const bk = x => { const pl = planned[x.id];
    return `<div class="bk ${qcls(quadOf(x))} ${pl && !x.rec ? 'planned' : ''}" draggable="true" data-bk="${x.id}" data-addbk="${x.id}" title="Bấm để xem chi tiết & xếp lịch · hoặc kéo sang ngày">
      <div class="bt">${P.vital.has(x.id) ? '⭐ ' : ''}${x.rec ? '🔁 ' : ''}${esc(x.title)}<small>${[x.rec ? recText(x.rec) : '', x.ts ? '🕘 ' + timeTxt(x) : '', '~' + fmtH(hOf(x)), x.due ? 'hạn ' + fmtD(x.due) : '', stOf(x) !== 'todo' ? STATUS[stOf(x)][1] + ' ' + STATUS[stOf(x)][0] : '', pl && !x.rec ? '✓ đã xếp ' + pl.map(fmtD).join(', ') : ''].filter(Boolean).join(' · ')}</small>${x.desc ? `<small class="bdesc">${esc(x.desc)}</small>` : ''}</div>
      </div>`; };
  const BGX = [[-1, '✍ Việc thêm tay'], ...BG];
  $('#backlog').innerHTML = BGX.filter(([q]) => q === -1 || showAll || q >= 1 && q <= 3).map(([q, name]) => {
    const l = back.filter(x => quadOf(x) === q); if (!l.length) return '';
    return `<div class="bgh ${qcls(q)}">${name}<span>${l.length}</span></div>` + l.map(bk).join('');
  }).join('') || '<div class="empty">Chưa có việc. Hãy thêm việc ở trang Phân tích.</div>';

  applyBK(back.filter(x => !x.done && (x.noA || quadOf(x) >= 1 && quadOf(x) <= 3) && !planned[x.id]).length);

  /* dữ liệu theo ngày (đã sắp theo mức ưu tiên) */
  const by = buildBy(P);
  const en = it => {
    const e = it.e, x = e.taskId && taskOf(e.taskId), q = x ? quadOf(x) : null, end = e.end && e.end > e.date ? e.end : e.date;
    const lt = x && !x.rec && x.due && end > x.due;
    const meta = [e.ts ? '🕘 ' + timeTxt(e) : '', it.clash ? '⚠ trùng giờ' : '', it.h ? fmtH(it.h) + (it.n > 1 ? '/ngày' : '') : '', it.n > 1 ? `ngày ${it.i}/${it.n} · ${fmtD(e.date)}–${fmtD(end)}` : '', e.note ? esc(e.note) : '', lt ? '⚠ sau hạn ' + fmtD(x.due) : ''].filter(Boolean).join(' · ');
    return `<div class="en ${qcls(q)} ${e.done ? 'done' : ''} ${lt || it.clash ? 'late' : ''}" draggable="true" data-en="${e.id}">
      <input type="checkbox" data-endone="${e.id}" ${e.done ? 'checked' : ''}>
      <div class="eb"><div class="et" data-enedit="${e.id}" title="${esc(x && x.desc ? x.desc : 'Bấm để sửa')}">${x && P.vital.has(x.id) ? '⭐ ' : ''}${e.ro ? '🔁 ' : ''}${esc(e.title)}${meta ? `<small>${meta}</small>` : ''}</div>${stChip(e, 'data-stcycle')}</div></div>`;
  };
  const col = (k, wide) => {
    const list = by[k] || [], u = hrsOf(list);
    return `<div class="daycol ${k === T0 ? 'today' : ''} ${wide ? 'wide' : ''}" data-d="${k}">
      <div class="dh"><div><b>${DOW[pd(k).getDay()]}</b><small>${fmtD(k)}</small>${k === T0 ? '<span class="tg">Hôm nay</span>' : ''}</div>
        <div class="load"><i class="${u > SET.cap ? 'over' : u >= SET.cap ? 'full' : ''}" style="width:${Math.min(100, u / SET.cap * 100)}%"></i></div>
        <small class="hrs ${u > SET.cap ? 'over' : ''}">${fmtH(u)} / ${fmtH(SET.cap)}${u > SET.cap ? ' — quá tải' : ''}</small></div>
      <div class="dcb">${list.map(en).join('') || '<div class="empty">Chưa có việc — kéo từ kho hoặc bấm ＋</div>'}</div>
      <button class="addday" data-enadd="${k}">＋ Thêm việc</button></div>`;
  };
  const view = $('#planView'); view.className = 'pview ' + s.mode;
  if (s.mode === 'month') {
    const startDow = (pd(f).getDay() + 6) % 7;
    view.innerHTML = '<div class="mgrid">' + ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(x => `<div class="mdow">${x}</div>`).join('')
      + '<div class="mcell blank"></div>'.repeat(startDow)
      + datesIn(f, t).map(k => {
        const list = by[k] || [], h = hrsOf(list), d = pd(k);
        return `<div class="mcell ${k === T0 ? 'today' : ''} ${isWork(d) ? '' : 'off'}" data-d="${k}">
          <div class="mh"><a data-goday="${k}" title="Xem ngày này">${+k.slice(8)}</a><small>${h ? fmtH(h) : ''}</small><button class="madd" data-enadd="${k}" title="Thêm việc">＋</button></div>
          ${list.slice(0, 3).map(it => { const e = it.e, x = e.taskId && taskOf(e.taskId), q = x ? quadOf(x) : null;
            return `<div class="mchip ${qcls(q)} st-${stOf(e)} ${e.done ? 'done' : ''}" draggable="true" data-en="${e.id}" data-enedit="${e.id}" title="${esc(e.title)} · ${STATUS[stOf(e)][0]}">${it.i > 1 ? '↳ ' : ''}${e.ts ? e.ts + ' ' : ''}${e.ro ? '🔁 ' : ''}${esc(e.title)}</div>`; }).join('')}
          ${list.length > 3 ? `<div class="more" data-goday="${k}">+${list.length - 3} việc nữa</div>` : ''}</div>`;
      }).join('') + '</div>';
  } else if (s.mode === 'year') {
    const y = +f.slice(0, 4), lv = k => { const l = by[k]; if (!l) return 0; const h = hrsOf(l), r = h / SET.cap; return !h ? 1 : r < .34 ? 1 : r < .67 ? 2 : r < 1 ? 3 : 4; };
    view.innerHTML = '<div class="ygrid">' + Array.from({ length: 12 }, (_, m) => {
      const first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, nd = new Date(y, m + 1, 0).getDate(), pre = y + '-' + String(m + 1).padStart(2, '0');
      const ml = Object.keys(by).filter(k => k.startsWith(pre)).flatMap(k => by[k]);
      return `<div class="ymonth"><a class="yt" data-gomonth="${pre}-01">Tháng ${m + 1}</a><small>${ml.length ? new Set(ml.map(p => p.e)).size + ' việc · ' + fmtH(hrsOf(ml)) : 'trống'}</small>
        <div class="ydays">${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(x => `<i class="yd">${x}</i>`).join('')}${'<i></i>'.repeat(lead)}${Array.from({ length: nd }, (_, i) => {
          const k = pre + '-' + String(i + 1).padStart(2, '0'), l = by[k] || [];
          return `<a class="ycell l${lv(k)} ${k === T0 ? 'today' : ''}" data-goday="${k}" title="${fmtD(k)}: ${l.length} việc · ${fmtH(hrsOf(l))}">${i + 1}</a>`; }).join('')}</div></div>`;
    }).join('') + '</div><div class="ylegend">Mức tải: <i class="ycell l0"></i>trống <i class="ycell l1"></i>nhẹ <i class="ycell l2"></i>vừa <i class="ycell l3"></i>nhiều <i class="ycell l4"></i>đầy/quá tải (so với giờ tập trung/ngày) · bấm một ngày để xem chi tiết, bấm tên tháng để xem cả tháng</div>';
  } else {
    let ds = s.mode === 'day' ? [f] : datesIn(f, t, 92);
    if (s.mode !== 'day') ds = ds.filter(k => isWork(pd(k)) || by[k]);
    if (s.mode === 'range' && ds.length > 31) ds = ds.filter(k => by[k]);
    view.style.setProperty('--n', ds.length || 1);
    view.innerHTML = ds.length ? ds.map(k => col(k, s.mode === 'day')).join('') : '<div class="empty" style="grid-column:1/-1">Không có ngày nào để hiển thị trong khoảng này.</div>';
  }

  /* tóm tắt + nhắc việc chưa vào kế hoạch */
  const ps = datesIn(f, t, 800).flatMap(k => by[k] || []), es = [...new Set(ps.map(p => p.e))], dn = es.filter(e => e.done).length, dg = es.filter(e => stOf(e) === 'doing').length, wt = es.filter(e => stOf(e) === 'wait').length;
  $('#planSum').innerHTML = es.length
    ? `<b>${labelOf(s)}</b>: ${es.length} việc · <b>${fmtH(hrsOf(ps))}</b> kế hoạch · hoàn thành <b>${dn}/${es.length}</b> (${Math.round(dn / es.length * 100)}%)${dg ? ` · đang làm ${dg}` : ''}${wt ? ` · chờ/vướng ${wt}` : ''}. <span class="sub">Trong mỗi ngày, việc quan trọng và ⭐ trọng tâm 80/20 được xếp lên đầu.</span>`
    : `<b>${labelOf(s)}</b>: chưa có gì trong kế hoạch. Hãy kéo việc từ kho bên trái vào ngày.`;
  const miss = tasks.filter(x => !x.done && !x.rec && !planned[x.id] && (quadOf(x) === 1 || (x.due && daysTo(x.due) <= 3)));
  $('#planWarn').innerHTML = miss.length
    ? `<div>⚠ Việc gấp / sắp đến hạn nhưng chưa có trong kế hoạch: ${miss.map(x => `<button data-addbk="${x.id}">${esc(x.title)}${x.due ? ' (hạn ' + fmtD(x.due) + ')' : ''}</button>`).join('')}</div>` : '';
}
function planText() {
  const s = ST.plan, [f, t] = rangeOf(s), by = buildBy(pareto());
  let out = `KẾ HOẠCH ${labelOf(s).toUpperCase()}\n`;
  datesIn(f, t, 400).forEach(k => {
    const list = by[k]; if (!list) return;
    out += `\n${longD(k)}:\n` + list.map(it => `- ${it.e.done ? '[x]' : '[ ]'} ${it.e.ts ? timeTxt(it.e) + ' ' : ''}${it.e.title}${it.h ? ' (' + fmtH(it.h) + (it.n > 1 ? '/ngày, ngày ' + it.i + '/' + it.n : '') + ')' : ''} [${STATUS[stOf(it.e)][0]}]${it.e.note ? ' — ' + it.e.note : ''}`).join('\n') + '\n';
  });
  return out;
}

/* ----- hộp thoại chi tiết công việc (mô tả, deadline, trạng thái, thời gian làm, lặp định kỳ) ----- */
function recUI() {
  const fr = $('#rFreq').value;
  $('#rNL').hidden = !fr; $('#rDowsW').hidden = fr !== 'weekly'; $('#rDomW').hidden = fr !== 'monthly'; $('#rRange').hidden = !fr;
  $('#rUnit').textContent = { daily: 'ngày', weekly: 'tuần', monthly: 'tháng', yearly: 'năm' }[fr] || '';
  $('#tAnalysis').hidden = $('#tNoA').checked;
  $('#pFields').hidden = !$('#pOn').checked;
  $('#rHint').textContent = fr ? 'Các lần lặp sẽ tự xuất hiện trong Kế hoạch từ ngày bắt đầu. Bạn vẫn có thể tick xong, dời ngày hoặc xóa từng lần.' : '';
}
/* Một hộp thoại duy nhất cho: thêm việc mới · sửa chi tiết · đưa vào / sửa lịch trong kế hoạch.
   preset: { title, noA, hid (việc nhập nhanh trong ngày, ẩn khỏi kho), plan (mở sẵn mục lên kế hoạch), date, entryId (đang sửa một mục kế hoạch) } */
let tPreset = {};
function openTask(id, preset = {}) {
  tPreset = preset;
  const x = id ? taskOf(id) : null, r = (x && x.rec) || {}, en = preset.entryId ? plan.find(e => e.id === preset.entryId) : null;
  $('#tId').value = id || ''; $('#tEntry').value = en ? en.id : '';
  $('#tHead').textContent = 'Công việc & kế hoạch';   // một hộp thoại duy nhất cho mọi thao tác
  $('#tTitle').value = x ? x.title : (preset.title || ''); $('#tDesc').value = x ? x.desc || '' : '';
  $('#tDue').value = x ? x.due || '' : '';
  $('#tStatus').value = en ? stOf(en) : x ? stOf(x) : 'todo';
  $('#tHours').value = en ? en.hours || '' : x ? x.hrs || '' : '';
  $('#tHours').readOnly = false;
  $('#tTs').value = en ? en.ts || '' : x ? x.ts || '' : ''; $('#tTe').value = en ? en.te || '' : x ? x.te || '' : '';
  $('#pOn').checked = !!en || !!preset.plan; $('#pOn').disabled = !!en;
  $('#pDate').value = en ? en.date : preset.date || ymd(nextWork(new Date())); $('#pEnd').value = en && en.end ? en.end : ''; $('#pNote').value = en ? en.note || '' : '';
  $('#pLabel').textContent = en && en.ro ? 'Lần lặp này' : 'Đưa vào kế hoạch';
  const pl = x && !en ? plan.filter(e => e.taskId === x.id && !e.done && !e.ro).map(e => fmtD(e.date) + (e.end && e.end > e.date ? '–' + fmtD(e.end) : '')) : [];
  $('#pInfo').textContent = pl.length ? '✓ Việc này đã xếp vào: ' + pl.join(', ') : '';
  $('#tUnplan').hidden = !en; $('#tUnplan').textContent = en && en.ro ? 'Bỏ lần này' : 'Gỡ khỏi kế hoạch';
  $('#tNoA').checked = x ? !!x.noA : !!preset.noA;
  $('#tImpact').value = x && !x.aI ? x.impact : 'auto'; $('#tEffort').value = x && !x.aE ? x.effort : 'auto';
  $('#rFreq').value = r.freq || ''; $('#rN').value = r.n || 1;
  const dows = r.dows && r.dows.length ? r.dows : [new Date().getDay()];
  $$('[data-rdow]').forEach(c => c.checked = dows.includes(+c.dataset.rdow));
  $('#rDom').value = r.dom || new Date().getDate(); $('#rStart').value = r.start || T0; $('#rUntil').value = r.until || '';
  $('#tDel').hidden = !x; recUI(); hoursUI(); $('#dlgT').showModal(); $('#tTitle').focus();
}
/* Giờ dự kiến: có "từ giờ – đến giờ" thì tự suy ra (khóa ô nhập); không có thì bạn nhập số */
function hoursUI() {
  const inp = $('#tHours'), d = timeHours($('#tTs').value, $('#tTe').value);
  if (d) {
    const n = $('#pOn').checked && $('#pDate').value ? entDates({ date: $('#pDate').value, end: $('#pEnd').value }).length : 1;
    inp.value = Math.round(d * n * 100) / 100; inp.readOnly = true;
    $('#hHint').textContent = `Tự tính: ${fmtH(d)}/ngày${n > 1 ? ' × ' + n + ' ngày' : ''} từ giờ làm`;
  } else {
    if (inp.readOnly) inp.value = '';
    inp.readOnly = false; $('#hHint').textContent = 'Nhập số giờ, hoặc nhập “Từ giờ – Đến giờ” để tự tính';
  }
}
['#tTs', '#tTe', '#pDate', '#pEnd'].forEach(id => $(id).addEventListener('input', hoursUI));
['#tTs', '#tTe', '#pDate', '#pEnd', '#pOn'].forEach(id => $(id).addEventListener('change', hoursUI));
function saveTask() {
  const id = $('#tId').value, title = $('#tTitle').value.trim(); if (!title) return;
  let x = id ? taskOf(id) : null;
  if (!x) { x = { id: uid(), done: false, status: 'todo', urgent: null, important: null, aI: true, aE: true, impact: 3, effort: 2, hid: !!tPreset.hid }; tasks.push(x); }
  const wasRec = JSON.stringify([x.rec || null, x.ts || '', x.te || '']), entryId = $('#tEntry').value, sv = $('#tStatus').value;
  let hv = parseFloat(String($('#tHours').value).replace(',', '.')) || 0;
  const ts = $('#tTs').value, te = ts && $('#tTe').value > ts ? $('#tTe').value : '';        // giờ kết thúc phải sau giờ bắt đầu
  Object.assign(x, { title, desc: $('#tDesc').value.trim(), due: $('#tDue').value || '', noA: $('#tNoA').checked });
  if (!(entryId && x.rec)) { x.hrs = timeHours(ts, te) || hv; x.ts = ts; x.te = te; }   // có khung giờ thì giờ mặc định = độ dài khung giờ (mỗi ngày)   // sửa riêng một lần lặp thì không đổi giờ/khung giờ mặc định của cả chuỗi
  if (!x.noA) x.hid = false;                           // việc đã đưa vào phân tích thì hiện trong kho
  const iv = $('#tImpact').value, ev = $('#tEffort').value;
  x.aI = iv === 'auto'; if (!x.aI) x.impact = +iv; x.aE = ev === 'auto'; if (!x.aE) x.effort = +ev;
  if (x.aI) x.impact = estI(x); if (x.aE) x.effort = estE(x);
  if (!x.noA && (x.urgent == null || x.important == null)) placeAuto(x);   // việc cần phân tích mà chưa xếp ô → máy gợi ý
  const fr = $('#rFreq').value;
  if (fr) {
    x.rec = { freq: fr, n: Math.max(1, +$('#rN').value || 1), dows: $$('[data-rdow]').filter(c => c.checked).map(c => +c.dataset.rdow),
      dom: Math.min(31, Math.max(1, +$('#rDom').value || 1)), start: $('#rStart').value || T0, until: $('#rUntil').value || '', hours: x.hrs || 0, skip: (x.rec && x.rec.skip) || [] };
  } else delete x.rec;
  if (JSON.stringify([x.rec || null, x.ts || '', x.te || '']) !== wasRec) dropFuture(x.id);   // đổi lịch lặp / khung giờ → sinh lại các lần tương lai
  plan.forEach(e => { if (e.taskId === x.id) e.title = title; });
  /* phần kế hoạch của cùng hộp thoại: thời gian làm (từ ngày – đến ngày) và trạng thái */
  const date = $('#pDate').value, endV = $('#pEnd').value, note = $('#pNote').value.trim();
  if (entryId) {
    const e = plan.find(p => p.id === entryId);
    if (e) {
      if (date) e.date = date; e.end = endV && endV > e.date ? endV : ''; e.ts = ts; e.te = te; e.note = note;
      const auto = timeHours(ts, te) * entDates(e).length;                       // giờ tự tính từ khung giờ × số ngày
      if (auto) { e.hours = auto; e.hAuto = true; } else { e.hours = hv || hOf(x); e.hAuto = false; }       // có giờ làm → giờ dự kiến suy ra từ giờ làm; không có → dùng số bạn nhập
      setStatus(e, sv); syncTask(x.id);
    }
  } else {
    if ($('#pOn').checked && date) {
      const ne = { id: uid(), taskId: x.id, title, date, end: endV && endV > date ? endV : '', ts, te, note, status: sv, done: sv === 'done', doneAt: sv === 'done' ? T0 : '' };
      const auto = timeHours(ts, te) * entDates(ne).length;
      ne.hours = auto || hv || hOf(x); ne.hAuto = !!auto; plan.push(ne);
    }
    if (stOf(x) !== sv) setTaskStatus(x, sv);
  }
  $('#dlgT').close(); commit();
}

/* ============ vẽ: trang Báo cáo / Dashboard ============ */
const CATS = ['Hỗ trợ dev/QA', 'Xử lý sự cố', 'Bàn giao & nghiệm thu', 'Quản lý thay đổi', 'Tài liệu yêu cầu', 'Làm việc với khách / stakeholder',
  'Review & chất lượng', 'Backlog & kế hoạch', 'Phát triển năng lực & quy trình', 'Họp định kỳ', 'Hành chính & báo cáo', 'Việc lặt vặt', 'Việc lặt vặt'];
BA_RULES.forEach((r, i) => r.cat = CATS[i]);
const catOf = title => { const r = BA_RULES.find(x => x.re.test(title)); return r ? r.cat : 'Khác'; };
const QN = { 1: '🔥 Làm ngay', 2: '📅 Lên lịch', 3: '🤝 Ủy quyền / gộp', 4: '🗑 Để sau / bỏ', 0: '🤔 Chưa phân loại', x: '✍ Việc riêng (ngoài ma trận)' };
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

function trendSVG(bk, cap) {
  const N = bk.length; if (!N) return '';
  const W = Math.max(520, N * 36 + 60), H = 210, pl = 38, pb = 30, pt = 12, iw = W - pl - 8, ih = H - pb - pt;
  const mx = Math.max(1, ...bk.map(b => Math.max(b.p, b.d)), cap || 0), gw = iw / N, bw = Math.max(4, Math.min(16, gw / 2 - 2));
  const y = h => pt + ih * (1 - h / mx), step = Math.ceil(N / 16);
  return `<svg viewBox="0 0 ${W} ${H}" class="pchart" role="img" aria-label="Giờ kế hoạch và giờ đã xong theo thời gian">
    <line x1="${pl}" x2="${W - 8}" y1="${y(0)}" y2="${y(0)}" class="axl"/><text x="${pl - 6}" y="${y(0)}" text-anchor="end" class="ax">0</text><text x="${pl - 6}" y="${y(mx) + 8}" text-anchor="end" class="ax">${fmtH(mx)}</text>
    ${cap ? `<line x1="${pl}" x2="${W - 8}" y1="${y(cap)}" y2="${y(cap)}" class="tr-c"/><text x="${W - 10}" y="${y(cap) - 4}" text-anchor="end" class="ax">giờ tập trung/ngày</text>` : ''}
    ${bk.map((b, i) => { const x0 = pl + gw * i + gw / 2;
      return `<rect x="${x0 - bw - 1}" y="${y(b.p)}" width="${bw}" height="${ih * b.p / mx}" rx="2" class="tr-p"><title>${b.label}: kế hoạch ${fmtH(b.p)}</title></rect><rect x="${x0 + 1}" y="${y(b.d)}" width="${bw}" height="${ih * b.d / mx}" rx="2" class="tr-d"><title>${b.label}: đã xong ${fmtH(b.d)}</title></rect>${i % step === 0 ? `<text x="${x0}" y="${H - pb + 14}" text-anchor="middle" class="ax">${b.label}</text>` : ''}`; }).join('')}</svg>`;
}
function renderReport() {
  const s = ST.report, [f, t] = rangeOf(s), P = pareto();
  materialize(f, t);
  $('#pbarReport').innerHTML = pbarHTML('report');
  /* mục kế hoạch làm nhiều ngày được chia giờ đều theo từng ngày làm việc; chỉ tính phần nằm trong kỳ báo cáo */
  const ps = plan.flatMap(partsOf).filter(p => p.k >= f && p.k <= t);
  const es = [...new Set(ps.map(p => p.e))], dn = es.filter(e => e.done);
  const recs = {}; es.filter(e => e.ro).forEach(e => { const r = recs[e.taskId] = recs[e.taskId] || { n: 0, d: 0 }; r.n++; if (e.done) r.d++; });
  const ph = hrsOf(ps), dh = hrsOf(ps.filter(p => p.e.done));
  const stc = { todo: 0, doing: 0, wait: 0, done: 0 }; es.forEach(e => stc[stOf(e)]++);
  const carry = plan.filter(e => !e.done && (e.end && e.end > e.date ? e.end : e.date) < T0).sort((a, b) => a.date < b.date ? -1 : 1);
  const overdue = tasks.filter(x => !x.done && x.due && x.due < T0);
  const planned = new Set(plan.filter(e => !e.done && e.taskId).map(e => e.taskId));
  const unplanned = tasks.filter(x => !x.done && !x.rec && !planned.has(x.id) && (quadOf(x) === 1 || (x.due && daysTo(x.due) <= 3)));
  const kpi = (v, l, c = '') => `<div class="kpi ${c}"><b>${v}</b><span>${l}</span></div>`;

  /* ma trận: phân bổ thời gian */
  const qk = e => { const x = e.taskId && taskOf(e.taskId); return x && !x.noA ? quadOf(x) : 'x'; };
  const useH = ph > 0, qs = {}; ps.forEach(p => { const k = qk(p.e); qs[k] = (qs[k] || 0) + (useH ? p.h : 1 / p.n); });
  const qt = Object.values(qs).reduce((a, b) => a + b, 0);
  const ord = [1, 2, 3, 4, 0, 'x'].filter(k => qs[k]);
  const share = k => pct(qs[k] || 0, qt);
  const adv = [];
  if (qt) {
    if (share(1) >= 45) adv.push('🔥 Bạn đang dành quá nhiều thời gian “chữa cháy”. Hãy dành thêm thời gian cho 📅 (việc quan trọng chưa gấp) để giảm việc gấp về sau.');
    if (share(2) >= 40) adv.push('✅ Tỷ lệ 📅 Lên lịch tốt — đây là vùng tạo giá trị lâu dài (mục tiêu khoảng 40–65%).');
    else adv.push('📅 Việc quan trọng nhưng chưa gấp mới chiếm ' + share(2) + '% — mục tiêu khoảng 40–65%. Hãy ưu tiên đặt các khung giờ cố định cho nhóm này.');
    if (share(3) + share(4) >= 30) adv.push('🤝 ' + (share(3) + share(4)) + '% thời gian dành cho việc ít quan trọng — cân nhắc ủy quyền, làm gộp hoặc bỏ.');
  }
  /* xu hướng */
  const span = datesIn(f, t, 800).length, mode = span <= 31 ? 'd' : span <= 100 ? 'w' : 'm';
  const bkey = k => mode === 'd' ? k : mode === 'w' ? monOf(k) : k.slice(0, 7);
  const bmap = new Map(); datesIn(f, t, 800).forEach(k => { const b = bkey(k); if (!bmap.has(b)) bmap.set(b, { k: b, p: 0, d: 0, label: mode === 'm' ? 'T' + b.slice(5) : fmtD(b) }); });
  ps.forEach(p => { const b = bmap.get(bkey(p.k)); if (b) { b.p += p.h; if (p.e.done) b.d += p.h; } });
  /* loại việc BA */
  const cm = {}; ps.forEach(p => { const e = p.e, x = e.taskId && taskOf(e.taskId), c = catOf(x ? x.title : e.title); cm[c] = cm[c] || { h: 0, n: 0 }; cm[c].h += p.h; cm[c].n += 1 / p.n; });
  const cl = Object.entries(cm).sort((a, b) => (useH ? b[1].h - a[1].h : b[1].n - a[1].n)), cmax = Math.max(1, ...cl.map(([, v]) => useH ? v.h : v.n));
  /* 80/20 */
  const vh = es.filter(e => P.vital.has(e.taskId)), vShare = pct(useH ? hrsOf(ps.filter(p => P.vital.has(p.e.taskId))) : vh.length, useH ? ph : es.length);
  /* đúng hạn */
  const fin = tasks.filter(x => x.done && x.doneAt && x.due && x.doneAt >= f && x.doneAt <= t), ontime = fin.filter(x => x.doneAt <= x.due);

  const sec = (title, body, cls = '') => `<div class="box ${cls}"><h3>${title}</h3>${body}</div>`;
  $('#reportBody').innerHTML = `
    <div class="kpis">
      ${kpi(es.length, 'việc đã lên kế hoạch')}${kpi(fmtH(ph), 'giờ kế hoạch')}
      ${kpi(pct(dn.length, es.length) + '%', `hoàn thành kế hoạch (${dn.length}/${es.length})`, 'ok')}${kpi(fmtH(dh), 'giờ đã hoàn thành')}
      ${kpi(carry.length, 'việc dồn lại từ ngày trước', carry.length ? 'bad' : '')}${kpi(overdue.length, 'việc quá hạn chót', overdue.length ? 'bad' : '')}
    </div>
    <div class="rgrid">
      ${sec('🧭 Thời gian dành cho từng ô ma trận', qt ? `<div class="stack">${ord.map(k => `<i class="sg${k}" style="width:${share(k)}%" title="${QN[k]}: ${share(k)}%"></i>`).join('')}</div>
        <div class="legend2">${ord.map(k => `<div><i class="sg${k}"></i>${QN[k]}<b>${useH ? fmtH(qs[k]) : Math.round(qs[k]) + ' việc'} · ${share(k)}%</b></div>`).join('')}</div>
        ${adv.map(a => `<p class="insight">${a}</p>`).join('')}` : '<div class="empty">Chưa có dữ liệu trong khoảng này.</div>', 'span2')}
      ${sec('📈 Giờ kế hoạch so với giờ đã xong', bmap.size && ph ? trendSVG([...bmap.values()], mode === 'd' ? SET.cap : 0) + '<div class="sub"><i class="dot tr-pd"></i>Kế hoạch &nbsp; <i class="dot tr-dd"></i>Đã xong · nhóm theo ' + (mode === 'd' ? 'ngày' : mode === 'w' ? 'tuần' : 'tháng') + '</div>' : '<div class="empty">Chưa có giờ kế hoạch trong khoảng này.</div>', 'span2')}
      ${sec('🗂 Thời gian theo loại việc BA', cl.length ? cl.map(([c, v]) => `<div class="hb"><span>${esc(c)}</span><div class="hbar"><i style="width:${(useH ? v.h : v.n) / cmax * 100}%"></i></div><b>${useH ? fmtH(v.h) : Math.round(v.n)}</b></div>`).join('') : '<div class="empty">Chưa có dữ liệu.</div>')}
      ${sec('⭐ Tập trung vào việc trọng tâm (80/20)', es.length ? `<div class="gauge"><i style="width:${vShare}%"></i></div><p><b>${vShare}%</b> ${useH ? 'số giờ' : 'số việc'} dành cho việc ⭐ trọng tâm.</p>
        <p class="sub">${vShare >= 60 ? '✅ Rất tốt — bạn đang dồn sức đúng chỗ.' : '👉 Mục tiêu ≥ 60%. Hãy xếp việc ⭐ vào đầu ngày, lúc tập trung nhất.'}</p>` : '<div class="empty">Chưa có dữ liệu.</div>')}
      ${sec('⏱ Hoàn thành đúng hạn', fin.length ? `<div class="gauge"><i style="width:${pct(ontime.length, fin.length)}%"></i></div><p><b>${pct(ontime.length, fin.length)}%</b> đúng hạn (${ontime.length}/${fin.length} việc có hạn chót đã xong trong kỳ).</p>
        ${fin.filter(x => x.doneAt > x.due).map(x => `<div class="li">⚠ ${esc(x.title)} <span class="sub">— hạn ${fmtD(x.due)}, xong ${fmtD(x.doneAt)}</span></div>`).join('')}` : '<div class="empty">Chưa có việc có hạn chót nào hoàn thành trong kỳ này (hệ thống ghi nhận ngày hoàn thành từ khi bạn tick xong).</div>')}
      ${sec('📌 Trạng thái công việc trong kỳ', es.length ? `<div class="stack">${STORDER.filter(k => stc[k]).map(k => `<i class="stb-${k}" style="width:${pct(stc[k], es.length)}%" title="${STATUS[k][0]}: ${stc[k]}"></i>`).join('')}</div>
        <div class="legend2">${STORDER.map(k => `<div><i class="stb-${k}"></i>${STATUS[k][1]} ${STATUS[k][0]}<b>${stc[k]} · ${pct(stc[k], es.length)}%</b></div>`).join('')}</div>
        ${stc.wait ? `<p class="insight">⏸ ${stc.wait} việc đang chờ / vướng — hãy xem ai cần được nhắc hoặc cần gỡ khó khăn gì để việc tiếp tục.</p>` : ''}` : '<div class="empty">Chưa có dữ liệu.</div>')}
      ${sec('🔁 Việc định kỳ', Object.keys(recs).length ? Object.entries(recs).map(([id, r]) => { const x = taskOf(id); return `<div class="hb"><span>${esc(x ? x.title : '(đã xóa)')}<small class="sub" style="display:block">${x ? recText(x.rec) : ''}</small></span><div class="hbar"><i style="width:${pct(r.d, r.n)}%"></i></div><b>${r.d}/${r.n}</b></div>`; }).join('') + '<div class="sub">Tỷ lệ làm đủ các lần lặp trong kỳ — việc nào thấp liên tục nên xem lại tần suất hoặc ủy quyền.</div>' : '<div class="empty">Chưa có việc định kỳ nào trong kỳ này. Tạo bằng nút ✎ → “Lặp lại định kỳ”.</div>')}
      ${sec('🚨 Cần xử lý ngay', `
        ${carry.length ? `<h4>Việc dồn lại (đã qua ngày kế hoạch nhưng chưa xong) <button data-mvall>Dời tất cả sang hôm nay</button></h4>${carry.slice(0, 8).map(e => `<div class="li">${esc(e.title)} <span class="sub">— ${fmtD(e.date)}</span> <button data-mv="${e.id}">→ Hôm nay</button></div>`).join('')}${carry.length > 8 ? `<div class="sub">… và ${carry.length - 8} việc nữa</div>` : ''}` : ''}
        ${overdue.length ? `<h4>Việc quá hạn chót</h4>${overdue.map(x => `<div class="li late">${esc(x.title)} <span class="sub">— hạn ${fmtD(x.due)}</span></div>`).join('')}` : ''}
        ${unplanned.length ? `<h4>Việc 🔥 / sắp đến hạn chưa có trong kế hoạch</h4>${unplanned.map(x => `<div class="li">${esc(x.title)}${x.due ? ` <span class="sub">— hạn ${fmtD(x.due)}</span>` : ''} <button data-addbk="${x.id}">＋ Lên lịch</button></div>`).join('')}` : ''}
        ${!carry.length && !overdue.length && !unplanned.length ? '<div class="empty">✅ Không có việc nào cần xử lý gấp.</div>' : ''}`, 'span2')}
    </div>`;
}
function csvReport() {
  const [f, t] = rangeOf(ST.report), q = c => '"' + String(c).replace(/"/g, '""') + '"';
  const rows = [['Từ ngày', 'Đến ngày', 'Từ giờ', 'Đến giờ', 'Việc', 'Giờ (tổng)', 'Trạng thái', 'Ô ma trận', 'Loại việc', 'Ghi chú']];
  plan.filter(e => e.date <= t && (e.end && e.end > e.date ? e.end : e.date) >= f).sort((a, b) => a.date < b.date ? -1 : 1).forEach(e => {
    const x = e.taskId && taskOf(e.taskId);
    rows.push([e.date, e.end && e.end > e.date ? e.end : e.date, e.ts || '', e.te || '', e.title, e.hours || 0, STATUS[stOf(e)][0], QN[x && !x.noA ? quadOf(x) : 'x'], catOf(x ? x.title : e.title), e.note || '']);
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `bao-cao-${f}_${t}.csv`; a.click();
}

/* ============ điều hướng ============ */
const ROUTES = {
  matrix: ['Ma trận 4 ô', 'Phân loại việc theo mức độ gấp và quan trọng — máy gợi ý, bạn quyết định', true],
  pareto: ['Phân tích 80/20', '20% việc tạo ra 80% giá trị — chọn đúng việc trọng tâm', true],
  plan:   ['Kế hoạch', 'Bạn tự chọn việc từ kho và xếp vào ngày làm việc — xem theo ngày, tuần, tháng, năm hoặc khoảng tự chọn', false],
  report: ['Báo cáo', 'Bạn đã dùng thời gian vào đâu, kế hoạch được thực hiện ra sao, việc gì cần xử lý', false]
};
let route = 'matrix';
function go() {
  const r = location.hash.slice(1); route = ROUTES[r] ? r : 'matrix';
  $$('.page').forEach(p => p.hidden = p.id !== 'page-' + route);
  $$('nav a').forEach(a => a.classList.toggle('on', a.dataset.r === route));
  $('#pTitle').textContent = ROUTES[route][0]; $('#pSub').textContent = ROUTES[route][1];
  $('#f').hidden = !ROUTES[route][2]; $('#stats').hidden = !ROUTES[route][2];
  document.title = ROUTES[route][0] + ' · BA Planner';
  render();
}
function render() {
  tasks.forEach(t => {
    if (t.aI) t.impact = estI(t); if (t.aE) t.effort = estE(t);
    if (t.note && !t.done) placeAuto(t); /* việc do máy tự xếp luôn được tính lại; kéo tay là hết tự xếp */
  });
  materialize('1970-01-01', ymd(addD(pd(T0), 60)));
  const act = tasks.filter(t => !t.done && !t.noA), { vital } = pareto();
  $('#stOpen').textContent = act.length;
  $('#stQ1').textContent = act.filter(t => quadOf(t) === 1).length;
  $('#stLate').textContent = act.filter(t => t.due && daysTo(t.due) < 0).length;
  $('#stStar').textContent = vital.size;
  if (route === 'matrix') renderMatrix(); else if (route === 'pareto') renderPareto(); else if (route === 'plan') renderPlan(); else renderReport();
}
const commit = () => { save(); render(); };

/* ============ sự kiện ============ */
$('#f').onsubmit = e => {
  e.preventDefault(); const v = id => $(id).value;
  addTask(v('#title').trim(), { urgent: v('#urg') === '' ? null : v('#urg') === '1', important: v('#imp2') === '' ? null : v('#imp2') === '1',
    impact: v('#impact'), effort: v('#effort'), due: v('#due') || '', desc: v('#desc').trim() }, $('#autoplace').checked);
  $('#title').value = ''; $('#due').value = ''; $('#desc').value = ''; commit(); $('#title').focus();
};
$('#bulk').onclick = () => $('#dlg').showModal();
$('#bulkCancel').onclick = () => $('#dlg').close();
$('#bulkOk').onclick = () => {
  $('#bulkText').value.split('\n').map(s => s.replace(/^[\s\-*•\d.)]+/, '').trim()).filter(Boolean).forEach(s => addTask(s, {}, true));
  $('#bulkText').value = ''; $('#dlg').close(); commit();
};
/* gỡ một mục khỏi kế hoạch (việc vẫn còn trong kho); lần lặp thì bỏ riêng lần đó, không sinh lại */
$('#tUnplan').onclick = () => {
  const it = plan.find(x => x.id === $('#tEntry').value); if (!it) return;
  const tk = taskOf(it.taskId);
  if (it.ro && tk && tk.rec) (tk.rec.skip = tk.rec.skip || []).push(it.ro);
  plan = plan.filter(x => x.id !== it.id);
  if (tk && tk.hid && !tk.rec && !plan.some(x => x.taskId === tk.id)) tasks = tasks.filter(x => x.id !== tk.id);   // việc nhập nhanh trong ngày: gỡ là xóa luôn
  $('#dlgT').close(); commit();
};
$('#pOn').onchange = recUI;
/* thêm tay việc vào kho (không cần phân tích) + hộp thoại chi tiết việc */
$('#bkForm').onsubmit = e => {
  e.preventDefault(); const v = $('#bkTitle').value.trim(); if (!v) return;
  addTask(v, { noA: true }, false); $('#bkTitle').value = ''; commit(); $('#bkTitle').focus();
};
$('#bkMore').onclick = () => { const v = $('#bkTitle').value.trim(); $('#bkTitle').value = ''; openTask(null, { title: v, noA: true }); };
$('#tForm').onsubmit = e => { e.preventDefault(); saveTask(); };
$('#tCancel').onclick = () => $('#dlgT').close();
$('#tDel').onclick = () => {
  const id = $('#tId').value; if (!id || !confirm('Xóa việc này (kèm các mục kế hoạch liên quan)?')) return;
  tasks = tasks.filter(x => x.id !== id); plan = plan.filter(x => x.taskId !== id); $('#dlgT').close(); commit();
};
$('#rFreq').onchange = () => { if ($('#rFreq').value === 'weekly' && !$$('[data-rdow]').some(c => c.checked)) $$('[data-rdow]').forEach(c => c.checked = [1, 2, 3, 4, 5].includes(+c.dataset.rdow)); recUI(); };
$('#tNoA').onchange = recUI;
$('#rWk').onclick = () => $$('[data-rdow]').forEach(c => c.checked = [1, 2, 3, 4, 5].includes(+c.dataset.rdow));

$('#bkToggle').onclick = () => { BK.open = !BK.open; saveBK(); renderPlan(); };
$('#bkClose').onclick = () => { BK.open = false; saveBK(); renderPlan(); };
$('#bkPin').onclick = () => { BK.pinned = !BK.pinned; saveBK(); renderPlan(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && route === 'plan' && BK.open && !BK.pinned && !$('#dlgT').open) { BK.open = false; saveBK(); renderPlan(); } });
document.addEventListener('click', e => {
  /* kho việc dạng nổi: bấm ra ngoài thì tự đóng */
  if (route === 'plan' && BK.open && !BK.pinned && !e.target.closest('.backlog,#bkToggle,dialog,[data-addbk]')) { BK.open = false; saveBK(); renderPlan(); }
  const g = a => e.target.closest('[' + a + ']'); let el;
  if (el = g('data-tog')) { const t = taskOf(el.dataset.tog), f = el.dataset.f; t[f] = t[f] == null ? true : (t[f] ? false : null); t.note = t.tip = ''; commit(); }
  else if (el = g('data-stcycle')) {           // đổi trạng thái một mục kế hoạch: chưa bắt đầu → đang làm → chờ/vướng → hoàn thành
    const it = plan.find(x => x.id === el.dataset.stcycle); setStatus(it, STORDER[(STORDER.indexOf(stOf(it)) + 1) % STORDER.length]); syncTask(it.taskId); commit();
  }
  else if (el = g('data-tstcycle')) {          // đổi trạng thái của việc (ở trang Phân tích)
    const x = taskOf(el.dataset.tstcycle); setTaskStatus(x, STORDER[(STORDER.indexOf(stOf(x)) + 1) % STORDER.length]); commit();
  }
  else if (el = g('data-apply')) { const t = taskOf(el.dataset.apply), s = suggest(t); t.urgent = s.urgent; t.important = s.important; commit(); }
  else if (g('data-applyall')) { tasks.filter(t => !t.done && quadOf(t) === 0).forEach(t => { const s = suggest(t); t.urgent = s.urgent; t.important = s.important; }); commit(); }
  else if (el = g('data-del')) { const id = el.dataset.del; tasks = tasks.filter(x => x.id !== id); plan = plan.filter(x => x.taskId !== id); commit(); }
  else if (el = g('data-pm')) {
    const [k, m] = el.dataset.pm.split(':'), s = ST[k]; s.mode = m;
    if (m === 'range' && !(s.from && s.to)) { const [f, t] = rangeOf({ mode: 'week', anchor: s.anchor }); s.from = f; s.to = t; }
    saveView(); render();
  }
  else if (el = g('data-pn')) { const [k, d] = el.dataset.pn.split(':'); shiftP(ST[k], +d); saveView(); render(); }
  else if (el = g('data-pt')) {
    const s = ST[el.dataset.pt];
    if (s.mode === 'range') { const [f, t] = rangeOf(s), len = Math.round((pd(t) - pd(f)) / 864e5); s.from = T0; s.to = ymd(addD(pd(T0), len)); }
    s.anchor = T0; saveView(); render();
  }
  else if (el = g('data-goday')) { ST.plan.mode = 'day'; ST.plan.anchor = el.dataset.goday; saveView(); render(); }
  else if (el = g('data-gomonth')) { ST.plan.mode = 'month'; ST.plan.anchor = el.dataset.gomonth; saveView(); render(); }
  else if (el = g('data-mv')) { plan.find(x => x.id === el.dataset.mv).date = T0; commit(); }
  else if (g('data-mvall')) { plan.filter(x => !x.done && x.date < T0).forEach(x => x.date = T0); commit(); }
  else if (g('data-csv')) csvReport();
  else if (g('data-copy')) { const s = planText(); (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(() => alert('Đã sao chép kế hoạch tuần'), () => prompt('Sao chép kế hoạch:', s)); }
  else if (el = g('data-addbk')) { const t = taskOf(el.dataset.addbk); openTask(t.id, { plan: !t.rec }); }
  else if (el = g('data-tedit')) openTask(el.dataset.tedit);
  else if (el = g('data-enadd')) openTask(null, { plan: true, noA: true, hid: true, date: el.dataset.enadd });
  else if (el = g('data-enedit')) { const en = plan.find(x => x.id === el.dataset.enedit); openTask(en.taskId, { entryId: en.id }); }
});
document.addEventListener('change', e => {
  const d = e.target.dataset;
  if (d.done) {
    const t = taskOf(d.done); setDone(t, e.target.checked);
    if (t.rec) { if (t.done) dropFuture(t.id); }     // đánh dấu xong việc định kỳ = kết thúc chuỗi lặp, giữ lại các lần đã làm
    else plan.filter(x => x.taskId === t.id).forEach(x => setDone(x, t.done));
    commit();
  }
  else if (d.endone) { const it = plan.find(x => x.id === d.endone); setDone(it, e.target.checked); syncTask(it.taskId); commit(); }
  else if (d.pr) { const [k, fld] = d.pr.split(':'); ST[k][fld] = e.target.value; if (ST[k].from && ST[k].to) { ST[k].anchor = ST[k].from; } saveView(); render(); }
  else if (d.pa) { if (e.target.value) { ST[d.pa].anchor = e.target.value; saveView(); render(); } }
  else if (d.f && e.target.tagName === 'SELECT') {
    const t = taskOf(d.id), f = d.f, k = f === 'impact' ? 'aI' : 'aE';
    if (e.target.value === 'auto') t[k] = true; else { t[k] = false; t[f] = +e.target.value; } commit();
  }
  else if (e.target.id === 'setCap') { SET.cap = Math.max(1, +e.target.value || 6); saveSet(); renderPlan(); }
  else if (e.target.id === 'bkAll') { showAll = e.target.checked; renderPlan(); }
  else if (d.day !== undefined) {
    const n = +d.day; SET.days = SET.days.filter(x => x !== n); if (e.target.checked) SET.days.push(n);
    if (!SET.days.length) SET.days = [1, 2, 3, 4, 5]; saveSet(); renderPlan();
  }
});

/* kéo thả: thẻ ↔ ô ma trận · việc ở kho / mục kế hoạch → ngày */
let drag = null;
document.addEventListener('dragstart', e => {
  const c = e.target.closest && e.target.closest('.card,.bk,.en,.mchip'); if (!c) return;
  drag = c.classList.contains('card') ? { k: 'card', id: c.dataset.id } : c.classList.contains('bk') ? { k: 'bk', id: c.dataset.bk } : { k: 'en', id: c.dataset.en };
  c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', drag.id);
  if (drag.k === 'bk' && !BK.pinned) setTimeout(() => $('#planLayout').classList.add('dragmode'), 0);   // kho nổi mờ đi để thấy các ngày bên dưới
});
document.addEventListener('dragend', () => { drag = null; $$('.dragging,.over').forEach(x => x.classList.remove('dragging', 'over')); $('#planLayout').classList.remove('dragmode'); });
document.addEventListener('dragover', e => {
  if (!drag) return;
  const q = e.target.closest(drag.k === 'card' ? '.quad' : '.daycol,.mcell');
  if (q) { e.preventDefault(); $$('.over').forEach(x => x !== q && x.classList.remove('over')); q.classList.add('over'); }
});
document.addEventListener('drop', e => {
  if (!drag) return;
  if (drag.k === 'card') {
    const q = e.target.closest('.quad'); if (!q) return; e.preventDefault();
    const t = taskOf(drag.id), n = +q.dataset.q; drag = null; t.note = t.tip = '';
    if (n === 0) { t.urgent = null; t.important = null; } else { t.important = n <= 2; t.urgent = (n === 1 || n === 3); }
    commit(); return;
  }
  const dc = e.target.closest('.daycol,.mcell'); if (!dc) return; e.preventDefault();
  if (drag.k === 'bk') {
    if (!BK.pinned) { BK.open = false; saveBK(); }     // kho nổi: dùng xong tự đóng
    const t = taskOf(drag.id);
    plan.push({ id: uid(), taskId: t.id, title: t.title, date: dc.dataset.d, hours: hOf(t), note: '', status: 'todo', done: false });
  } else shiftEntry(plan.find(x => x.id === drag.id), dc.dataset.d);      // dời cả khoảng nhiều ngày, giữ nguyên độ dài
  drag = null; commit();
});

/* dữ liệu: xuất / nhập / dọn */
$('#clr').onclick = () => {
  if (tasks.some(t => t.done) && confirm('Xóa tất cả việc đã hoàn thành (kèm các mục kế hoạch liên quan)?')) {
    const gone = new Set(tasks.filter(t => t.done).map(t => t.id));
    tasks = tasks.filter(t => !t.done); plan = plan.filter(e => !gone.has(e.taskId)); commit();
  }
};
$('#rep-csv').onclick = csvReport;
$('#exp').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ tasks, plan, set: SET }, null, 1)], { type: 'application/json' }));
  a.download = 'ba-planner.json'; a.click();
};
$('#imp').onclick = () => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.json';
  i.onchange = () => i.files[0].text().then(s => {
    try {
      const d = JSON.parse(s);
      if (Array.isArray(d)) tasks = d;
      else if (d && Array.isArray(d.tasks)) { tasks = d.tasks; plan = Array.isArray(d.plan) ? d.plan : []; if (d.set) { SET = Object.assign(SET, d.set); saveSet(); } }
      else throw 0;
      commit();
    } catch (err) { alert('File không hợp lệ'); }
  });
  i.click();
};

window.addEventListener('hashchange', go);
go();
})();
