import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { create } from 'zustand';

async function loadSource(path, dependencies, globals = {}) {
    const context = vm.createContext({ console, ...globals });
    const mocks = new Map();
    for (const [name, exports] of Object.entries(dependencies)) {
        const module = new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        }, { context });
        await module.link(() => {});
        await module.evaluate();
        mocks.set(name, module);
    }
    const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
    }).outputText.replaceAll('import.meta.env.VITE_API_URL', '"https://api.example.test"');
    const module = new vm.SourceTextModule(code, {
        context, importModuleDynamically: name => mocks.get(name)
    });
    await module.link(name => mocks.get(name));
    await module.evaluate();
    return module.namespace;
}

test('API 401 and outages reject the request without signing out or redirecting', async () => {
    let handleError;
    let signOuts = 0;
    let redirects = 0;
    let storageDeletes = 0;
    const api = { interceptors: {
        request: { use() {} },
        response: { use(_success, failure) { handleError = failure; } }
    } };
    await loadSource('../../src/services/api.ts', {
        axios: { default: { create: () => api } },
        './supabase': { supabase: { auth: { signOut: () => signOuts++ } } },
        'react-hot-toast': { default: { error() {} } }
    }, {
        window: { location: { set href(_value) { redirects++; } } },
        localStorage: { removeItem() { storageDeletes++; } },
        setTimeout() { redirects++; }
    });
    for (const status of [401, 503, 500]) {
        const error = { response: { status } };
        await assert.rejects(handleError(error), caught => caught === error);
    }
    assert.equal(signOuts, 0);
    assert.equal(redirects, 0);
    assert.equal(storageDeletes, 0);
});

test('SDK sessions synchronize the store; a failed session read preserves the logged-in user', async () => {
    const { useAuthStore } = await loadSource('../../src/stores/authStore.ts', {
        zustand: { create },
        '../services/supabase': { authService: {
            getSession: async () => { throw new Error('temporary outage'); }
        } }
    });
    const session = { access_token: 'test-token', user: {
        id: 'test-user', email: 'test@example.com', user_metadata: { onboarding_completed: true }
    } };
    useAuthStore.getState().applySession(session);
    await useAuthStore.getState().checkAuth();
    assert.equal(useAuthStore.getState().isAuthenticated, true);
    assert.equal(useAuthStore.getState().user.id, 'test-user');
    assert.equal(useAuthStore.getState().isLoading, false);
    useAuthStore.getState().applySession(null);
    assert.equal(useAuthStore.getState().isAuthenticated, false);
    assert.equal(useAuthStore.getState().user, null);
});
