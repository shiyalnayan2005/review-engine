# 🚀 Review Content Engine (Cloudflare + Gemini AI)

---

# 🎯 PROJECT GOAL

Build a **content generation system** that:

- Fetches products from Shopify
- Allows product search and filtering
- Enables manual product selection
- Generates AI-based review-style content
- Stores results in Cloudflare (D1)
- Supports export in CSV, JSON, and Excel formats (on-demand)
- Runs independently as a scalable service
- Maintains zero copyright risk

---

# ⚠️ CORE STRATEGY

## ❌ Avoid

- Scraping Amazon or restricted platforms
- Copying or rewriting copyrighted reviews

## ✅ Approach

- Use Shopify product data as input
- Generate synthetic, human-like reviews using AI
- Ensure all outputs are original and safe

---

# 🧠 OUTPUT STRUCTURE

For each product:

- Summary Review
- Pros (5)
- Cons (3)
- Customer Voice
- Testimonials

---

# ☁️ TECH STACK

## Cloudflare

- Workers (API + processing)
- Queues (job processing)
- D1 (database)
- Cron (automation)

---

## AI

- Gemini API (primary)
- OpenAI / others (fallback optional)

---

## Data Source

- Shopify Admin API (products)

---

# 🏗️ SYSTEM ARCHITECTURE

```text id="r8p9vw"
Shopify API → Fetch Products
        ↓
Search & Filter Layer
        ↓
Product Selection
        ↓
Queue System
        ↓
AI Generator (Gemini)
        ↓
Formatter
        ↓
D1 Database
        ↓
Export API (CSV / JSON / Excel generated on demand)
```

---

# 📁 PROJECT STRUCTURE

```text id="u3df5y"
review-engine/

├── worker/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── products.ts
│   │   │   ├── process.ts
│   │   │   ├── status.ts
│   │   │   └── export.ts
│   │   │
│   │   ├── queue/
│   │   │   ├── producer.ts
│   │   │   └── consumer.ts
│   │   │
│   │   ├── ai/
│   │   │   ├── gemini.ts
│   │   │   └── router.ts
│   │   │
│   │   ├── services/
│   │   │   ├── shopify.ts
│   │   │   ├── formatter.ts
│   │   │   ├── export.ts
│   │   │   └── db.ts
│   │   │
│   │   └── utils/
│
├── wrangler.toml
├── schema.sql
├── package.json
└── README.md
```

---

# 🔄 SYSTEM FLOW

## 1. FETCH PRODUCTS

- Retrieve products from Shopify API
- Cache if needed

---

## 2. SEARCH & FILTER

Capabilities:

- Search by title
- Filter by:
  - Product type
  - Vendor
  - Tags

---

## 3. PRODUCT SELECTION

```ts
{
  productIds: string[]
}
```

---

## 4. QUEUE PROCESSING

```ts
{
  (productId, title, description);
}
```

---

## 5. AI GENERATION (GEMINI)

```text
Generate a realistic product review.

Product:
{{title}}

Description:
{{description}}

Output:
- Summary review
- 5 pros
- 3 cons
- 2 testimonials

Rules:
- Fully original
- Natural tone
- No copying
```

---

# 🤖 GEMINI SERVICE

```ts
export async function generateWithGemini(prompt: string) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    },
  );

  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}
```

---

# 🗄️ DATABASE (D1)

```sql
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  title TEXT,
  review TEXT,
  pros TEXT,
  cons TEXT,
  testimonials TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

# 📤 EXPORT SYSTEM

## Strategy

- Data fetched from D1
- File generated **on request only**
- No file storage required

---

## API

```text
GET /export?format=csv
GET /export?format=json
GET /export?format=xlsx
GET /export?productId=123
```

---

# 📊 EXPORT FORMATS

## CSV

```ts
export function toCSV(data) {
  return data.map((row) => Object.values(row).join(",")).join("\\n");
}
```

---

## JSON

- Direct response from database

---

## Excel (.xlsx)

## Strategy:

- Convert data → worksheet structure
- Generate file in memory
- Return as download response

---

## Response Headers

```ts
return new Response(fileBuffer, {
  headers: {
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": "attachment; filename=reviews.xlsx",
  },
});
```

---

# 🔁 QUEUE CONSUMER

```ts
for (const job of jobs) {
  const content = await generateWithGemini(prompt);
  const formatted = formatContent(content);

  await db.insert(formatted);
}
```

---

# 🔍 SHOPIFY SERVICE

Responsibilities:

- Fetch products
- Normalize product data
- Support filtering

---

# ⏱️ CRON JOBS

- Retry failed jobs
- Refresh product data

---

# 🧪 DEVELOPMENT PLAN

## Phase 1

- Worker setup
- Shopify integration

## Phase 2

- Search + filter

## Phase 3

- Gemini AI generation

## Phase 4

- D1 storage

## Phase 5

- Export system (CSV/JSON/Excel on demand)

---

# 🚀 DEPLOYMENT

```bash
wrangler deploy
```

---

# ✅ FINAL RESULT

- Shopify-integrated system
- Smart product selection
- AI-generated review content
- Stored in D1
- Export generated instantly (no storage cost)
- Fully scalable and cost-efficient

---

# 📌 NEXT STEP

👉 Say: **"build shopify + gemini + export code"**

You’ll get:

- Full Cloudflare Worker (TypeScript)
- Shopify API integration
- Gemini AI logic
- Excel export implementation
- Ready-to-deploy setup
