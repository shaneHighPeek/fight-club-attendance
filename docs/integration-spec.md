# Integration Specification

## Webhook Endpoint

### Base URL
`{crm_base_url}/api/v1/webhooks/attendance`

For HighPeekPro (HighLevel), this is expected to be a single **inbound webhook URL** that accepts a JSON `POST`.

### Authentication
- **Method**: Bearer Token
- **Header**: `Authorization: Bearer {api_key}`
- **Rate Limiting**: 100 requests/minute

## Events

### 1. Member Check-in
**Event Type**: `member.check_in`

**Payload**:
```json
{
  "event_id": "evt_abc123",
  "event_type": "member.check_in",
  "timestamp": "2024-02-10T10:30:00Z",
  "location": {
    "id": "ashmore",
    "name": "Ashmore"
  },
  "member": {
    "id": "mem_123",
    "member_number": "FC-000123",
    "external_id": "crm_456",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "+15551234567",
    "membership_type": "unlimited",
    "membership_status": "active",
    "rank": {
      "belt": "white",
      "stripes": 2
    }
  },
  "check_in": {
    "id": "chk_789",
    "location_id": "ashmore",
    "location_name": "Ashmore",
    "check_in_time": "2024-02-10T10:30:00Z",
    "type": "class",
    "class_id": "cls_morning_kickboxing",
    "class_name": "Morning Kickboxing",
    "instructor_id": "inst_123",
    "instructor_name": "Sensei Mike"
  },
  "waiver": {
    "accepted": true,
    "waiver_id": "wvr_123",
    "expires_at": "2025-02-10T23:59:59Z"
  },
  "metadata": {
    "source": "kiosk_1",
    "version": "1.0.0",
    "retry_count": 0
  }
}
```

### 2. Waiver Signed
**Event Type**: `waiver.signed`

**Payload**:
```json
{
  "event_id": "evt_def456",
  "event_type": "waiver.signed",
  "timestamp": "2024-02-10T10:15:00Z",
  "waiver": {
    "id": "wvr_123",
    "version": "2024-01",
    "signed_at": "2024-02-10T10:15:00Z",
    "expires_at": "2025-02-10T23:59:59Z",
    "ip_address": "192.168.1.100"
  },
  "signer": {
    "first_name": "Jane",
    "last_name": "Smith",
    "email": "jane.smith@example.com",
    "phone": "+15557654321",
    "birth_date": "1990-05-15",
    "is_member": false
  },
  "emergency_contact": {
    "name": "John Smith",
    "phone": "+15558889999",
    "relationship": "Spouse"
  },
  "metadata": {
    "source": "web_form",
    "user_agent": "Mozilla/5.0...",
    "version": "1.0.0"
  }
}
```

## Webhook Security

### Signature Verification
- **Header**: `X-Signature`
- **Algorithm**: HMAC-SHA256
- **Secret**: Shared secret key

Example:
```
X-Signature: t=1612974052,v1=30a405c6...
```

### Retry Policy
- **Initial Delay**: 1 minute
- **Backoff**: Exponential (1m, 5m, 15m, 1h, 6h)
- **Max Attempts**: 5
- **Dead Letter Queue**: Failed events after max attempts

## Response Format

### Success (2xx)
```json
{
  "success": true,
  "message": "Event processed successfully",
  "event_id": "evt_abc123"
}
```

### Error (4xx/5xx)
```json
{
  "success": false,
  "error": {
    "code": "invalid_request",
    "message": "Missing required field: member.id",
    "details": {
      "field": "member.id",
      "type": "required"
    }
  },
  "request_id": "req_123456"
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| invalid_request | 400 | Invalid request format or missing fields |
| unauthorized | 401 | Invalid or missing authentication |
| forbidden | 403 | Insufficient permissions |
| not_found | 404 | Resource not found |
| rate_limited | 429 | Too many requests |
| server_error | 500 | Internal server error |
| service_unavailable | 503 | Service temporarily unavailable |

## Testing

### Test Events
```bash
# Member Check-in
curl -X POST https://api.example.com/webhooks/attendance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test_key_123" \
  -d @test_checkin.json

# Waiver Signed
curl -X POST https://api.example.com/webhooks/attendance \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test_key_123" \
  -d @test_waiver.json
```

### Test Webhook Endpoint
```json
{
  "type": "webhook_test",
  "challenge": "test_123456",
  "timestamp": "2024-02-10T12:00:00Z"
}
```

## Versioning
- API version in URL path (`/api/v1/...`)
- Backward compatible changes within major version
- Deprecation notice: 6 months before removal

## Rate Limits
- 100 requests per minute per IP
- 10,000 requests per day per account
- Headers:
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Reset timestamp
