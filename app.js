import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

// 분리된 기본 계좌 데이터 세팅
const defaultCategories = ['집', '자동차', '대출', '개인', '보험', '어린이집', '공과금', '렌트', '통신', '기타'];
const defaultPayMethods = ['자동이체', '직접송금', '카카오페이', '신용카드'];
const defaultIncAccounts = ['미지정', '국민 111-222', '카카오 333']; // 입금계좌(소득)
const defaultExpAccounts = ['미지정', '신한 444-555', '농협 666']; // 출금계좌(지출)

let appData = { 
  expenses: [], incomes: [], categories: defaultCategories, 
  paymentMethods: defaultPayMethods, incAccounts: defaultIncAccounts, expAccounts: defaultExpAccounts, 
  widgetOrder: [] 
};
let isFirstLoad = true;

onSnapshot(docRef, (docSnap) => {
  if (docSnap.exists()) {
    appData = docSnap.data();
    // 호환성 유지 (새로운 배열이 없으면 기본값 주입)
    if(!appData.paymentMethods) appData.paymentMethods = defaultPayMethods;
    if(!appData.incAccounts) appData.incAccounts = defaultIncAccounts;
    if(!appData.expAccounts) appData.expAccounts = defaultExpAccounts;
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
  renderAnalysis(); // 차트 렌더링
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

window.toggleWidgetDetails = function(id) {
  const el = document.getElementById(id);
  el.style.display = (el.style.display === 'block') ? 'none' : 'block';
};

function updateHome() {
  const currentDay = new Date().getDate();
  document.getElementById('date-subtitle').textContent = `지출 예정 (오늘 ${currentDay}일)`;

  let totalIncome = 0; let paidAmount = 0; let unpaidAmount = 0; let expectedAmount = 0;
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
        htmlUnpaid += `<div class="mini-item"><span class="mini-item-name">${e.name} (${e.date}일)</span><span class="mini-item-amt red-text">${moneyStr}</span></div>`;
      } else {
        expectedAmount += amt;
        htmlExpected += `<div class="mini-item"><span class="mini-item-name">${e.name} (${e.date}일)</span><span class="mini-item-amt">${moneyStr}</span></div>`;
      }
    }
  });

  const remaining = totalIncome - (paidAmount + unpaidAmount + expectedAmount);

  document.getElementById('home-total-income').textContent = formatMoney(totalIncome);
  document.getElementById('home-paid-amount').textContent = formatMoney(paidAmount);
  document.getElementById('home-unpaid-amount').textContent = formatMoney(unpaidAmount);
  document.getElementById('home-expected-amount').textContent = formatMoney(expectedAmount);
  document.getElementById('home-balance').textContent = formatMoney(remaining);

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

  if (currentIndex === 3) renderAnalysis(); // 분석 탭 누르면 차트 그리기
}
navItems.forEach((item, idx) => item.addEventListener('click', () => switchTab(idx)));

let startX = 0; let endX = 0;
const appWrapper = document.getElementById('app-wrapper');
appWrapper.addEventListener('touchstart', e => startX = e.touches[0].clientX);
appWrapper.addEventListener('touchend', e => {
  endX = e.changedTouches[0].clientX;
  if (Math.abs(startX - endX) > 50) {
    if (startX - endX > 0) switchTab(currentIndex + 1);
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

/* ================= 5. 지출 로직 ================= */
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
        <p style="font-size:11px; color:#aaa; margin-top:2px;">[출금] ${item.account || '-'} / [방식] ${item.payMethod || '-'}</p>
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
    openModal('납부 취소', `<p style="text-align:center;">정말 <b>[${exp.name}]</b> 항목의 납부 완료를 취소할까요?</p>`, () => {
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
  const accOpts = appData.expAccounts.map(a => `<option value="${a}" ${a===exp.account?'selected':''}>${a}</option>`).join('');

  const html = `
    <div class="form-group"><label>카테고리</label><select id="e-cat" class="form-input">${catOpts}</select></div>
    <div class="form-group"><label>항목명</label><input type="text" id="e-name" class="form-input" value="${exp.name}"></div>
    <div class="form-group"><label>출금일</label><input type="number" id="e-date" class="form-input" value="${exp.date}"></div>
    <div class="form-group"><label>금액 (원)</label><input type="text" inputmode="numeric" id="e-amt" class="form-input" value="${Number(exp.amount).toLocaleString('ko-KR')}"></div>
    <div style="display:flex; gap:10px;">
      <div class="form-group" style="flex:1;"><label>결제수단</label><select id="e-paymethod" class="form-input">${payOpts}</select></div>
      <div class="form-group" style="flex:1;"><label>출금계좌</label><select id="e-account" class="form-input">${accOpts}</select></div>
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
  if(confirm('정말 삭제할까요?')) { appData.expenses = appData.expenses.filter(e => e.id !== id); saveData(); window.closeModal(); }
};


/* ================= 6. 소득 로직 (일반 등록 + OCR 분석) ================= */
const incomeList = document.getElementById('income-list');
function renderIncomes() {
  incomeList.innerHTML = '';
  appData.incomes.forEach(item => {
    const div = document.createElement('div');
    div.className = 'list-item';
    div.innerHTML = `
      <div class="item-info" onclick="editIncome(${item.id})">
        <h3 style="font-size:15px; margin-bottom:4px;">${item.name}</h3>
        <p style="font-size:12px; color:#888;">매월 ${item.date}일 | [입금] ${item.account || '-'}</p>
        ${item.taxAmount ? `<p style="font-size:11px; color:#FF4B4B; margin-top:2px;">세금/공제: -${formatMoney(item.taxAmount)}</p>` : ''}
      </div>
      <div class="bold-text blue-text">${formatMoney(item.amount)}</div>
    `;
    incomeList.appendChild(div);
  });
}

window.editIncome = function(id) {
  const inc = appData.incomes.find(i => i.id === id);
  if(!inc) return;
  const accOpts = appData.incAccounts.map(a => `<option value="${a}" ${a===inc.account?'selected':''}>${a}</option>`).join('');
  const html = `
    <div class="form-group"><label>항목명</label><input type="text" id="i-name" class="form-input" value="${inc.name}"></div>
    <div class="form-group"><label>입금일</label><input type="number" id="i-date" class="form-input" value="${inc.date}"></div>
    <div class="form-group"><label>입금계좌</label><select id="i-account" class="form-input">${accOpts}</select></div>
    <div class="form-group"><label>공제액 (세금 등)</label><input type="text" inputmode="numeric" id="i-tax" class="form-input" value="${inc.taxAmount ? Number(inc.taxAmount).toLocaleString('ko-KR') : ''}" placeholder="없으면 비워두세요"></div>
    <div class="form-group"><label>실수령액 (원)</label><input type="text" inputmode="numeric" id="i-amt" class="form-input" value="${Number(inc.amount).toLocaleString('ko-KR')}"></div>
    <button class="pretty-btn gray-btn" style="margin-top:10px; color:#D32F2F;" onclick="deleteIncome(${inc.id})">🗑️ 삭제</button>
  `;
  openModal('소득 수정', html, () => {
    inc.name = document.getElementById('i-name').value;
    inc.date = document.getElementById('i-date').value;
    inc.account = document.getElementById('i-account').value;
    inc.taxAmount = getRawNumber(document.getElementById('i-tax').value) || 0;
    inc.amount = getRawNumber(document.getElementById('i-amt').value);
    saveData(); window.closeModal();
  });
  attachCommaEvent('i-amt'); attachCommaEvent('i-tax');
};

window.deleteIncome = function(id) {
  if(confirm('정말 삭제할까요?')) { appData.incomes = appData.incomes.filter(i => i.id !== id); saveData(); window.closeModal(); }
};

// 플로팅 (+) 버튼 클릭 처리
fabBtn.addEventListener('click', () => {
  if (currentIndex === 2) {
    // 지출 추가 폼
    const catOpts = appData.categories.map(c => `<option value="${c}">${c}</option>`).join('');
    const payOpts = appData.paymentMethods.map(p => `<option value="${p}">${p}</option>`).join('');
    const accOpts = appData.expAccounts.map(a => `<option value="${a}">${a}</option>`).join('');

    const html = `
      <div class="form-group"><label>카테고리</label><select id="e-cat" class="form-input">${catOpts}</select></div>
      <div class="form-group"><label>항목명</label><input type="text" id="e-name" class="form-input" placeholder="예: 월세"></div>
      <div class="form-group"><label>출금일</label><input type="number" id="e-date" class="form-input" placeholder="숫자 (예: 20)"></div>
      <div class="form-group"><label>금액 (원)</label><input type="text" inputmode="numeric" id="e-amt" class="form-input" placeholder="금액 입력"></div>
      <div style="display:flex; gap:10px;">
        <div class="form-group" style="flex:1;"><label>결제수단</label><select id="e-paymethod" class="form-input">${payOpts}</select></div>
        <div class="form-group" style="flex:1;"><label>출금계좌</label><select id="e-account" class="form-input">${accOpts}</select></div>
      </div>
    `;
    openModal('새 지출 등록', html, () => {
      const rawAmt = getRawNumber(document.getElementById('e-amt').value);
      if (!rawAmt) return alert("금액을 입력해주세요.");
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
    // 일반 소득 추가 폼
    const accOpts = appData.incAccounts.map(a => `<option value="${a}">${a}</option>`).join('');
    const html = `
      <div class="form-group"><label>항목명</label><input type="text" id="i-name" class="form-input" placeholder="예: 급여"></div>
      <div class="form-group"><label>입금일</label><input type="number" id="i-date" class="form-input" placeholder="예: 20"></div>
      <div class="form-group"><label>입금계좌</label><select id="i-account" class="form-input">${accOpts}</select></div>
      <div class="form-group"><label>공제액 (세금 등)</label><input type="text" inputmode="numeric" id="i-tax" class="form-input" placeholder="없으면 비워두세요"></div>
      <div class="form-group"><label>실수령액 (원)</label><input type="text" inputmode="numeric" id="i-amt" class="form-input" placeholder="금액 입력"></div>
    `;
    openModal('새 소득 등록', html, () => {
      appData.incomes.push({ 
        id: Date.now(), name: document.getElementById('i-name').value, 
        date: document.getElementById('i-date').value, account: document.getElementById('i-account').value,
        taxAmount: getRawNumber(document.getElementById('i-tax').value) || 0, amount: getRawNumber(document.getElementById('i-amt').value) 
      });
      saveData(); window.closeModal();
    });
    attachCommaEvent('i-amt'); attachCommaEvent('i-tax');
  }
});

// 🌟 AI 급여명세서 OCR 시뮬레이션 로직
document.getElementById('ocr-upload').addEventListener('change', function(e) {
  if (e.target.files.length > 0) {
    // 로딩창 띄우기
    const loadingOverlay = document.getElementById('ocr-loading');
    loadingOverlay.style.display = 'flex';
    
    // 2초 후 (AI 분석 완료 시뮬레이션) 로딩 끄고 결과 모달 띄우기
    setTimeout(() => {
      loadingOverlay.style.display = 'none';
      e.target.value = ''; // 파일 초기화

      const accOpts = appData.incAccounts.map(a => `<option value="${a}">${a}</option>`).join('');
      // 분석된 목업 데이터 (실제로는 여기서 API 결과를 변수에 담습니다)
      const mockGross = 3300000;
      const mockTax = 385000;
      const mockNet = mockGross - mockTax;

      const html = `
        <p style="text-align:center; color:#3182F6; font-size:13px; font-weight:bold; margin-bottom:15px;">✨ 명세서 분석이 완료되었습니다!</p>
        <div class="form-group"><label>항목명</label><input type="text" id="ocr-name" class="form-input" value="정기 급여"></div>
        <div class="form-group"><label>입금일</label><input type="number" id="ocr-date" class="form-input" value="${new Date().getDate()}"></div>
        <div class="form-group"><label>입금계좌</label><select id="ocr-account" class="form-input">${accOpts}</select></div>
        
        <div style="background:#f9f9f9; padding:15px; border-radius:12px; margin-bottom:15px; border:1px solid #eee;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px;"><span>지급 총액</span><span>${formatMoney(mockGross)}</span></div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px; color:#FF4B4B;"><span>세금 및 공제액</span><span>-${formatMoney(mockTax)}</span></div>
          <hr style="border:0; border-top:1px dashed #ccc; margin:10px 0;">
          <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:16px;"><span>실수령액</span><span class="blue-text">${formatMoney(mockNet)}</span></div>
        </div>

        <input type="hidden" id="ocr-tax" value="${mockTax}">
        <input type="hidden" id="ocr-net" value="${mockNet}">
      `;
      openModal('명세서 분석 결과', html, () => {
        appData.incomes.push({ 
          id: Date.now(), name: document.getElementById('ocr-name').value, 
          date: document.getElementById('ocr-date').value, account: document.getElementById('ocr-account').value,
          taxAmount: Number(document.getElementById('ocr-tax').value), amount: Number(document.getElementById('ocr-net').value) 
        });
        saveData(); window.closeModal();
      });
    }, 2000); // 2초 대기
  }
});


/* ================= 7. 차트 분석 (Chart.js) ================= */
let summaryChartInstance = null;
let expenseChartInstance = null;

function renderAnalysis() {
  let totalIncome = 0; let totalExpense = 0;
  let categoryData = {};

  appData.incomes.forEach(i => totalIncome += Number(i.amount));
  appData.expenses.forEach(e => {
    const amt = Number(e.amount);
    totalExpense += amt;
    categoryData[e.category] = (categoryData[e.category] || 0) + amt;
  });

  // 1. 수입 vs 지출 바 차트
  const ctxSummary = document.getElementById('summaryChart');
  if(summaryChartInstance) summaryChartInstance.destroy();
  summaryChartInstance = new Chart(ctxSummary, {
    type: 'bar',
    data: {
      labels: ['수입', '지출'],
      datasets: [{
        label: '금액',
        data: [totalIncome, totalExpense],
        backgroundColor: ['#3182F6', '#FF8BA7'],
        borderRadius: 8
      }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // 2. 카테고리별 지출 도넛 차트
  const ctxExpense = document.getElementById('expenseChart');
  if(expenseChartInstance) expenseChartInstance.destroy();
  
  const catLabels = Object.keys(categoryData);
  const catValues = Object.values(categoryData);
  
  expenseChartInstance = new Chart(ctxExpense, {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{
        data: catValues,
        backgroundColor: ['#FF8BA7', '#FFC6D3', '#FFD8A8', '#FFECB3', '#DCE775', '#81C784', '#64B5F6', '#9575CD', '#F06292', '#E0E0E0'],
        borderWidth: 2
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'right' } } }
  });
}


/* ================= 8. 설정 (카테고리/계좌 관리) ================= */
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
  appData[arrName].splice(idx, 1); saveData();
  let title = '관리'; let p = '입력';
  if(arrName === 'categories') { title = '카테고리 관리'; p = '새 카테고리'; }
  if(arrName === 'paymentMethods') { title = '결제수단 관리'; p = '예: 카카오페이'; }
  if(arrName === 'incAccounts') { title = '입금계좌 관리'; p = '예: 국민 123-456'; }
  if(arrName === 'expAccounts') { title = '출금계좌 관리'; p = '예: 신한 789-012'; }
  renderSettingModal(title, arrName, p);
};

window.addSettingItem = function(arrName) {
  const newVal = document.getElementById('new-setting-input').value.trim();
  if(newVal) { appData[arrName].push(newVal); saveData(); }
  let title = '관리'; let p = '입력';
  if(arrName === 'categories') { title = '카테고리 관리'; p = '새 카테고리'; }
  if(arrName === 'paymentMethods') { title = '결제수단 관리'; p = '예: 카카오페이'; }
  if(arrName === 'incAccounts') { title = '입금계좌 관리'; p = '예: 국민 123-456'; }
  if(arrName === 'expAccounts') { title = '출금계좌 관리'; p = '예: 신한 789-012'; }
  renderSettingModal(title, arrName, p);
};

document.getElementById('btn-manage-categories').addEventListener('click', () => renderSettingModal('카테고리 관리', 'categories', '새 카테고리'));
document.getElementById('btn-manage-paymethod').addEventListener('click', () => renderSettingModal('결제수단 관리', 'paymentMethods', '예: 카카오페이'));
document.getElementById('btn-manage-inc-account').addEventListener('click', () => renderSettingModal('입금계좌 관리', 'incAccounts', '예: 국민 123-456'));
document.getElementById('btn-manage-exp-account').addEventListener('click', () => renderSettingModal('출금계좌 관리', 'expAccounts', '예: 신한 789-012'));

document.getElementById('btn-reset-data').addEventListener('click', () => {
  openModal('데이터 초기화 경고', `<p style="text-align:center; color:#FF4B4B; font-weight:bold;">정말 모든 데이터를 삭제하시겠습니까?</p>`, async () => {
      appData = { expenses: [], incomes: [], categories: defaultCategories, paymentMethods: defaultPayMethods, incAccounts: defaultIncAccounts, expAccounts: defaultExpAccounts, widgetOrder: [] };
      await saveData(); window.closeModal(); alert('초기화 완료.'); location.reload();
  });
});

/* ================= 9. 인증 및 로그아웃 ================= */
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
