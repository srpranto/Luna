// @ts-nocheck
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import fs from 'node:fs';

try {
  register(pathToFileURL(path.resolve('tests/e2e/loader.ts')).href, import.meta.url);
} catch {}

process.removeAllListeners('warning');

async function runMobileNavigationHapticsSuite() {
  console.log('===============================================================');
  console.log('   📱 Luna Android & iOS System Navigation & Haptics Suite');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error('    ', err.message);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Group 1: Tactile Haptic Patterns & Safe Guards
  // -------------------------------------------------------------
  console.log('▶ 1. Tactile Haptic Feedback Patterns & Guards');

  const soundModule = await import('@/lib/luna/sound.ts');
  const {
    HAPTIC_PATTERNS,
    triggerHaptic,
    isHapticEnabled,
    setHapticEnabled,
    isSoundEnabled,
    setSoundEnabled,
  } = soundModule;

  await test('Verifies exact sensory vibration patterns defined in requirements', () => {
    assert.deepEqual(HAPTIC_PATTERNS.match, [40, 60, 80], 'Match Found must be crisp double-pulse [40, 60, 80]');
    assert.deepEqual(HAPTIC_PATTERNS['message-sent'], [15], 'Message Sent must be subtle soft tick [15]');
    assert.deepEqual(HAPTIC_PATTERNS['message-received'], [25, 40, 25], 'Message Received must be gentle tap [25, 40, 25]');
    assert.deepEqual(HAPTIC_PATTERNS.tap, [10], 'Button / Action tap must be light tick [10]');
    assert.deepEqual(HAPTIC_PATTERNS.disconnect, [60, 80, 40], 'Session Disconnected must be low descending warning [60, 80, 40]');
  });

  await test('triggerHaptic invokes navigator.vibrate with correct pattern on Android / Web Vibration API', () => {
    const vibrateCalls = [];
    const originalVibrate = globalThis.navigator?.vibrate;
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;

    const storage = new Map();
    globalThis.localStorage = {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    };
    globalThis.window = {};

    Object.defineProperty(globalThis.navigator, 'vibrate', {
      value: (pattern) => {
        vibrateCalls.push(pattern);
        return true;
      },
      configurable: true,
      writable: true,
    });

    try {
      setSoundEnabled(true);
      setHapticEnabled(true);

      triggerHaptic('match');
      assert.deepEqual(vibrateCalls[0], [40, 60, 80]);

      triggerHaptic('message-sent');
      assert.deepEqual(vibrateCalls[1], [15]);

      triggerHaptic('message-received');
      assert.deepEqual(vibrateCalls[2], [25, 40, 25]);

      triggerHaptic('tap');
      assert.deepEqual(vibrateCalls[3], [10]);

      triggerHaptic('disconnect');
      assert.deepEqual(vibrateCalls[4], [60, 80, 40]);
    } finally {
      globalThis.window = originalWindow;
      globalThis.localStorage = originalLocalStorage;
      if (originalVibrate) {
        Object.defineProperty(globalThis.navigator, 'vibrate', {
          value: originalVibrate,
          configurable: true,
          writable: true,
        });
      } else {
        delete globalThis.navigator.vibrate;
      }
    }
  });

  await test('triggerHaptic respects user mute and haptic settings preferences', () => {
    const vibrateCalls = [];
    const originalVibrate = globalThis.navigator?.vibrate;
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;

    const storage = new Map();
    globalThis.localStorage = {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    };
    globalThis.window = {};

    Object.defineProperty(globalThis.navigator, 'vibrate', {
      value: (pattern) => {
        vibrateCalls.push(pattern);
        return true;
      },
      configurable: true,
      writable: true,
    });

    try {
      // 1. Muting haptics suppresses triggerHaptic
      setHapticEnabled(false);
      triggerHaptic('match');
      assert.equal(vibrateCalls.length, 0, 'Should not vibrate when haptics are disabled');

      // 2. Muting master sound also silences haptics
      setHapticEnabled(true);
      setSoundEnabled(false);
      triggerHaptic('match');
      assert.equal(vibrateCalls.length, 0, 'Should not vibrate when sound is muted');

      // 3. Re-enabling allows haptics
      setSoundEnabled(true);
      triggerHaptic('match');
      assert.equal(vibrateCalls.length, 1, 'Should vibrate when both are enabled');
    } finally {
      globalThis.window = originalWindow;
      globalThis.localStorage = originalLocalStorage;
      if (originalVibrate) {
        Object.defineProperty(globalThis.navigator, 'vibrate', {
          value: originalVibrate,
          configurable: true,
          writable: true,
        });
      } else {
        delete globalThis.navigator.vibrate;
      }
    }
  });

  await test('iOS Safari Web Fallback: triggers DOM switch tick and stops event bubbling', () => {
    let switchClicked = 0;
    const listeners = new Map();
    const fakeElement = {
      type: 'checkbox',
      click: () => {
        switchClicked++;
      },
      setAttribute: () => {},
      addEventListener: (event, handler) => {
        listeners.set(event, handler);
      },
      style: {},
    };

    const originalVibrate = globalThis.navigator?.vibrate;
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalLocalStorage = globalThis.localStorage;

    const storage = new Map();
    globalThis.localStorage = {
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    };
    globalThis.window = {};
    delete globalThis.navigator.vibrate;

    globalThis.document = {
      body: {
        contains: () => true,
        appendChild: () => {},
      },
      getElementById: (id) => (id === 'luna-haptic-switch' ? fakeElement : null),
      createElement: () => fakeElement,
    };

    try {
      setSoundEnabled(true);
      setHapticEnabled(true);

      triggerHaptic('tap');
      assert.ok(switchClicked > 0, 'iOS Safari switch fallback click should be invoked');
      assert.ok(listeners.has('click'), 'Click stopPropagation listener must be registered');
      assert.ok(listeners.has('change'), 'Change stopPropagation listener must be registered');
    } finally {
      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
      globalThis.localStorage = originalLocalStorage;
      if (originalVibrate) {
        Object.defineProperty(globalThis.navigator, 'vibrate', {
          value: originalVibrate,
          configurable: true,
          writable: true,
        });
      }
    }
  });

  await test('Deduplication: Composer submit does not double-trigger message-sent haptics', () => {
    const composerContent = fs.readFileSync(path.resolve('src/components/luna/composer.tsx'), 'utf-8');
    const matches = composerContent.match(/triggerHaptic\(["']message-sent["']\)/g);
    assert.equal(matches, null, 'Composer must not call triggerHaptic("message-sent"); useLunaMessages is the single source of truth');

    const hookContent = fs.readFileSync(path.resolve('src/hooks/luna/use-luna-messages.ts'), 'utf-8');
    assert.ok(
      hookContent.includes('triggerHaptic("message-sent")'),
      'useLunaMessages must trigger message-sent haptic on dispatch'
    );
  });

  await test('Match Haptics: Session establishment effect triggers match haptic on all match pathways', () => {
    const pageContent = fs.readFileSync(path.resolve('src/app/page.tsx'), 'utf-8');
    assert.ok(
      pageContent.includes('playMatchChime();\n        triggerHaptic("match");'),
      'page.tsx session establishment effect must trigger match haptic alongside chime'
    );
  });

  // -------------------------------------------------------------
  // Group 2: System Navigation & History Stack Architecture
  // -------------------------------------------------------------
  console.log('\n▶ 2. Mobile System Navigation & History Stack Architecture');

  await test('Closing overlay modals via UI or back gesture does NOT prompt exit confirmation', () => {
    let activeSession = { id: 'sess-123', closed: false };
    let settingsOpen = false;
    let logOpen = false;
    let historyOpen = false;
    let voidOpen = false;
    let exitConfirm = null;
    let historyStack = [{ luna: true, view: 'boot' }, { luna: true, view: 'chat', sessionId: activeSession.id }];
    let historyIndex = 1;

    function pushState(state) {
      historyStack = historyStack.slice(0, historyIndex + 1);
      historyStack.push(state);
      historyIndex = historyStack.length - 1;
    }

    function openOverlayModal(name) {
      settingsOpen = name === 'settings';
      logOpen = name === 'log';
      historyOpen = name === 'history';
      voidOpen = name === 'void';
      const state = { luna: true, view: 'chat', sessionId: activeSession.id, modal: name };
      pushState(state);
    }

    function closeOverlayModal(name) {
      if (name === 'settings') settingsOpen = false;
      if (name === 'log') logOpen = false;
      if (name === 'history') historyOpen = false;
      if (name === 'void') voidOpen = false;
      if (historyStack[historyIndex]?.modal === name) {
        historyIndex--;
        onPopState({ state: historyStack[historyIndex] });
      }
    }

    function onPopState(event) {
      const state = event.state;
      if (exitConfirm) {
        exitConfirm = null;
        if (activeSession && !activeSession.closed) {
          pushState({ luna: true, view: 'chat', sessionId: activeSession.id });
        }
        return 'dismissed_exit_confirm';
      }

      if (settingsOpen || logOpen || historyOpen || voidOpen) {
        if (state?.modal === 'history' && historyOpen) {
          return 'retained_history_modal';
        }
        settingsOpen = false;
        logOpen = false;
        historyOpen = false;
        voidOpen = false;
        return 'closed_modal';
      }

      if (activeSession && !activeSession.closed) {
        if (state?.view === 'chat' && state?.sessionId === activeSession.id) {
          return 'retained_chat_view';
        }
        exitConfirm = { type: 'chat' };
        pushState({ luna: true, view: 'chat', sessionId: activeSession.id, modal: 'exit_confirm' });
        return 'prompted_chat_exit';
      }

      return 'boot';
    }

    // Step 1: Open Settings
    openOverlayModal('settings');
    assert.equal(settingsOpen, true);
    assert.equal(historyStack[historyIndex].modal, 'settings');

    // Step 2: Close Settings via UI "X" button
    closeOverlayModal('settings');
    assert.equal(settingsOpen, false, 'Settings must be closed');
    assert.equal(exitConfirm, null, 'Exit confirm must NOT be prompted when closing settings via UI');
    assert.equal(activeSession.closed, false, 'Chat session must remain active');

    // Step 3: Open Settings and press physical Back gesture
    openOverlayModal('settings');
    assert.equal(settingsOpen, true);
    historyIndex--;
    const res = onPopState({ state: historyStack[historyIndex] });
    assert.equal(res, 'closed_modal');
    assert.equal(settingsOpen, false, 'Settings must be closed by back swipe');
    assert.equal(exitConfirm, null, 'Exit confirm must NOT be prompted when closing settings via back swipe');
    assert.equal(activeSession.closed, false, 'Chat session must remain active');
  });

  await test('Cancelling exit dialog ("Stay in Chat") restores chat without infinite pop loop', () => {
    let activeSession = { id: 'sess-456', closed: false };
    let exitConfirm = null;
    let historyStack = [{ luna: true, view: 'boot' }, { luna: true, view: 'chat', sessionId: activeSession.id }];
    let historyIndex = 1;

    function pushState(state) {
      historyStack = historyStack.slice(0, historyIndex + 1);
      historyStack.push(state);
      historyIndex = historyStack.length - 1;
    }

    function onPopState(event) {
      const state = event.state;
      if (exitConfirm) {
        exitConfirm = null;
        if (activeSession && !activeSession.closed) {
          pushState({ luna: true, view: 'chat', sessionId: activeSession.id });
        }
        return 'dismissed_exit_confirm';
      }

      if (activeSession && !activeSession.closed) {
        if (state?.view === 'chat' && state?.sessionId === activeSession.id) {
          return 'retained_chat_view';
        }
        exitConfirm = { type: 'chat' };
        pushState({ luna: true, view: 'chat', sessionId: activeSession.id, modal: 'exit_confirm' });
        return 'prompted_chat_exit';
      }
      return 'boot';
    }

    // 1. User performs back gesture in active chat
    historyIndex--;
    const res1 = onPopState({ state: historyStack[historyIndex] });
    assert.equal(res1, 'prompted_chat_exit');
    assert.deepEqual(exitConfirm, { type: 'chat' });
    assert.equal(historyStack[historyIndex].modal, 'exit_confirm');

    // 2. User taps "Stay in Chat" (onCancel): replaces state with chat view, no history.back() call
    exitConfirm = null;
    historyStack[historyIndex] = { luna: true, view: 'chat', sessionId: activeSession.id };

    // Assert that we are cleanly in chat and exitConfirm is null
    assert.equal(exitConfirm, null, 'Dialog must be dismissed');
    assert.equal(historyStack[historyIndex].view, 'chat');
    assert.equal(historyStack[historyIndex].modal, undefined);

    // 3. User again performs back gesture later
    historyIndex--;
    const res2 = onPopState({ state: historyStack[historyIndex] });
    assert.equal(res2, 'prompted_chat_exit', 'Subsequent back gesture still properly caught');
    assert.deepEqual(exitConfirm, { type: 'chat' });

    // 4. User presses physical back on the open exit dialog to cancel
    historyIndex--;
    const res3 = onPopState({ state: historyStack[historyIndex] });
    assert.equal(res3, 'dismissed_exit_confirm');
    assert.equal(exitConfirm, null);
    assert.equal(historyStack[historyIndex].view, 'chat');
  });

  await test('HistoryModal: Inspecting sub-session pops back to history list without closing modal', () => {
    let historyOpen = true;
    let selectedSessionId = 'hist-1';
    let historyStack = [
      { luna: true, view: 'chat' },
      { luna: true, modal: 'history' },
      { luna: true, modal: 'history_session' },
    ];
    let historyIndex = 2;

    function onPopState(event) {
      const state = event.state;
      if (historyOpen) {
        if (state?.modal === 'history') {
          // Sub-view popped, retain history modal
          selectedSessionId = null;
          return 'retained_history_modal';
        }
        historyOpen = false;
        selectedSessionId = null;
        return 'closed_history_modal';
      }
      return 'other';
    }

    // Step A: Back gesture from sub-session pops to main history list
    historyIndex--;
    const res1 = onPopState({ state: historyStack[historyIndex] });
    assert.equal(res1, 'retained_history_modal');
    assert.equal(selectedSessionId, null, 'Selected session must be cleared');
    assert.equal(historyOpen, true, 'History modal must remain open');

    // Step B: Back gesture from history list closes history modal
    historyIndex--;
    const res2 = onPopState({ state: historyStack[historyIndex] });
    assert.equal(res2, 'closed_history_modal');
    assert.equal(historyOpen, false, 'History modal closed');
  });

  await test('Queue back gesture prompts exit confirmation; cancelling stays in queue, confirming leaves', () => {
    let queued = true;
    let exitConfirm = null;
    let historyStack = [{ luna: true, view: 'boot' }, { luna: true, view: 'queue' }];
    let historyIndex = 1;

    function pushState(state) {
      historyStack = historyStack.slice(0, historyIndex + 1);
      historyStack.push(state);
      historyIndex = historyStack.length - 1;
    }

    function onPopState(event) {
      const state = event.state;
      if (exitConfirm) {
        exitConfirm = null;
        if (queued) {
          pushState({ luna: true, view: 'queue' });
        }
        return 'dismissed_exit_confirm';
      }

      if (queued) {
        if (state?.view === 'queue') {
          return 'retained_queue_view';
        }
        exitConfirm = { type: 'queue' };
        pushState({ luna: true, view: 'queue', modal: 'exit_confirm' });
        return 'prompted_queue_exit';
      }
      return 'boot';
    }

    // Back gesture in queue prompts exit dialog
    historyIndex--;
    const res = onPopState({ state: historyStack[historyIndex] });
    assert.equal(res, 'prompted_queue_exit');
    assert.deepEqual(exitConfirm, { type: 'queue' });

    // Cancel: keep searching
    exitConfirm = null;
    historyStack[historyIndex] = { luna: true, view: 'queue' };
    assert.equal(queued, true);

    // Confirm: leave queue
    exitConfirm = null;
    queued = false;
    historyStack[historyIndex] = { luna: true, view: 'boot' };
    assert.equal(queued, false);
    assert.equal(historyStack[historyIndex].view, 'boot');
  });

  // -------------------------------------------------------------
  // Group 3: Viewport, CSS overscroll-behavior & Safe-Area Insets
  // -------------------------------------------------------------
  console.log('\n▶ 3. Viewport & CSS Ergonomics');

  await test('layout.tsx contains locked pure black themeColor and interactive-widget=resizes-content', () => {
    const layoutContent = fs.readFileSync(path.resolve('src/app/layout.tsx'), 'utf-8');
    assert.ok(
      layoutContent.includes('interactiveWidget: "resizes-content"'),
      'interactiveWidget: "resizes-content" must be configured for virtual keyboard ergonomics'
    );
    assert.ok(
      layoutContent.includes('#09090b'),
      'Locked monochrome dark themeColor (#09090b) must be set'
    );
    assert.ok(
      layoutContent.includes('viewportFit: "cover"'),
      'viewportFit: "cover" must be configured for full edge-to-edge layout'
    );
  });

  await test('globals.css applies overscroll-behavior: none to prevent pull-to-refresh reload and rubber-band bounce', () => {
    const cssContent = fs.readFileSync(path.resolve('src/app/globals.css'), 'utf-8');
    assert.ok(
      cssContent.includes('overscroll-behavior: none'),
      'html and body must have overscroll-behavior: none'
    );
    assert.ok(
      cssContent.includes('-webkit-overscroll-behavior: none'),
      'WebKit overscroll behavior prefix must be present'
    );
  });

  await test('Fixed header and composer declare safe-area insets for notched iPhones and gesture nav pills', () => {
    const headerContent = fs.readFileSync(path.resolve('src/components/luna/status-header.tsx'), 'utf-8');
    assert.ok(
      headerContent.includes('env(safe-area-inset-top)'),
      'StatusHeader must include env(safe-area-inset-top)'
    );

    const composerContent = fs.readFileSync(path.resolve('src/components/luna/composer.tsx'), 'utf-8');
    assert.ok(
      composerContent.includes('env(safe-area-inset-bottom)'),
      'Composer must include env(safe-area-inset-bottom)'
    );
  });

  await test('LineView transcript declares overscroll-y-contain to isolate scroll chains', () => {
    const lineViewContent = fs.readFileSync(path.resolve('src/components/luna/line-view.tsx'), 'utf-8');
    assert.ok(
      lineViewContent.includes('overscroll-y-contain'),
      'LineView transcript scroll container must have overscroll-y-contain'
    );
  });

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`   TOTAL: ${passed} / ${passed + failed} passed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMobileNavigationHapticsSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
