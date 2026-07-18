// Tabby Sidecar edge worker. Serves the Expo SPA export (nested under
// /public/sidecar so asset paths match the /sidecar base URL) and falls back
// to the SPA shell for client-side navigations. Bound to the route
// tabatha.pondocean.co/sidecar* so the rest of the domain keeps hitting Pages.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let res = await env.ASSETS.fetch(request);
    if (res.status === 404) {
      const accept = request.headers.get('accept') || '';
      if (accept.includes('text/html')) {
        res = await env.ASSETS.fetch(new URL('/sidecar/index.html', url.origin));
      }
    }
    // Service worker must be allowed to control the /sidecar/ scope.
    if (url.pathname.endsWith('/sw.js')) {
      const h = new Headers(res.headers);
      h.set('Service-Worker-Allowed', '/sidecar/');
      h.set('Cache-Control', 'no-cache');
      res = new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  },
};
