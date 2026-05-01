# Expense Tracker

A minimal full-stack expense tracker with a JSON-backed backend and a single-page frontend.

## Run It

1. Open a terminal in `backend`.
2. Install dependencies with `npm install`.
3. Start the server with `npm start`.
4. Open `http://localhost:5000`.

## Backend Design

The backend stores expenses in `backend/data/expenses.json`. I chose a JSON file because it keeps the project simple, survives restarts, and is easy to inspect while still behaving more like real persistence than an in-memory array.

Money is stored as a decimal string in the API and as integer paise internally so totals do not rely on floating point math.

To handle retries and accidental duplicate submits, `POST /expenses` computes a fingerprint from the normalized expense payload plus an optional `Idempotency-Key` header. Repeating the same request returns the existing record instead of creating a duplicate.

## Backend Setup
Implemented Express server with POST and GET endpoints.

## Frontend Notes

The UI supports adding expenses, filtering by category, sorting by newest first, and showing the total of the currently visible rows.

It also includes basic loading and error states, and the submit button is disabled while a request is in flight to reduce duplicate clicks.

## Trade-offs

I did not add authentication, editing, deletion, or a database migration layer. The focus here was on correctness, retry safety, and a small amount of persistence with minimal setup.

I also kept the styling intentionally simple and self-contained so the assignment is easy to run without a frontend build tool.

## Deployment
App is deployed on Render.