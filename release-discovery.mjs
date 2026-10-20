export function releaseDiscoveryResponse(origin, appVersion, buildId) {
  if (origin && origin !== 'null') {
    return {
      status: 403,
      headers: {},
      body: { error: 'Release discovery is available only to a directly opened local HTML page' },
    };
  }
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'null',
      Vary: 'Origin',
    },
    body: { appVersion, buildId },
  };
}
