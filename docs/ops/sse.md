# SSE (Server-Sent Events) behind Reverse Proxy

Chat real-time updates use SSE at `GET /api/orgs/[orgId]/chat/stream`.

## Critical: Disable proxy buffering

If buffering is enabled, events can be batched and delivered in bulk, causing apparent latency and reconnection issues.

## Nginx

```nginx
location /api/orgs/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding off;

    # SSE-specific
    location ~ ^/api/orgs/[^/]+/chat/stream {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        add_header X-Accel-Buffering no;
    }
}
```

Or apply to the broader `/api/` location if all SSE routes are under it:

```nginx
location /api/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    add_header X-Accel-Buffering no;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

## Response headers (set by app)

The stream endpoint returns:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no` (nginx hint)

## Other gateways

- **Cloudflare**: Disable "Always Online" and buffering for SSE paths
- **AWS ALB**: Use HTTP/1.1; ensure idle timeout ≥ 3600s for long-lived connections
- **Vercel**: Edge/proxy buffering behavior may vary; test SSE delivery latency
- **Caddy**: `reverse_proxy` with `flush_interval -1` to disable buffering
