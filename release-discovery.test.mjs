import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { releaseDiscoveryResponse } from '../release-discovery.mjs';

test('direct-file origin receives only release identity and CORS permission', () => {
  const result = releaseDiscoveryResponse('null', '0.0.0', 'baseline-r0');
  assert.equal(result.status, 200);
  assert.equal(result.headers['Access-Control-Allow-Origin'], 'null');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(result.body, { appVersion: '0.0.0', buildId: 'baseline-r0' });
  assert.equal('packageRoot' in result.body, false);
  assert.equal('provider' in result.body, false);
});

test('ordinary website origins cannot use release discovery', () => {
  const result = releaseDiscoveryResponse('https://example.com', '0.0.0', 'baseline-r0');
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: 'Release discovery is available only to a directly opened local HTML page' });
  assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
});

test('requests without Origin remain usable for local diagnostics', () => {
  const result = releaseDiscoveryResponse(undefined, '0.0.0', 'baseline-r0');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { appVersion: '0.0.0', buildId: 'baseline-r0' });
});
