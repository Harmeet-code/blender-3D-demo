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

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
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
  });
});
