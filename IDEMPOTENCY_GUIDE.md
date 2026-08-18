# Idempotency Implementation Guide

## Overview
Idempotency ensures that duplicate requests are detected and handled gracefully, preventing duplicate charges, withdrawals, and other critical operations in your payment system.

## What Was Implemented

### 1. Database Table (`idempotency_keys`)
Tracks all idempotent requests for 24 hours:
```sql
CREATE TABLE idempotency_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    user_id INT,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    request_hash VARCHAR(64),
    status_code INT,
    response_body LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR),
    INDEX (idempotency_key),
    INDEX (expires_at)
);
```

### 2. Middleware (`/server/src/middleware/idempotency.js`)
Two middleware functions for handling idempotency:

- **`idempotencyMiddleware`** - Optional, processes requests if `Idempotency-Key` header is provided
- **`requireIdempotency`** - Required, enforces `Idempotency-Key` header for sensitive endpoints

### 3. Protected Endpoints

#### Optional Idempotency (Recommended for all clients)
- `POST /api/purchase` - Product/package purchase initiation
- `POST /api/webhook` - Payment gateway webhook callbacks
- `POST /api/check-payment-status` - Payment status polling

#### Required Idempotency (Must be used)
- `POST /api/admin/withdraw/initiate` - Withdrawal OTP initiation
- `POST /api/admin/withdraw` - Withdrawal confirmation

## How to Use

### For Client Applications

#### 1. Generate Unique Idempotency Key
Use a UUID v4 or unique request ID:
```javascript
const idempotencyKey = crypto.randomUUID(); // or custom unique ID
```

#### 2. Include in Request Headers
```javascript
const response = await fetch('http://api.example.com/api/purchase', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey  // ← Add this
    },
    body: JSON.stringify({
        phone_number: '256701234567',
        package_id: 1,
        router_id: null
    })
});
```

### Example: Safe Withdrawal

```javascript
// Generate once per withdrawal request
const idempotencyKey = `withdrawal-${Date.now()}-${Math.random()}`;

// Step 1: Initiate Withdrawal (Requires Idempotency-Key)
const initiateRes = await fetch('http://api.example.com/api/admin/withdraw/initiate', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({
        amount: 50000,
        phone_number: '256701234567'
    })
});

// If network fails and retry happens, server returns same cached response
// No duplicate OTP sent, user doesn't lose money

// Step 2: Confirm Withdrawal (Requires NEW Idempotency-Key)
const confirmKey = `withdraw-confirm-${Date.now()}-${Math.random()}`;
const confirmRes = await fetch('http://api.example.com/api/admin/withdraw', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': confirmKey  // ← Different key for different request
    },
    body: JSON.stringify({
        amount: 50000,
        phone_number: '256701234567',
        otp: '123456',
        description: 'Withdrawal'
    })
});
```

### Example: Safe Purchase

```javascript
// Always use unique key per purchase attempt
const purchaseKey = `purchase-${phoneNumber}-${Date.now()}`;

const response = await fetch('http://api.example.com/api/purchase', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': purchaseKey
    },
    body: JSON.stringify({
        phone_number: '256701234567',
        package_id: 1
    })
});

// Response includes _cached flag if it's a duplicate
const data = await response.json();
if (data._cached) {
    console.log('This is a cached response from a previous request');
}
```

## Response Format

### Successful New Request
```json
{
    "status": "pending",
    "transaction_id": "REF-1234567890-123",
    "_idempotencyKey": "purchase-256701234567-1234567890"
}
```

### Duplicate Request (Cached)
```json
{
    "status": "pending",
    "transaction_id": "REF-1234567890-123",
    "_cached": true,
    "_idempotencyKey": "purchase-256701234567-1234567890"
}
```

## Best Practices

### 1. Use UUID v4 for Idempotency Keys
```javascript
// Good: UUID v4
const key = crypto.randomUUID();

// Also acceptable: Custom format with timestamp
const key = `request-${Date.now()}-${Math.random().toString(36)}`;

// Bad: Fixed key (would always be idempotent)
const key = 'my-purchase-key'; // Don't use this
```

### 2. Never Reuse Keys Across Different Actions
```javascript
// WRONG - Same key for multiple requests
const key = 'payment-key';
await fetch('/api/purchase', { headers: { 'Idempotency-Key': key } }); // First call
await fetch('/api/purchase', { headers: { 'Idempotency-Key': key } }); // Duplicate, returns cached

// CORRECT - New key for each logical operation
const key1 = crypto.randomUUID();
await fetch('/api/purchase', { headers: { 'Idempotency-Key': key1 } });

const key2 = crypto.randomUUID();
await fetch('/api/purchase', { headers: { 'Idempotency-Key': key2 } }); // New purchase
```

### 3. Store Idempotency Keys Locally
```javascript
// Save key in localStorage for retry scenarios
const idempotencyKey = crypto.randomUUID();
localStorage.setItem('pendingWithdrawal', JSON.stringify({
    idempotencyKey,
    amount: 50000,
    phone: '256701234567',
    timestamp: Date.now()
}));

// If network fails, retry with same key
const stored = JSON.parse(localStorage.getItem('pendingWithdrawal'));
if (stored && Date.now() - stored.timestamp < 3600000) { // Within 1 hour
    await fetch('/api/admin/withdraw', {
        headers: { 'Idempotency-Key': stored.idempotencyKey },
        body: JSON.stringify(stored)
    });
}
```

### 4. Handle Retries Safely
```javascript
async function safeWithdraw(amount, phone, otp, maxRetries = 3) {
    const idempotencyKey = crypto.randomUUID();
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch('/api/admin/withdraw', {
                method: 'POST',
                headers: {
                    'Idempotency-Key': idempotencyKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ amount, phone_number: phone, otp })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                console.log(`✓ Withdrawal succeeded (attempt ${attempt})`);
                if (data._cached) console.log('  (used cached response)');
                return data;
            }
            
            // Don't retry if it's a client error (not 5xx)
            if (response.status < 500) throw data.error;
            
        } catch (err) {
            console.error(`✗ Attempt ${attempt} failed:`, err);
            if (attempt === maxRetries) throw err;
            
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.pow(2, attempt - 1) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}
```

## Monitoring & Maintenance

### View Duplicate Requests
```sql
-- Find all duplicate requests
SELECT 
    idempotency_key,
    endpoint,
    COUNT(*) as duplicate_count,
    MAX(created_at) as last_attempt
FROM idempotency_keys
WHERE expires_at > NOW()
GROUP BY idempotency_key, endpoint
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

### Check Idempotency Coverage
```sql
-- Verify payment transactions are tracked
SELECT COUNT(*) as tracked_requests
FROM idempotency_keys
WHERE endpoint IN ('/purchase', '/webhook', '/admin/withdraw')
AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY);
```

### Manual Cleanup (if needed)
```sql
-- Delete expired idempotency keys (older than 24 hours)
DELETE FROM idempotency_keys
WHERE expires_at < NOW();
```

## Error Scenarios

### Missing Idempotency Key (Required Endpoints)
```json
{
    "error": "Idempotency-Key header is required for this endpoint",
    "example": "Idempotency-Key: unique-request-id-12345"
}
```

### Conflicting Request Body
If the same idempotency key is used with different request bodies, the cached response is returned:
```javascript
// First request
fetch('/api/purchase', {
    headers: { 'Idempotency-Key': 'key-1' },
    body: { amount: 50000 } // Original
});

// Same key, different body
fetch('/api/purchase', {
    headers: { 'Idempotency-Key': 'key-1' },
    body: { amount: 100000 } // Different, but cached response returned
});
// ⚠️ Returns cached response from first request, ignoring new body
```

## Troubleshooting

### Requests Always Return 200 with No Change
- Check if you're reusing the same `Idempotency-Key`
- Use a new unique key for each logical operation

### "Idempotency-Key header is required" Error
- Add header to your request: `'Idempotency-Key': uniqueValue`
- Only required for `/admin/withdraw/initiate` and `/admin/withdraw`

### Database Growing Too Large
- Idempotency keys auto-expire after 24 hours
- Run manual cleanup: `DELETE FROM idempotency_keys WHERE expires_at < NOW();`

## References
- [Stripe Idempotency API](https://stripe.com/docs/api/idempotent_requests)
- [RFC 9110 - HTTP Semantics](https://tools.ietf.org/html/rfc9110#section-9.2.2)
