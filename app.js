import { currencies , groupedCurrencies , getCurrency} from './currency.js';

// Worker operations
let dbWorker;
const workerCallbacks = new Map();
const budgetCallbacks = [];
let requestId = 0;

const initWorker = () => {
  if(dbWorker) return;
  dbWorker = new Worker('./worker.js');
  dbWorker.onmessage = (e) => {
    const msg = e.data;
    if(msg.type === "budgetBatch") {
      budgetCallbacks.forEach(cb => cb(msg.data));
      return;
    }
    if(msg.type === "dateBatch" || msg.type === "done") {
      if(window.onHistoryCallback) window.onHistoryCallback(msg);
      return;
    }
    if(msg.id) {
      const cb = workerCallbacks.get(msg.id);
      if(cb) { 
        cb(msg); 
        workerCallbacks.delete(msg.id); 
      }
    }
    if(msg.type === "error") {
      console.error("Worker error:", msg.error);
    }
  };
}

const onBudgetUpdate = (cb) => {
  initWorker();
  budgetCallbacks.push(cb);
}

const sendBudgetMessage = (type, data) => {
  initWorker();
  dbWorker.postMessage({ type, data, requestId: ++requestId });
}

const getAllBudgets = () => sendBudgetMessage("getAllBudgets");
const addBudget = (budget) => sendBudgetMessage("addBudget", budget);
const updateBudget = (budget) => sendBudgetMessage("updateBudget", budget);
const deleteBudget = (id) => sendBudgetMessage("deleteBudget", {id});

function db(type, data, id) {
  return new Promise(resolve => {
    initWorker();
    const reqId = crypto.randomUUID();
    workerCallbacks.set(reqId, resolve);
    dbWorker.postMessage({type, data, id, reqId});
  });
}

const addExpense = (expense) => db("add", expense);
const getAllExpenses = () => db("getAll");
const getExpense = (id) => db("get", null, id);
const updateExpense = (expense) => db("update", expense);
const deleteExpense = (id) => db("delete", null, id);
const getExpensesByCategory = (category) => db("byCategory", category);
const getFilteredExpenseTotal = (time , date) => db("getTotal", [time , date]);

const loadAllHistory = () => {
  initWorker();
  dbWorker.postMessage({type: "loadAllHistory"});
}

const loadSingleDate = (date) => {
  initWorker();
  dbWorker.postMessage({type: "loadSingleDate", data: date});
}

const onHistoryUpdate = (callback) => { 
  window.onHistoryCallback = callback; 
  loadAllHistory();
}

//app + ui operations

async function clearDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase("NairaSaverDB#2");
    req.onsuccess = () => {
      //console.log("DB Deleted");
      alert("Database cleared. Refresh the page");
      resolve(true);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => alert("Close all tabs with this app first");
  });
}
//clearDatabase()

const amountTitle = document.querySelector('.amount-title');
const amountLabel = document.querySelector('.amount-label');
const expenseList = document.getElementById('expenseList');
const amountFilter = document.getElementById('timeFilter');
const date_filter = document.querySelector(".date_filter")
const dialog = document.getElementById('addExpenseDialog');
const openBtn = document.getElementById('openAddExpense');
const form = dialog.querySelector('.dialog-form');
const closeBtn = document.getElementById('closeAddExpense');
const amountInput = document.getElementById('expenseAmount');
const categoryInput = document.getElementById('expenseCategory');
const promptModal = document.getElementById('promptModal');
const promptMessage = document.getElementById('promptMessage');
const promptOk = document.getElementById('promptOk');
const reloadBtn = document.querySelector(".btnreload")
const historyList = document.getElementById("historyList");
const searchBtn = document.getElementById("searchBtn");
const dateSearch = document.getElementById("dateSearch");
const menuLinks = document.querySelectorAll('.menulist li a');
const toast = document.getElementById("toast")
const select_currency = document.querySelector(".select_currency");
const toggleNotif = document.querySelector("#toggleNotif")
let notificationAllowed = false
let amountTime = "today";
let currency = {name : "dollar" , sign : "$"}
let firstTime = true

function saveData(key, data) {
  data.updatedAt = Date.now();
  if (!data.id) {
    data.id = key + '_' + Date.now();
  }
  localStorage.setItem(key, JSON.stringify(data));
}

function loadData(key) {
  const data = localStorage.getItem(key);
  return data? JSON.parse(data) : null;
}

function loadCurrencyOptions() {

  select_currency.innerHTML = "";

  for (const groupName in groupedCurrencies) {
    const optGroup = document.createElement("optgroup");
    optGroup.label = groupName;

    groupedCurrencies[groupName].forEach(cur => {
      const option = document.createElement("option");
      option.value = cur.code;
      option.textContent = `${cur.flag} ${cur.name} (${cur.sign}) - ${cur.code}`;
      if (cur.code === "NGN") option.selected = true;
      optGroup.appendChild(option);
    });

    select_currency.appendChild(optGroup);
  }
}

function saveCurrency() {
  
  select_currency.addEventListener("change", () => {
    
    const code = select_currency.value;
    const cur = getCurrency(code);
    
    if (!cur) return;

    const data = {
      name: cur.name,
      sign: cur.sign, 
      status: "local"
    };
    
    const found = currencies.find(c => c.name === currency.name);
    if (found) select_currency.value = found.code;
    
    showDeletePrompt("Reload app to apply changes?" , () => {
      saveData("kudi_guard_currency" , data)
      currency = data;
      location.reload()
      select_currency.value = currency.code
    })
  });
}

function loadCurrency() {
  const saved = localStorage.getItem("kudi_guard_currency");
  
  if (saved) {
    currency = JSON.parse(saved);
    console.log(currency)
    
    if (select_currency && currency.name) {
      const found = currencies.find(c => c.name === currency.name);
      if (found) select_currency.value = found.code;
    }
  } else {
    currency = { name: "Nigerian Naira", sign: "₦", status: "local" };
    saveData("kudi_guard_currency" , currency)
    if (select) select_currency.value = "NGN";
  }
}

function setupNotificationToggle() {
  if (!toggleNotif) return;

  toggleNotif.addEventListener("change", () => {
    notificationAllowed = toggleNotif.checked;

    const data = {
      allowed: notificationAllowed,
      status: "local"
    };

    saveData("kudi_guard_notification" , data)
    console.log("Saved:", data);
  });
}

function loadNotificationSetting() {
  const saved = localStorage.getItem("kudi_guard_notification");

  if (saved) {
    const data = JSON.parse(saved);
    notificationAllowed = data.allowed;
    
    if (toggleNotif) {
      toggleNotif.checked = notificationAllowed;
    }
  } else {
    notificationAllowed = false;
    if (toggleNotif) toggleNotif.checked = false;
  }
}

function setProfileDate() {
  const date = new Date();
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('profileDate').textContent = date.toLocaleDateString('en-US', options);
}

function uploadPicture() {
  const fileInput = document.getElementById('fileInput');
  fileInput.onchange = function(e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const base64Image = e.target.result;
        const profile = loadData('profile') || {syncStatus : "local"};
        profile.profilePicture = base64Image;
        saveData('profile', profile);
        showProfilePicture(base64Image);
      };
      reader.readAsDataURL(file);
    }
    fileInput.value = '';
  };
  fileInput.click();
}

function showProfilePicture(base64) {
  const img = document.getElementById('profilePic');
  img.src = base64;
  img.style.display = 'block';
  const overlay = document.querySelector('.avatar-overlay');
  if(overlay) overlay.style.display = 'none';
}

function loadProfilePicture() {
  const profile = loadData('profile');
  if (profile && profile.profilePicture) {
    showProfilePicture(profile.profilePicture);
  }
}

function loadUsername() {
  const profile = loadData('profile');
  let savedName = profile? profile.username : null;
  if (!savedName) {
    let newName = prompt("Welcome! Please set your username:");
    savedName = newName? newName.trim() : "User";
    saveData('profile', { username: savedName, syncStatus: "local" });
  }
  const el = document.getElementById('username');
  if(el) el.firstChild.textContent = savedName + " ";
}

function changeUsername() {
  const profile = loadData('profile') || {syncStatus: "local"};
  let newName = prompt("Enter your new username:", profile.username || "User");
  if (newName && newName.trim()!== "") {
    profile.username = newName.trim();
    saveData('profile', profile);
    loadUsername();
  }
}

document.querySelector(".username").addEventListener("click" , () => {
  changeUsername()
})

document.querySelector(".avatar").addEventListener("click" , () => {
  uploadPicture()
})

function getKeys(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = dateStr.slice(0,7);
  const year = dateStr.slice(0,4);

  const date = new Date(d);
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(),0,4);
  const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  const week = weekNum;
  
  return {day, week, month, year};
}

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
})

function closeExpenseDialog() {
  dialog.close();
}
closeBtn.addEventListener('click', closeExpenseDialog);

function openExpenseDialog() {
  form.reset();
  document.getElementById('expenseId').value = '';
  dialog.showModal();
}
openBtn.addEventListener('click', openExpenseDialog);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await putExpense()
});

async function putExpense (amount_ , category_) {
  let amount = null
  let category = null
  if (!amount_) {
    amount = Number(amountInput.value);
  } else {
    amount = amount_
  }
  if (!category_) {
    category = categoryInput.value;
  } else {
    category = category_
  }
  const date = new Date().toISOString().slice(0,10);
  const {day, week, month, year} = getKeys(date);
  const fullDate = new Date().toISOString();
  const expense = {amount, category, fullDate, date, day, week, month, year};
  
  const res = await addExpense(expense);
  if(res.success) {
    openToast("New expense has been added")
    dialog.close();
    amountInput.value = '';
    categoryInput.value = '';
    historyList.innerHTML = ""; 
    loadAllHistory();
    await loadTimedExpenses();
    await displayTotalExpenses(amountFilter.value , toInputDate(new Date()));
  } else {
    alert("Failed to add expense: " + res.error)
  }
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: true
  });
}

async function renderExpenses(expenses) {
  expenseList.innerHTML = '';
  if(expenses.length === 0) {
    expenseList.innerHTML = '<div class="expense-item">No expenses today</div>';
    return;
  }
  expenses.forEach(e => {
    const item = document.createElement('div');
    item.className = 'expense-item new';
    item.dataset.id = e.id;
    item.innerHTML = `
      <div class="expense-amount">${currency.sign}${Number(e.amount).toLocaleString()}.00</div>
      <div class="expense-meta">
        <span class="expense-cat">${e.category}</span>
        <span class="expense-date">${formatDate(e.fullDate)}</span>
      </div>
    `;
    item.addEventListener("touchstart", () => startLongPress(e.id))
    item.addEventListener("touchend", () => cancelLongPress())
    expenseList.prepend(item);
  });
}

function toInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

async function loadTimedExpenses() {

  const baseDate = date_filter.value 
    ? new Date(...date_filter.value.split('-').map((v,i) => i==1 ? v-1 : +v)) 
    : new Date();

  console.log(toInputDate(baseDate));

  let time = amountFilter.value;
  const res = await getAllExpenses();
  console.log(res)
  
  if (res.success) {
    let expense_to_display = null;
    const todayStr = toInputDate(baseDate);

    if (time == "today") {
      expense_to_display = res.result.filter(e => e.date === todayStr);
    } else if (time == "week") {
      const weekNum = getWeekNumber(baseDate);
      expense_to_display = res.result.filter(e => e.week === weekNum && e.year === baseDate.getFullYear().toString());
    } else {
      const monthStr = todayStr.slice(0, 7); // YYYY-MM
      expense_to_display = res.result.filter(e => e.month === monthStr);
    }
    renderExpenses(expense_to_display);
  }
  if (firstTime) {
    displayTotalExpenses("today" , toInputDate(new Date()))
    firstTime = false
  }
  
}

document.addEventListener('DOMContentLoaded', () => {
  if (!date_filter.value) {
    date_filter.value = toInputDate(new Date());
  }
});

let longPressTimer = null
let itemToDelete = null

function startLongPress(id) {
  itemToDelete = id;
  document.querySelector(".dashboard-card").addEventListener("scroll", cancelLongPress, {once: true})
  window.addEventListener("scroll" , cancelLongPress)
  longPressTimer = setTimeout(() => {
    showDeletePrompt("Delete this expense?", async () => {
      const delRes = await deleteExpense(id);
      if(delRes.success) {
        openToast("Expense has been deleted")
        await loadTimedExpenses();
        await displayTotalExpenses(amountTime);
        dateSearch.value = ""
        historyList.innerHTML = ""
        loadAllHistory();
      }
    });
  }, 600);
}

function cancelLongPress() {
  clearTimeout(longPressTimer);
  itemToDelete = null;
}

function showDeletePrompt(message, onConfirm) {
  promptMessage.textContent = message;
  document.body.style.overflow = 'hidden';
  promptModal.showModal();

  promptOk.onclick = () => {
    onConfirm();
    closePrompt();
  };

  promptModal.onclick = (e) => {
    if(e.target === promptModal) closePrompt();
  }
}

function closePrompt() {
  promptModal.close();
  document.body.style.overflow = '';
}

async function displayTotalExpenses(time , date) {
  amountTime = time;
  let label = "";

  const res = await getFilteredExpenseTotal(time , date);
  //console.log("TOTAL RES:", res)
  
  const total = Number(res?.result?.result || 0); // <-- triple .result

  if(time === "today") label = "Amount spent today";
  else if(time === "week") {label = "Amount spent this week";}
  else if(time === "month") label = "Amount spent this month";

  amountTitle.textContent = `${currency.sign}${total.toLocaleString()}.00`;
  amountLabel.textContent = label;
}

amountFilter.addEventListener("change", async (e) => {
  await loadTimedExpenses()
  await displayTotalExpenses(e.target.value , date_filter.value);
});

date_filter.addEventListener("change", async () => {
  await loadTimedExpenses()
  await displayTotalExpenses(amountFilter.value , date_filter.value);
});

reloadBtn.addEventListener("click" , async () => {
  //console.log("reloading")
  expenseList.innerHTML = ""
  historyList.innerHTML = ""
  dateSearch.value = ""
  await loadTimedExpenses();
  await displayTotalExpenses(amountTime);
  loadAllHistory(); 
  getAllBudgets();
})

function renderDate(date, items, total) {
  //historyList.innerHTML = ""
  document.querySelector(".empty_block").style.display = "none"
  if(items.length === 0) {
    let html = '<div class="date-block">No expenses...</div>'
    historyList.insertAdjacentHTML("beforeend", html)
    return
  };
  
  const grouped = items.reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + (Number(exp.amount) || 0);
    return acc;
  }, {});
  
  console.log(grouped)
  
  const [y,m,d] = date.split("-");
  let modDate = null
  function convertDate(dateStr) {
    const [month, day, year] = dateStr.split("/");
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", { 
      month: "long", 
      day: "numeric", 
      year: "numeric" 
    });
  }
  modDate = convertDate(`${m}/${d}/${y}`)
  
  //console.log(convertDate("09/06/2025")); 
  //console.log(date)
  let html = `
    <div class="date-block">
      <div class="date-header-row">
        <h3 class="date-header">${modDate}</h3>
      </div>
      <ul class="category-list">`;
  
  for(const [cat, catTotal] of Object.entries(grouped)){
    html += `<li><span>${cat}</span> <span>${currency.sign}${catTotal.toLocaleString()}</span></li>`;
  }
  html += `</ul>
    <div class="date-total-row">
      <span>Total</span>
      <span>${currency.sign}${total.toLocaleString()}</span>
    </div>
  </div><hr class="divider">`;
  
  historyList.insertAdjacentHTML("beforeend", html);
}

onHistoryUpdate((msg) => {
  if(msg.type === "dateBatch") renderDate(msg.date, msg.items, msg.total);
  if(msg.type === "done") {}//console.log("Finished loading history");
});

searchBtn.onclick = () => {
  const date = dateSearch.value;
  if(!date) return;
  historyList.innerHTML = "";
  loadSingleDate(date);
}

document.addEventListener('DOMContentLoaded', async () => {
  loadUsername();
  loadProfilePicture();
  setProfileDate();
  loadCurrencyOptions()
  loadCurrency();
  saveCurrency();
  loadNotificationSetting();
  setupNotificationToggle();
  await displayTotalExpenses("today");
  await loadTimedExpenses();
});

//budget

const budget_grid = document.querySelector('#budget .budget-grid');
const budget_addBtn = document.querySelector('#budget .btn-primary');
const budget_dialog = document.querySelector('#budget_dialog');
const budget_closeBtn = document.querySelector('#budget_closeDialogBtn');
const budget_form = document.querySelector('.budget_dialogForm');
const budget_spanBtns = document.querySelectorAll('.budget_spanBtn');
const budget_submitBtn = budget_form.querySelector('button[type="submit"]');
const budget_btn = document.querySelector('#budget_btn');

let editingBudgetId = null;

onBudgetUpdate((budgets) => {
  budget_renderUI(budgets);
});

function getCompleteHistory(b) {
  if (!b.startDate) return b.history || [];

  const span = (b.span || 'day').toLowerCase();
  const historyMap = new Map();
  if (b.history) {
    b.history.forEach(item => {
      historyMap.set(item.date, (historyMap.get(item.date) || 0) + item.amount);
    });
  }

  const completeHistory = [];
  const startDate = new Date(b.startDate);
  const today = new Date();
  let currentDate = new Date(startDate);

  if (span.includes('month')) {
    currentDate.setDate(1);
    while (currentDate <= today) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const amount = historyMap.has(dateStr) ? historyMap.get(dateStr) : 0;
      completeHistory.push({ date: dateStr, amount: amount });
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  } else if (span.includes('week')) {
    while (currentDate <= today) {
      const year = currentDate.getFullYear();
      const weekNum = getWeekNumber(currentDate);
      const dateStr = `${year}-W${String(weekNum).padStart(2, '0')}`;
      const amount = historyMap.has(dateStr) ? historyMap.get(dateStr) : 0;
      completeHistory.push({ date: dateStr, amount: amount });
      currentDate.setDate(currentDate.getDate() + 7);
    }
  } else {
    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const amount = historyMap.has(dateStr) ? historyMap.get(dateStr) : 0;
      completeHistory.push({ date: dateStr, amount: amount });
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return completeHistory.reverse();
}

function budget_renderUI(budgets) {
  console.log(budgets);
  budget_grid.innerHTML = "";

  if (!budgets || budgets.length === 0) {
    budget_grid.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:20px;">No budgets yet. Tap "Create Budget" ☝️</p>`;
    return;
  }
  
  document.querySelector(".stat-num").textContent = budgets.length.toString();
  
  budgets.forEach(b => {
    if (b.isAlert) {
      openToast(`${b.percent}% has been used in budget "${b.name}"`);
    }
      
    const color = b.percent > 75 ? 'red' : (b.percent > 50 ? 'orange' : 'green');
    const displayPercent = Math.min(b.percent, 100);

    const card = document.createElement('div');
    card.className = `budget-card`;
    card.dataset.id = b.id;
    
    const fullHistory = getCompleteHistory(b);

    const historyHtml = fullHistory.length > 0
      ? fullHistory.map(item => {
          let percentage = b.limit > 0 ? Math.round((item.amount / b.limit) * 100) : 0;
          let itemColorClass = "";
          let donutColorClass = "";

          if (percentage > 50 && percentage < 75) {
            donutColorClass = "yellow";
            itemColorClass = "yellow";
          } else if (percentage >= 75) {
            donutColorClass = "red";
            itemColorClass = "red";
          } else {
            donutColorClass = "green";
            itemColorClass = "green";
          }
          
          let displayItemPercent = percentage > 100 ? 100 : percentage;

          return `
            <li class="history-item">
              <div class="item-details">
                <span class="item-date">${item.date}</span>
                <span class="item-amount">Amount spent: ${currency.sign}${item.amount.toLocaleString()} / ${currency.sign}${b.limit.toLocaleString()}</span>
                <span class="item-percentage ${itemColorClass}">${percentage}%</span>
                <div class="donut-chart ${donutColorClass}" style="--percent: ${displayItemPercent}%;">
                  <span class="donut-center">${percentage}%</span>
                </div>
              </div>
            </li>
          `;
        }).join('')
      : `<li class="history-item empty" ><div class="item-details" style="height:20px;text-align:center;"><span class="item-date">No history recorded yet</span></div></li>`;
    
    const maxAmount = fullHistory.length > 0 ? Math.max(...fullHistory.map(i => i.amount), 0) : 0;

    const chartHtml = fullHistory.length > 0
      ? fullHistory.map((item, index) => {
          let limitPercentage = b.limit > 0 ? Math.round((item.amount / b.limit) * 100) : 0;
          let itemColorClass = "green";

          if (limitPercentage > 50 && limitPercentage < 75) itemColorClass = "yellow";
          else if (limitPercentage >= 75) itemColorClass = "red";
          else itemColorClass = "green";
          
          let barHeight = maxAmount > 0 ? Math.round((item.amount / maxAmount) * 100) : 0;
          if (barHeight === 0) barHeight = 1;
          
          let ref = b.span[0] == "t" ? "d" : b.span[0]          
          return `
            <div class="bar-group">
              <div class="bar ${itemColorClass}" style="--height: ${barHeight}%;"></div>
              <span class="bar-label">${ref}${fullHistory.length - index}</span>
            </div>
          `;
        }).join('')
      : ``;
    
    card.innerHTML = `
      <div class="card-top">
        <div class="card-title-block">
          <h3>${b.name || 'Unnamed Budget'}</h3>
          <p class="card-categories">Applies to: ${b.categories.includes('all') ? 'All Categories' : b.categories.join(', ')}</p>
        </div>
      </div>
      
      <div class="card-date-badge">${b.startDate} - ${b.span}</div>
      
      <div class="card-chart">
        <div class="donut ${color}" style="--percent: ${displayPercent}">
          <div class="donut-inner">
            <span class="donut-amount">${currency.sign}${b.currentSpent.toLocaleString()} / ${currency.sign}${b.limit.toLocaleString()}</span><br/>
            <span class="donut-percent">${b.percent}%</span>
          </div>
        </div>
      </div>
      
      <div class="card-progress">
        <div class="progress-track">
          <div class="progress-fill ${color}"></div>
        </div>
      </div>
      
      <div class="card-actions">
        <button class="btn btn-edit" data-id="${b.id}">Edit</button>
        <button class="btn btn-delete" data-id="${b.id}">Delete</button>
      </div>
      
      <div class="history-toggle-row">
        <span class="history-toggle-label">History</span>
        <svg class="chevron-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      
      <div class="budget_history">
        <div class="top-divider"></div>
      
        <div class="chart-section">
          <div class="bar-chart">
            ${chartHtml}
          </div>
        </div>
      
        <ul class="history-list">
          ${historyHtml}
        </ul>
      </div>
    `;
    
    budget_grid.appendChild(card);
    
    if (chartHtml === "") {
      card.querySelector(".bar-chart").style.height = "0";
      card.classList.add("empty");
    }
    
    let formerHeight = ""
    card.querySelector('.history-toggle-row').addEventListener('click', (e) => {
      e.currentTarget.classList.toggle('open');
      card.querySelector('.budget_history').classList.toggle('open');
      if (!card.querySelector('.budget_history').classList.contains("open")) {
        formerHeight = card.querySelector(".budget_history").style.height
        card.querySelector(".budget_history").style.minHeight = "20px"
        card.querySelector(".budget_history").style.height = "20px"
      } else {
        card.querySelector(".budget_history").style.minHeight = "180px"
        card.querySelector(".budget_history").style.height = formerHeight
      }
    });

    card.querySelector('.btn-edit').addEventListener('click', () => {
      openEditDialog(b);
    });

    card.querySelector('.btn-delete').addEventListener('click', () => {
      showDeletePrompt("Delete this budget ?", async () => {
        await deleteBudget(b.id);
      });
    });

    const donut = card.querySelector('.donut');
    const track = card.querySelector(".progress-fill");
    const percentText = card.querySelector(".donut-percent");
    
    donut.style.setProperty('--percent', 0);
    track.style.width = `0%`;
    percentText.textContent = "0%";

    let current = 0;
    const step = () => {
      if (current < displayPercent) {
        current += 1;
        percentText.textContent = `${current}%`;
        donut.style.setProperty('--percent', current);
        track.style.width = `${current}%`;
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  });
}


function openEditDialog(budget) {
  editingBudgetId = budget.id;

  document.querySelector('#budget_name').value = budget.name;
  document.querySelector('#budget_limit').value = budget.limit;
  document.querySelector('#budget_startDate').value = budget.startDate;
  document.querySelector('#budget_span').value = budget.span;
  document.querySelector('#budget_alertToggle').checked = budget.alertEnabled;
  document.querySelector('#budget_alertPercent').value = budget.alertPercent;

  [...document.querySelector('#budget_categories').options].forEach(opt => {
    opt.selected = budget.categories.includes(opt.value) || budget.categories.includes('all');
  });

  budget_spanBtns.forEach(btn => {
    btn.classList.toggle('budget_spanBtnActive', btn.dataset.span === budget.span);
  });

  budget_submitBtn.textContent = "Save Changes";
  budget_dialog.showModal();
}

budget_spanBtns.forEach(btn => {
  btn.onclick = () => {
    budget_spanBtns.forEach(b => b.classList.remove('budget_spanBtnActive'));
    btn.classList.add('budget_spanBtnActive');
    document.querySelector('#budget_span').value = btn.dataset.span;
  }
});

budget_addBtn.onclick = () => {
  editingBudgetId = null;
  budget_form.reset();
  budget_submitBtn.textContent = "Create Budget";
  document.querySelector('#budget_span').value = 'daily';
  budget_spanBtns[0].classList.add('budget_spanBtnActive');
  budget_dialog.showModal();
}

budget_closeBtn.onclick = () => {
  editingBudgetId = null;
  budget_form.reset();
  budget_dialog.close();
}

budget_form.onsubmit = async (e) => {
  e.preventDefault();

  const budget_categories = [...document.querySelector('#budget_categories').selectedOptions].map(o => o.value);
  const budget_amount = Number(document.querySelector('#budget_limit').value);
  const budget_span = document.querySelector(".budget_spanBtnActive")
  
  let span = 0
  if(budget_span.getAttribute("data-span") == "daily") {
    span = 0
  } else if (budget_span.getAttribute("data-span") == "weekly") {
    span = 7
  } else if (budget_span.getAttribute("data-span") == "monthly") {
    span = 30
  }

  const inputDate = document.getElementById('budget_startDate').value;
  const date = new Date(inputDate);
  date.setDate(date.getDate() + span);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  const endDate = `${year}-${month}-${day}`;
  //console.log(endDate);
  
  if(!budget_amount || budget_amount <= 0) {
    alert("Please enter a valid budget limit");
    return;
  }

  const budgetObj = {
    id: editingBudgetId || Date.now(), 
    name: document.querySelector('#budget_name').value.trim() || `Budget ${new Date().toLocaleDateString()}`,
    limit: budget_amount,
    categories: budget_categories.length? budget_categories : ['all'],
    startDate: document.querySelector('#budget_startDate').value || new Date().toISOString().split('T')[0],
    endDate: endDate, 
    span: document.querySelector('#budget_span').value,
    alertEnabled: document.querySelector('#budget_alertToggle').checked,
    alertPercent: Number(document.querySelector('#budget_alertPercent').value),
  };

  if(editingBudgetId) {
    await updateBudget(budgetObj);
    openToast("Budget has been edited")
  } else {
    await addBudget(budgetObj);
    openToast("New budget has been added")
  }

  budget_form.reset();
  editingBudgetId = null;
  budget_submitBtn.textContent = "Create Budget";
  document.querySelector('#budget_span').value = 'daily';
  budget_spanBtns[0].classList.add('budget_spanBtnActive');
  budget_dialog.close();
};

budget_btn.addEventListener("click" , () => {
  getAllBudgets();
})

//Sound recognition
let mic_btn = document.querySelector(".mic-btn")
let timeout = null

window.addEventListener("touchstart" , (e) => {
  if (!e.target.contains(mic_btn)) {
    timeout = setTimeout( () => {
      mic_btn.style.opacity = "0.3"
    } , 100)
  }
})

window.addEventListener("touchend" , (e) => {
  if (!e.target.contains(mic_btn)) {
    mic_btn.style.opacity = "1"
    clearTimeout(timeout)
  }
})

//speech recognition
let categoryList = []
for (var i = 1; i < categoryInput.children.length; i++) {
  categoryList.push(categoryInput.children[i].textContent.toLowerCase())
}
console.log(categoryList)
let SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
let speechObj = null

mic_btn.addEventListener("touchstart" , startSpeechRecognition)
mic_btn.addEventListener("touchend" , endSpeechRecognition)
window.addEventListener("touchmove" ,endSpeechRecognition)

function startSpeechRecognition() {
  if(!SpeechRecognition) {
    openToast("Speech recognition is not allowed")
    return
  }
  
  if (!navigator.onLine) {
    openToast("Online only feature. Turn on Wi-Fi")
    return
  }
      
  speechObj = new SpeechRecognition()
  speechObj.start()
  speechObj.onresult = async (r) => {
    console.log(r.results[0][0].transcript)
    let result = tokenize(r.results[0][0].transcript)
    console.log(result)
    let amount = result.find(item => item.type == "amount")
    let category = result.find(item => item.type == "category")
    await putExpense(amount.value , category.value)
  }
  speechObj.onend = () => {
    speechObj = null
  }
}

function endSpeechRecognition () {
  if (SpeechRecognition && speechObj) {
    speechObj.stop()
  }
}

function tokenize(script) {
  
  script = script
            .trim()
            .toLowerCase()
            .replace("," , "")
            .replace("." , "")
  let tokenArray = []
  
  for (let i = 0; i < script.length; i++) {
    let unit = script[i]
    
    if (unit == " ") {
      continue
    }
    
    if (unit >= 'a' && unit <= 'z' ) {
      let index = i
      let fullStr = ""
      while (script[index] && script[index] >= 'a' && script[index] <= 'z') {
        fullStr += script[index]
        index++
      }
      
      let isCurrency = currencies.find(item => item.name == fullStr)
      
      if (isCurrency !== undefined) {
        tokenArray.push({type:"currency" , value:isCurrency})
      } else {
        if (categoryList.includes(fullStr)) {
          tokenArray.push({type:"category" , value:fullStr})
        }
        if (fullStr == "delete") {
          return {error : "Recording stopped"}
        }
        if (fullStr == "million" || fullStr == "meter") {
          tokenArray[tokenArray.length-1].value += "000000"
        } else if (fullStr == "billion") {
          tokenArray[tokenArray.length-1].value += "000000000"
        } else if (fullStr == "trillion") {
          tokenArray[tokenArray.length-1].value += "000000000000"
        } else if (fullStr == "thousand") {
          tokenArray[tokenArray.length-1].value += "000"
        }
      }
      i = index - 1
      continue
    }
    
    if (unit >= '0' && unit <= '9') {
      let index = i
      let fullStr = ""
      while ((script[index] && script[index] >= '0' && script[index] <= '9') || script[index] == "k") {
        if (index > 0 && (script[index] == "k" || script[index] == "bay")) {
          fullStr += "000"
          break
        }
        fullStr += script[index]
        index++
      }
      tokenArray.push({type:"amount" , value:Number(fullStr)})
      i = index - 1
      continue
    }
    
  }
  
  let hasCat = tokenArray.some(item => item.type == "category") 
  let hasAmt = tokenArray.some(item => item.type == "amount")
  let hasCurr = tokenArray.some(item => item.type == "currency")
  let {id , name , sign , status , updatedAt} = currency
  tokenArray.push({type:"currency" , value:{name , sign}})
  
  if (!hasAmt || !hasCat) {
    openToast("statement not recognized")
  }
  
  return hasAmt && hasCat ? tokenArray : {error : "statement not recognized"}
  
}


let toastTimeout = null
function openToast(message) {
  clearTimeout(toastTimeout)
  toast.classList.remove("show")
  toast.textContent = message.trim()
  toast.classList.add("show")
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show")
  }, 3000)
}

function showPublicNotification(msg) {
  if (!notificationAllowed) return
  navigator.serviceWorker.ready.then(reg => {
    reg.showNotification('Kudi Guide Alert', {
      body: msg,
      icon: './icon2.png'
    });
  });
}
//showPublicNotification("sup")