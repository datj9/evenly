import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { api, ApiError, useQuery } from '../src/lib/api';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(handler: (url: string, init: RequestInit) => Response): ReturnType<typeof vi.fn> {
  const fn = vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('api client', () => {
  it('sends the CSRF header and JSON body', async () => {
    const fetchMock = stubFetch(() => new Response(JSON.stringify({ ok: 1 }), { status: 201 }));
    await api('POST', '/friends', { name: 'A' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/friends');
    expect((init.headers as Record<string, string>)['X-Requested-With']).toBe('evenly');
    expect(init.body).toBe('{"name":"A"}');
  });

  it('turns error payloads into ApiError', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'Nope' }), { status: 400 }));
    await expect(api('POST', '/x', {})).rejects.toEqual(new ApiError(400, 'Nope'));
  });

  it('refetches mounted queries after a DELETE that returns 204', async () => {
    let version = 0;
    stubFetch((_url, init) =>
      init.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ version: ++version }), { status: 200 }),
    );
    const { result } = renderHook(() => useQuery<{ version: number }>('/groups/1'));
    await waitFor(() => expect(result.current.data?.version).toBe(1));
    await api('DELETE', '/expenses/9');
    await waitFor(() => expect(result.current.data?.version).toBe(2));
  });
});
