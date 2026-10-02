import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

const browser = new JSDOM('', { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = browser;
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  Node: window.Node,
  NodeFilter: window.NodeFilter,
  Element: window.Element,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLSelectElement: window.HTMLSelectElement,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  FocusEvent: window.FocusEvent,
  MutationObserver: window.MutationObserver,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act, cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { BoothDrawer } = await import('../src/frontend/features/booth-customize/BoothDrawer.tsx');
const { useWorldStore } = await import('../src/frontend/entities/viewer/model/viewer-store.ts');

describe('BoothDrawer reservation', () => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env['VITE_API_BASE_URL'];

  beforeEach(() => {
    process.env['VITE_API_BASE_URL'] = 'http://reservation-api.test';
    useWorldStore.setState({
      selectedBoothId: 'room-101',
      cart: { 'room-101': ['chair'] },
    });
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    useWorldStore.setState({ selectedBoothId: null, cart: {} });
  });

  afterAll(() => {
    window.close();
    if (originalApiBaseUrl === undefined) {
      delete process.env['VITE_API_BASE_URL'];
    } else {
      process.env['VITE_API_BASE_URL'] = originalApiBaseUrl;
    }
  });

  test('submits the selected booth and cart add-ons, then shows the returned order ID', async () => {
    let request: { url: string; method?: string; body?: string } | undefined;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        request = {
          url: String(input),
          method: init?.method,
          body: init?.body?.toString(),
        };
        return Response.json({
          reserved: true,
          boothId: 'room-101',
          addOns: ['chair'],
          orderId: 'order-ui-101',
        });
      },
      { preconnect: originalFetch.preconnect },
    );
    render(<BoothDrawer />);

    fireEvent.click(screen.getByRole('button', { name: /Reserve/ }));

    await screen.findByText(/order-ui-101/);
    expect(request).toEqual({
      url: 'http://reservation-api.test/api/events/convention-center-01/booths/reserve',
      method: 'POST',
      body: '{"boothId":"room-101","addOns":["chair"]}',
    });
  });

  test('locks add-on changes while a reservation is pending and after it succeeds', async () => {
    let finishRequest: (response: Response) => void = () => {};
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          finishRequest = resolve;
        }),
      { preconnect: originalFetch.preconnect },
    );
    render(<BoothDrawer />);

    fireEvent.click(screen.getByRole('button', { name: /Reserve/ }));
    await screen.findByText('Creating your pending order…');

    const pendingChairCheckbox = screen.getByRole('checkbox', { name: /Chair/ });
    expect((pendingChairCheckbox as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pendingChairCheckbox);
    expect(useWorldStore.getState().cart['room-101']).toEqual(['chair']);

    finishRequest(
      Response.json({
        reserved: true,
        boothId: 'room-101',
        addOns: ['chair'],
        orderId: 'order-ui-pending',
      }),
    );
    await screen.findByText(/order-ui-pending/);

    const successfulChairCheckbox = screen.getByRole('checkbox', { name: /Chair/ });
    expect((successfulChairCheckbox as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(successfulChairCheckbox);
    expect(useWorldStore.getState().cart['room-101']).toEqual(['chair']);
  });

  test('submits only once when Reserve is clicked twice before the first request settles', async () => {
    let postCount = 0;
    let finishRequest: (response: Response) => void = () => {};
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        postCount++;
        return new Promise<Response>((resolve) => {
          finishRequest = resolve;
        });
      },
      { preconnect: originalFetch.preconnect },
    );
    render(<BoothDrawer />);
    const reserveButton = screen.getByRole('button', { name: /Reserve/ });

    act(() => {
      fireEvent.click(reserveButton);
      fireEvent.click(reserveButton);
    });

    expect(postCount).toBe(1);
    await screen.findByText('Creating your pending order…');
    finishRequest(
      Response.json({
        reserved: true,
        boothId: 'room-101',
        addOns: ['chair'],
        orderId: 'order-ui-duplicate-check',
      }),
    );
    await screen.findByText(/order-ui-duplicate-check/);
  });

  test('shows a reservation error and preserves the selected add-on after failure', async () => {
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ error: 'Booth already reserved' }, { status: 409 }),
      { preconnect: originalFetch.preconnect },
    );
    render(<BoothDrawer />);

    fireEvent.click(screen.getByRole('button', { name: /Reserve/ }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('API 409'));
    expect(useWorldStore.getState().cart['room-101']).toEqual(['chair']);

    const chairCheckbox = screen.getByRole('checkbox', { name: /Chair/ });
    expect((chairCheckbox as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(chairCheckbox);
    expect(useWorldStore.getState().cart['room-101']).toEqual([]);
  });
});
