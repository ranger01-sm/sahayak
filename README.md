# Sahayak — Backend API

Node.js + Express REST API for the Sahayak home services platform.

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | SQLite via sql.js (zero native deps) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| File Uploads | Multer |
| Security | Helmet, CORS, express-rate-limit |

---

## Quick Start

```bash
# 1. Copy env file and fill in your keys
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Start (auto-creates DB on first run)
npm start          # production
npm run dev        # watch mode (Node 18+)
```

Server runs on **http://localhost:5000**

---

## API Reference

### Auth  `/api/auth`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Register new customer |
| POST | `/login` | Customer login → JWT |
| POST | `/worker/login` | Worker login → JWT |

### Workers  `/api/workers`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | Public | Worker registration (multipart with aadhaar + photo) |
| GET | `/nearby?lat=&lng=&service=` | Public | Find closest available workers |
| GET | `/:id` | Public | Worker profile |
| PUT | `/me/location` | Worker | Update GPS location |
| PUT | `/me/online` | Worker | Toggle online status |

### Bookings  `/api/bookings`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | Customer | Create a booking |
| GET | `/my` | Customer | My bookings |
| GET | `/worker` | Worker | Assigned jobs |
| GET | `/:id` | Customer/Worker | Single booking |
| POST | `/:id/assign` | Customer | Run allocation after payment |
| PUT | `/:id/status` | Worker/Admin | Update status |

### Payments  `/api/payments`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/create-order` | Customer | Create Razorpay order |
| POST | `/verify` | Customer | Verify Razorpay signature |
| POST | `/simulate` | Customer | **Dev only** — instant confirm |

### Reviews  `/api/reviews`
| Method | Path | Auth |
|--------|------|------|
| POST | `/` | Customer |
| GET | `/worker/:workerId` | Public |

### Admin  `/api/admin`  *(role: admin)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Stats overview |
| GET | `/workers?status=pending` | List workers |
| PUT | `/workers/:id/status` | Approve / suspend worker |
| GET | `/bookings` | All bookings |
| GET | `/users` | All customers |

### Notifications  `/api/notifications`
| Method | Path | Auth |
|--------|------|------|
| GET | `/` | Any logged-in |
| PUT | `/:id/read` | Any logged-in |

---

## Worker Allocation Algorithm

After payment the frontend calls `POST /api/bookings/:id/assign`.  
The server:
1. Fetches all `status = 'active'` workers with GPS coordinates.
2. Filters by skill match (service type).
3. Calculates Haversine distance from customer GPS.
4. Sorts by distance ↑, then rating ↓.
5. Assigns the top result and pushes a notification to the worker.

---

## Payment Flow (Razorpay)

```
Frontend                         Backend
   |                                |
   |-- POST /bookings ------------> |  create booking (status=pending)
   |<-- { bookingId }               |
   |                                |
   |-- POST /payments/create-order->|  create Razorpay order
   |<-- { razorpay_order_id, amount}|
   |                                |
   |-- (Razorpay checkout UI) ----> Razorpay
   |<-- { payment_id, signature }   |
   |                                |
   |-- POST /payments/verify -----> |  verify sig → mark paid
   |-- POST /bookings/:id/assign -> |  run algorithm → assign worker
   |<-- { worker, etaMin }          |
```

In **development** mode, use `POST /api/payments/simulate` to skip Razorpay.

---

## Environment Variables

```
PORT=5000
NODE_ENV=development
JWT_SECRET=change_me_in_production
JWT_EXPIRES_IN=7d
DB_PATH=./sahayak.db
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=5
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
FRONTEND_URL=http://localhost:3000
```

---

## File Structure

```
sahayak-backend/
├── server.js              # Entry point
├── .env.example
├── config/
│   └── database.js        # sql.js setup + schema
├── middleware/
│   ├── auth.js            # JWT middleware
│   └── upload.js          # Multer config
├── routes/
│   ├── auth.js
│   ├── workers.js
│   ├── bookings.js
│   ├── payments.js
│   ├── reviews.js
│   ├── admin.js
│   └── notifications.js
└── uploads/               # Worker photos & aadhaar files
```

---

## Connecting the Frontend

Add this to your `sahayak.html` — replace `initiatePayment()` calls with:

```js
const API = "http://localhost:5000/api";

async function apiPost(path, body, token) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {})
    },
    body: JSON.stringify(body)
  });
  return res.json();
}
```

Store the JWT from `/api/auth/login` in `localStorage` and pass it with every authenticated request.
