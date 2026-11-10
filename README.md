# Inventory and Data Management System — Lab 3 (Web Dev III, Unit 3, CO3)

A RESTful backend that lets a store or warehouse manage its product catalogue:
create products, update details and stock levels, search / filter / sort / paginate
the catalogue, and generate inventory reports with MongoDB aggregation pipelines.

**Stack (as required by the brief):** Node.js · Express.js · MongoDB · Mongoose · dotenv
— these are the *only* dependencies (no admin panel, CMS or boilerplate). Tests use
Node's built-in `node:test` runner and `fetch`, so no extra packages are needed.

---

## 1. Project structure

```
inventory-data-management-system/
├── server.js                    # entry point: loads .env, connects DB, starts Express
├── .env.example                 # copy to .env (PORT, MONGO_URI, pagination limits)
├── package.json
├── src/
│   ├── app.js                   # Express app: JSON parser, logger, routes, 404, error handler
│   ├── config/db.js             # Mongoose connection (MONGO_URI from dotenv)
│   ├── models/Product.js        # Mongoose schema + field-level validation + stockValue virtual
│   ├── controllers/productController.js   # CRUD, stock adjustment, aggregation reports
│   ├── routes/productRoutes.js  # /api/products routes
│   ├── middleware/
│   │   ├── validate.js          # input validation (body, ObjectId, stock change)
│   │   ├── errorHandler.js      # centralized error handling + 404
│   │   └── logger.js            # request logger
│   └── utils/
│       ├── buildQuery.js        # query-string -> filter / sort / pagination
│       ├── ApiError.js          # error with HTTP status
│       └── asyncHandler.js      # forwards async errors to the error handler
├── scripts/seed.js, seedData.js # 12 sample products in 5 categories
├── tests/api.test.js            # 28 end-to-end tests (node --test)
├── docs/sample-responses/       # real responses captured from the running API
└── postman/Inventory-API.postman_collection.json
```

## 2. Setup & run

**Prerequisites:** Node.js 18+ and a MongoDB server — either

* **Local:** install [MongoDB Community Server](https://www.mongodb.com/try/download/community)
  (on Windows tick “Install MongoD as a Service”), so it listens on `mongodb://127.0.0.1:27017`, or
* **Atlas (cloud, free tier):** create a cluster and put its `mongodb+srv://…` string in `MONGO_URI`.

```bash
cd inventory-data-management-system
npm install                 # installs express, mongoose, dotenv
copy .env.example .env      # (Windows)  — or: cp .env.example .env
npm run seed                # optional: loads 12 sample products
npm start                   # http://localhost:5000
```

`npm run dev` restarts automatically on file changes (`node --watch`).
`npm test` runs the full test suite against a separate `inventory_test` database
(it never touches `inventory_db`).

### Environment variables (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | HTTP port |
| `NODE_ENV` | `development` | `production` hides internal error messages |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/inventory_db` | MongoDB connection string |
| `MONGO_URI_TEST` | *(falls back to MONGO_URI)* | optional, used by `npm test` |
| `DEFAULT_PAGE_LIMIT` / `MAX_PAGE_LIMIT` | `10` / `100` | pagination |

`.env` is listed in `.gitignore`, so credentials are never committed.

## 3. Product schema

| Field | Type | Validation |
|---|---|---|
| `name` | String | required, trimmed, 2–100 chars |
| `sku` | String | required, **unique**, auto-uppercased, pattern `ABC-12-XYZ` (letters/digits/hyphens), ≤ 30 chars |
| `category` | String | required, enum: Electronics, Apparel, Furniture, Stationery, Grocery, Home & Kitchen, Sports, Other |
| `price` | Number | required, ≥ 0 |
| `quantity` | Number | required, whole number ≥ 0 |
| `reorderLevel` | Number | whole number ≥ 0, default 10 |
| `supplier` | String | trimmed, ≤ 100 chars, default “Unknown” |
| `createdAt`, `updatedAt` | Date | automatic (`timestamps: true`) |
| `stockValue` | virtual | `price × quantity` (included in JSON with `id`) |

Validation happens in two layers: `middleware/validate.js` checks the request body
(types, required fields, unknown fields) and returns all problems at once; Mongoose
then enforces the schema rules on save / update.

## 4. API reference

Base URL: `http://localhost:5000`

| Method | Endpoint | Description | Success |
|---|---|---|---|
| GET | `/api/products` | List with filtering, sorting, pagination | 200 |
| POST | `/api/products` | Create product | 201 |
| GET | `/api/products/:id` | Get single product | 200 |
| PUT | `/api/products/:id` | Update details (only sent fields change; `PATCH` also works) | 200 |
| PATCH | `/api/products/:id/stock` | Stock adjustment (restock / sale) | 200 |
| DELETE | `/api/products/:id` | Delete product | 200 |
| GET | `/api/products/low-stock` | Low-stock alert report (aggregation) | 200 |
| GET | `/api/products/summary` | Category-wise inventory summary (aggregation) | 200 |
| GET | `/api/health` | Server + DB status | 200 |

### Query parameters for `GET /api/products`

| Param | Example | Meaning |
|---|---|---|
| `category` | `Electronics` or `Electronics,Apparel` | exact category (case-insensitive), comma list allowed |
| `supplier` | `ikea` | supplier contains text |
| `search` | `pen` | name / SKU / supplier contains text |
| `minPrice`, `maxPrice` | `500`, `5000` | price range |
| `minQty`, `maxQty` | `0`, `20` | quantity range |
| `inStock` | `true` / `false` | quantity > 0 / = 0 |
| `lowStock` | `true` | quantity ≤ reorderLevel |
| `sort` | `price`, `-price`, `category,-quantity` | `-` = descending; default `-createdAt` |
| `page`, `limit` | `2`, `5` | pagination (default page 1, limit 10, max 100) |

Example: `GET /api/products?category=Electronics&minPrice=1000&sort=-price&page=1&limit=5`

```json
{ "total": 12, "page": 1, "totalPages": 2, "count": 10, "products": [ { "_id": "…", "name": "Study Table", "sku": "FURN-TB-812", "category": "Furniture", "price": 3999, "quantity": 2, "reorderLevel": 4, "supplier": "IKEA India", "createdAt": "…", "updatedAt": "…", "__v": 0, "stockValue": 7998, "id": "…" } ] }
```

### Create — `POST /api/products`

```json
{ "name": "Gel Pen Pack of 15", "sku": "STNY-PN-713", "category": "Stationery",
  "price": 120, "quantity": 40, "reorderLevel": 20, "supplier": "Cello Pens" }
```
→ `201 Created` with the saved product (incl. `stockValue: 4800`).

### Update — `PUT /api/products/:id`

```json
{ "price": 140, "quantity": 60 }
```
→ `200 OK` with the updated product (schema validation re-runs).

### Stock adjustment — `PATCH /api/products/:id/stock`

```json
{ "change": 10 }                      // restock +10
{ "change": -3 }                      // sale of 3
{ "type": "sale", "amount": 3 }       // same, explicit form
```
→ `{ "message": "Stock updated", "product": { … } }` (plus a `warning` when the new
quantity is at/below the reorder level). The update is a single atomic
`findOneAndUpdate` with `$inc` and a `quantity >= amount` condition, so concurrent
sales can never push stock below zero; an oversell returns `400 Insufficient stock`.

### Delete — `DELETE /api/products/:id`
→ `{ "message": "Product deleted", "id": "…" }`

### Low-stock report — `GET /api/products/low-stock`
Aggregation pipeline: `$match` (`$expr: quantity <= reorderLevel`) → `$addFields`
(`stockValue`, `shortfall`, `id`) → `$sort` (lowest quantity first).
Optional: `?threshold=5` (quantity ≤ 5 instead of each item's reorder level), `?category=Furniture`.

```json
{ "count": 4, "lowStockItems": [ { "name": "Study Table", "quantity": 2, "reorderLevel": 4, "shortfall": 2, "stockValue": 7998, … } ] }
```

### Category summary — `GET /api/products/summary`
Aggregation pipeline: `$group` by category (`totalItems`, `totalQuantity`,
`totalStockValue`, `avgPrice`, `minPrice`, `maxPrice`, `lowStockCount`) → `$project`
(rounding) → `$sort` by stock value.

```json
{ "categories": 5,
  "summary": [ { "_id": "Electronics", "totalItems": 4, "totalQuantity": 96, "totalStockValue": 182904, "avgPrice": 5149, "minPrice": 799, "maxPrice": 14999, "lowStockCount": 1 }, … ],
  "overall": { "totalItems": 12, "totalQuantity": 370, "totalStockValue": 369142, "lowStockCount": 4 } }
```

### Error format (centralized error handler)

```json
{ "success": false, "message": "Validation failed",
  "errors": [ { "field": "price", "message": "price cannot be negative" } ] }
```

| Situation | Status |
|---|---|
| Validation error (middleware or Mongoose) / malformed JSON / bad query param / invalid id | 400 |
| Product or route not found | 404 |
| Duplicate SKU | 409 |
| Unexpected server error | 500 |

## 5. Testing with Postman

Import `postman/Inventory-API.postman_collection.json`. It contains every request shown
in the lab brief (list, create, update, delete, low-stock, summary, stock adjustment)
plus filter/sort/pagination and error examples. The **Create Product** request saves the
new id into the `productId` collection variable, so the update / stock / delete requests
work straight after it.

For the lab submission, take Postman screenshots of each request (as in the brief's
“Expected Output”). `docs/sample-responses/` already holds the actual request/response
pairs produced by this API (list, create, get, update, delete, low-stock, summary,
restock, sale, filters and error cases) for reference.

## 6. Rubric mapping

| Criterion | Where |
|---|---|
| Database schema design & validation (Mongoose) | `src/models/Product.js`, `src/middleware/validate.js` |
| CRUD functionality | `src/controllers/productController.js`, `src/routes/productRoutes.js` |
| Querying — filtering, sorting, pagination | `src/utils/buildQuery.js`, `getProducts` |
| Aggregation — low-stock report & category summary | `getLowStock`, `getCategorySummary` |
| API design & clean code | MVC folders, centralized `errorHandler.js`, `asyncHandler`, dotenv config, tests |
