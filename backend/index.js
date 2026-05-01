const express = require("express");
const cors = require("cors");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const app = express();
const dataFilePath = path.join(__dirname, "data", "expenses.json");
const frontendPath = path.join(__dirname, "..", "frontend");

app.use(cors());
app.use(express.json());
app.use(express.static(frontendPath));

let expenses = [];
let isLoaded = false;
let writeQueue = Promise.resolve();
let mutationQueue = Promise.resolve();

function normalizeText(value) {
  return String(value ?? "").trim();
}

function toCents(amountValue) {
  const normalized = normalizeText(amountValue);

  if (!normalized || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const [rupeesPart, paisePart = ""] = normalized.split(".");
  const rupees = Number(rupeesPart);
  const paise = Number((paisePart + "00").slice(0, 2));

  if (!Number.isSafeInteger(rupees) || !Number.isSafeInteger(paise)) {
    return null;
  }

  return rupees * 100 + paise;
}

function formatMoney(cents) {
  return (cents / 100).toFixed(2);
}

function fingerprintExpense(expense) {
  const hash = crypto.createHash("sha256");

  hash.update(JSON.stringify({
    amount: expense.amount,
    category: expense.category,
    description: expense.description,
    date: expense.date,
    idempotencyKey: expense.idempotencyKey || ""
  }));

  return hash.digest("hex");
}

async function ensureDataDirectory() {
  await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
}

async function loadExpenses() {
  if (isLoaded) {
    return;
  }

  await ensureDataDirectory();

  try {
    const raw = await fs.readFile(dataFilePath, "utf8");
    const parsed = JSON.parse(raw);
    expenses = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    expenses = [];
  }

  isLoaded = true;
}

async function persistExpenses() {
  await ensureDataDirectory();

  const serialized = JSON.stringify(expenses, null, 2);
  writeQueue = writeQueue.then(() => fs.writeFile(dataFilePath, serialized, "utf8"));
  await writeQueue;
}

async function runExclusiveMutation(operation) {
  const nextMutation = mutationQueue.then(operation);
  mutationQueue = nextMutation.then(
    () => undefined,
    () => undefined
  );

  return nextMutation;
}

function serializeExpense(expense) {
  const amount =
    expense.amount !== undefined && expense.amount !== null
      ? String(expense.amount)
      : expense.amountCents !== undefined
      ? formatMoney(expense.amountCents)
      : "0.00";

  const category = (expense.category || "").toLowerCase();

  return {
    id: expense.id,
    amount: amount,
    category: category,
    description: expense.description,
    date: expense.date,
    created_at: expense.createdAt
  };
}

function sortExpensesByNewestFirst(left, right) {
  const dateComparison = new Date(right.date).getTime() - new Date(left.date).getTime();

  if (dateComparison !== 0) {
    return dateComparison;
  }

  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.post("/expenses", async (req, res) => {
  try {
    const response = await runExclusiveMutation(async () => {
      await loadExpenses();

      const amount = Number(req.body.amount);
      const category = normalizeText(req.body.category).toLowerCase();
      const description = normalizeText(req.body.description);
      const date = normalizeText(req.body.date);
      const idempotencyKey = normalizeText(req.get("Idempotency-Key"));

      if (!amount || amount <= 0 || !Number.isFinite(amount)) {
        return { status: 400, body: { error: "Amount must be a positive number with up to 2 decimals." } };
      }

      if (!category) {
        return { status: 400, body: { error: "Category is required." } };
      }

      if (!description) {
        return { status: 400, body: { error: "Description is required." } };
      }

      if (!date || Number.isNaN(new Date(date).getTime())) {
        return { status: 400, body: { error: "A valid date is required." } };
      }

      const normalizedExpense = {
        amount: Number(amount).toFixed(2),
        category,
        description,
        date,
        idempotencyKey
      };

      const fingerprint = fingerprintExpense(normalizedExpense);
      const existingExpense = expenses.find((expense) => expense.fingerprint === fingerprint);

      if (existingExpense) {
        return { status: 200, body: serializeExpense(existingExpense) };
      }

      const newExpense = {
        id: crypto.randomUUID(),
        amount: Number(amount).toFixed(2),
        category,
        description,
        date,
        createdAt: new Date().toISOString(),
        fingerprint
      };

      expenses.push(newExpense);
      await persistExpenses();

      return { status: 201, body: serializeExpense(newExpense) };
    });

    return res.status(response.status).json(response.body);
  } catch (error) {
    console.error("Failed to save expense:", error);
    return res.status(500).json({ error: "Failed to save expense." });
  }
});

app.get("/expenses", async (req, res) => {
  await loadExpenses();

  const categoryFilter = normalizeText(req.query.category).toLowerCase();
  const sort = normalizeText(req.query.sort);

  let result = expenses.slice();

  if (categoryFilter) {
    result = result.filter((expense) => (String(expense.category || "")).toLowerCase() === categoryFilter);
  }

  if (sort === "date_desc") {
    result.sort(sortExpensesByNewestFirst);
  }

  res.json(result.map(serializeExpense));
});

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 5000;

  loadExpenses()
    .then(() => {
      app.listen(port, () => {
        console.log(`Expense Tracker API running on http://localhost:${port}`);
      });
    })
    .catch((error) => {
      console.error("Failed to start server:", error);
      process.exit(1);
    });
}