import { test } from 'node:test';
import assert from 'node:assert/strict';

// Client construction only; all verification calls below use a fake client.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
const { createAuthenticateUser } = await import('../src/middleware/auth.middleware.js');

async function verify(result, authorization = 'Bearer test-token') {
    let nextCalls = 0;
    const req = { headers: { authorization } };
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    const middleware = createAuthenticateUser({ auth: { getUser: async () => {
        if (result instanceof Error) throw result;
        return result;
    } } });
    await middleware(req, res, () => nextCalls++);
    return { req, res, nextCalls };
}

test('Supabase failures are service errors, not invalid-session responses', async () => {
    for (const error of [{ status: 500, message: 'Database unavailable' }, { status: 429, message: 'Rate limit' }]) {
        const { res, nextCalls } = await verify({ data: { user: null }, error });
        assert.equal(res.code, 503);
        assert.equal(nextCalls, 0);
    }
    assert.equal((await verify(new Error('unexpected connection failure'))).res.code, 503);
});

test('missing or invalid tokens stay rejected; valid tokens reach the protected route', async () => {
    assert.equal((await verify(null, '')).res.code, 401);
    assert.equal((await verify({ data: { user: null }, error: { status: 403 } })).res.code, 401);
    assert.equal((await verify({ data: { user: null }, error: null })).res.code, 401);
    const valid = await verify({ data: { user: { id: 'verified-user' } }, error: null });
    assert.equal(valid.nextCalls, 1);
    assert.equal(valid.req.userId, 'verified-user');
});
