(() => {
  'use strict';

  const PAGE_PATH = '/account/registerkey';
  const NETWORK_KEYWORD = 'ajaxregisterkey';
  const STORAGE_KEY_ENABLED = 'ski_enabled';
  const STORAGE_KEY_HISTORY = 'ski_history';
  const HISTORY_LIMIT = 20;
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
    copyTimeoutId: null,
    history: [],
    historyExpanded: true,
    lastDetectedText: 'Never',
    processedPayloads: new Set(),
    flashTimeoutId: null
  };

  const ui = {
    root: null,
    message: null,
    gameName: null,
    packageId: null,
    steamDbLink: null,
    toggle: null,
    copyButton: null,
    historyList: null,
    historyEmpty: null,
    clearHistoryButton: null,
    historyToggle: null,
    historyContent: null,
    lastDetectedBadge: null
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

  function formatRelativeTime(timestamp) {
    try {
      const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
      if (diffSeconds < 5) {
        return 'just now';
      }
      if (diffSeconds < 60) {
        return `${diffSeconds} sec ago`;
      }
      const minutes = Math.floor(diffSeconds / 60);
      if (minutes < 60) {
        return `${minutes} min ago`;
      }
      const hours = Math.floor(minutes / 60);
      if (hours < 24) {
        return `${hours} hr ago`;
      }
      const days = Math.floor(hours / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    } catch (_) {
      return 'unknown';
    }
  }

  function renderHistory() {
    if (!ui.historyList || !ui.historyEmpty || !ui.lastDetectedBadge) {
      return;
    }

    ui.historyList.textContent = '';

    if (state.history.length === 0) {
      ui.historyEmpty.hidden = false;
      state.lastDetectedText = 'Never';
    } else {
      ui.historyEmpty.hidden = true;
      const latest = state.history[0];
      state.lastDetectedText = formatRelativeTime(latest.timestamp);

      state.history.forEach((item) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'ski-history-item';

        const title = document.createElement('div');
        title.className = 'ski-history-title';
        title.textContent = `🎮 ${item.gameName || 'Unknown Game'}`;

        const meta = document.createElement('div');
        meta.className = 'ski-history-meta';
        const pkgText = item.packageId ? `Package: ${item.packageId}` : 'Package: —';
        meta.textContent = `${pkgText} • ${formatRelativeTime(item.timestamp)}`;

        row.appendChild(title);
        row.appendChild(meta);

        if (item.packageId) {
          row.addEventListener('click', () => {
            try {
              window.open(`https://steamdb.info/sub/${encodeURIComponent(item.packageId)}`, '_blank', 'noopener');
            } catch (_) {
              // Intentionally silent.
            }
          });
        } else {
          row.disabled = true;
        }

        ui.historyList.appendChild(row);
      });
    }

    ui.lastDetectedBadge.textContent = `Last detected: ${state.lastDetectedText}`;
  }

  async function saveHistory(newItem) {
    if (!newItem || typeof newItem !== 'object') {
      return;
    }

    const previous = state.history[0];
    if (previous && previous.gameName === newItem.gameName && previous.packageId === newItem.packageId) {
      return;
    }

    state.history = [newItem, ...state.history].slice(0, HISTORY_LIMIT);
    renderHistory();

    try {
      await chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: state.history });
    } catch (_) {
      // Keep UI responsive even if storage fails.
    }
  }

  async function loadHistory() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_HISTORY);
      const raw = Array.isArray(stored?.[STORAGE_KEY_HISTORY]) ? stored[STORAGE_KEY_HISTORY] : [];

      state.history = raw
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          gameName: typeof entry.gameName === 'string' ? entry.gameName : 'Unknown Game',
          packageId: typeof entry.packageId === 'string' ? entry.packageId : null,
          timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now()
        }))
        .slice(0, HISTORY_LIMIT);
    } catch (_) {
      state.history = [];
    }

    renderHistory();
  }

  function flashPanel() {
    if (!ui.root) {
      return;
    }
    ui.root.classList.remove('ski-flash');
    void ui.root.offsetWidth;
    ui.root.classList.add('ski-flash');
    if (state.flashTimeoutId) {
      clearTimeout(state.flashTimeoutId);
    }
    state.flashTimeoutId = window.setTimeout(() => {
      ui.root?.classList.remove('ski-flash');
      state.flashTimeoutId = null;
    }, 700);
  }

  function render() {
    if (!ui.root) {
      return;
    }

    ui.root.dataset.enabled = state.enabled ? 'true' : 'false';

    if (ui.toggle) {
      ui.toggle.checked = state.enabled;
    }

    if (ui.historyContent && ui.historyToggle) {
      ui.historyContent.hidden = !state.historyExpanded;
      ui.historyToggle.textContent = state.historyExpanded ? '▼ History' : '▶ History';
      ui.historyToggle.setAttribute('aria-expanded', state.historyExpanded ? 'true' : 'false');
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
      renderHistory();
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

    renderHistory();
    setCopyButtonState(hasGameName);
  }

  async function saveEnabledPreference(enabled) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_ENABLED]: enabled });
    } catch (_) {}
  }

  async function loadEnabledPreference() {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY_ENABLED);
      if (typeof stored?.[STORAGE_KEY_ENABLED] === 'boolean') {
        state.enabled = stored[STORAGE_KEY_ENABLED];
      }
    } catch (_) {}
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
      <div class="ski-badge" id="ski-last-detected">Last detected: Never</div>
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
      <section class="ski-history" aria-label="History">
        <button type="button" id="ski-history-toggle" class="ski-history-toggle" aria-expanded="true">▼ History</button>
        <div id="ski-history-content">
          <div id="ski-history-empty" class="ski-history-empty">No history yet</div>
          <div id="ski-history-list" class="ski-history-list"></div>
          <button type="button" id="ski-clear-history" class="ski-btn ski-clear-btn">Clear history</button>
        </div>
      </section>
    `;

    keyInput.insertAdjacentElement('afterend', panel);

    ui.root = panel;
    ui.message = panel.querySelector('#ski-message');
    ui.gameName = panel.querySelector('#ski-game-name');
    ui.packageId = panel.querySelector('#ski-package-id');
    ui.steamDbLink = panel.querySelector('#ski-steamdb-link');
    ui.toggle = panel.querySelector('#ski-toggle');
    ui.copyButton = panel.querySelector('#ski-copy');
    ui.historyList = panel.querySelector('#ski-history-list');
    ui.historyEmpty = panel.querySelector('#ski-history-empty');
    ui.clearHistoryButton = panel.querySelector('#ski-clear-history');
    ui.historyToggle = panel.querySelector('#ski-history-toggle');
    ui.historyContent = panel.querySelector('#ski-history-content');
    ui.lastDetectedBadge = panel.querySelector('#ski-last-detected');

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

    ui.historyToggle?.addEventListener('click', () => {
      state.historyExpanded = !state.historyExpanded;
      render();
    });

    ui.clearHistoryButton?.addEventListener('click', async () => {
      state.history = [];
      renderHistory();
      try {
        await chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: [] });
      } catch (_) {}
    });

    state.panelMounted = true;
    render();
  }

  async function updateFromAjaxResponse(json) {
    if (!state.enabled) {
      return;
    }

    const parsed = normalizeResponseData(json);
    state.gameName = parsed?.gameName ?? '';
    state.packageId = parsed?.packageId ?? null;
    state.message = getStatusMessage(parsed);
    render();

    if (parsed?.gameName || parsed?.packageId) {
      await saveHistory({
        gameName: parsed.gameName || 'Unknown Game',
        packageId: parsed.packageId,
        timestamp: Date.now()
      });
      flashPanel();
    }
  }

  function isTargetRequest(url) {
    return typeof url === 'string' && url.includes(NETWORK_KEYWORD);
  }

  function shouldProcessPayload(json) {
    try {
      const parsed = normalizeResponseData(json);
      if (!parsed) {
        return true;
      }
      const fingerprint = `${parsed.gameName || ''}::${parsed.packageId || ''}`;
      if (state.processedPayloads.has(fingerprint)) {
        return false;
      }
      state.processedPayloads.add(fingerprint);
      if (state.processedPayloads.size > 40) {
        state.processedPayloads.clear();
        state.processedPayloads.add(fingerprint);
      }
      return true;
    } catch (_) {
      return true;
    }
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
          if (shouldProcessPayload(data)) {
            await updateFromAjaxResponse(data);
          }
        }
      } catch (_) {}

      return response;
    };
  }

  function patchXhr() {
    if (!window.XMLHttpRequest || !window.XMLHttpRequest.prototype) {
      return;
    }

    const proto = window.XMLHttpRequest.prototype;
    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function openPatched(method, url, ...rest) {
      try {
        this.__skiTargetRequest = isTargetRequest(typeof url === 'string' ? url : String(url || ''));
      } catch (_) {
        this.__skiTargetRequest = false;
      }
      return originalOpen.call(this, method, url, ...rest);
    };

    proto.send = function sendPatched(...args) {
      try {
        if (this.__skiTargetRequest) {
          this.addEventListener('load', () => {
            try {
              const text = typeof this.responseText === 'string' ? this.responseText : '';
              if (!text) {
                return;
              }
              const data = JSON.parse(text);
              if (shouldProcessPayload(data)) {
                void updateFromAjaxResponse(data);
              }
            } catch (_) {}
          }, { once: true });
        }
      } catch (_) {}

      return originalSend.apply(this, args);
    };
  }

  async function init() {
    patchFetch();
    patchXhr();
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
    await loadHistory();
    render();
  }

  void init();
})();
