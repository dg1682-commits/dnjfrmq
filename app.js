import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
const docRef = doc(db, "household", "myHome"); // 데이터베이스 저장소 이름

const defaultCategories = ['집', '자동차', '대출', '개인', '보험', '어린이집', '공과금', '렌트', '통신', '기타'];
let appData = { expenses: [], incomes: [], categories: defaultCategories, widgetOrder: [] };
let isFirstLoad = true;

// 파이어베이스 실시간 연동 (데이터가 바뀌면 화면 즉시 갱신)
onSnapshot(docRef, (docSnap) => {
  if (docSnap.exists()) {
    appData = docSnap.data();
  } else {
    // 최초 실행 시 기본 데이터베이스 생성
    setDoc(docRef, appData);
  }

  // 처음 불러올 때만 저장된 위젯 순서를 적용 (드래그 중 튕김 방지)
  if (isFirstLoad) {
    applyWidgetOrder();
    isFirstLoad = false;
  }

  updateHome();
  renderExpenses();
  renderIncomes();
});

function saveData() {
  setDoc(docRef, appData); // 로컬 스토리지가 아닌 파이어베이스에 저장
}

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


/* ================= 2. 위젯 순서 및 홈 화면 갱신 ================= */
function applyWidgetOrder() {
  if (appData.widgetOrder && appData.widgetOrder.length > 0) {
    const container = document.getElementById('tab-home');
    appData.widgetOrder.forEach(id => {
      const el = document.getElementById(id);
      if (el) container.appendChild(el);
    });
  }
}

// 위젯 드래그 앤 드롭 및 순서 파이어베이스 저장
new Sortable(document.getElementById('tab-home'), {
  handle: '.drag-handle',
  animation: 150,
  onEnd: function () {
    const order = Array.from(document.getElementById('tab-home').querySelectorAll('.widget')).map(el => el.id);
    appData.widgetOrder = order;
    saveData();
  }
});

function updateHome() {
  const currentDay = new Date().getDate();
  document.getElementById('date-subtitle').textContent = `지출 예정 (오늘 ${currentDay}일 기준)`;

  let totalIncome = 0; let paidAmount = 0; let unpaidAmount = 0; let expectedAmount = 0;
  appData.incomes.forEach(i => totalIncome += Number(i.amount));
  appData.expenses.forEach(e => {
    const amt = Number(e.amount);
    if(e.isPaid) {
      paidAmount += amt;
    } else {
      if(Number(e.date) < currentDay) unpaidAmount += amt;
      else expectedAmount += amt;
    }
  });

  const remaining = totalIncome - (paidAmount + unpaidAmount + expectedAmount);

  document.getElementById('home-total-income').textContent = formatMoney(totalIncome);
  document.getElementById('home-paid-amount').textContent = formatMoney(paidAmount);
  document.getElementById('home-unpaid-amount').textContent = formatMoney(unpaidAmount);
  document.getElementById('home-expected-amount').textContent = formatMoney(expectedAmount);
  document.getElementById('home-balance').textContent = formatMoney(remaining);
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
  if (clockEl) {
    clockEl.innerHTML = `${m}월 <span class="big-day">${d}일</span><br>${h}:${min}:${s}`;
  }
}
setInterval(updateClock, 1000);
updateClock();


/* ================= 4. 화면 전환 및 모달 ================= */
const navItems = document.querySelectorAll('.nav-item');
const tabSections = document.querySelectorAll('.tab-section');
const tabNames = ['월급 찍고 갑니다', '소득', '지출', '분석', '설정'];
let currentIndex = 0;

function switchTab(idx) {
  if(idx < 0 || idx >= tabSections.length) return;
  currentIndex = idx;
  navItems.forEach(nav => nav.classList.remove('active'));
  tabSections.forEach(sec => sec.classList.remove('active'));
  navItems[currentIndex].classList.add('active');
  tabSections[currentIndex].classList.add('active');
  document.getElementById('header-title').textContent = tabNames[currentIndex];
}
navItems.forEach((item, idx) => item.addEventListener('click', () => switchTab(idx)));

let startX = 0; let endX = 0;
document.getElementById('app-content').addEventListener('touchstart', e => startX = e.touches[0].clientX);
document.getElementById('app-content').addEventListener('touchend', e => {
  endX = e.changedTouches[0].clientX;
  if(startX - endX > 60) switchTab(currentIndex + 1);
  else if(endX - startX > 60) switchTab(currentIndex - 1);
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
    openModal('납부 취소', `<p style="text-align:center;">정말 <b>[${exp.name}]</b> 항목의<br>납부 완료 상태를 취소하시겠습니까?</p>`, () => {
      exp.isPaid = false;
      exp.paidAt = null;
      saveData(); window.closeModal();
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
  const opts = appData.categories.map(c => `<option value="${c}" ${c===exp.category?'selected':''}>${c}</option>`).join('');
  const html = `
    <div class="form-group"><label>카테고리</label><select id="e-cat" class="form-input">${opts}</select></div>
    <div class="form-group"><label>항목명</label><input type="text" id="e-name" class="form-input" value="${exp.name}"></div>
    <div class="form-group"><label>출금일</label><input type="number" id="e-date" class="form-input" value="${exp.date}"></div>
    <div class="form-group"><label>금액 (원)</label><input type="text" inputmode="numeric" id="e-amt" class="form-input" value="${Number(exp.amount).toLocaleString('ko-KR')}"></div>
    <button class="pretty-btn gray-btn" style="margin-top:10px; color:#D32F2F;" onclick="deleteExpense(${exp.id})">🗑️ 이 항목 삭제하기</button>
  `;
  openModal('지출 수정', html, () => {
    exp.category = document.getElementById('e-cat').value;
    exp.name = document.getElementById('e-name').value;
    exp.date = document.getElementById('e-date').value;
    exp.amount = getRawNumber(document.getElementById('e-amt').value);
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

document.getElementById('btn-add-expense').addEventListener('click', () => {
  const opts = appData.categories.map(c => `<option value="${c}">${c}</option>`).join('');
  const html = `
    <div class="form-group"><label>카테고리</label><select id="e-cat" class="form-input">${opts}</select></div>
    <div class="form-group"><label>항목명</label><input type="text" id="e-name" class="form-input" placeholder="예: 월세"></div>
    <div class="form-group"><label>출금일</label><input type="number" id="e-date" class="form-input" placeholder="숫자 (예: 20)"></div>
    <div class="form-group"><label>금액 (원)</label><input type="text" inputmode="numeric" id="e-amt" class="form-input" placeholder="금액 입력"></div>
  `;
  openModal('새 지출 등록', html, () => {
    const rawAmt = getRawNumber(document.getElementById('e-amt').value);
    if (!rawAmt) return alert("금액을 정확히 입력해주세요.");
    appData.expenses.push({
      id: Date.now(), category: document.getElementById('e-cat').value,
      name: document.getElementById('e-name').value, date: document.getElementById('e-date').value,
      amount: rawAmt, isPaid: false, paidAt: null
    });
    saveData(); window.closeModal();
  });
  attachCommaEvent('e-amt');
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

window.deleteIncome = function(id) {
  if(confirm('정말 삭제할까요?')) { appData.incomes = appData.incomes.filter(i => i.id !== id); saveData(); window.closeModal(); }
};

document.getElementById('btn-add-income').addEventListener('click', () => {
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
});


/* ================= 7. 카테고리 로직 ================= */
document.getElementById('btn-manage-categories').addEventListener('click', () => { renderCatModal(); });

window.removeCat = function(idx) {
  appData.categories.splice(idx, 1);
  saveData(); renderCatModal(); 
};

window.addCat = function() {
  const newVal = document.getElementById('new-cat-input').value.trim();
  if(newVal) { appData.categories.push(newVal); saveData(); renderCatModal(); }
};

function renderCatModal() {
  const tags = appData.categories.map((c, i) => `<span class="cat-tag delete" onclick="removeCat(${i})">${c} ✕</span>`).join('');
  const html = `
    <div style="margin-bottom:20px;">${tags}</div>
    <div style="display:flex; gap:10px;">
      <input type="text" id="new-cat-input" class="form-input" placeholder="새 카테고리 입력">
      <button class="pretty-btn coral-btn" style="width:80px; padding:10px;" onclick="addCat()">추가</button>
    </div>
    <p style="font-size:12px; color:#888; margin-top:10px; margin-bottom: 20px;">태그를 누르면 삭제됩니다.</p>
    <button class="pretty-btn gray-btn" style="width:100%;" onclick="closeModal()">닫기</button>
  `;
  openModal('카테고리 관리', html, null, false); 
}