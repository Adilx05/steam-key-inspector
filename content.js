(() => {
  'use strict';

  const PAGE_PATH = '/account/registerkey';
  const NETWORK_KEYWORD = 'ajaxregisterkey';
  const STORAGE_KEY = 'ski_enabled';
  const COPY_LABEL_DEFAULT = 'Copy';
  const COPY_LABEL_DONE = 'Copied';

  if (!location.pathname.startsWith(PAGE_PATH)) {
    return;
  }

  const state = {
    enabled: true,
    panelMounted: false,
    gameName: '',
    packageId: null,
    message: 'Waiting for key submission…',
    copyTimeoutId: null
  };

  const ui = {
    root: null,
    message: null,
    gameName: null,
    packageId: null,
    steamDbLink: null,
    toggle: null,
    copyButton: null
  };

  function normalizeResponseData(json) {
    if (!json || typeof json !== 'object') {
      return null;
    }

    const receipt = json.purchase_receipt_info;
    const lineItems = Array.isArray(receipt?.line_items) ? receipt.line_items : [];
    const firstItem = lineItems.find((item) => item && typeof item === 'object');

    const description = firstItem?.line_item_description;
    const packageId = firstItem?.packageid ?? firstItem?.package_id ?? null;

    const hasDescription = typeof description === 'string' && description.trim().length > 0;

    if (!hasDescription && !packageId) {
      return null;
    }

    return {
      gameName: hasDescription ? description.trim() : null,
      packageId: packageId ? String(packageId) : null
    };
  }

  function getStatusMessage(parsedData) {
    if (parsedData?.gameName) {
      return `Game detected: ${parsedData.gameName}`;
    }
    return 'No game info found';
  }

  function resetCopyButtonLabel() {
    if (!ui.copyButton) {
      return;
    }
    ui.copyButton.textContent = COPY_LABEL_DEFAULT;
  }

  function setCopyButtonState(canCopy) {
    if (!ui.copyButton) {
      return;
    }
    ui.copyButton.disabled = !canCopy || !state.enabled;
    if (!canCopy) {
      resetCopyButtonLabel();
    }
  }

  function render() {
    if (!ui.root) {
      return;
    }

    ui.root.dataset.enabled = state.enabled ? 'true' : 'false';

    if (ui.toggle) {
      ui.toggle.checked = state.enabled;
    }

    if (!state.enabled) {
      if (ui.message) {
        ui.message.textContent = 'Steam Key Inspector is disabled';
      }
      if (ui.gameName) {
        ui.gameName.textContent = '—';
      }
      if (ui.packageId) {
        ui.packageId.textContent = '—';
      }
      if (ui.steamDbLink) {
        ui.steamDbLink.hidden = true;
      }
      setCopyButtonState(false);
      return;
    }

    if (ui.message) {
      ui.message.textContent = state.message;
    }

    const hasGameName = Boolean(state.gameName);
    const hasPackageId = Boolean(state.packageId);

    if (ui.gameName) {
      ui.gameName.textContent = hasGameName ? state.gameName : '—';
    }

    if (ui.packageId) {
      ui.packageId.textContent = hasPackageId ? state.packageId : '—';
    }

    if (ui.steamDbLink) {
      if (hasPackageId) {
        ui.steamDbLink.href = `https://steamdb.info/sub/${encodeURIComponent(state.packageId)}`;
        ui.steamDbLink.hidden = false;
      } else {
        ui.steamDbLink.hidden = true;
      }
    }

    setCopyButtonState(hasGameName);
  }

  async function saveEnabledPreference(enabled) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: enabled });
    } catch (_) {
      // Ignore storage failures silently to avoid impacting the page behavior.
    }
  }

  async function loadEnabledPreference() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      if (typeof stored?.[STORAGE_KEY] === 'boolean') {
        state.enabled = stored[STORAGE_KEY];
      }
    } catch (_) {
      // Keep default state if storage is unavailable.
    }
  }

  function mountPanel() {
    if (state.panelMounted) {
      return;
    }

    const keyInput = document.querySelector('input[name="product_key"], #product_key');
    if (!keyInput) {
      return;
    }

    const panel = document.createElement('section');
    panel.className = 'ski-panel';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');

    panel.innerHTML = `
      <div class="ski-header">
        <strong>Steam Key Inspector</strong>
        <label class="ski-toggle">
          <input type="checkbox" id="ski-toggle" checked>
          <span>Enabled</span>
        </label>
      </div>
      <p class="ski-message" id="ski-message">Waiting for key submission…</p>
      <dl class="ski-grid">
        <div>
          <dt>🎮 Game Name</dt>
          <dd id="ski-game-name">—</dd>
        </div>
        <div>
          <dt>Package ID</dt>
          <dd id="ski-package-id">—</dd>
        </div>
      </dl>
      <div class="ski-actions">
        <button type="button" id="ski-copy" class="ski-btn">${COPY_LABEL_DEFAULT}</button>
        <a id="ski-steamdb-link" class="ski-link" href="#" target="_blank" rel="noopener noreferrer" hidden>
          Open on SteamDB
        </a>
      </div>
    `;

    keyInput.insertAdjacentElement('afterend', panel);

    ui.root = panel;
    ui.message = panel.querySelector('#ski-message');
    ui.gameName = panel.querySelector('#ski-game-name');
    ui.packageId = panel.querySelector('#ski-package-id');
    ui.steamDbLink = panel.querySelector('#ski-steamdb-link');
    ui.toggle = panel.querySelector('#ski-toggle');
    ui.copyButton = panel.querySelector('#ski-copy');

    ui.toggle?.addEventListener('change', async (event) => {
      state.enabled = Boolean(event.target?.checked);
      await saveEnabledPreference(state.enabled);
      render();
    });

    ui.copyButton?.addEventListener('click', async () => {
      if (!state.enabled || !state.gameName) {
        return;
      }
      try {
        await navigator.clipboard.writeText(state.gameName);
        ui.copyButton.textContent = COPY_LABEL_DONE;
        if (state.copyTimeoutId) {
          clearTimeout(state.copyTimeoutId);
        }
        state.copyTimeoutId = window.setTimeout(() => {
          resetCopyButtonLabel();
          state.copyTimeoutId = null;
        }, 1200);
      } catch (_) {
        resetCopyButtonLabel();
      }
    });

    state.panelMounted = true;
    render();
  }

  function updateFromAjaxResponse(json) {
    if (!state.enabled) {
      return;
    }

    const parsed = normalizeResponseData(json);
    state.gameName = parsed?.gameName ?? '';
    state.packageId = parsed?.packageId ?? null;
    state.message = getStatusMessage(parsed);
    render();
  }

  function isTargetRequest(url) {
    return typeof url === 'string' && url.includes(NETWORK_KEYWORD);
  }

  function patchFetch() {
    if (typeof window.fetch !== 'function') {
      return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      try {
        const requestTarget = args[0];
        const requestUrl = typeof requestTarget === 'string' ? requestTarget : requestTarget?.url;

        if (isTargetRequest(requestUrl)) {
          const cloned = response.clone();
          const data = await cloned.json();
          updateFromAjaxResponse(data);
        }
      } catch (_) {
        // Ignore parse/intercept errors to preserve page behavior.
      }

      return response;
    };
  }

  async function init() {
    patchFetch();
    await loadEnabledPreference();

    const observer = new MutationObserver(() => {
      if (!state.panelMounted) {
        mountPanel();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    mountPanel();
  }

  init();
})();
