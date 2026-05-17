const SUPABASE_URL = "https://ahtgiwdzocerkonrjmdo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_HTCFg_w3vmdNqfG2ZE46-A_6KXpxAnz";

let supabaseClient = null;

const INACTIVITY_LIMIT_MS = 2 * 60 * 1000;
const activityEvents = ["click", "input", "keydown", "touchstart", "scroll"];
let inactivityTimer = null;
let isAutoSigningOut = false;

const denominations = [10000, 5000, 1000, 500, 100, 50, 10];

const nonCashItems = [
  { key: "paypay", label: "PayPay" },
  { key: "point", label: "积分" },
  { key: "credit", label: "信用卡" }
];

const standardCash = {
  10000: 0,
  5000: 3,
  1000: 15,
  500: 10,
  100: 32,
  50: 30,
  10: 30
};

const fixedChangeAmount = 40000;

const defaultReserveCash = {
  10000: { count: 0, target: 0 },
  5000: { count: 6, target: 6 },
  1000: { count: 30, target: 30 },
  500: { count: 20, target: 20 },
  100: { count: 64, target: 64 },
  50: { count: 60, target: 60 },
  10: { count: 60, target: 60 }
};

let currentYear = 2026;
let currentMonth = 5;
let currentDay = null;
let currentUser = null;
let currentStoreId = null;
let currentFeeSettings = {
  paypay: 0,
  point: 0,
  credit: 0
};
let currentMonthData = {};
let currentReserveData = null;

let currentExchangePlan = {
  giveToReserve: [],
  takeFromReserve: []
};

/* =========================
   Supabase 登录 / 权限
========================= */

function initializeSupabase() {
  if (!window.supabase) {
    alert("Supabase JS 没有加载成功。请检查网络。");
    return false;
  }

  if (!SUPABASE_PUBLISHABLE_KEY) {
    alert("请先在 app.js 中设置 SUPABASE_PUBLISHABLE_KEY。");
    return false;
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  return true;
}

async function login() {
  if (!supabaseClient) {
    alert("Supabase 尚未初始化。");
    return;
  }

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!username || !password) {
    alert("请输入用户名和密码。");
    return;
  }

  const { data: emailData, error: emailError } = await supabaseClient
    .rpc("get_email_by_username", {
      input_username: username
    });

  if (emailError || !emailData) {
    alert("用户名不存在。");
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: emailData,
    password
  });

  if (error) {
    alert("登录失败：" + error.message);
    return;
  }

  await loadCurrentUserFromSupabase(data.user);
}

async function logout() {
  stopInactivityWatcher();

  if (supabaseClient) {
    await supabaseClient.auth.signOut({ scope: "local" });
  }

  currentUser = null;
  currentStoreId = null;
  currentMonthData = {};

  document.getElementById("appPage").classList.remove("active");
  document.getElementById("loginPage").classList.add("active");
  document.getElementById("loginPassword").value = "";
}

async function confirmAndGlobalLogout() {
  const ok = confirm(
    "确定要退出所有设备吗？\n\n" +
    "此操作会让当前账号在其他电脑、iPad、手机上也需要重新登录。"
  );

  if (!ok) return;

  stopInactivityWatcher();

  if (supabaseClient) {
    await supabaseClient.auth.signOut({ scope: "global" });
  }

  currentUser = null;
  currentStoreId = null;
  currentMonthData = {};

  document.getElementById("appPage").classList.remove("active");
  document.getElementById("loginPage").classList.add("active");
  document.getElementById("loginPassword").value = "";

  alert("已退出所有设备。");
}

async function autoLogoutByInactivity() {
  if (!currentUser || isAutoSigningOut) {
    return;
  }

  isAutoSigningOut = true;
  stopInactivityWatcher();

  if (supabaseClient) {
    await supabaseClient.auth.signOut({ scope: "local" });
  }

  currentUser = null;
  currentStoreId = null;
  currentMonthData = {};

  document.getElementById("appPage").classList.remove("active");
  document.getElementById("loginPage").classList.add("active");
  document.getElementById("loginPassword").value = "";

  alert("10分钟无操作，已自动退出。请重新登录。");

  isAutoSigningOut = false;
}

function resetInactivityTimer() {
  if (!currentUser) {
    return;
  }

  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }

  inactivityTimer = setTimeout(() => {
    autoLogoutByInactivity();
  }, INACTIVITY_LIMIT_MS);
}

function startInactivityWatcher() {
  stopInactivityWatcher();

  activityEvents.forEach(eventName => {
    window.addEventListener(eventName, resetInactivityTimer, { passive: true });
  });

  resetInactivityTimer();
}

function stopInactivityWatcher() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }

  activityEvents.forEach(eventName => {
    window.removeEventListener(eventName, resetInactivityTimer);
  });
}

async function restoreLogin() {
  if (!supabaseClient) {
    showLogin();
    return;
  }

  const { data, error } = await supabaseClient.auth.getUser();

  if (error || !data.user) {
    showLogin();
    return;
  }

  await loadCurrentUserFromSupabase(data.user);
}

async function loadCurrentUserFromSupabase(user) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("id, email, username, display_name, role")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    alert(
      "登录成功，但读取用户权限失败。\n\n" +
      "请确认 profiles 表中已经有该用户，并设置了 role。"
    );

    await supabaseClient.auth.signOut({ scope: "local" });
    showLogin();
    return;
  }

  currentUser = {
    id: user.id,
    email: user.email,
    username: profile.display_name || profile.username || profile.email || user.email,
    role: profile.role
  };

  await loadDefaultStore();
  showApp();
}

async function loadDefaultStore() {
  const { data, error } = await supabaseClient
    .from("stores")
    .select("id, store_name, paypay_fee_rate, point_fee_rate, credit_fee_rate")
    .eq("store_name", "默认店铺")
    .single();

  if (error || !data) {
    alert(
      "读取默认店铺失败。请确认 stores 表中存在「默认店铺」，并且已经执行 v32 手续费字段 SQL。"
    );
    return;
  }

  currentStoreId = data.id;

  currentFeeSettings = {
    paypay: Number(data.paypay_fee_rate || 0),
    point: Number(data.point_fee_rate || 0),
    credit: Number(data.credit_fee_rate || 0)
  };
}

function showLogin() {
  document.getElementById("loginPage").classList.add("active");
  document.getElementById("appPage").classList.remove("active");
}

function showApp() {
  document.getElementById("loginPage").classList.remove("active");
  document.getElementById("appPage").classList.add("active");

  document.getElementById("currentUserText").textContent =
    `${currentUser.username}（${currentUser.role}）`;

  startInactivityWatcher();
  applyPermissions();

  const today = new Date();

  currentYear = today.getFullYear();
  currentMonth = today.getMonth() + 1;

  document.getElementById("yearInput").value = currentYear;
  document.getElementById("monthInput").value = currentMonth;

  generateMonth();
}

function hasRole(role) {
  return currentUser && currentUser.role === role;
}

function canAdmin() {
  return hasRole("admin");
}

function canWrite() {
  return currentUser && (currentUser.role === "admin" || currentUser.role === "staff");
}

function applyPermissions() {
  document.querySelectorAll(".admin-only").forEach(el => {
    el.classList.toggle("hidden-by-permission", !canAdmin());
  });

  document.querySelectorAll(".write-only").forEach(el => {
    el.classList.toggle("hidden-by-permission", !canWrite());
  });
}

/* =========================
   通用
========================= */

function hideAllPages() {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: "auto"
  });
}

function getStorageKey() {
  return `store-cash-book-${currentYear}-${currentMonth}`;
}

function getMonthData() {
  return currentMonthData || {};
}

function setMonthData(data) {
  currentMonthData = data || {};
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function formatYen(value) {
  return `${Number(value || 0).toLocaleString()}円`;
}

function formatDateTimeText(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP");
}

function formatDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}


function calculateFeeAmount(amount, rate) {
  const numericAmount = Number(amount || 0);
  const numericRate = Number(rate || 0);

  if (numericAmount <= 0 || numericRate <= 0) {
    return 0;
  }

  return Math.round(numericAmount * numericRate / 100);
}

function calculateNonCashFees(nonCash) {
  const paypay = Number(nonCash?.paypay || 0);
  const point = Number(nonCash?.point || 0);
  const credit = Number(nonCash?.credit || 0);

  const paypayFee = calculateFeeAmount(paypay, currentFeeSettings.paypay);
  const pointFee = calculateFeeAmount(point, currentFeeSettings.point);
  const creditFee = calculateFeeAmount(credit, currentFeeSettings.credit);

  return {
    paypayFee,
    pointFee,
    creditFee,
    totalFee: paypayFee + pointFee + creditFee
  };
}

function calculateTotal(cash) {
  return denominations.reduce((sum, denom) => {
    return sum + denom * Number(cash[denom] || 0);
  }, 0);
}

function calculateReserveTotal(reserveData, mode = "count") {
  return denominations.reduce((sum, denom) => {
    return sum + denom * Number(reserveData[denom]?.[mode] || 0);
  }, 0);
}

function cloneCash(cash) {
  const copied = {};

  denominations.forEach(denom => {
    copied[denom] = Number(cash[denom] || 0);
  });

  return copied;
}

function recordToDayData(record) {
  if (!record) return null;

  return {
    id: record.id,
    date: record.record_date,
    cash: {
      10000: record.cash_10000 || 0,
      5000: record.cash_5000 || 0,
      1000: record.cash_1000 || 0,
      500: record.cash_500 || 0,
      100: record.cash_100 || 0,
      50: record.cash_50 || 0,
      10: record.cash_10 || 0
    },
    nonCash: {
      paypay: record.paypay || 0,
      point: record.point || 0,
      credit: record.credit || 0
    },
    exchangeApplied: Boolean(record.exchange_applied),
    exchangeAppliedAt: record.exchange_applied_at || null,
    exchangePlan: null
  };
}

function dayDataToRecord(day, dayData) {
  const cash = dayData.cash || {};
  const nonCash = dayData.nonCash || {};

  const cashTotal = calculateTotal(cash);
  const cashIncome = cashTotal - fixedChangeAmount;
  const paypay = Number(nonCash.paypay || 0);
  const point = Number(nonCash.point || 0);
  const credit = Number(nonCash.credit || 0);
  const totalIncome = cashIncome + paypay + point + credit;

  return {
    store_id: currentStoreId,
    record_date: formatDateKey(currentYear, currentMonth, day),

    cash_10000: Number(cash[10000] || 0),
    cash_5000: Number(cash[5000] || 0),
    cash_1000: Number(cash[1000] || 0),
    cash_500: Number(cash[500] || 0),
    cash_100: Number(cash[100] || 0),
    cash_50: Number(cash[50] || 0),
    cash_10: Number(cash[10] || 0),

    paypay,
    point,
    credit,

    cash_total: cashTotal,
    cash_income: cashIncome,
    total_income: totalIncome,

    exchange_applied: Boolean(dayData.exchangeApplied),
    exchange_applied_at: dayData.exchangeAppliedAt || null,

    created_by: currentUser?.id || null,
    updated_by: currentUser?.id || null
  };
}

async function loadMonthDataFromSupabase(year, month) {
  if (!currentStoreId) return {};

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = getDaysInMonth(year, month);
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data, error } = await supabaseClient
    .from("daily_records")
    .select("*")
    .eq("store_id", currentStoreId)
    .gte("record_date", startDate)
    .lte("record_date", endDate)
    .order("record_date", { ascending: true });

  if (error) {
    alert("读取云端每日数据失败：" + error.message);
    return {};
  }

  const monthData = {};

  (data || []).forEach(record => {
    const day = Number(record.record_date.slice(8, 10));
    monthData[day] = recordToDayData(record);
  });

  return monthData;
}

async function upsertDayDataToSupabase(day, dayData) {
  const record = dayDataToRecord(day, dayData);

  const { data, error } = await supabaseClient
    .from("daily_records")
    .upsert(record, {
      onConflict: "store_id,record_date"
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return recordToDayData(data);
}

/* =========================
   月份 / 每日
========================= */

async function generateMonth() {
  currentYear = Number(document.getElementById("yearInput").value);
  currentMonth = Number(document.getElementById("monthInput").value);

  const monthData = await loadMonthDataFromSupabase(currentYear, currentMonth);
  setMonthData(monthData);

  renderMonth();
}

function renderMonth() {
  const days = getDaysInMonth(currentYear, currentMonth);
  const monthData = getMonthData();

  renderMonthSummary(monthData);

  const dayList = document.getElementById("dayList");
  dayList.innerHTML = "";

  for (let day = 1; day <= days; day++) {
    const dayData = monthData[day];

    const card = document.createElement("div");
    card.className = "day-card";

    const title = document.createElement("strong");
    title.textContent = `${currentMonth}月${day}日`;

    const status = document.createElement("span");

    if (dayData && dayData.cash) {
      const total = calculateTotal(dayData.cash);
      const income = total - fixedChangeAmount;
      const nonCash = dayData.nonCash || {};
      const nonCashTotal =
        Number(nonCash.paypay || 0) +
        Number(nonCash.point || 0) +
        Number(nonCash.credit || 0);

      card.classList.add("saved");

      if (dayData.exchangeApplied) {
        card.classList.add("applied");
      }

      if (total < fixedChangeAmount) {
        card.classList.add("warning");
        status.textContent = `已保存 / 现金不足 / 现金净收入 ${formatYen(income)}`;
      } else if (dayData.exchangeApplied) {
        status.textContent = `已保存 / 已执行兑换 / 现金 ${formatYen(income)} / 非现金 ${formatYen(nonCashTotal)}`;
      } else {
        status.textContent = `已保存 / 现金 ${formatYen(income)} / 非现金 ${formatYen(nonCashTotal)}`;
      }
    } else {
      status.textContent = "未录入";
    }

    card.appendChild(title);
    card.appendChild(status);

    card.addEventListener("click", () => {
      openDay(day);
    });

    dayList.appendChild(card);
  }
}

function renderMonthSummary(monthData) {
  let savedDays = 0;

  let cashIncomeTotal = 0;
  let paypayTotal = 0;
  let pointTotal = 0;
  let creditTotal = 0;
  let feeTotal = 0;

  Object.keys(monthData).forEach(day => {
    const dayData = monthData[day];

    if (!dayData || !dayData.cash) {
      return;
    }

    const totalCash = calculateTotal(dayData.cash);
    const netIncome = totalCash - fixedChangeAmount;

    const nonCash = dayData.nonCash || {};
    const fees = calculateNonCashFees(nonCash);

    savedDays += 1;

    cashIncomeTotal += netIncome;
    paypayTotal += Number(nonCash.paypay || 0);
    pointTotal += Number(nonCash.point || 0);
    creditTotal += Number(nonCash.credit || 0);
    feeTotal += fees.totalFee;
  });

  const totalIncomeBeforeFee =
    cashIncomeTotal + paypayTotal + pointTotal + creditTotal;

  const totalIncomeAfterFee = totalIncomeBeforeFee - feeTotal;

  document.getElementById("monthSavedDaysText").textContent = `${savedDays}天`;

  document.getElementById("monthCashIncomeText").textContent =
    formatYen(cashIncomeTotal);

  document.getElementById("monthPaypayText").textContent =
    formatYen(paypayTotal);

  document.getElementById("monthPointText").textContent =
    formatYen(pointTotal);

  document.getElementById("monthCreditText").textContent =
    formatYen(creditTotal);

  document.getElementById("monthTotalIncomeText").textContent =
    formatYen(totalIncomeBeforeFee);

  const feeText = document.getElementById("monthFeeText");
  if (feeText) {
    feeText.textContent = formatYen(feeTotal);
  }

  const afterFeeText = document.getElementById("monthNetAfterFeeText");
  if (afterFeeText) {
    afterFeeText.textContent = formatYen(totalIncomeAfterFee);
  }
}

async function openDay(day) {
  currentDay = day;

  hideAllPages();
  document.getElementById("dayPage").classList.add("active");
  scrollToTop();

  document.getElementById("selectedDateTitle").textContent =
    `${currentYear}年${currentMonth}月${currentDay}日`;

  await loadReserveDataFromSupabase();

  renderCashInputs();
  renderNonCashInputs();
  loadCurrentDayData();
  calculateCurrentDay();
  applyPermissions();
}

function showMonthPage() {
  hideAllPages();
  document.getElementById("monthPage").classList.add("active");
  scrollToTop();

  renderMonth();
  applyPermissions();
}

function renderCashInputs() {
  const area = document.getElementById("cashInputArea");
  area.innerHTML = "";

  denominations.forEach(denom => {
    const row = document.createElement("div");
    row.className = "cash-row";

    const label = document.createElement("label");
    label.textContent = `${denom}円`;

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = "";
    input.dataset.denom = denom;

    input.addEventListener("input", calculateCurrentDay);

    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className = "small-btn write-only";
    minusBtn.textContent = "-";
    minusBtn.addEventListener("click", () => {
      if (!canWrite()) return;
      const value = Number(input.value || 0);
      input.value = Math.max(0, value - 1);
      calculateCurrentDay();
    });

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "small-btn write-only";
    plusBtn.textContent = "+";
    plusBtn.addEventListener("click", () => {
      if (!canWrite()) return;
      const value = Number(input.value || 0);
      input.value = value + 1;
      calculateCurrentDay();
    });

    if (!canWrite()) {
      input.disabled = true;
    }

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(minusBtn);
    row.appendChild(plusBtn);

    area.appendChild(row);
  });

  applyPermissions();
}

function renderNonCashInputs() {
  const area = document.getElementById("nonCashInputArea");
  area.innerHTML = "";

  nonCashItems.forEach(item => {
    const row = document.createElement("div");
    row.className = "non-cash-row";

    const label = document.createElement("label");
    label.textContent = item.label;

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.value = "";
    input.placeholder = "0";
    input.dataset.nonCash = item.key;

    if (!canWrite()) {
      input.disabled = true;
    }

    row.appendChild(label);
    row.appendChild(input);

    area.appendChild(row);
  });
}

function getCurrentCashInput() {
  const cash = {};

  denominations.forEach(denom => {
    const input = document.querySelector(`input[data-denom="${denom}"]`);
    cash[denom] = Number(input?.value || 0);
  });

  return cash;
}

function getCurrentNonCashInput() {
  const nonCash = {};

  nonCashItems.forEach(item => {
    const input = document.querySelector(`input[data-non-cash="${item.key}"]`);
    nonCash[item.key] = Number(input?.value || 0);
  });

  return nonCash;
}

function calculateCurrentDay() {
  const cash = getCurrentCashInput();

  const total = calculateTotal(cash);
  const netIncome = total - fixedChangeAmount;

  document.getElementById("totalCashText").textContent = formatYen(total);
  document.getElementById("netIncomeText").textContent = formatYen(netIncome);

  if (total < fixedChangeAmount) {
    document.getElementById("diffArea").innerHTML =
      `<div class="diff-minus">现金总额不足 40,000円，请确认录入数量。</div>`;

    document.getElementById("takeIncomeArea").innerHTML =
      `<div class="diff-minus">无法计算净收入拿走方案。</div>`;

    document.getElementById("exchangeArea").innerHTML =
      `<div class="diff-minus">无法计算兑换建议。</div>`;

    const exchangeActionArea = document.getElementById("exchangeActionArea");
    if (exchangeActionArea) {
      exchangeActionArea.innerHTML =
        `<div class="diff-minus">无法执行兑换。</div>`;
    }

    currentExchangePlan = {
      giveToReserve: [],
      takeFromReserve: []
    };

    renderExchangeActionStatus();
    return;
  }

  const incomeResult = calculateIncomeTakingPlan(cash, netIncome);
  const remainingCash = incomeResult.remainingCash;

  renderDiff(remainingCash);
  renderTakeIncomePlan(incomeResult.takePlan);
  renderExchangePlan(remainingCash);
  renderExchangeActionStatus();
}

function calculateIncomeTakingPlan(cash, netIncome) {
  const remainingCash = cloneCash(cash);

  const takePlan = {};
  denominations.forEach(denom => {
    takePlan[denom] = 0;
  });

  let amountToTake = netIncome;

  if (amountToTake <= 0) {
    return {
      takePlan,
      remainingCash
    };
  }

  denominations.forEach(denom => {
    if (amountToTake <= 0) return;

    const standard = Number(standardCash[denom] || 0);
    const extraCount = Math.max(0, remainingCash[denom] - standard);

    if (extraCount <= 0) return;

    const maxTakeCount = Math.min(
      extraCount,
      Math.floor(amountToTake / denom)
    );

    if (maxTakeCount > 0) {
      takePlan[denom] += maxTakeCount;
      remainingCash[denom] -= maxTakeCount;
      amountToTake -= maxTakeCount * denom;
    }
  });

  denominations.forEach(denom => {
    if (amountToTake <= 0) return;

    const availableCount = Number(remainingCash[denom] || 0);
    const maxTakeCount = Math.min(
      availableCount,
      Math.floor(amountToTake / denom)
    );

    if (maxTakeCount > 0) {
      takePlan[denom] += maxTakeCount;
      remainingCash[denom] -= maxTakeCount;
      amountToTake -= maxTakeCount * denom;
    }
  });

  if (amountToTake !== 0) {
    takePlan.unresolvedAmount = amountToTake;
  }

  return {
    takePlan,
    remainingCash
  };
}

function renderDiff(cash) {
  const diffArea = document.getElementById("diffArea");
  diffArea.innerHTML = "";

  let hasDiff = false;

  denominations.forEach(denom => {
    const current = Number(cash[denom] || 0);
    const standard = Number(standardCash[denom] || 0);
    const diff = current - standard;

    if (diff === 0) return;

    hasDiff = true;

    const div = document.createElement("div");

    if (diff > 0) {
      div.className = "diff-plus";
      div.textContent = `${denom}円：多 ${diff}`;
    } else {
      div.className = "diff-minus";
      div.textContent = `${denom}円：不足 ${Math.abs(diff)}`;
    }

    diffArea.appendChild(div);
  });

  if (!hasDiff) {
    diffArea.textContent = "刚好符合标准找零数量";
  }
}

function renderTakeIncomePlan(takePlan) {
  const area = document.getElementById("takeIncomeArea");
  area.innerHTML = "";

  if (takePlan.unresolvedAmount) {
    area.innerHTML =
      `<div class="diff-minus">无法刚好组成净收入，还剩 ${formatYen(takePlan.unresolvedAmount)} 无法处理。</div>`;
    return;
  }

  let hasPlan = false;
  let total = 0;

  denominations.forEach(denom => {
    const count = Number(takePlan[denom] || 0);
    if (count <= 0) return;

    hasPlan = true;
    total += denom * count;

    const div = document.createElement("div");
    div.className = "diff-normal";
    div.textContent = `拿走 ${denom}円 × ${count} = ${formatYen(denom * count)}`;
    area.appendChild(div);
  });

  if (!hasPlan) {
    area.textContent = "无需拿走现金。";
    return;
  }

  const totalDiv = document.createElement("div");
  totalDiv.className = "exchange-total";
  totalDiv.textContent = `合计拿走：${formatYen(total)}`;
  area.appendChild(totalDiv);
}

function renderExchangePlan(remainingCash) {
  const area = document.getElementById("exchangeArea");
  area.innerHTML = "";

  const giveToReserve = [];
  const takeFromReserve = [];

  denominations.forEach(denom => {
    const current = Number(remainingCash[denom] || 0);
    const standard = Number(standardCash[denom] || 0);
    const diff = current - standard;

    if (diff > 0) {
      giveToReserve.push({
        denom,
        count: diff,
        amount: denom * diff
      });
    } else if (diff < 0) {
      takeFromReserve.push({
        denom,
        count: Math.abs(diff),
        amount: denom * Math.abs(diff)
      });
    }
  });

  currentExchangePlan = {
    giveToReserve,
    takeFromReserve
  };

  const giveTotal = giveToReserve.reduce((sum, item) => sum + item.amount, 0);
  const takeTotal = takeFromReserve.reduce((sum, item) => sum + item.amount, 0);

  if (giveToReserve.length === 0 && takeFromReserve.length === 0) {
    area.textContent = "无需兑换，收银现金已经恢复为标准找零。";
    renderReservePreview(area, giveToReserve, takeFromReserve);
    return;
  }

  const giveTitle = document.createElement("div");
  giveTitle.className = "exchange-section-title";
  giveTitle.textContent = "交给备用金：";
  area.appendChild(giveTitle);

  if (giveToReserve.length === 0) {
    const div = document.createElement("div");
    div.textContent = "无";
    area.appendChild(div);
  } else {
    giveToReserve.forEach(item => {
      const div = document.createElement("div");
      div.className = "diff-plus";
      div.textContent =
        `${item.denom}円 × ${item.count} = ${formatYen(item.amount)}`;
      area.appendChild(div);
    });
  }

  const takeTitle = document.createElement("div");
  takeTitle.className = "exchange-section-title";
  takeTitle.textContent = "从备用金取出：";
  area.appendChild(takeTitle);

  if (takeFromReserve.length === 0) {
    const div = document.createElement("div");
    div.textContent = "无";
    area.appendChild(div);
  } else {
    takeFromReserve.forEach(item => {
      const div = document.createElement("div");
      div.className = "diff-minus";
      div.textContent =
        `${item.denom}円 × ${item.count} = ${formatYen(item.amount)}`;
      area.appendChild(div);
    });
  }

  const totalDiv = document.createElement("div");
  totalDiv.className = "exchange-total";
  totalDiv.textContent =
    `兑换金额：交出 ${formatYen(giveTotal)} / 取出 ${formatYen(takeTotal)}`;
  area.appendChild(totalDiv);

  if (giveTotal !== takeTotal) {
    const warning = document.createElement("div");
    warning.className = "diff-minus";
    warning.style.marginTop = "8px";
    warning.textContent =
      `注意：交出金额和取出金额不一致，差额为 ${formatYen(Math.abs(giveTotal - takeTotal))}。请确认净收入拿走方案或现金录入数量。`;
    area.appendChild(warning);
  }

  renderReservePreview(area, giveToReserve, takeFromReserve);
}

async function saveCurrentDay() {
  if (!canWrite()) {
    alert("没有保存权限。");
    return;
  }

  if (!currentDay) return;

  const cash = getCurrentCashInput();
  const nonCash = getCurrentNonCashInput();

  const oldDayData = currentMonthData[currentDay] || {};

  const dayData = {
    date: formatDateKey(currentYear, currentMonth, currentDay),
    cash,
    nonCash,
    exchangeApplied: oldDayData.exchangeApplied || false,
    exchangeAppliedAt: oldDayData.exchangeAppliedAt || null,
    exchangePlan: oldDayData.exchangePlan || null
  };

  try {
    const savedDay = await upsertDayDataToSupabase(currentDay, dayData);
    currentMonthData[currentDay] = savedDay;

    renderMonthSummary(currentMonthData);
    renderExchangeActionStatus();

    alert("当天数据已保存到云端。");
  } catch (error) {
    console.error(error);
    alert("保存云端数据失败：" + error.message);
  }
}

async function deleteCurrentDayData() {
  if (!canAdmin()) {
    alert("没有删除权限。");
    return;
  }

  if (!currentDay || !currentStoreId) {
    alert("请先选择日期。");
    return;
  }

  const dateText = formatDateKey(currentYear, currentMonth, currentDay);

  const ok = confirm(
    `确定要删除 ${currentYear}年${currentMonth}月${currentDay}日 的云端数据吗？\n\n` +
    `删除后该日期会恢复为未录入状态。`
  );

  if (!ok) return;

  const { error } = await supabaseClient
    .from("daily_records")
    .delete()
    .eq("store_id", currentStoreId)
    .eq("record_date", dateText);

  if (error) {
    alert("删除云端数据失败：" + error.message);
    return;
  }

  delete currentMonthData[currentDay];

  loadCurrentDayData();
  calculateCurrentDay();
  renderExchangeActionStatus();

  alert("当天云端数据已删除。");
}

function loadCurrentDayData() {
  const monthData = getMonthData();
  const dayData = monthData[currentDay];

  denominations.forEach(denom => {
    const input = document.querySelector(`input[data-denom="${denom}"]`);
    if (!input) return;

    if (dayData && dayData.cash) {
      input.value = dayData.cash[denom] ?? "";
    } else {
      input.value = standardCash[denom] ?? 0;
    }
  });

  nonCashItems.forEach(item => {
    const input = document.querySelector(`input[data-non-cash="${item.key}"]`);
    if (!input) return;

    if (dayData && dayData.nonCash) {
      input.value = dayData.nonCash[item.key] ?? "";
    } else {
      input.value = "";
    }
  });
}

function getCurrentDayData() {
  return currentMonthData[currentDay] || null;
}

function isExchangeAlreadyApplied() {
  const dayData = getCurrentDayData();
  return Boolean(dayData && dayData.exchangeApplied);
}

function renderExchangeActionStatus() {
  const area = document.getElementById("exchangeActionArea");
  const button = document.querySelector("#dayPage .execute-btn");
  const undoButton = document.getElementById("undoExchangeBtn");

  if (!area || !button) return;

  function hideUndo() {
    if (undoButton) {
      undoButton.classList.add("hidden-by-state");
      undoButton.disabled = true;
    }
  }

  function showUndo() {
    if (undoButton) {
      undoButton.classList.remove("hidden-by-state");
      undoButton.disabled = false;
    }
  }

  hideUndo();

  if (!canAdmin()) {
    area.innerHTML = `<div class="diff-minus">当前用户没有执行兑换权限。</div>`;
    button.disabled = true;
    return;
  }

  const giveToReserve = currentExchangePlan.giveToReserve || [];
  const takeFromReserve = currentExchangePlan.takeFromReserve || [];

  const hasExchange =
    giveToReserve.length > 0 || takeFromReserve.length > 0;

  if (isExchangeAlreadyApplied()) {
    const dayData = getCurrentDayData();

    area.innerHTML =
      `<div class="exchange-applied">本日兑换已执行。</div>` +
      `<div class="diff-normal">执行时间：${formatDateTimeText(dayData.exchangeAppliedAt)}</div>` +
      `<div class="diff-normal">如本日兑换执行错误，可点击下方按钮撤销。撤销会反向恢复备用金库存。</div>`;

    button.disabled = true;
    showUndo();
    return;
  }

  if (!hasExchange) {
    area.innerHTML = `<div class="exchange-applied">无需执行兑换。</div>`;
    button.disabled = true;
    return;
  }

  const shortageMessages = checkReserveShortageForCurrentPlan();

  if (shortageMessages.length > 0) {
    area.innerHTML =
      `<div class="diff-minus">备用金不足，无法执行兑换：</div>` +
      shortageMessages.map(msg => `<div class="diff-minus">${msg}</div>`).join("");

    button.disabled = true;
    return;
  }

  area.innerHTML =
    `<div class="exchange-not-applied">本日兑换尚未执行。</div>` +
    `<div class="diff-normal">确认实际完成兑换后，请点击下方按钮更新备用金库存。</div>`;

  button.disabled = false;
}
function checkReserveShortageForCurrentPlan() {
  const reserveData = getReserveData();
  const takeFromReserve = currentExchangePlan.takeFromReserve || [];
  const messages = [];

  takeFromReserve.forEach(item => {
    const currentCount = Number(reserveData[item.denom]?.count || 0);

    if (currentCount < item.count) {
      messages.push(
        `${item.denom}円：需要 ${item.count}，当前备用金只有 ${currentCount}`
      );
    }
  });

  return messages;
}

async function confirmAndApplyExchange() {
  if (!canAdmin()) {
    alert("没有权限。");
    return;
  }

  if (!currentDay) {
    alert("请先选择日期。");
    return;
  }

  if (isExchangeAlreadyApplied()) {
    alert("本日兑换已经执行过，不能重复执行。");
    renderExchangeActionStatus();
    return;
  }

  const giveToReserve = currentExchangePlan.giveToReserve || [];
  const takeFromReserve = currentExchangePlan.takeFromReserve || [];

  const hasExchange =
    giveToReserve.length > 0 || takeFromReserve.length > 0;

  if (!hasExchange) {
    alert("当前无需兑换。");
    renderExchangeActionStatus();
    return;
  }

  const shortageMessages = checkReserveShortageForCurrentPlan();

  if (shortageMessages.length > 0) {
    alert("备用金不足，无法执行兑换。\n\n" + shortageMessages.join("\n"));
    renderExchangeActionStatus();
    return;
  }

  const giveText = giveToReserve.length
    ? giveToReserve.map(item => `${item.denom}円 × ${item.count}`).join("\n")
    : "无";

  const takeText = takeFromReserve.length
    ? takeFromReserve.map(item => `${item.denom}円 × ${item.count}`).join("\n")
    : "无";

  const ok = confirm(
    `确定已经完成以下兑换，并更新备用金库存吗？\n\n` +
    `交给备用金：\n${giveText}\n\n` +
    `从备用金取出：\n${takeText}\n\n` +
    `执行后不能重复执行本日兑换。`
  );

  if (!ok) return;

  await applyExchangeToReserve();
}

async function applyExchangeToReserve() {
  const reserveData = getReserveData();

  const giveToReserve = currentExchangePlan.giveToReserve || [];
  const takeFromReserve = currentExchangePlan.takeFromReserve || [];

  giveToReserve.forEach(item => {
    reserveData[item.denom].count += item.count;
  });

  takeFromReserve.forEach(item => {
    reserveData[item.denom].count -= item.count;
  });

  try {
    await saveReserveDataToSupabase(reserveData);
  } catch (error) {
    alert("备用金云端更新失败：" + error.message);
    return;
  }

  const cash = getCurrentCashInput();
  const nonCash = getCurrentNonCashInput();

  const nowText = new Date().toISOString();

  const dayData = {
    date: formatDateKey(currentYear, currentMonth, currentDay),
    cash,
    nonCash,
    exchangeApplied: true,
    exchangeAppliedAt: nowText,
    exchangePlan: {
      giveToReserve,
      takeFromReserve
    }
  };

  try {
    const savedDay = await upsertDayDataToSupabase(currentDay, dayData);
    currentMonthData[currentDay] = savedDay;

    await createExchangeLogForCurrentDay(
      savedDay.id,
      giveToReserve,
      takeFromReserve
    );

    renderMonthSummary(currentMonthData);
    calculateCurrentDay();
    renderExchangeActionStatus();

    alert("备用金库存、每日数据和兑换日志已保存到云端。");
  } catch (error) {
    alert("执行兑换后的云端保存失败：" + error.message);
  }
}


/* =========================
   月度报表导出
========================= */

function getDailyReportRows() {
  const monthData = getMonthData();
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const rows = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayData = monthData[day];

    if (!dayData || !dayData.cash) {
      continue;
    }

    const cash = dayData.cash || {};
    const nonCash = dayData.nonCash || {};
    const cashTotal = calculateTotal(cash);
    const cashIncome = cashTotal - fixedChangeAmount;
    const paypay = Number(nonCash.paypay || 0);
    const point = Number(nonCash.point || 0);
    const credit = Number(nonCash.credit || 0);
    const totalIncome = cashIncome + paypay + point + credit;
    const fees = calculateNonCashFees(nonCash);
    const totalIncomeAfterFee = totalIncome - fees.totalFee;

    rows.push({
      day,
      date: formatDateKey(currentYear, currentMonth, day),
      cash10000: Number(cash[10000] || 0),
      cash5000: Number(cash[5000] || 0),
      cash1000: Number(cash[1000] || 0),
      cash500: Number(cash[500] || 0),
      cash100: Number(cash[100] || 0),
      cash50: Number(cash[50] || 0),
      cash10: Number(cash[10] || 0),
      cashTotal,
      cashIncome,
      paypay,
      point,
      credit,
      totalIncome,
      feeTotal: fees.totalFee,
      totalIncomeAfterFee,
      exchangeStatus: dayData.exchangeApplied ? "已执行" : "未执行"
    });
  }

  return rows;
}

function getMonthlyReportSummary(rows) {
  return rows.reduce((summary, row) => {
    summary.savedDays += 1;
    summary.cashIncome += row.cashIncome;
    summary.paypay += row.paypay;
    summary.point += row.point;
    summary.credit += row.credit;
    summary.totalIncome += row.totalIncome;
    summary.feeTotal += row.feeTotal || 0;
    summary.totalIncomeAfterFee += row.totalIncomeAfterFee ?? row.totalIncome;
    return summary;
  }, {
    savedDays: 0,
    cashIncome: 0,
    paypay: 0,
    point: 0,
    credit: 0,
    totalIncome: 0,
    feeTotal: 0,
    totalIncomeAfterFee: 0
  });
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function exportMonthlyCsvReport() {
  const rows = getDailyReportRows();

  if (rows.length === 0) {
    alert("当前月份没有可导出的数据。");
    return;
  }

  const summary = getMonthlyReportSummary(rows);

  const lines = [];

  lines.push(["店铺记账系统 月度CSV报表"].map(csvEscape).join(","));
  lines.push(["月份", `${currentYear}年${currentMonth}月`].map(csvEscape).join(","));
  lines.push(["已录入天数", summary.savedDays].map(csvEscape).join(","));
  lines.push(["现金收入合计", summary.cashIncome].map(csvEscape).join(","));
  lines.push(["PayPay合计", summary.paypay].map(csvEscape).join(","));
  lines.push(["积分合计", summary.point].map(csvEscape).join(","));
  lines.push(["信用卡合计", summary.credit].map(csvEscape).join(","));
  lines.push(["手续费前总收入", summary.totalIncome].map(csvEscape).join(","));
  lines.push(["手续费合计", summary.feeTotal].map(csvEscape).join(","));
  lines.push(["手续费后总收入", summary.totalIncomeAfterFee].map(csvEscape).join(","));
  lines.push("");

  lines.push([
    "日期",
    "现金收入",
    "PayPay",
    "积分",
    "信用卡",
    "手续费前当日总收入",
    "手续费",
    "手续费后当日总收入",
    "兑换状态",
    "10000円数量",
    "5000円数量",
    "1000円数量",
    "500円数量",
    "100円数量",
    "50円数量",
    "10円数量",
    "现金总额"
  ].map(csvEscape).join(","));

  rows.forEach(row => {
    lines.push([
      row.date,
      row.cashIncome,
      row.paypay,
      row.point,
      row.credit,
      row.totalIncome,
      row.feeTotal,
      row.totalIncomeAfterFee,
      row.exchangeStatus,
      row.cash10000,
      row.cash5000,
      row.cash1000,
      row.cash500,
      row.cash100,
      row.cash50,
      row.cash10,
      row.cashTotal
    ].map(csvEscape).join(","));
  });

  const csvText = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });

  const fileName =
    `store-cash-book-report-${currentYear}-${String(currentMonth).padStart(2, "0")}.csv`;

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printMonthlyReport() {
  const rows = getDailyReportRows();

  if (rows.length === 0) {
    alert("当前月份没有可打印的数据。");
    return;
  }

  const summary = getMonthlyReportSummary(rows);

  const rowHtml = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.date)}</td>
      <td class="num">${formatYen(row.cashIncome)}</td>
      <td class="num">${formatYen(row.paypay)}</td>
      <td class="num">${formatYen(row.point)}</td>
      <td class="num">${formatYen(row.credit)}</td>
      <td class="num">${formatYen(row.totalIncome)}</td>
      <td class="num">${formatYen(row.feeTotal || 0)}</td>
      <td class="num strong">${formatYen(row.totalIncomeAfterFee ?? row.totalIncome)}</td>
      <td>${escapeHtml(row.exchangeStatus)}</td>
    </tr>
  `).join("");

  const detailRowHtml = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.date)}</td>
      <td class="num">${row.cash10000}</td>
      <td class="num">${row.cash5000}</td>
      <td class="num">${row.cash1000}</td>
      <td class="num">${row.cash500}</td>
      <td class="num">${row.cash100}</td>
      <td class="num">${row.cash50}</td>
      <td class="num">${row.cash10}</td>
      <td class="num">${formatYen(row.cashTotal)}</td>
    </tr>
  `).join("");

  const reportHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${currentYear}年${currentMonth}月 店铺月度报表</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans", "Microsoft YaHei", sans-serif;
      color: #111827;
      margin: 24px;
      line-height: 1.5;
    }
    h1 {
      font-size: 24px;
      margin: 0 0 4px;
      text-align: center;
    }
    .subtitle {
      text-align: center;
      color: #4b5563;
      margin-bottom: 20px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    .box {
      border: 1px solid #d1d5db;
      border-radius: 10px;
      padding: 10px;
      background: #f9fafb;
    }
    .label {
      font-size: 12px;
      color: #6b7280;
    }
    .value {
      font-size: 18px;
      font-weight: 700;
      margin-top: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 12px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 6px;
      text-align: left;
    }
    th {
      background: #f3f4f6;
    }
    .num {
      text-align: right;
    }
    .strong {
      font-weight: 700;
    }
    .section-title {
      font-size: 16px;
      font-weight: 700;
      margin-top: 24px;
    }
    .footer {
      margin-top: 20px;
      text-align: right;
      font-size: 11px;
      color: #6b7280;
    }
    @media print {
      body { margin: 12mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:right;margin-bottom:12px;">
    <button onclick="window.print()" style="padding:8px 14px;">打印 / 另存为PDF</button>
  </div>

  <h1>店铺记账系统 月度报表</h1>
  <div class="subtitle">${currentYear}年${currentMonth}月</div>

  <div class="summary">
    <div class="box">
      <div class="label">已录入天数</div>
      <div class="value">${summary.savedDays}天</div>
    </div>
    <div class="box">
      <div class="label">现金收入合计</div>
      <div class="value">${formatYen(summary.cashIncome)}</div>
    </div>
    <div class="box">
      <div class="label">PayPay合计</div>
      <div class="value">${formatYen(summary.paypay)}</div>
    </div>
    <div class="box">
      <div class="label">积分合计</div>
      <div class="value">${formatYen(summary.point)}</div>
    </div>
    <div class="box">
      <div class="label">信用卡合计</div>
      <div class="value">${formatYen(summary.credit)}</div>
    </div>
    <div class="box">
      <div class="label">手续费前总收入</div>
      <div class="value">${formatYen(summary.totalIncome)}</div>
    </div>
    <div class="box">
      <div class="label">手续费合计</div>
      <div class="value">${formatYen(summary.feeTotal)}</div>
    </div>
    <div class="box">
      <div class="label">手续费后总收入</div>
      <div class="value">${formatYen(summary.totalIncomeAfterFee)}</div>
    </div>
  </div>

  <div class="section-title">每日收入明细</div>
  <table>
    <thead>
      <tr>
        <th>日期</th>
        <th>现金收入</th>
        <th>PayPay</th>
        <th>积分</th>
        <th>信用卡</th>
        <th>手续费前收入</th>
        <th>手续费</th>
        <th>手续费后收入</th>
        <th>兑换状态</th>
      </tr>
    </thead>
    <tbody>
      ${rowHtml}
    </tbody>
  </table>

  <div class="section-title">现金数量明细</div>
  <table>
    <thead>
      <tr>
        <th>日期</th>
        <th>10000円</th>
        <th>5000円</th>
        <th>1000円</th>
        <th>500円</th>
        <th>100円</th>
        <th>50円</th>
        <th>10円</th>
        <th>现金总额</th>
      </tr>
    </thead>
    <tbody>
      ${detailRowHtml}
    </tbody>
  </table>

  <div class="footer">
    输出时间：${new Date().toLocaleString("ja-JP")}
  </div>
</body>
</html>`;

  const reportWindow = window.open("", "_blank");

  if (!reportWindow) {
    alert("浏览器阻止了弹出窗口。请允许弹出窗口后重试。");
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
}

/* =========================
   导入导出
========================= */

function exportCurrentMonthData() {
  currentYear = Number(document.getElementById("yearInput").value);
  currentMonth = Number(document.getElementById("monthInput").value);

  const monthData = getMonthData();
  const reserveData = getReserveData();

  const backupData = {
    appName: "store-cash-book",
    version: "3.2-global-settings-fee-10min-logout",
    year: currentYear,
    month: currentMonth,
    fixedChangeAmount,
    standardCash,
    defaultReserveCash,
    reserveData,
    denominations,
    nonCashItems,
    data: monthData,
    exportedAt: new Date().toISOString()
  };

  const jsonText = JSON.stringify(backupData, null, 2);
  const blob = new Blob([jsonText], { type: "application/json" });

  const fileName =
    `cash-book-backup-${currentYear}-${String(currentMonth).padStart(2, "0")}.json`;

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importBackupFile(event) {
  if (!canAdmin()) {
    alert("没有导入权限。");
    return;
  }

  const file = event.target.files[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = async function(e) {
    try {
      const backupData = JSON.parse(e.target.result);

      if (!backupData || backupData.appName !== "store-cash-book") {
        alert("这个文件不是店铺记账系统的备份文件。");
        return;
      }

      if (!backupData.year || !backupData.month || !backupData.data) {
        alert("备份文件内容不完整，无法导入。");
        return;
      }

      const ok = confirm(
        `确定要导入 ${backupData.year}年${backupData.month}月 的备份到云端吗？\n\n` +
        `注意：这会覆盖云端该月份相同日期的数据。`
      );

      if (!ok) {
        return;
      }

      currentYear = Number(backupData.year);
      currentMonth = Number(backupData.month);

      document.getElementById("yearInput").value = currentYear;
      document.getElementById("monthInput").value = currentMonth;

      const importData = backupData.data || {};
      const days = Object.keys(importData);

      for (const dayKey of days) {
        const day = Number(dayKey);
        await upsertDayDataToSupabase(day, importData[dayKey]);
      }

      if (backupData.reserveData) {
        const reserveData = normalizeReserveData(backupData.reserveData);
        await saveReserveDataToSupabase(reserveData);
      }

      await generateMonth();

      alert("备份已导入云端。");
    } catch (error) {
      console.error(error);
      alert("导入失败：" + error.message);
    } finally {
      event.target.value = "";
    }
  };

  reader.readAsText(file);
}



/* =========================
   全局设置：手续费
========================= */

function renderFeeSettingsInputs() {
  const paypayInput = document.getElementById("paypayFeeInput");
  const pointInput = document.getElementById("pointFeeInput");
  const creditInput = document.getElementById("creditFeeInput");

  if (paypayInput) paypayInput.value = currentFeeSettings.paypay;
  if (pointInput) pointInput.value = currentFeeSettings.point;
  if (creditInput) creditInput.value = currentFeeSettings.credit;
}

function getFeeSettingsInputData() {
  return {
    paypay: Number(document.getElementById("paypayFeeInput")?.value || 0),
    point: Number(document.getElementById("pointFeeInput")?.value || 0),
    credit: Number(document.getElementById("creditFeeInput")?.value || 0)
  };
}

async function saveGlobalSettings() {
  if (!canAdmin()) {
    alert("没有权限。");
    return;
  }

  if (!currentStoreId) {
    alert("未读取到默认店铺。");
    return;
  }

  const feeSettings = getFeeSettingsInputData();

  const { error } = await supabaseClient
    .from("stores")
    .update({
      paypay_fee_rate: feeSettings.paypay,
      point_fee_rate: feeSettings.point,
      credit_fee_rate: feeSettings.credit
    })
    .eq("id", currentStoreId);

  if (error) {
    alert("手续费设置保存失败：" + error.message);
    return;
  }

  currentFeeSettings = feeSettings;
  renderMonthSummary(currentMonthData);

  alert("手续费设置已保存到云端。");
}

/* =========================
   兑换日志 / 撤销兑换
========================= */

async function createExchangeLogForCurrentDay(dailyRecordId, giveToReserve, takeFromReserve) {
  if (!currentStoreId || !currentDay) {
    throw new Error("店铺或日期未选择。");
  }

  const { error } = await supabaseClient
    .from("exchange_logs")
    .insert({
      store_id: currentStoreId,
      daily_record_id: dailyRecordId || null,
      record_date: formatDateKey(currentYear, currentMonth, currentDay),
      give_to_reserve: giveToReserve || [],
      take_from_reserve: takeFromReserve || [],
      created_by: currentUser?.id || null
    });

  if (error) {
    throw error;
  }
}

async function getLatestExchangeLogForCurrentDay() {
  if (!currentStoreId || !currentDay) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from("exchange_logs")
    .select("*")
    .eq("store_id", currentStoreId)
    .eq("record_date", formatDateKey(currentYear, currentMonth, currentDay))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function applyReverseExchangeToReserveData(reserveData, giveToReserve, takeFromReserve) {
  const updated = cloneReserveData(reserveData);

  // 原执行时：交给备用金 = 备用金增加；撤销时反向减少
  (giveToReserve || []).forEach(item => {
    updated[item.denom].count -= Number(item.count || 0);
  });

  // 原执行时：从备用金取出 = 备用金减少；撤销时反向增加
  (takeFromReserve || []).forEach(item => {
    updated[item.denom].count += Number(item.count || 0);
  });

  return updated;
}

async function confirmAndUndoExchange() {
  if (!canAdmin()) {
    alert("没有权限。");
    return;
  }

  if (!currentDay) {
    alert("请先选择日期。");
    return;
  }

  if (!isExchangeAlreadyApplied()) {
    alert("本日尚未执行兑换，无需撤销。");
    renderExchangeActionStatus();
    return;
  }

  let log = null;

  try {
    log = await getLatestExchangeLogForCurrentDay();
  } catch (error) {
    alert("读取兑换日志失败：" + error.message);
    return;
  }

  if (!log) {
    alert(
      "没有找到本日兑换日志，无法自动撤销。\n\n" +
      "可能原因：该兑换是在旧版本执行的，没有保存兑换明细。"
    );
    return;
  }

  const giveToReserve = log.give_to_reserve || [];
  const takeFromReserve = log.take_from_reserve || [];

  const giveText = giveToReserve.length
    ? giveToReserve.map(item => `${item.denom}円 × ${item.count}`).join("\n")
    : "无";

  const takeText = takeFromReserve.length
    ? takeFromReserve.map(item => `${item.denom}円 × ${item.count}`).join("\n")
    : "无";

  const ok = confirm(
    `确定要撤销本日兑换吗？\n\n` +
    `原本交给备用金：\n${giveText}\n\n` +
    `原本从备用金取出：\n${takeText}\n\n` +
    `撤销后系统会反向恢复备用金，并允许本日重新执行兑换。`
  );

  if (!ok) return;

  try {
    await loadReserveDataFromSupabase();

    const currentReserve = getReserveData();
    const reversedReserve = applyReverseExchangeToReserveData(
      currentReserve,
      giveToReserve,
      takeFromReserve
    );

    for (const denom of denominations) {
      if (reversedReserve[denom].count < 0) {
        throw new Error(`${denom}円 撤销后库存会小于 0，请先确认备用金实际库存。`);
      }
    }

    await saveReserveDataToSupabase(reversedReserve);

    const dayData = currentMonthData[currentDay] || {
      date: formatDateKey(currentYear, currentMonth, currentDay),
      cash: getCurrentCashInput(),
      nonCash: getCurrentNonCashInput()
    };

    dayData.exchangeApplied = false;
    dayData.exchangeAppliedAt = null;

    const savedDay = await upsertDayDataToSupabase(currentDay, dayData);
    currentMonthData[currentDay] = savedDay;

    const { error: deleteLogError } = await supabaseClient
      .from("exchange_logs")
      .delete()
      .eq("id", log.id);

    if (deleteLogError) {
      alert(
        "兑换已撤销，但删除兑换日志失败：\n" +
        deleteLogError.message +
        "\n\n请到 Supabase exchange_logs 手动确认。"
      );
    }

    calculateCurrentDay();
    renderExchangeActionStatus();

    alert("本日兑换已撤销，备用金已反向恢复。");
  } catch (error) {
    alert("撤销兑换失败：" + error.message);
  }
}

/* =========================
   备用金管理
========================= */

function normalizeReserveData(rawData) {
  const reserve = cloneReserveData(defaultReserveCash);

  denominations.forEach(denom => {
    if (rawData && rawData[denom]) {
      const raw = rawData[denom];

      reserve[denom] = {
        count: Number(raw.count || 0),
        target: Number(
          raw.target !== undefined
            ? raw.target
            : defaultReserveCash[denom].target
        )
      };
    }
  });

  return reserve;
}

function cloneReserveData(reserveData) {
  const copied = {};

  denominations.forEach(denom => {
    copied[denom] = {
      count: Number(reserveData[denom]?.count || 0),
      target: Number(reserveData[denom]?.target || 0)
    };
  });

  return copied;
}

async function loadReserveDataFromSupabase() {
  if (!currentStoreId) {
    currentReserveData = cloneReserveData(defaultReserveCash);
    return currentReserveData;
  }

  const { data, error } = await supabaseClient
    .from("reserve_cash")
    .select("denomination, count, target")
    .eq("store_id", currentStoreId)
    .order("denomination", { ascending: false });

  if (error) {
    alert("读取云端备用金失败：" + error.message);
    currentReserveData = cloneReserveData(defaultReserveCash);
    return currentReserveData;
  }

  const reserve = cloneReserveData(defaultReserveCash);

  (data || []).forEach(row => {
    reserve[row.denomination] = {
      count: Number(row.count || 0),
      target: Number(row.target || 0)
    };
  });

  currentReserveData = reserve;
  return currentReserveData;
}

async function saveReserveDataToSupabase(reserveData) {
  if (!canAdmin()) {
    throw new Error("没有备用金操作权限。");
  }

  if (!currentStoreId) {
    throw new Error("未读取到默认店铺。");
  }

  const rows = denominations.map(denom => ({
    store_id: currentStoreId,
    denomination: denom,
    count: Number(reserveData[denom]?.count || 0),
    target: Number(reserveData[denom]?.target || 0),
    updated_by: currentUser?.id || null
  }));

  const { error } = await supabaseClient
    .from("reserve_cash")
    .upsert(rows, {
      onConflict: "store_id,denomination"
    });

  if (error) {
    throw error;
  }

  currentReserveData = cloneReserveData(reserveData);
  return currentReserveData;
}

function getReserveData() {
  if (!currentReserveData) {
    return cloneReserveData(defaultReserveCash);
  }

  return cloneReserveData(currentReserveData);
}

async function showReservePage() {
  if (!canAdmin()) {
    alert("没有权限。");
    return;
  }

  hideAllPages();
  document.getElementById("reservePage").classList.add("active");
  scrollToTop();

  await loadDefaultStore();
  await loadReserveDataFromSupabase();

  renderFeeSettingsInputs();
  renderReserveInputs();
  renderReserveSummary();
  renderReserveAlerts();
  renderReserveRebalancePlan();
  applyPermissions();
}

function renderReserveInputs() {
  const reserveData = getReserveData();
  const area = document.getElementById("reserveInputArea");
  area.innerHTML = "";

  const header = document.createElement("div");
  header.className = "reserve-header";
  header.innerHTML = `
    <div>面额</div>
    <div>当前库存</div>
    <div>-</div>
    <div>+</div>
    <div>目标库存</div>
    <div>-</div>
    <div>+</div>
  `;
  area.appendChild(header);

  denominations.forEach(denom => {
    const row = document.createElement("div");
    row.className = "reserve-row";

    const label = document.createElement("label");
    label.textContent = `${denom}円`;

    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.min = "0";
    countInput.value = reserveData[denom].count;
    countInput.dataset.reserveCount = denom;

    const targetInput = document.createElement("input");
    targetInput.type = "number";
    targetInput.min = "0";
    targetInput.value = reserveData[denom].target;
    targetInput.dataset.reserveTarget = denom;

    countInput.addEventListener("input", renderReserveLiveInfoFromInputs);
    targetInput.addEventListener("input", renderReserveLiveInfoFromInputs);

    const countMinusBtn = document.createElement("button");
    countMinusBtn.type = "button";
    countMinusBtn.className = "reserve-small-btn";
    countMinusBtn.textContent = "-";
    countMinusBtn.addEventListener("click", () => {
      const value = Number(countInput.value || 0);
      countInput.value = Math.max(0, value - 1);
      renderReserveLiveInfoFromInputs();
    });

    const countPlusBtn = document.createElement("button");
    countPlusBtn.type = "button";
    countPlusBtn.className = "reserve-small-btn";
    countPlusBtn.textContent = "+";
    countPlusBtn.addEventListener("click", () => {
      const value = Number(countInput.value || 0);
      countInput.value = value + 1;
      renderReserveLiveInfoFromInputs();
    });

    const targetMinusBtn = document.createElement("button");
    targetMinusBtn.type = "button";
    targetMinusBtn.className = "reserve-small-btn";
    targetMinusBtn.textContent = "-";
    targetMinusBtn.addEventListener("click", () => {
      const value = Number(targetInput.value || 0);
      targetInput.value = Math.max(0, value - 1);
      renderReserveLiveInfoFromInputs();
    });

    const targetPlusBtn = document.createElement("button");
    targetPlusBtn.type = "button";
    targetPlusBtn.className = "reserve-small-btn";
    targetPlusBtn.textContent = "+";
    targetPlusBtn.addEventListener("click", () => {
      const value = Number(targetInput.value || 0);
      targetInput.value = value + 1;
      renderReserveLiveInfoFromInputs();
    });

    row.appendChild(label);
    row.appendChild(countInput);
    row.appendChild(countMinusBtn);
    row.appendChild(countPlusBtn);
    row.appendChild(targetInput);
    row.appendChild(targetMinusBtn);
    row.appendChild(targetPlusBtn);

    area.appendChild(row);
  });
}

function getReserveInputData() {
  const reserveData = {};

  denominations.forEach(denom => {
    const countInput = document.querySelector(`input[data-reserve-count="${denom}"]`);
    const targetInput = document.querySelector(`input[data-reserve-target="${denom}"]`);

    reserveData[denom] = {
      count: Number(countInput?.value || 0),
      target: Number(targetInput?.value || 0)
    };
  });

  return reserveData;
}

async function saveReserveData() {
  if (!canAdmin()) {
    alert("没有权限。");
    return;
  }

  const reserveData = getReserveInputData();

  try {
    await saveReserveDataToSupabase(reserveData);

    renderReserveSummary(reserveData);
    renderReserveAlerts(reserveData);
    renderReserveRebalancePlan(reserveData);

    alert("备用金设置已保存到云端。");
  } catch (error) {
    alert("备用金保存失败：" + error.message);
  }
}

function renderReserveLiveInfoFromInputs() {
  const reserveData = getReserveInputData();

  renderReserveSummary(reserveData);
  renderReserveAlerts(reserveData);
  renderReserveRebalancePlan(reserveData);
}

function renderReserveSummary(optionalReserveData) {
  const reserveData = optionalReserveData || getReserveData();

  const currentTotal = calculateReserveTotal(reserveData, "count");
  const targetTotal = calculateReserveTotal(reserveData, "target");
  const diff = currentTotal - targetTotal;

  document.getElementById("reserveCurrentTotalText").textContent =
    formatYen(currentTotal);

  document.getElementById("reserveTargetTotalText").textContent =
    formatYen(targetTotal);

  const diffText = diff === 0
    ? "0円"
    : diff > 0
      ? `多 ${formatYen(diff)}`
      : `少 ${formatYen(Math.abs(diff))}`;

  document.getElementById("reserveDiffTotalText").textContent = diffText;
}

function renderReserveAlerts(optionalReserveData) {
  const reserveData = optionalReserveData || getReserveData();
  const area = document.getElementById("reserveAlertArea");

  if (!area) return;

  area.innerHTML = "";

  let hasDiff = false;

  denominations.forEach(denom => {
    const count = Number(reserveData[denom].count || 0);
    const target = Number(reserveData[denom].target || 0);
    const diff = count - target;

    const div = document.createElement("div");

    if (diff > 0) {
      hasDiff = true;
      div.className = "diff-plus";
      div.textContent = `${denom}円：当前 ${count}，目标 ${target}，多 ${diff}`;
    } else if (diff < 0) {
      hasDiff = true;
      div.className = "diff-minus";
      div.textContent = `${denom}円：当前 ${count}，目标 ${target}，不足 ${Math.abs(diff)}`;
    } else {
      div.className = "reserve-ok";
      div.textContent = `${denom}円：当前 ${count}，目标 ${target}，正常`;
    }

    area.appendChild(div);
  });

  if (!hasDiff) {
    const ok = document.createElement("div");
    ok.className = "reserve-ok";
    ok.textContent = "备用金库存已经符合目标数量。";
    area.prepend(ok);
  }
}

function buildReserveRebalancePlan(reserveData) {
  const overList = [];
  const shortageList = [];

  denominations.forEach(denom => {
    const count = Number(reserveData[denom].count || 0);
    const target = Number(reserveData[denom].target || 0);
    const diff = count - target;

    if (diff > 0) {
      overList.push({
        denom,
        count: diff,
        amount: denom * diff
      });
    } else if (diff < 0) {
      shortageList.push({
        denom,
        count: Math.abs(diff),
        amount: denom * Math.abs(diff)
      });
    }
  });

  const overTotal = overList.reduce((sum, item) => sum + item.amount, 0);
  const shortageTotal = shortageList.reduce((sum, item) => sum + item.amount, 0);

  return {
    overList,
    shortageList,
    overTotal,
    shortageTotal,
    diffTotal: overTotal - shortageTotal
  };
}

function renderReserveRebalancePlan(optionalReserveData) {
  const reserveData = optionalReserveData || getReserveData();
  const area = document.getElementById("reserveRebalanceArea");
  const button = document.querySelector("#reservePage .execute-btn");

  if (!area || !button) return;

  area.innerHTML = "";

  const plan = buildReserveRebalancePlan(reserveData);

  if (plan.overList.length === 0 && plan.shortageList.length === 0) {
    area.innerHTML = `<div class="exchange-applied">备用金已经符合目标库存，无需整理。</div>`;
    button.disabled = true;
    return;
  }

  const currentTotal = calculateReserveTotal(reserveData, "count");
  const targetTotal = calculateReserveTotal(reserveData, "target");

  if (currentTotal !== targetTotal) {
    const div = document.createElement("div");
    div.className = "diff-minus";

    if (currentTotal > targetTotal) {
      div.textContent =
        `当前备用金总额比目标多 ${formatYen(currentTotal - targetTotal)}。仅靠内部兑换无法完全恢复目标，请先移出多余金额或调整目标库存。`;
    } else {
      div.textContent =
        `当前备用金总额比目标少 ${formatYen(targetTotal - currentTotal)}。仅靠内部兑换无法完全恢复目标，需要外部补充或调整目标库存。`;
    }

    area.appendChild(div);
    button.disabled = true;
  } else {
    button.disabled = !canAdmin();
  }

  const overTitle = document.createElement("div");
  overTitle.className = "exchange-section-title";
  overTitle.textContent = "可用于兑换的多余面额：";
  area.appendChild(overTitle);

  if (plan.overList.length === 0) {
    const div = document.createElement("div");
    div.textContent = "无";
    area.appendChild(div);
  } else {
    plan.overList.forEach(item => {
      const div = document.createElement("div");
      div.className = "diff-plus";
      div.textContent =
        `${item.denom}円 × ${item.count} = ${formatYen(item.amount)}`;
      area.appendChild(div);
    });
  }

  const shortageTitle = document.createElement("div");
  shortageTitle.className = "exchange-section-title";
  shortageTitle.textContent = "需要补足的面额：";
  area.appendChild(shortageTitle);

  if (plan.shortageList.length === 0) {
    const div = document.createElement("div");
    div.textContent = "无";
    area.appendChild(div);
  } else {
    plan.shortageList.forEach(item => {
      const div = document.createElement("div");
      div.className = "diff-minus";
      div.textContent =
        `${item.denom}円 × ${item.count} = ${formatYen(item.amount)}`;
      area.appendChild(div);
    });
  }

  const totalDiv = document.createElement("div");
  totalDiv.className = "exchange-total";
  totalDiv.textContent =
    `整理金额：多余 ${formatYen(plan.overTotal)} / 不足 ${formatYen(plan.shortageTotal)}`;
  area.appendChild(totalDiv);

  if (currentTotal === targetTotal) {
    const suggestTitle = document.createElement("div");
    suggestTitle.className = "exchange-section-title";
    suggestTitle.textContent = "建议操作：";
    area.appendChild(suggestTitle);

    const div = document.createElement("div");
    div.className = "diff-normal";
    div.textContent =
      "将上方多余面额拿去兑换为不足面额。确认实际整理完成后，点击下方按钮，系统会把当前库存更新为目标库存。";
    area.appendChild(div);
  }
}

async function confirmAndRebalanceReserve() {
  if (!canAdmin()) {
    alert("没有权限。");
    return;
  }

  const reserveData = getReserveInputData();
  const currentTotal = calculateReserveTotal(reserveData, "count");
  const targetTotal = calculateReserveTotal(reserveData, "target");

  if (currentTotal !== targetTotal) {
    alert(
      `当前备用金总额和目标总额不一致，不能仅靠内部兑换整理。\n\n` +
      `当前总额：${formatYen(currentTotal)}\n` +
      `目标总额：${formatYen(targetTotal)}`
    );
    return;
  }

  const plan = buildReserveRebalancePlan(reserveData);

  if (plan.overList.length === 0 && plan.shortageList.length === 0) {
    alert("备用金已经符合目标库存，无需整理。");
    return;
  }

  const overText = plan.overList.length
    ? plan.overList.map(item => `${item.denom}円 × ${item.count}`).join("\n")
    : "无";

  const shortageText = plan.shortageList.length
    ? plan.shortageList.map(item => `${item.denom}円 × ${item.count}`).join("\n")
    : "无";

  const ok = confirm(
    `确定已经完成备用金内部整理吗？\n\n` +
    `拿去兑换的多余面额：\n${overText}\n\n` +
    `兑换回来的不足面额：\n${shortageText}\n\n` +
    `确认后，系统会把当前库存更新为目标库存。`
  );

  if (!ok) return;

  denominations.forEach(denom => {
    reserveData[denom].count = reserveData[denom].target;
  });

  try {
    await saveReserveDataToSupabase(reserveData);

    renderReserveInputs();
    renderReserveSummary(reserveData);
    renderReserveAlerts(reserveData);
    renderReserveRebalancePlan(reserveData);

    alert("备用金库存已更新为目标库存，并保存到云端。");
  } catch (error) {
    alert("备用金整理保存失败：" + error.message);
  }
}

function renderReservePreview(container, giveToReserve, takeFromReserve) {
  const reserveData = getReserveData();
  const afterReserve = cloneReserveData(reserveData);

  giveToReserve.forEach(item => {
    afterReserve[item.denom].count += item.count;
  });

  takeFromReserve.forEach(item => {
    afterReserve[item.denom].count -= item.count;
  });

  const preview = document.createElement("div");
  preview.className = "reserve-preview";

  const title = document.createElement("div");
  title.className = "exchange-section-title";
  title.textContent = "兑换后备用金预估：";
  preview.appendChild(title);

  denominations.forEach(denom => {
    const before = Number(reserveData[denom].count || 0);
    const after = Number(afterReserve[denom].count || 0);
    const target = Number(afterReserve[denom].target || 0);

    const div = document.createElement("div");

    if (after < 0) {
      div.className = "reserve-negative";
      div.textContent = `${denom}円：${before} → ${after}，备用金不足，无法完成兑换`;
    } else if (after < target) {
      div.className = "reserve-low";
      div.textContent = `${denom}円：${before} → ${after}，低于目标 ${target}`;
    } else if (after > target) {
      div.className = "diff-plus";
      div.textContent = `${denom}円：${before} → ${after}，高于目标 ${target}`;
    } else {
      div.className = "reserve-ok";
      div.textContent = `${denom}円：${before} → ${after}，符合目标`;
    }

    preview.appendChild(div);
  });

  container.appendChild(preview);
}

window.addEventListener("load", async () => {
  const ok = initializeSupabase();

  if (!ok) {
    showLogin();
    return;
  }

  await restoreLogin();
});
