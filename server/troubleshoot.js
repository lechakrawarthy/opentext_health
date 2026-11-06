// Maps a failure class to where in the request path it broke and what to do about it.
// Hops describe the journey of a health check from the monitor to the service.
export const HOPS = [
  { key: 'monitor', name: 'Monitor', detail: 'Check runner' },
  { key: 'dns', name: 'DNS', detail: 'Name resolution' },
  { key: 'network', name: 'Network · TLS', detail: 'TCP connect & handshake' },
  { key: 'gateway', name: 'Gateway', detail: 'Routing, auth & quotas' },
  { key: 'service', name: 'Service', detail: 'Application & dependencies' },
];

export const KINDS = {
  timeout: {
    label: 'Request timed out',
    hop: 4,
    where: 'Upstream service, or a dependency it is waiting on',
    summary: 'The connection opened but no response arrived inside the timeout window.',
    causes: [
      'Service is saturated: CPU, thread pool or connection pool exhausted',
      'A slow downstream dependency (database, search cluster, third-party API)',
      'Long garbage-collection pauses or a lock/deadlock',
      'Timeout configured below the endpoint’s normal p99',
    ],
    steps: [
      'Compare the latency trend below. A slow climb points to saturation; a cliff points to a dependency.',
      'Check CPU, memory and pool usage on the service instances.',
      'Trace one request through its downstream calls (DB, cache, external APIs).',
      'If the service is healthy but naturally slow, raise the timeout or degraded threshold.',
    ],
  },
  dns: {
    label: 'DNS resolution failed',
    hop: 1,
    where: 'DNS record or the resolver used by the monitor',
    summary: 'The hostname could not be resolved to an IP address, so no request was sent.',
    causes: [
      'Hostname typo, or the record was removed during a migration',
      'Record created recently and not yet propagated',
      'Internal resolver unreachable from the monitoring host',
      'Split-horizon DNS: the name only resolves inside another network',
    ],
    steps: [
      'Run `nslookup <host>` or `dig <host>` from the monitoring host.',
      'Confirm the record exists in your DNS provider or internal zone.',
      'Check whether the hostname changed in a recent release or infra change.',
      'Verify the monitor uses the expected resolver (VPN, corporate DNS).',
    ],
  },
  refused: {
    label: 'Connection refused',
    hop: 2,
    where: 'Host and port: nothing is listening',
    summary: 'The host answered but actively refused the TCP connection.',
    causes: [
      'Service process crashed or is mid-restart',
      'Wrong port in the monitor URL',
      'Load balancer has no healthy targets registered',
      'Firewall rejecting traffic from the monitor',
    ],
    steps: [
      'Check process / container status and recent restarts on the host.',
      'Confirm the port with the service owner or deployment manifest.',
      'Inspect target health on the load balancer.',
      'Test with `curl -v` from inside the same network as the service.',
    ],
  },
  reset: {
    label: 'Connection reset',
    hop: 2,
    where: 'Network path, proxy or load balancer',
    summary: 'The connection opened and was then dropped before a response completed.',
    causes: [
      'Proxy or LB idle timeout shorter than the request',
      'Service crashed while handling the request',
      'Keep-alive mismatch between gateway and service',
    ],
    steps: [
      'Look for crashes or OOM kills around the failure time.',
      'Compare idle timeouts on the LB, proxy and service.',
      'Retry with keep-alive disabled to isolate pooling issues.',
    ],
  },
  tls: {
    label: 'TLS / certificate error',
    hop: 2,
    where: 'Certificate or TLS termination point',
    summary: 'The secure handshake failed, so the request was never sent.',
    causes: [
      'Certificate expired',
      'Hostname not covered by the certificate’s SAN list',
      'Incomplete chain: an intermediate certificate is missing',
      'Self-signed or private CA not trusted by the monitor',
    ],
    steps: [
      'Run `openssl s_client -connect <host>:443 -servername <host>`.',
      'Check the expiry date and SAN entries.',
      'Make sure the full chain is served by the LB / ingress.',
      'Renew or rotate the certificate where TLS terminates.',
    ],
  },
  auth: {
    label: 'Authentication rejected',
    hop: 3,
    where: 'API gateway or identity provider',
    summary: 'The service is reachable but rejected the monitor’s credentials (401/403).',
    causes: [
      'API key, token or client secret expired or was rotated',
      'Monitor credentials are missing a required scope',
      'IP allow-list does not include the monitoring host',
      'Identity provider is degraded',
    ],
    steps: [
      'Check when the monitor’s credential was last rotated, and its expiry.',
      'Request a token manually and call the endpoint with `curl -H "Authorization: …"`.',
      'Review recent gateway policy or allow-list changes.',
      'Check the identity provider’s own health monitor.',
    ],
  },
  rate_limited: {
    label: 'Rate limited (429)',
    hop: 3,
    where: 'API gateway quota or throttling policy',
    summary: 'The gateway is throttling requests from this client.',
    causes: [
      'Quota shared with a noisy consumer',
      'Monitor interval too aggressive for the plan',
      'Throttling policy recently tightened',
    ],
    steps: [
      'Read the `Retry-After` and quota headers on the response.',
      'Give the monitor its own client / quota bucket.',
      'Lengthen the check interval for this endpoint.',
    ],
  },
  not_found: {
    label: 'Endpoint not found (404)',
    hop: 3,
    where: 'Routing or gateway configuration',
    summary: 'The request reached the platform but no route matched the path.',
    causes: [
      'Route removed or renamed in a recent release',
      'Wrong base path or API version in the monitor URL',
      'Ingress / gateway rule missing for this path',
    ],
    steps: [
      'Compare the monitor URL with the service’s current API spec.',
      'Check gateway / ingress route definitions for this path.',
      'Look for a deploy shortly before the first failure.',
    ],
  },
  http_5xx: {
    label: 'Server error (5xx)',
    hop: 4,
    where: 'Application service',
    summary: 'The service received the request and failed while handling it.',
    causes: [
      'Unhandled exception in the service',
      'A failing dependency surfaced as 500 / 502 / 503',
      'Bad deploy or configuration change',
      '502/504: the gateway could not reach a healthy instance',
    ],
    steps: [
      'Open the service logs around the incident start time.',
      'Check for a deploy or config change just before the first failure.',
      '503: check instance health and capacity. 502/504: check gateway-to-service connectivity.',
      'Roll back the last release if the timing lines up.',
    ],
  },
  unexpected_status: {
    label: 'Unexpected status code',
    hop: 4,
    where: 'Application response contract',
    summary: 'The endpoint answered, but with a status code the monitor does not expect.',
    causes: [
      'Endpoint behaviour changed (e.g. now redirects or returns 204)',
      'Monitor expectation is out of date',
    ],
    steps: [
      'Call the endpoint manually and compare with the expected status.',
      'Update the monitor’s expected status if the new behaviour is intended.',
    ],
  },
  body_mismatch: {
    label: 'Unexpected response body',
    hop: 4,
    where: 'Application response contract',
    summary: 'The status code was fine, but the body did not contain the expected text.',
    causes: [
      'Health payload format changed',
      'Service is returning a fallback or maintenance page',
      'A dependency check inside the health endpoint is failing',
    ],
    steps: [
      'Fetch the endpoint and inspect the full body.',
      'Check whether the health endpoint reports a failing sub-component.',
      'Update the expected text if the payload legitimately changed.',
    ],
  },
  invalid_url: {
    label: 'Invalid monitor URL',
    hop: 0,
    where: 'Monitor configuration',
    summary: 'The monitor could not build a request from the configured URL.',
    causes: ['Typo or missing scheme (http:// or https://) in the URL'],
    steps: ['Edit the monitor and correct the URL.'],
  },
  network: {
    label: 'Network error',
    hop: 2,
    where: 'Network path between monitor and service',
    summary: 'The request failed below HTTP before any response arrived.',
    causes: ['Routing or firewall issue', 'Host unreachable', 'Proxy misconfiguration'],
    steps: [
      'Run `curl -v` and `traceroute` from the monitoring host.',
      'Check firewall and security-group rules between the networks.',
    ],
  },
  slow: {
    label: 'Elevated latency',
    hop: 4,
    where: 'Service performance',
    summary: 'Responses succeed but are slower than the degraded threshold.',
    causes: [
      'Increased traffic or a heavy batch job',
      'Slow queries or a cold cache',
      'A dependency responding slowly',
    ],
    steps: [
      'Compare the latency chart with traffic for the same window.',
      'Look for slow queries or cache-miss spikes.',
      'Check the latency of this service’s own dependencies.',
    ],
  },
};

export function kindLabel(kind) {
  return KINDS[kind]?.label || 'Check failed';
}

export function diagnose(kind) {
  const k = KINDS[kind] || KINDS.network;
  return {
    kind,
    ...k,
    hops: HOPS.map((h, i) => ({
      ...h,
      state: kind === 'slow' ? (i === k.hop ? 'warn' : 'ok') : i < k.hop ? 'ok' : i === k.hop ? 'fail' : 'unknown',
    })),
  };
}
