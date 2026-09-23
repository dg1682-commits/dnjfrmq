import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, addDoc, query, orderBy, limit, getDocs, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut, updateProfile, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

/* ================= 1. 초기화 및 전역 변수 ================= */
const firebaseConfig = { apiKey: "AIzaSyCG86jGSCHmadOn4_LdymWtT37XMEA4EFE", authDomain: "dnjfrmq.firebaseapp.com", projectId: "dnjfrmq", storageBucket: "dnjfrmq.firebasestorage.app", messagingSenderId: "942049894622", appId: "1:942049894622:web:8dc62411fac925e5b1224f" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let currentHouseholdId = null; 
let myFamilyCode = '';
let unsubSnapshot = null;
let isFirstLoad = true;

const defaultCategories = ['집', '자동차', '대출', '개인', '보험', '어린이집', '공과금', '렌트', '통신', '기타'];
const defaultPaymentMethods = ['자동이체', '직접송금', '앱결제', '지로납부'];
const defaultPayAccounts = ['미지정', '신용카드', '카카오페이'];
const defaultWithdrawAccounts = ['미지정', '국민 111', '신한 222'];

let appData = { expenses: [], incomes: [], categories: defaultCategories, paymentMethods: defaultPaymentMethods, payAccounts: defaultPayAccounts, withdrawAccounts: defaultWithdrawAccounts, widgetOrder: [], ledgerName: "월급 찍고 갑니다" };

/* ================= 2. 인증 및 가족 연동 로직 ================= */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    updateHeaderNickname();

    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      myFamilyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      currentHouseholdId = user.uid; 
      await setDoc(userDocRef, { householdId: currentHouseholdId, myCode: myFamilyCode, nickname: user.displayName || "사용자" });
    } else {
      currentHouseholdId = userSnap.data().householdId;
      myFamilyCode = userSnap.data().myCode;
    }
    
    document.getElementById('my-family-code').textContent = myFamilyCode;
    await loadHouseholdData();
    loadFamilyMembers();
  } else {
    window.location.href = "main.html";
  }
});

function updateHeaderNickname() {
  const emailEl = document.getElementById('header-user-email');
  if (emailEl && currentUser) emailEl.textContent = currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : "사용자");
}

async function loadHouseholdData() {
  const docRef = doc(db, "households", currentHouseholdId);
  const docSnap = await getDoc(docRef);
  
  // 🌟 (핵심) 날아갔던 옛날 데이터(myHome) 완벽 복구 마이그레이션 로직
  if (!docSnap.exists()) {
    const legacySnap = await getDoc(doc(db, "household", "myHome"));
    if (legacySnap.exists()) appData = legacySnap.data();
    await setDoc(docRef, appData);
  }

  if (unsubSnapshot) unsubSnapshot(); 
  unsubSnapshot = onSnapshot(docRef, (snap) => {
    if (snap.exists()) appData = snap.data();
    
    // 구조 무너짐 방지용 안전 장치
    if(!appData.paymentMethods) appData.paymentMethods = defaultPaymentMethods;
    if(!appData.payAccounts) appData.payAccounts = defaultPayAccounts;
    if(!appData.withdrawAccounts) appData.withdrawAccounts = defaultWithdrawAccounts;
    if(!appData.categories) appData.categories = defaultCategories;
    if(!appData.expenses) appData.expenses = [];
    if(!appData.incomes) appData.incomes = [];
    if(!appData.ledgerName) appData.ledgerName = "월급 찍고 갑니다";
    if(appData.separateSalary === undefined) appData.separateSalary = false;
    
    const toggleSplit = document.getElementById('toggle-salary-split');
    if(toggleSplit) toggleSplit.checked = appData.separateSalary;

    if (isFirstLoad) { applyWidgetOrder(); isFirstLoad = false; }
    if(currentIndex === 0) document.getElementById('header-title').textContent = appData.ledgerName;
    
    updateHome(); renderExpenses(); renderIncomes();
    if (currentIndex === 3) renderAnalysis();
  });
}

function loadFamilyMembers() {
  onSnapshot(query(collection(db, "users"), where("householdId", "==", currentHouseholdId)), (snapshot) => {
    let names = [];
    snapshot.forEach(doc => names.push(doc.data().nickname || "가족"));
    const listEl = document.getElementById('family-members-list');
    if(listEl) listEl.textContent = names.join(', ');
  });
}

function saveData() { setDoc(doc(db, "households", currentHouseholdId), appData); }

/* ================= 3. 내 정보, 제목 변경, 버튼 액션 (안전 로직) ================= */
// 각 버튼이 HTML에 확실히 존재할 때만 클릭 이벤트를 달아 오류(먹통) 원천 차단
const elChangeNick = document.getElementById('btn-change-nickname');
if(elChangeNick) elChangeNick.addEventListener('click', () => {
  openModal('닉네임 변경', `<div class="form-group"><input type="text" id="new-nick" class="form-input" value="${currentUser.displayName || ''}"></div>`, async () => {
    const n = document.getElementById('new-nick').value.trim();
    if(n) {
      await updateProfile(currentUser, { displayName: n });
      await setDoc(doc(db, "users", currentUser.uid), { nickname: n }, { merge: true });
      updateHeaderNickname(); window.closeModal(); alert("변경 완료");
    }
  });
});

const elChangePw = document.getElementById('btn-change-password');
if(elChangePw) elChangePw.addEventListener('click', () => {
  openModal('비밀번호 변경', `<div class="form-group"><input type="password" id="new-pw" class="form-input" placeholder="새 비밀번호 (6자리 이상)"></div>`, async () => {
    const pw = document.getElementById('new-pw').value.trim();
    if(pw.length >= 6) {
      try { await updatePassword(currentUser, pw); window.closeModal(); alert("비밀번호 변경 완료"); }
      catch(e) { alert("보안상 로그아웃 후 다시 로그인해야 변경할 수 있습니다."); }
    } else alert("6자리 이상 입력하세요.");
  });
});

const elChangeTitle = document.getElementById('btn-change-ledger-name');
if(elChangeTitle) elChangeTitle.addEventListener('click', () => {
  openModal('홈 화면 타이틀 변경', `<div class="form-group"><input type="text" id="new-title" class="form-input" value="${appData.ledgerName}"></div>`, () => {
    const t = document.getElementById('new-title').value.trim();
    if(t) { appData.ledgerName = t; saveData(); window.closeModal(); }
  });
});

const elShowQr = document.getElementById('btn-show-qr');
if(elShowQr) elShowQr.addEventListener('click', () => {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${myFamilyCode}`;
  openModal('가족 코드 QR', `<div style="text-align:center;"><img src="${qrUrl}" style="border-radius:10px;"><p style="margin-top:10px; font-size:18px; font-weight:bold; letter-spacing:2px;">${myFamilyCode}</p></div>`, null, false);
});

const elLinkFamily = document.getElementById('btn-link-family');
if(elLinkFamily) elLinkFamily.addEventListener('click', async () => {
  const inputCode = document.getElementById('input-family-code').value.trim().toUpperCase();
  if(!inputCode) return alert("코드를 입력하세요.");
  if(inputCode === myFamilyCode) return alert("본인의 코드입니다.");

  try {
    const querySnapshot = await getDocs(query(collection(db, "users")));
    let targetHouseholdId = null;
    querySnapshot.forEach((doc) => { if (doc.data().myCode === inputCode) targetHouseholdId = doc.data().householdId; });

    if(targetHouseholdId) {
      if(confirm('가족 데이터를 찾았습니다! 연동하시겠습니까?\n(기존 내 데이터 대신 가족 데이터가 출력됩니다)')) {
        await setDoc(doc(db, "users", currentUser.uid), { householdId: targetHouseholdId }, { merge: true });
        alert("가족 연동이 완료되었습니다."); location.reload();
      }
    } else alert("일치하는 코드가 없습니다.");
  } catch(e) { alert("연동 오류 발생"); }
});

const elBackup = document.getElementById('btn-backup-data');
if(elBackup) elBackup.addEventListener('click', async () => {
  if(confirm('현재 데이터를 클라우드에 백업하시겠습니까?')) {
    await addDoc(collection(db, "households", currentHouseholdId, "backups"), { data: appData, timestamp: Date.now() });
    alert("백업 완료");
  }
});

const elRestore = document.getElementById('btn-restore-data');
if(elRestore) elRestore.addEventListener('click', async () => {
  const snaps = await getDocs(query(collection(db, "households", currentHouseholdId, "backups"), orderBy("timestamp", "desc"), limit(5)));
  if(snaps.empty) return alert("백업 데이터가 없습니다.");
  let html = `<p style="font-size:13px; color:#888; margin-bottom:15px;">최근 백업 내역 5개</p>`;
  snaps.forEach(docSnap => { html += `<button class="pretty-btn outline-btn" style="margin-bottom:10px; font-size:13px;" onclick="restoreBackup('${docSnap.id}')">${new Date(docSnap.data().timestamp).toLocaleString()}</button>`; });
  
  window.restoreBackup = async function(docId) {
    if(confirm('이 시점으로 복구하시겠습니까? (현재 내용 덮어씌움)')) {
      appData = snaps.docs.find(d => d.id === docId).data().data; saveData(); window.closeModal(); alert("복구 완료");
    }
  };
  openModal('백업 가져오기', html, null, false);
});


/* ================= 4. 공통 유틸 및 UI 제어 ================= */
function formatMoney(num) { return Number(num).toLocaleString() + ' 원'; }
function getRawNumber(val) { return Number(val.replace(/,/g, '')); }
function attachCommaEvent(inputId) {
  const input = document.getElementById(inputId);
  if(!input) return;
  input.addEventListener('input', function(e) { let val = e.target.value.replace(/[^0-9]/g, ''); e.target.value = val ? Number(val).toLocaleString('ko-KR') : ''; });
}

function updateClock() {
  const now = new Date(); const m = String(now.getMonth() + 1).padStart(2, '0'); const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0'); const min = String(now.getMinutes()).padStart(2, '0'); const s = String(now.getSeconds()).padStart(2, '0');
  const clockEl = document.getElementById('header-clock');
  if (clockEl) clockEl.innerHTML = `${m}월 <span class="big-day">${d}일</span><br>${h}:${min}:${s}`;
}
setInterval(updateClock, 1000); updateClock();

const navItems = document.querySelectorAll('.nav-item');
const tabSections = document.querySelectorAll('.tab-section');
const tabNames = [appData.ledgerName, '소득', '지출', '분석', '설정'];
const fabBtn = document.getElementById('btn-floating-add');
let currentIndex = 0;

function switchTab(idx) {
  if(idx < 0 || idx >= tabSections.length) return;
  currentIndex = idx;
  navItems.forEach(nav => nav.classList.remove('active'));
  tabSections.forEach(sec => sec.classList.remove('active'));
  navItems[currentIndex].classList.add('active');
  tabSections[currentIndex].classList.add('active');
  document.getElementById('header-title').textContent = currentIndex === 0 ? appData.ledgerName : tabNames[currentIndex];
  
  if (currentIndex === 1 || currentIndex === 2) fabBtn.style.display = 'flex'; else fabBtn.style.display = 'none';
  if (currentIndex === 3) renderAnalysis();
}
navItems.forEach((item, idx) => item.addEventListener('click', () => switchTab(idx)));

let startX = 0; let endX = 0;
document.getElementById('app-wrapper').addEventListener('touchstart', e => startX = e.touches[0].clientX);
document.getElementById('app-wrapper').addEventListener('touchend', e => {
  endX = e.changedTouches[0].clientX;
  if (Math.abs(startX - endX) > 50) { if (startX - endX > 0) switchTab(currentIndex + 1); else switchTab(currentIndex - 1); }
});

const modal = document.getElementById('custom-modal');
function openModal(title, html, onConfirm, showBtns = true) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-action-btns').style.display = showBtns ? 'flex' : 'none';
  document.getElementById('modal-confirm').onclick = () => { if(onConfirm) onConfirm(); };
  modal.classList.add('show');
}
window.closeModal = function() { modal.classList.remove('show'); };
modal.addEventListener('click', e => { if (e.target === modal) window.closeModal(); });
document.getElementById('modal-cancel').addEventListener('click', window.closeModal);


/* ================= 5. 홈 위젯 ================= */
window.toggleWidgetDetails = function(id) { const el = document.getElementById(id); el.style.display = (el.style.display === 'block') ? 'none' : 'block'; };

function applyWidgetOrder() {
  if (appData.widgetOrder && appData.widgetOrder.length > 0) {
    const container = document.getElementById('tab-home');
    appData.widgetOrder.forEach(id => { const el = document.getElementById(id); if (el) container.appendChild(el); });
  }
}
const tabHomeEl = document.getElementById('tab-home');
if(tabHomeEl) {
  new Sortable(tabHomeEl, { handle: '.drag-handle', animation: 150, onEnd: function () { appData.widgetOrder = Array.from(tabHomeEl.querySelectorAll('.widget')).map(el => el.id); saveData(); } });
}

function updateHome() {
  document.getElementById('date-subtitle').textContent = `지출 예정 (오늘 ${new Date().getDate()}일)`;
  let totalIncome = 0; let paidAmount = 0; let unpaidAmount = 0; let expectedAmount = 0;
  let htmlIncome = ''; let htmlPaid = ''; let htmlUnpaid = ''; let htmlExpected = '';
  const cd = new Date().getDate();

  appData.incomes.forEach(i => { totalIncome += Number(i.amount); let ownerTag = (appData.separateSalary && i.owner === 'family') ? '<span style="font-size:10px; background:#eee; padding:2px 4px; border-radius:4px; margin-right:5px; color:#555;">가족</span>' : ''; htmlIncome += `<div class="mini-item"><span class="mini-item-name">${ownerTag}${i.name}</span><span class="mini-item-amt blue-text">${formatMoney(i.amount)}</span></div>`; });
  appData.expenses.forEach(e => {
    const amt = Number(e.amount);
    if(e.isPaid) { paidAmount += amt; htmlPaid += `<div class="mini-item"><span class="mini-item-name">${e.name}</span><span class="mini-item-amt green-text">${formatMoney(amt)}</span></div>`; } 
    else {
      if(Number(e.date) < cd) { unpaidAmount += amt; htmlUnpaid += `<div class="mini-item"><span class="mini-item-name">${e.name} (${e.date}일)</span><span class="mini-item-amt red-text">${formatMoney(amt)}</span></div>`; } 
      else { expectedAmount += amt; htmlExpected += `<div class="mini-item"><span class="mini-item-name">${e.name} (${e.date}일)</span><span class="mini-item-amt">${formatMoney(amt)}</span></div>`; }
    }
  });

  document.getElementById('home-total-income').textContent = formatMoney(totalIncome); document.getElementById('home-paid-amount').textContent = formatMoney(paidAmount);
  document.getElementById('home-unpaid-amount').textContent = formatMoney(unpaidAmount); document.getElementById('home-expected-amount').textContent = formatMoney(expectedAmount);
  document.getElementById('home-balance').textContent = formatMoney(totalIncome - (paidAmount + unpaidAmount + expectedAmount));

  document.getElementById('details-income').innerHTML = htmlIncome || '<p style="font-size:12px; color:#aaa; text-align:center;">내역 없음</p>';
  document.getElementById('details-paid').innerHTML = htmlPaid || '<p style="font-size:12px; color:#aaa; text-align:center;">내역 없음</p>';
  document.getElementById('details-unpaid').innerHTML = htmlUnpaid || '<p style="font-size:12px; color:#aaa; text-align:center;">내역 없음</p>';
  document.getElementById('details-expected').innerHTML = htmlExpected || '<p style="font-size:12px; color:#aaa; text-align:center;">내역 없음</p>';
}

/* ================= 6. 지출 및 소득 로직 ================= */
const expenseList = document.getElementById('expense-list');
function renderExpenses() {
  expenseList.innerHTML = '';
  const sortedExpenses = [...appData.expenses].sort((a, b) => { if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1; return Number(a.date) - Number(b.date); });
  sortedExpenses.forEach(item => {
    const div = document.createElement('div'); div.className = 'list-item';
    div.innerHTML = `
      <div class="item-info" onclick="editExpense(${item.id})">
        <h3 style="font-size:15px; margin-bottom:4px; ${item.isPaid ? 'text-decoration:line-through; color:#aaa;' : ''}">${item.name}</h3>
        <p style="font-size:12px; color:#888;">${item.category} | 매월 ${item.date}일</p>
        <p style="font-size:11px; color:#aaa; margin-top:2px;">[방식] ${item.payMethod || '-'} / [납부] ${item.payAccount || '-'} / [출금] ${item.withdrawAccount || '-'}</p>
        <div style="font-weight:bold; margin-top:5px; color:${item.isPaid ? '#aaa' : '#333'};">${formatMoney(item.amount)}</div>
      </div>
      <div class="item-action">
        <button class="pay-btn ${item.isPaid ? 'paid' : ''}" onclick="togglePaid(${item.id})">${item.isPaid ? '납부완료 ✓' : '납부 대기'}</button>
        ${item.isPaid && item.paidAt ? `<span class="paid-time">${item.paidAt}</span>` : ''}
      </div>`;
    expenseList.appendChild(div);
  });
}

window.togglePaid = function(id) {
  const exp = appData.expenses.find(e => e.id === id); if(!exp) return;
  if (exp.isPaid) { openModal('납부 취소', `<p style="text-align:center;"><b>[${exp.name}]</b> 납부 완료를 취소할까요?</p>`, () => { exp.isPaid = false; exp.paidAt = null; saveData(); window.closeModal(); }); } 
  else { exp.isPaid = true; const now = new Date(); exp.paidAt = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; saveData(); }
};

window.editExpense = function(id) {
  const exp = appData.expenses.find(e => e.id === id); if(!exp) return;
  const html = `
    <div class="form-group"><label>카테고리</label><select id="e-cat" class="form-input">${appData.categories.map(c => `<option value="${c}" ${c===exp.category?'selected':''}>${c}</option>`).join('')}</select></div>
    <div class="form-group"><label>항목명</label><input type="text" id="e-name" class="form-input" value="${exp.name}"></div>
    <div class="form-group"><label>출금일</label><input type="number" id="e-date" class="form-input" value="${exp.date}"></div>
    <div class="form-group"><label>금액 (원)</label><input type="text" inputmode="numeric" id="e-amt" class="form-input" value="${Number(exp.amount).toLocaleString('ko-KR')}"></div>
    <div style="display:flex; gap:10px;">
      <div class="form-group" style="flex:1;"><label>납부방법</label><select id="e-paymethod" class="form-input">${appData.paymentMethods.map(m => `<option value="${m}" ${m===exp.payMethod?'selected':''}>${m}</option>`).join('')}</select></div>
      <div class="form-group" style="flex:1;"><label>납부계좌</label><select id="e-payacc" class="form-input">${appData.payAccounts.map(p => `<option value="${p}" ${p===exp.payAccount?'selected':''}>${p}</option>`).join('')}</select></div>
    </div>
    <div class="form-group"><label>출금계좌</label><select id="e-withacc" class="form-input">${appData.withdrawAccounts.map(a => `<option value="${a}" ${a===exp.withdrawAccount?'selected':''}>${a}</option>`).join('')}</select></div>
    <button class="pretty-btn gray-btn" style="margin-top:10px; color:#D32F2F;" onclick="deleteExpense(${exp.id})">🗑️ 삭제</button>
  `;
  openModal('지출 수정', html, () => {
    exp.category = document.getElementById('e-cat').value; exp.name = document.getElementById('e-name').value; exp.date = document.getElementById('e-date').value;
    exp.amount = getRawNumber(document.getElementById('e-amt').value); exp.payMethod = document.getElementById('e-paymethod').value; exp.payAccount = document.getElementById('e-payacc').value; exp.withdrawAccount = document.getElementById('e-withacc').value;
    saveData(); window.closeModal();
  });
  attachCommaEvent('e-amt'); 
};
window.deleteExpense = function(id) { if(confirm('삭제할까요?')) { appData.expenses = appData.expenses.filter(e => e.id !== id); saveData(); window.closeModal(); } };

const incomeList = document.getElementById('income-list');
function renderIncomes() {
  incomeList.innerHTML = '';
  appData.incomes.forEach(item => {
    const div = document.createElement('div'); div.className = 'list-item';
    let ownerTag = (appData.separateSalary && item.owner === 'family') ? '<span style="font-size:11px; background:#eee; padding:2px 6px; border-radius:4px; margin-right:5px; color:#555;">가족 소득</span><br>' : '';
    div.innerHTML = `
      <div class="item-info" style="width:100%;">
        <div style="display:flex; justify-content:space-between; align-items:center;" onclick="editIncome(${item.id})">
          <h3 style="font-size:15px; margin-bottom:4px;">${item.name}</h3>
          ${item.taxAmount ? `<span class="expand-btn" onclick="event.stopPropagation(); toggleWidgetDetails('inc-det-${item.id}')">▼ 상세내역</span>` : ''}
        </div>
        <p style="font-size:12px; color:#888;" onclick="editIncome(${item.id})">${ownerTag}매월 ${item.date}일</p>
        
        <div id="inc-det-${item.id}" class="widget-details" style="display:none; margin-top:10px; font-size:12px; border-top:1px solid var(--border-color); padding-top:10px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>지급 총액</span><span>${formatMoney(item.amount + (item.taxAmount||0))}</span></div>
          <div style="display:flex; justify-content:space-between; color:#FF4B4B;"><span>공제액 (세금)</span><span>-${formatMoney(item.taxAmount||0)}</span></div>
        </div>
        <div class="bold-text blue-text" style="margin-top:8px;" onclick="editIncome(${item.id})">${formatMoney(item.amount)}</div>
      </div>
    `;
    incomeList.appendChild(div);
  });
}

window.editIncome = function(id) {
  const inc = appData.incomes.find(i => i.id === id); if(!inc) return;
  const ownerHtml = appData.separateSalary ? `<div class="form-group"><label>누구의 소득인가요?</label><select id="i-owner" class="form-input"><option value="me" ${inc.owner==='me'?'selected':''}>내 소득</option><option value="family" ${inc.owner==='family'?'selected':''}>가족 소득</option></select></div>` : '';
  const html = `
    ${ownerHtml}
    <div class="form-group"><label>항목명</label><input type="text" id="i-name" class="form-input" value="${inc.name}"></div>
    <div class="form-group"><label>입금일</label><input type="number" id="i-date" class="form-input" value="${inc.date}"></div>
    <div class="form-group"><label>공제액 (세금 등)</label><input type="text" inputmode="numeric" id="i-tax" class="form-input" value="${inc.taxAmount ? Number(inc.taxAmount).toLocaleString('ko-KR') : ''}"></div>
    <div class="form-group"><label>실수령액 (원)</label><input type="text" inputmode="numeric" id="i-amt" class="form-input" value="${Number(inc.amount).toLocaleString('ko-KR')}"></div>
    <button class="pretty-btn gray-btn" style="margin-top:10px; color:#D32F2F;" onclick="deleteIncome(${inc.id})">🗑️ 삭제</button>
  `;
  openModal('소득 수정', html, () => {
    inc.name = document.getElementById('i-name').value; inc.date = document.getElementById('i-date').value;
    inc.taxAmount = getRawNumber(document.getElementById('i-tax').value) || 0; inc.amount = getRawNumber(document.getElementById('i-amt').value);
    if(appData.separateSalary) inc.owner = document.getElementById('i-owner').value;
    saveData(); window.closeModal();
  });
  attachCommaEvent('i-amt'); attachCommaEvent('i-tax');
};
window.deleteIncome = function(id) { if(confirm('삭제할까요?')) { appData.incomes = appData.incomes.filter(i => i.id !== id); saveData(); window.closeModal(); } };

fabBtn.addEventListener('click', () => {
  if (currentIndex === 2) {
    const html = `
      <div class="form-group"><label>카테고리</label><select id="e-cat" class="form-input">${appData.categories.map(c => `<option value="${c}">${c}</option>`).join('')}</select></div>
      <div class="form-group"><label>항목명</label><input type="text" id="e-name" class="form-input" placeholder="예: 월세"></div>
      <div class="form-group"><label>출금일</label><input type="number" id="e-date" class="form-input" placeholder="숫자 (예: 20)"></div>
      <div class="form-group"><label>금액 (원)</label><input type="text" inputmode="numeric" id="e-amt" class="form-input" placeholder="금액 입력"></div>
      <div style="display:flex; gap:10px;">
        <div class="form-group" style="flex:1;"><label>납부방법</label><select id="e-paymethod" class="form-input">${appData.paymentMethods.map(m => `<option value="${m}">${m}</option>`).join('')}</select></div>
        <div class="form-group" style="flex:1;"><label>납부계좌</label><select id="e-payacc" class="form-input">${appData.payAccounts.map(p => `<option value="${p}">${p}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label>출금계좌</label><select id="e-withacc" class="form-input">${appData.withdrawAccounts.map(a => `<option value="${a}">${a}</option>`).join('')}</select></div>
    `;
    openModal('새 지출 등록', html, () => {
      const rawAmt = getRawNumber(document.getElementById('e-amt').value); if (!rawAmt) return alert("금액을 입력해주세요.");
      appData.expenses.push({ id: Date.now(), category: document.getElementById('e-cat').value, name: document.getElementById('e-name').value, date: document.getElementById('e-date').value, amount: rawAmt, payMethod: document.getElementById('e-paymethod').value, payAccount: document.getElementById('e-payacc').value, withdrawAccount: document.getElementById('e-withacc').value, isPaid: false, paidAt: null });
      saveData(); window.closeModal();
    });
    attachCommaEvent('e-amt');
  } else if (currentIndex === 1) {
    const ownerHtml = appData.separateSalary ? `<div class="form-group"><label>누구의 소득인가요?</label><select id="i-owner" class="form-input"><option value="me">내 소득</option><option value="family">가족 소득</option></select></div>` : '';
    const html = `
      ${ownerHtml}
      <div class="form-group"><label>항목명</label><input type="text" id="i-name" class="form-input" placeholder="예: 기타 수입"></div>
      <div class="form-group"><label>입금일</label><input type="number" id="i-date" class="form-input" placeholder="예: 20"></div>
      <div class="form-group"><label>공제액 (세금 등)</label><input type="text" inputmode="numeric" id="i-tax" class="form-input" placeholder="없으면 비워두세요"></div>
      <div class="form-group"><label>실수령액 (원)</label><input type="text" inputmode="numeric" id="i-amt" class="form-input" placeholder="금액 입력"></div>
    `;
    openModal('새 소득 등록', html, () => {
      let incomeObj = { id: Date.now(), name: document.getElementById('i-name').value, date: document.getElementById('i-date').value, taxAmount: getRawNumber(document.getElementById('i-tax').value) || 0, amount: getRawNumber(document.getElementById('i-amt').value) };
      if(appData.separateSalary) incomeObj.owner = document.getElementById('i-owner').value;
      appData.incomes.push(incomeObj); saveData(); window.closeModal();
    });
    attachCommaEvent('i-amt'); attachCommaEvent('i-tax');
  }
});

// AI OCR 등록
document.getElementById('ocr-upload').addEventListener('change', function(e) {
  if (e.target.files.length > 0) {
    document.getElementById('ocr-loading').style.display = 'flex';
    setTimeout(() => {
      document.getElementById('ocr-loading').style.display = 'none'; e.target.value = '';
      const mockGross = 3300000; const mockTax = 385000; const mockNet = mockGross - mockTax;
      const ownerHtml = appData.separateSalary ? `<div class="form-group"><label>누구의 소득인가요?</label><select id="ocr-owner" class="form-input"><option value="me">내 소득</option><option value="family">가족 소득</option></select></div>` : '';
      const html = `
        <p style="text-align:center; color:#3182F6; font-size:13px; font-weight:bold; margin-bottom:15px;">✨ 명세서 분석이 완료되었습니다!</p>
        ${ownerHtml}
        <div class="form-group"><label>항목명</label><input type="text" id="ocr-name" class="form-input" value="정기 급여"></div>
        <div class="form-group"><label>입금일</label><input type="number" id="ocr-date" class="form-input" value="${new Date().getDate()}"></div>
        <div style="background:var(--bg-color); padding:15px; border-radius:12px; margin-bottom:15px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;"><span>지급 총액</span><span>${formatMoney(mockGross)}</span></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px; color:#FF4B4B;"><span>세금 및 공제액</span><span>-${formatMoney(mockTax)}</span></div>
          <hr style="border:0; border-top:1px dashed var(--border-color); margin:10px 0;">
          <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:16px;"><span>실수령액</span><span class="blue-text">${formatMoney(mockNet)}</span></div>
        </div>
        <input type="hidden" id="ocr-tax" value="${mockTax}"><input type="hidden" id="ocr-net" value="${mockNet}">
      `;
      openModal('명세서 등록', html, () => {
        let incomeObj = { id: Date.now(), name: document.getElementById('ocr-name').value, date: document.getElementById('ocr-date').value, taxAmount: Number(document.getElementById('ocr-tax').value), amount: Number(document.getElementById('ocr-net').value) };
        if(appData.separateSalary) incomeObj.owner = document.getElementById('ocr-owner').value;
        appData.incomes.push(incomeObj); saveData(); window.closeModal();
      });
    }, 2000);
  }
});

/* ================= 7. 차트 및 관리 버튼 ================= */
let summaryChartInstance = null; let expenseChartInstance = null;
function renderAnalysis() {
  let totalIncome = 0; let totalExpense = 0; let categoryData = {};
  appData.incomes.forEach(i => totalIncome += Number(i.amount));
  appData.expenses.forEach(e => { const amt = Number(e.amount); totalExpense += amt; categoryData[e.category] = (categoryData[e.category] || 0) + amt; });

  if(summaryChartInstance) summaryChartInstance.destroy();
  summaryChartInstance = new Chart(document.getElementById('summaryChart'), { type: 'bar', data: { labels: ['수입', '지출'], datasets: [{ label: '금액', data: [totalIncome, totalExpense], backgroundColor: ['#3182F6', '#FF8BA7'], borderRadius: 8 }] }, options: { responsive: true, plugins: { legend: { display: false } } } });

  if(expenseChartInstance) expenseChartInstance.destroy();
  expenseChartInstance = new Chart(document.getElementById('expenseChart'), { type: 'doughnut', data: { labels: Object.keys(categoryData), datasets: [{ data: Object.values(categoryData), backgroundColor: ['#FF8BA7', '#FFC6D3', '#FFD8A8', '#FFECB3', '#DCE775', '#81C784', '#64B5F6', '#9575CD', '#F06292', '#E0E0E0'], borderWidth: 2 }] }, options: { responsive: true, plugins: { legend: { position: 'right' } } } });
}

const toggleSplitEl = document.getElementById('toggle-salary-split');
if(toggleSplitEl) toggleSplitEl.addEventListener('change', (e) => { appData.separateSalary = e.target.checked; saveData(); });

const isDark = localStorage.getItem('darkMode') === 'true';
if(isDark) { document.body.classList.add('dark-mode'); const tgDark = document.getElementById('toggle-dark-mode'); if(tgDark) tgDark.checked = true; }
const toggleDarkEl = document.getElementById('toggle-dark-mode');
if(toggleDarkEl) toggleDarkEl.addEventListener('change', (e) => {
  if(e.target.checked) { document.body.classList.add('dark-mode'); localStorage.setItem('darkMode', 'true'); }
  else { document.body.classList.remove('dark-mode'); localStorage.setItem('darkMode', 'false'); }
});

function renderSettingModal(title, arrayName, placeholder) {
  const arr = appData[arrayName];
  const tags = arr.map((val, idx) => `<span class="cat-tag delete" onclick="removeSettingItem('${arrayName}', ${idx})">${val} ✕</span>`).join('');
  const html = `<div style="margin-bottom:20px;">${tags}</div><div style="display:flex; gap:10px;"><input type="text" id="new-setting-input" class="form-input" placeholder="${placeholder}"><button class="pretty-btn coral-btn" style="width:80px; padding:10px;" onclick="addSettingItem('${arrayName}')">추가</button></div><button class="pretty-btn gray-btn" style="width:100%; margin-top:20px;" onclick="closeModal()">닫기</button>`;
  openModal(title, html, null, false); 
}

window.removeSettingItem = function(arrName, idx) {
  appData[arrName].splice(idx, 1); saveData();
  let t = '관리'; let p = '입력';
  if(arrName === 'categories') { t = '카테고리 관리'; p = '새 카테고리'; } if(arrName === 'paymentMethods') { t = '납부방법 관리'; p = '예: 자동이체'; }
  if(arrName === 'payAccounts') { t = '납부계좌 관리'; p = '예: 삼성카드'; } if(arrName === 'withdrawAccounts') { t = '출금계좌 관리'; p = '예: 신한 789'; }
  renderSettingModal(t, arrName, p);
};

window.addSettingItem = function(arrName) {
  const newVal = document.getElementById('new-setting-input').value.trim();
  if(newVal) { appData[arrName].push(newVal); saveData(); }
  let t = '관리'; let p = '입력';
  if(arrName === 'categories') { t = '카테고리 관리'; p = '새 카테고리'; } if(arrName === 'paymentMethods') { t = '납부방법 관리'; p = '예: 자동이체'; }
  if(arrName === 'payAccounts') { t = '납부계좌 관리'; p = '예: 삼성카드'; } if(arrName === 'withdrawAccounts') { t = '출금계좌 관리'; p = '예: 신한 789'; }
  renderSettingModal(t, arrName, p);
};

const elCat = document.getElementById('btn-manage-categories'); if(elCat) elCat.addEventListener('click', () => renderSettingModal('카테고리 관리', 'categories', '새 카테고리'));
const elPayM = document.getElementById('btn-manage-paymethod'); if(elPayM) elPayM.addEventListener('click', () => renderSettingModal('납부방법 관리', 'paymentMethods', '예: 자동이체'));
const elPayA = document.getElementById('btn-manage-pay-account'); if(elPayA) elPayA.addEventListener('click', () => renderSettingModal('납부계좌 관리', 'payAccounts', '예: 삼성카드'));
const elWithA = document.getElementById('btn-manage-withdraw-account'); if(elWithA) elWithA.addEventListener('click', () => renderSettingModal('출금계좌 관리', 'withdrawAccounts', '예: 신한 통장'));

const elLogout = document.getElementById('btn-logout');
if(elLogout) elLogout.addEventListener('click', () => { openModal('로그아웃', `<p style="text-align:center; color:#333; font-weight:500;">정말 로그아웃 하시겠습니까?</p>`, async () => { try { await signOut(auth); window.closeModal(); } catch (error) { alert("로그아웃 실패"); } }); });

const elReset = document.getElementById('btn-reset-data');
if(elReset) elReset.addEventListener('click', () => { openModal('데이터 초기화', `<p style="text-align:center; color:#FF4B4B; font-weight:bold;">모든 데이터를 삭제할까요?</p>`, async () => { appData = { expenses: [], incomes: [], categories: defaultCategories, paymentMethods: defaultPaymentMethods, payAccounts: defaultPayAccounts, withdrawAccounts: defaultWithdrawAccounts, widgetOrder: [], ledgerName: "월급 찍고 갑니다" }; await saveData(); window.closeModal(); alert('초기화 완료.'); location.reload(); }); });
