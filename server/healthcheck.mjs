/** The container's HEALTHCHECK (the image has no shell or curl): exit 0 when /healthz answers. */
try {
  const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/healthz`, { signal: AbortSignal.timeout(2500) });
  process.exit(res.ok ? 0 : 1);
} catch { process.exit(1); }
