import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

/* ================= 1. 파이어베이스 및 데이터 초기화 ================= */
const firebaseConfig = {
  apiKey: "AIzaSyCG86jGSCHmadOn4_LdymWtT37XMEA4EFE",
  authDomain: "dnjfrmq.firebaseapp.com",
  projectId: "dnjfrmq",
  storageBucket: "dnjfrmq.firebasestorage.app",
  messagingSenderId: "942049894622",
  appId: "1:942049894622:web:8dc62411fac925e5b1224f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const docRef = doc(db, "household", "myHome");

// 기본 데이터 세팅
const defaultCategories = ['집', '자동차', '대출', '개인', '보험', '어린이집', '공과금', '렌트', '통신', '기타'];
const defaultPayMethods = ['자동이체', '직접납부', '카카오페이', '신용카드'];
const defaultAccounts = ['미지정', '국민 111-222', '신한 333-444'];

let appData = { expenses: [], incomes: [], categories: defaultCategories, paymentMethods: defaultPayMethods, accounts: defaultAccounts, widgetOrder: [] };
let isFirstLoad = true;

onSnapshot(docRef, (docSnap) => {
  if (docSnap.exists()) {
    appData = docSnap.data();
    // 과거 데이터 호환성 유지 (새로운 배열이 없으면 기본값 주입)
    if(!appData.paymentMethods) appData.paymentMethods = defaultPayMethods;
    if(!appData.accounts) appData.accounts = defaultAccounts;
  } else {
    setDoc(docRef, appData);
  }

  if (isFirstLoad) {
    applyWidgetOrder();
    isFirstLoad = false;
  }

  updateHome();
  renderExpenses();
  renderIncomes();
});

function saveData() { setDoc(docRef, appData); }
function formatMoney(num) { return Number(num).toLocaleString() + ' 원'; }
function getRawNumber(val) { return Number(val.replace(/,/g, '')); }
function attachCommaEvent(inputId) {
  const input = document.getElementById(inputId);
  if(!input) return;
  input.addEventListener('input', function(e) {
    let val = e.target.value.replace(/[^0-9]/g, ''); 
    e.target.value = val ? Number(val).toLocaleString('ko-KR') : '';
  });
}

/* ================= 2. 위젯 순서 및 홈 갱신 (펼침 기능 포함) ================= */
function applyWidgetOrder() {
  if (appData.widgetOrder && appData.widgetOrder.length > 0) {
    const container = document.getElementById('tab-home');
    appData.widgetOrder.forEach(id => {
      const el = document.getElementById(id);
      if (el) container.appendChild(el);
    });
  }
}

new Sortable(document.getElementById('tab-home'), {
  handle: '.drag-handle',
  animation: 150,
  onEnd: function () {
    const order = Array.from(document.getElementById('tab-home').querySelectorAll('.widget')).map(el => el.id);
    appData.widgetOrder = order;
    saveData();
  }
});

// 전역 함수로 펼침 토글
window.toggleWidgetDetails = function(id) {
  const el = document.getElementById(id);
  if (el.style.display === 'block') {
    el.style.display = 'none';
  } else {
    el.style.display = 'block';
  }
};

function updateHome() {
  const currentDay = new Date().getDate();
  document.getElementById('date-subtitle').textContent = `지출 예정 (오늘 ${currentDay}일 기준)`;

  let totalIncome = 0; let paidAmount = 0; let unpaidAmount = 0; let expectedAmount = 0;
  
  // 미니 리스트 HTML 저장소
  let htmlIncome = ''; let htmlPaid = ''; let htmlUnpaid = ''; let htmlExpected = '';

  appData.incomes.forEach(i => {
    totalIncome += Number(i.amount);
    htmlIncome += `<div class="mini-item"><span class="mini-item-name">${i.name}</span><span class="mini-item-amt blue-text">${formatMoney(i.amount)}</span></div>`;
  });
  
  appData.expenses.forEach(e => {
    const amt = Number(e.amount);
    const moneyStr = formatMoney(amt);
    if(e.isPaid) {
      paidAmount += amt;
      htmlPaid += `<div class="mini-item"><span class="mini-item-name">${e.name}</span><span class="mini-item-amt green-text">${moneyStr}</span></div>`;
    } else {
      if(Number(e.date) < currentDay) {
        unpaidAmount += amt;
        htmlUnpaid += `<div class="mini-item"><span class="mini-item-name">${e.name} (매월 ${e.date}일)</span><span class="mini-item-amt red-text">${moneyStr}</span></div>`;
      } else {
        expectedAmount += amt;
        htmlExpected += `<div class="mini-item"><span class="mini-item-name">${e.name} (매월 ${e.date}일)</span><span class="mini-item-amt">${moneyStr}</span></div>`;
      }
    }
  });

  const remaining = totalIncome - (paidAmount + unpaidAmount + expectedAmount);

  // 금액 갱신
  document.getElementById('home-total-income').textContent = formatMoney(totalIncome);
  document.getElementById('home-paid-amount').textContent = formatMoney(paidAmount);
  document.getElementById('home-unpaid-amount').textContent = formatMoney(unpaidAmount);
  document.getElementById('home-expected-amount').textContent = formatMoney(expectedAmount);
  document.getElementById('home-balance').textContent = formatMoney(remaining);

  // 미니 리스트 갱신 (비어있으면 안내문구)
  document.getElementById('details-income').innerHTML = htmlIncome || '<p style="font-size:12px; color:#aaa; text-align:center;">내역이 없습니다.</p>';
  document.getElementById('details-paid').innerHTML = htmlPaid || '<p style="font-size:12px; color:#aaa; text-align:center;">내역이 없습니다.</p>';
  document.getElementById('details-unpaid').innerHTML = htmlUnpaid || '<p style="font-size:12px; color:#aaa; text-align:center;">내역이 없습니다.</p>';
  document.getElementById('details-expected').innerHTML = htmlExpected || '<p style="font-size:12px; color:#aaa; text-align:center;">내역이 없습니다.</p>';
}

/* ================= 3. 실시간 시계 ================= */
function updateClock() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  
  const clockEl = document.getElementById('header-clock');
  if (clockEl) clockEl.innerHTML = `${m}월 <span class="big-day">${d}일</span><br>${h}:${min}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

/* ================= 4. 화면 전환 및 모달 ================= */
const navItems = document.querySelectorAll('.nav-item');
const tabSections = document.querySelectorAll('.tab-section');
const tabNames = ['월급 찍고 갑니다', '소득', '지출', '분석', '설정'];
const fabBtn = document.getElementById('btn-floating-add');
let currentIndex = 0;

function switchTab(idx) {
  if(idx < 0 || idx >= tabSections.length) return;
  currentIndex = idx;
  
  navItems.forEach(nav => nav.classList.remove('active'));
  tabSections.forEach(sec => sec.classList.remove('active'));
  
  navItems[currentIndex].classList.add('active');
  tabSections[currentIndex].classList.add('active');
  document.getElementById('header-title').textContent = tabNames[currentIndex];

  if (currentIndex === 1 || currentIndex === 2) fabBtn.style.display = 'flex';
  else fabBtn.style.display = 'none';
}
navItems.forEach((item, idx) => item.addEventListener('click', () => switchTab(idx)));

let startX = 0; let endX = 0;
const appWrapper = document.getElementById('app-wrapper');
appWrapper.addEventListener('touchstart', e => startX = e.touches[0].clientX);
appWrapper.addEventListener('touchend', e => {
  endX = e.changedTouches[0].clientX;
  const diff = startX - endX;
  if (Math.abs(diff) > 50) {
    if (diff > 0) switchTab(currentIndex + 1);
    else switchTab(currentIndex - 1);
  }
});

const modal = document.getElementById('custom-modal');
const mTitle = document.getElementById('modal-title');
const mBody = document.getElementById('modal-body');
const mConfirm = document.getElementById('modal-confirm');
let confirmAction = null;

function openModal(title, html, onConfirm, showBtns = true) {
  mTitle.textContent = title;
  mBody.innerHTML = html;
  document.getElementById('modal-action-btns').style.display = showBtns ? 'flex' : 'none';
  confirmAction = onConfirm;
  modal.classList.add('show');
}
window.closeModal = function() { modal.classList.remove('show'); };
modal.addEventListener('click', e => { if (e.target === modal) window.closeModal(); });
document.getElementById('modal-cancel').addEventListener('click', window.closeModal);
mConfirm.onclick = () => { if(confirmAction) confirmAction(); };

/* ================= 5. 지출 로직 (납부방법/계좌 추가) ================= */
const expenseList = document.getElementById('expense-list');
function renderExpenses() {
  expenseList.innerHTML = '';
  const sortedExpenses = [...appData.expenses].sort((a, b) => {
    if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
    return Number(a.date) - Number(b.date);
  });

  sortedExpenses.forEach(item => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div class="item-info" onclick="editExpense(${item.id})">
        <h3 style="font-size:15px; margin-bottom:4px; ${item.isPaid ? 'text-decoration:line-through; color:#aaa;' : ''}">${item.name}</h3>
        <p style="font-size:12px; color:#888;">${item.category} | 매월 ${item.date}일</p>
        <p style="font-size:11px; color:#aaa; margin-top:2px;">${item.payMethod || '-'} / ${item.account || '-'}</p>
        <div style="font-weight:bold; margin-top:5px; color:${item.isPaid ? '#aaa' : '#333'};">${formatMoney(item.amount)}</div>
      </div>
      <div class="item-action">
        <button class="pay-btn ${item.isPaid ? 'paid' : ''}" onclick="togglePaid(${item.id})">
          ${item.isPaid ? '납부완료 ✓' : '납부 대기'}
        </button>
        ${item.isPaid && item.paidAt ? `<span class="paid-time">${item.paidAt}</span>` : ''}
      </div>
    `;
    expenseList.appendChild(div);
  });
}

window.togglePaid = function(id) {
  const exp = appData.expenses.find(e => e.id === id);
  if(!exp) return;

  if (exp.isPaid) {
    openModal('납부 취소', `<p style="text-align:center; color:#333;">정말 <b>[${exp.name}]</b> 항목의<br>납부 완료 상태를 취소하시겠습니까?</p>`, () => {
      exp.isPaid = false; exp.paidAt = null; saveData(); window.closeModal();
    });
  } else {
    exp.isPaid = true;
    const now = new Date();
    exp.paidAt = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    saveData(); 
  }
};

window.editExpense = function(id) {
  const exp = appData.expenses.find(e => e.id === id);
  if(!exp) return;
  
  const catOpts = appData.categories.map(c => `<option value="${c}" ${c===exp.category?'selected':''}>${c}</option>`).join('');
  const payOpts = appData.paymentMethods.map(p => `<option value="${p}" ${p===exp.payMethod?'selected':''}>${p}</option>`).join('');
  const accOpts = appData.accounts.map(a => `<option value="${a}" ${a===exp.account?'selected':''}>${a}</option>`).join('');

  const html = `
    <div class="form-group"><label>카테고리</label><select id="e-cat" class="form-input">${catOpts}</select></div>
    <div class="form-group"><label>항목명</label><input type="text" id="e-name" class="form-input" value="${exp.name}"></div>
    <div class="form-group"><label>출금일</label><input type="number" id="e-date" class="form-input" value="${exp.date}"></div>
    <div class="form-group"><label>금액 (원)</label><input type="text" inputmode="numeric" id="e-amt" class="form-input" value="${Number(exp.amount).toLocaleString('ko-KR')}"></div>
    
    <div style="display:flex; gap:10px;">
      <div class="form-group" style="flex:1;"><label>납부방법</label><select id="e-paymethod" class="form-input">${payOpts}</select></div>
      <div class="form-group" style="flex:1;"><label>계좌번호</label><select id="e-account" class="form-input">${accOpts}</select></div>
    </div>
    
    <button class="pretty-btn gray-btn" style="margin-top:10px; color:#D32F2F;" onclick="deleteExpense(${exp.id})">🗑️ 이 항목 삭제하기</button>
  `;
  openModal('지출 수정', html, () => {
    exp.category = document.getElementById('e-cat').value;
    exp.name = document.getElementById('e-name').value;
    exp.date = document.getElementById('e-date').value;
    exp.amount = getRawNumber(document.getElementById('e-amt').value);
    exp.payMethod = document.getElementById('e-paymethod').value;
    exp.account = document.getElementById('e-account').value;
    saveData(); window.closeModal();
  });
  attachCommaEvent('e-amt'); 
};

window.deleteExpense = function(id) {
  if(confirm('정말 삭제할까요?')) {
    appData.expenses = appData.expenses.filter(e => e.id !== id);
    saveData(); window.closeModal();
  }
};

fabBtn.addEventListener('click', () => {
  if (currentIndex === 2) {
    const catOpts = appData.categories.map(c => `<option value="${c}">${c}</option>`).join('');
    const payOpts = appData.paymentMethods.map(p => `<option value="${p}">${p}</option>`).join('');
    const accOpts = appData.accounts.map(a => `<option value="${a}">${a}</option>`).join('');

    const html = `
      <div class="form-group"><label>카테고리</label><select id="e-cat" class="form-input">${catOpts}</select></div>
      <div class="form-group"><label>항목명</label><input type="text" id="e-name" class="form-input" placeholder="예: 월세"></div>
      <div class="form-group"><label>출금일</label><input type="number" id="e-date" class="form-input" placeholder="숫자 (예: 20)"></div>
      <div class="form-group"><label>금액 (원)</label><input type="text" inputmode="numeric" id="e-amt" class="form-input" placeholder="금액 입력"></div>
      
      <div style="display:flex; gap:10px;">
        <div class="form-group" style="flex:1;"><label>납부방법</label><select id="e-paymethod" class="form-input">${payOpts}</select></div>
        <div class="form-group" style="flex:1;"><label>계좌번호</label><select id="e-account" class="form-input">${accOpts}</select></div>
      </div>
    `;
    openModal('새 지출 등록', html, () => {
      const rawAmt = getRawNumber(document.getElementById('e-amt').value);
      if (!rawAmt) return alert("금액을 정확히 입력해주세요.");
      appData.expenses.push({
        id: Date.now(), category: document.getElementById('e-cat').value,
        name: document.getElementById('e-name').value, date: document.getElementById('e-date').value,
        amount: rawAmt, payMethod: document.getElementById('e-paymethod').value, account: document.getElementById('e-account').value,
        isPaid: false, paidAt: null
      });
      saveData(); window.closeModal();
    });
    attachCommaEvent('e-amt');
  } else if (currentIndex === 1) {
    const html = `
      <div class="form-group"><label>항목명</label><input type="text" id="i-name" class="form-input" placeholder="예: 급여"></div>
      <div class="form-group"><label>입금일</label><input type="number" id="i-date" class="form-input" placeholder="예: 20"></div>
      <div class="form-group"><label>금액 (원)</label><input type="text" inputmode="numeric" id="i-amt" class="form-input" placeholder="금액 입력"></div>
    `;
    openModal('새 소득 등록', html, () => {
      appData.incomes.push({ 
        id: Date.now(), name: document.getElementById('i-name').value, 
        date: document.getElementById('i-date').value, amount: getRawNumber(document.getElementById('i-amt').value) 
      });
      saveData(); window.closeModal();
    });
    attachCommaEvent('i-amt');
  }
});


/* ================= 6. 소득 로직 ================= */
const incomeList = document.getElementById('income-list');
function renderIncomes() {
  incomeList.innerHTML = '';
  appData.incomes.forEach(item => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div class="item-info" onclick="editIncome(${item.id})">
        <h3 style="font-size:15px; margin-bottom:4px;">${item.name}</h3>
        <p style="font-size:12px; color:#888;">매월 ${item.date}일</p>
      </div>
      <div class="bold-text blue-text">${formatMoney(item.amount)}</div>
    `;
    incomeList.appendChild(div);
  });
}

window.editIncome = function(id) {
  const inc = appData.incomes.find(i => i.id === id);
  if(!inc) return;
  const html = `
    <div class="form-group"><label>항목명</label><input type="text" id="i-name" class="form-input" value="${inc.name}"></div>
    <div class="form-group"><label>입금일</label><input type="number" id="i-date" class="form-input" value="${inc.date}"></div>
    <div class="form-group"><label>금액 (원)</label><input type="text" inputmode="numeric" id="i-amt" class="form-input" value="${Number(inc.amount).toLocaleString('ko-KR')}"></div>
    <button class="pretty-btn gray-btn" style="margin-top:10px; color:#D32F2F;" onclick="deleteIncome(${inc.id})">🗑️ 삭제</button>
  `;
  openModal('소득 수정', html, () => {
    inc.name = document.getElementById('i-name').value;
    inc.date = document.getElementById('i-date').value;
    inc.amount = getRawNumber(document.getElementById('i-amt').value);
    saveData(); window.closeModal();
  });
  attachCommaEvent('i-amt');
};
window.deleteIncome = function(id) { if(confirm('정말 삭제할까요?')) { appData.incomes = appData.incomes.filter(i => i.id !== id); saveData(); window.closeModal(); } };


/* ================= 7. 설정 (카테고리/납부수단/계좌) ================= */
// 공통 리스트 관리 모달 생성 함수
function renderSettingModal(title, arrayName, placeholder) {
  const arr = appData[arrayName];
  const tags = arr.map((val, idx) => `<span class="cat-tag delete" onclick="removeSettingItem('${arrayName}', ${idx})">${val} ✕</span>`).join('');
  const html = `
    <div style="margin-bottom:20px;">${tags}</div>
    <div style="display:flex; gap:10px;">
      <input type="text" id="new-setting-input" class="form-input" placeholder="${placeholder}">
      <button class="pretty-btn coral-btn" style="width:80px; padding:10px;" onclick="addSettingItem('${arrayName}')">추가</button>
    </div>
    <p style="font-size:12px; color:#888; margin-top:10px; margin-bottom: 20px;">태그를 누르면 삭제됩니다.</p>
    <button class="pretty-btn gray-btn" style="width:100%;" onclick="closeModal()">닫기</button>
  `;
  openModal(title, html, null, false); 
}

window.removeSettingItem = function(arrName, idx) {
  appData[arrName].splice(idx, 1);
  saveData();
  // 다시 모달 렌더링을 위해 타이틀 유추
  let title = '관리'; let p = '입력';
  if(arrName === 'categories') { title = '카테고리 관리'; p = '새 카테고리'; }
  if(arrName === 'paymentMethods') { title = '납부방법 관리'; p = '예: 카카오페이'; }
  if(arrName === 'accounts') { title = '계좌번호 관리'; p = '예: 국민 123-456'; }
  renderSettingModal(title, arrName, p);
};

window.addSettingItem = function(arrName) {
  const newVal = document.getElementById('new-setting-input').value.trim();
  if(newVal) { appData[arrName].push(newVal); saveData(); }
  let title = '관리'; let p = '입력';
  if(arrName === 'categories') { title = '카테고리 관리'; p = '새 카테고리'; }
  if(arrName === 'paymentMethods') { title = '납부방법 관리'; p = '예: 카카오페이'; }
  if(arrName === 'accounts') { title = '계좌번호 관리'; p = '예: 국민 123-456'; }
  renderSettingModal(title, arrName, p);
};

// 각 버튼 클릭 시 모달 열기
document.getElementById('btn-manage-categories').addEventListener('click', () => renderSettingModal('카테고리 관리', 'categories', '새 카테고리'));
document.getElementById('btn-manage-paymethod').addEventListener('click', () => renderSettingModal('납부방법 관리', 'paymentMethods', '예: 카카오페이'));
document.getElementById('btn-manage-account').addEventListener('click', () => renderSettingModal('계좌번호 관리', 'accounts', '예: 국민 123-456'));

document.getElementById('btn-reset-data').addEventListener('click', () => {
  openModal('데이터 초기화 경고', `<p style="text-align:center; color:#FF4B4B; font-weight:bold;">정말 모든 데이터를 삭제하시겠습니까?</p>`, async () => {
      appData = { expenses: [], incomes: [], categories: defaultCategories, paymentMethods: defaultPayMethods, accounts: defaultAccounts, widgetOrder: [] };
      await saveData(); window.closeModal(); alert('초기화 완료.'); location.reload();
  });
});

/* ================= 8. 인증 및 로그아웃 ================= */
onAuthStateChanged(auth, (user) => {
  const emailEl = document.getElementById('header-user-email');
  if (user) {
    if (emailEl) {
      const displayName = user.displayName || (user.email ? user.email.split('@')[0] : "사용자");
      emailEl.textContent = displayName;
    }
  } else {
    window.location.href = "main.html";
  }
});

document.getElementById('btn-logout').addEventListener('click', () => {
  openModal('로그아웃', `<p style="text-align:center; color:#333; font-weight:500;">정말 로그아웃 하시겠습니까?</p>`, async () => {
      try { await signOut(auth); window.closeModal(); } catch (error) { alert("로그아웃 실패"); }
  });
});
