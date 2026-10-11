const DB_NAME = "NairaSaverDB#2";
const DB_VERSION = 13;
let db;

const openDB = () => {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      
      if (!db.objectStoreNames.contains("expenses")) {
        const store = db.createObjectStore("expenses", {keyPath: "id", autoIncrement: true});
        store.createIndex("date", "date", {unique: false});
        store.createIndex("category", "category", {unique: false});
        store.createIndex("day", "day", { unique: false });
        store.createIndex("week", "week", { unique: false });
        store.createIndex("month", "month", { unique: false });
        store.createIndex("year", "year", { unique: false });
      }
      
      if (!db.objectStoreNames.contains("budgets")) {
        const store = db.createObjectStore("budgets", { keyPath: "id", autoIncrement: true });
        store.createIndex("budgetId", "budgetId");
        store.createIndex("category", "category");
        store.createIndex("date", "date");       
      }
    };
    
    request.onsuccess = () => { db = request.result; resolve(db); };
    request.onerror = () => reject(request.error);
  });
};

const getStore = (name, mode) => openDB().then(() => db.transaction(name, mode).objectStore(name));

// ========== EXPENSE FUNCTIONS ==========
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

async function addExpense(expense) {
  const store = await getStore("expenses", "readwrite");
  delete expense.id;
  let date = getKeys(expense.date);
  expense.day = date.day; expense.week = date.week; 
  expense.month = date.month; expense.year = date.year;
  return new Promise((res, rej) => {
    const req = store.add(expense);
    req.onsuccess = () => res(req.result); 
    req.onerror = () => rej(req.error);
  });
}

const getAllExpenses = () => getStore("expenses", "readonly").then(s => new Promise((res, rej) => {
  const req = s.getAll(); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
}));

const getExpense = (id) => getStore("expenses", "readonly").then(s => new Promise((res, rej) => {
  const req = s.get(id); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
}));

const updateExpense = (expense) => getStore("expenses", "readwrite").then(s => new Promise((res, rej) => {
  const req = s.put(expense); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
}));

const deleteExpense = (id) => getStore("expenses", "readwrite").then(s => new Promise((res, rej) => {
  const req = s.delete(id); req.onsuccess = () => res(true); req.onerror = () => rej(req.error);
}));

const getByCategory = (category) => getStore("expenses", "readonly").then(s => {
  const index = s.index("category");
  return new Promise((res, rej) => { const req = index.getAll(category); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
});

const getByDate = (date) => getStore("expenses", "readonly").then(s => {
  const index = s.index("date");
  return new Promise((res, rej) => { const req = index.getAll(date); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
});

const getAllDates = () => getStore("expenses", "readonly").then(s => new Promise((res, rej) => {
  const req = s.getAll();
  req.onsuccess = () => {
    const dates = req.result.map(e => e.date).filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
    res([...new Set(dates)]);
  }
  req.onerror = () => rej(req.error);
}));

async function getTotals(data) {
  let [filter, date] = data;
  const expenses = await getAllExpenses();
  const todayStr = date;
  const {day, week, month, year} = getKeys(todayStr);
  let total = 0;
  expenses.forEach(exp => {
    const amount = Number(exp.amount) || 0;
    if(filter === "today" && exp.date === todayStr) total += amount;
    if(filter === "week" && exp.week === week && exp.year === year) total += amount;
    if(filter === "month" && exp.month === month) total += amount;
  });
  return {success: true, result: total};
}

// ========== BUDGET FUNCTIONS ==========
const getAllBudgetsRaw = () => getStore("budgets", "readonly").then(s => new Promise((res) => {
  const req = s.getAll(); req.onsuccess = () => res(req.result || []); req.onerror = () => res([]);
}));

const putBudget = (data) => getStore("budgets", "readwrite").then(s => new Promise((res, rej) => {
  const req = s.put(data); req.onsuccess = () => res(); req.onerror = () => rej(req.error);
}));

const delBudget = (key) => getStore("budgets", "readwrite").then(s => new Promise((res, rej) => {
  const req = s.delete(key); req.onsuccess = () => res(); req.onerror = () => rej(req.error);
}));

// Generates an interval identifier key based on span type ("daily", "weekly", or "monthly")
const getIntervalKey = (dateStr, span) => {
  if (span === "daily") {
    return dateStr; // Format: "YYYY-MM-DD"
  } else if (span === "weekly") {
    const { week, year } = getKeys(dateStr);
    return `${year}-W${String(week).padStart(2, '0')}`;
  } else {
    return dateStr.slice(0, 7); // Format: "YYYY-MM"
  }
};

const calculateBudgetState = (budget, expenses) => {
  const limit = Number(budget.limit) || 0;
  const span = budget.span || "monthly";
  const startDate = budget.startDate;
  
  // Categorized matching expenses on or after startDate
  const historyMap = {};

  expenses.forEach(e => {
    if (e.date < startDate) return;

    const categoryMatch = !budget.categories || 
                           budget.categories.includes('all') || 
                           budget.categories.includes(e.category.toLowerCase());
    
    if (categoryMatch) {
      const intervalKey = getIntervalKey(e.date, span);
      const amount = Number(e.amount) || 0;
      historyMap[intervalKey] = (historyMap[intervalKey] || 0) + amount;
    }
  });

  // Convert history map into array format: [{ date: "key", amount: totalAmount }]
  const history = Object.keys(historyMap).map(key => ({
    date: key,
    amount: historyMap[key]
  }));

  // Identify current real-world period
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentIntervalKey = getIntervalKey(todayStr, span);

  // Extract totals for current real-time date interval
  const currentSpent = historyMap[currentIntervalKey] || 0;

  let percent = (limit > 0 ? Math.round((currentSpent / limit) * 100) : 0);
  if (percent === 0 && currentSpent > 0) percent = 1;

  return {
    ...budget,
    limit,
    currentSpent,
    remaining: limit - currentSpent,
    percent,
    isOver: percent >= 100,
    isAlert: budget.alertEnabled && percent >= budget.alertPercent,
    history // Returns array containing aggregated periodic history
  };
};

const getAllBudgetsWithState = async () => {
  const [budgets, expenses] = await Promise.all([getAllBudgetsRaw(), getAllExpenses()]);
  return budgets.map(b => calculateBudgetState(b, expenses));
};

self.onmessage = async e => {
  const {type, data, id, reqId, requestId} = e.data;
  try {
    let result = [];
    if(type === "add") result = await addExpense(data);
    if(type === "getAll") result = await getAllExpenses();
    if(type === "get") result = await getExpense(id);
    if(type === "update") result = await updateExpense(data);
    if(type === "delete") result = await deleteExpense(id);
    if(type === "byCategory") result = await getByCategory(data);
    if(type === "getTotal") result = await getTotals(data);
    if(type === "loadAllHistory") {
      const dates = await getAllDates(); dates.sort().reverse();
      for(const date of dates) {
        const items = await getByDate(date);
        const dayTotal = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
        self.postMessage({type: "dateBatch", date, items, total: dayTotal});
      }
      return self.postMessage({type: "done"});
    }
    if(type === "loadSingleDate") {
      const items = await getByDate(data);
      const dayTotal = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      self.postMessage({type: "dateBatch", date: data, items, total: dayTotal});
      return self.postMessage({type: "done"});
    }

    if(type === "getAllBudgets") result = await getAllBudgetsWithState();
    if(type === "addBudget") { await putBudget(data); result = await getAllBudgetsWithState(); }
    if(type === "updateBudget") { await putBudget(data); result = await getAllBudgetsWithState(); }
    if(type === "deleteBudget") { await delBudget(data.id); result = await getAllBudgetsWithState(); }
    if(type === "addExpense") { await addExpense(data); result = await getAllBudgetsWithState(); } 
    if(type === "deleteExpense") { await deleteExpense(data.id); result = await getAllBudgetsWithState(); }

    if(reqId) self.postMessage({id: reqId, success: true, result});
    if(requestId) self.postMessage({ type: "budgetBatch", data: Array.isArray(result) ? result : [], requestId });

  } catch(err) {
    self.postMessage({id: reqId, success: false, error: err.message});
    console.error("Worker error:", err);
  }
};
