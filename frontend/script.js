const currentOrigin = globalThis.location?.origin;
const API_ROOT = currentOrigin && currentOrigin !== "null"
  ? currentOrigin
  : "http://localhost:5000";

const expenseForm = document.getElementById("expenseForm");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const descriptionInput = document.getElementById("description");
const dateInput = document.getElementById("date");
const filterSelect = document.getElementById("filter");
const sortSelect = document.getElementById("sort");
const listElement = document.getElementById("list");
const totalElement = document.getElementById("total");
const formStatus = document.getElementById("formStatus");
const listStatus = document.getElementById("listStatus");
const emptyState = document.getElementById("emptyState");
const submitButton = document.getElementById("submitButton");
const resetFiltersButton = document.getElementById("resetFiltersButton");

let isSubmitting = false;
const knownCategories = new Set();

function formatAmount(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount));
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function buildQueryString(params) {
  const query = new URLSearchParams();

  if (params.category) {
    query.set("category", params.category);
  }

  if (params.sort) {
    query.set("sort", params.sort);
  }

  const rendered = query.toString();
  return rendered ? `?${rendered}` : "";
}

function renderCategories(expenses) {
  const currentValue = filterSelect.value;

  expenses.forEach((expense) => {
    knownCategories.add(String(expense.category || "").toLowerCase());
  });

  const categories = [...knownCategories].sort((left, right) => left.localeCompare(right));

  filterSelect.innerHTML = '<option value="">All categories</option>';

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    filterSelect.appendChild(option);
  });

  if (currentValue && categories.includes(currentValue)) {
    filterSelect.value = currentValue;
  }
}

function renderExpenses(expenses) {
  listElement.innerHTML = "";
  let total = 0;

  expenses.forEach((expense) => {
    const amt = Number(expense.amount);
    const safeAmt = Number.isFinite(amt) ? amt : 0;
    total += safeAmt;

    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    const categoryCell = document.createElement("td");
    const descriptionCell = document.createElement("td");
    const amountCell = document.createElement("td");

    dateCell.textContent = expense.date;
    categoryCell.textContent = String(expense.category || "");
    descriptionCell.textContent = expense.description;
    amountCell.textContent = formatAmount(safeAmt.toFixed(2));

    row.append(dateCell, categoryCell, descriptionCell, amountCell);
    listElement.appendChild(row);
  });

  totalElement.textContent = `Total: ${formatAmount(total.toFixed(2))}`;
  emptyState.hidden = expenses.length > 0;
}

async function loadExpenses() {
  const category = filterSelect.value;
  const sort = sortSelect.value;

  setStatus(listStatus, "Loading expenses...");

  try {
    const response = await fetch(`${API_ROOT}/expenses${buildQueryString({ category, sort })}`);

    if (!response.ok) {
      throw new Error(`Failed to load expenses (${response.status})`);
    }

    const expenses = await response.json();

    renderCategories(expenses);
    renderExpenses(expenses);
    setStatus(listStatus, `${expenses.length} expense${expenses.length === 1 ? "" : "s"} loaded.`);
  } catch (error) {
    setStatus(listStatus, error.message || "Unable to load expenses.", true);
    listElement.innerHTML = "";
    totalElement.textContent = "Total: ₹0.00";
    emptyState.hidden = false;
  }
}

async function addExpense(event) {
  event.preventDefault();

  if (isSubmitting) {
    return;
  }

  const amount = amountInput.value.trim();
  const category = categoryInput.value.trim();
  const description = descriptionInput.value.trim();
  const date = dateInput.value;

  if (!amount || !category || !description || !date) {
    setStatus(formStatus, "All fields are required.", true);
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  setStatus(formStatus, "Saving expense...");

  try {
    const response = await fetch(`${API_ROOT}/expenses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ amount, category, description, date })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "Failed to save expense.");
    }

    expenseForm.reset();
    setStatus(formStatus, "Expense saved.");
    await loadExpenses();
  } catch (error) {
    setStatus(formStatus, error.message || "Unable to save expense.", true);
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
  }
}

expenseForm.addEventListener("submit", addExpense);
filterSelect.addEventListener("change", loadExpenses);
sortSelect.addEventListener("change", loadExpenses);
resetFiltersButton.addEventListener("click", () => {
  filterSelect.value = "";
  sortSelect.value = "date_desc";
  loadExpenses();
});

await loadExpenses();