/*!
 * real-estate-deposit-modal.js
 * Self-contained modal UI for a "buyer deposit" form + Connect Wallet button.
 *
 * Features:
 * - Injects styles automatically (no external CSS)
 * - Works standalone and can be attached to any button/element via:
 *     RealEstateDepositModal.attach(selectorOrElement, options)
 *   or used programmatically:
 *     const m = RealEstateDepositModal.create(options); m.open();
 * - Minimal focus trap, ESC & overlay close
 * - Basic validation and wallet connect via window.ethereum (if available)
 * - Safe to include multiple times (idempotent style injection)
 *
 * Usage:
 * 1) Include this file on any page.
 * 2) Attach to a button:
 *      RealEstateDepositModal.attach('#myBtn', { onSubmit, onConnect });
 *    or create/open directly:
 *      const modal = RealEstateDepositModal.create({ onSubmit, onConnect });
 *      modal.open();
 *
 * onSubmit receives an object: { property, name, amount, reference, wallet }
 *
 * Copyright: MIT-style, small utility.
 */
(function (global) {
  const STYLE_ID = 'red-modal-styles-v1';
  const PREFIX = 'red-'; // prefix for ids/classes to avoid collisions

  const defaultStyles = `
/* Overlay */
.${PREFIX}overlay {
  position: fixed;
  inset: 0;
  background: rgba(12,18,25,0.6);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index: 2147483646;
  padding: 20px;
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}

/* Modal container */
.${PREFIX}modal {
  width: 100%;
  max-width: 720px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(2,6,23,0.28);
  overflow: hidden;
  display:flex;
  flex-direction:column;
  transform: translateY(6px);
  animation: ${PREFIX}modal-show 180ms ease-out;
  max-height: 96vh;
}

/* Animation */
@keyframes ${PREFIX}modal-show { from { opacity:0; transform: translateY(12px);} to { opacity:1; transform: translateY(0);} }

/* Header */
.${PREFIX}modal-header {
  padding: 16px 18px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  border-bottom: 1px solid #eef2f6;
}
.${PREFIX}modal-title { margin:0; font-size:18px; font-weight:600; color:#071029;}
.${PREFIX}modal-close {
  background:none;
  border:0;
  font-size:18px;
  cursor:pointer;
  color:#6b7b8b;
}

/* Body */
.${PREFIX}modal-body { padding:18px; overflow:auto; }

/* Form */
.${PREFIX}form-row { margin-bottom:12px; display:flex; flex-direction:column; }
.${PREFIX}label { font-size:13px; margin-bottom:6px; color:#124; }
.${PREFIX}input, .${PREFIX}textarea, .${PREFIX}select {
  padding:10px 12px;
  border-radius:8px;
  border:1px solid #dfe7ef;
  font-size:14px;
  outline:none;
  background:#fff;
}
.${PREFIX}input:focus, .${PREFIX}textarea:focus, .${PREFIX}select:focus {
  box-shadow: 0 0 0 4px rgba(26,115,255,0.06);
  border-color: #1a73ff;
}
.${PREFIX}textarea { min-height:80px; resize:vertical; }

/* Footer */
.${PREFIX}modal-footer {
  padding:14px 18px;
  display:flex;
  gap:10px;
  align-items:center;
  justify-content:flex-end;
  border-top:1px solid #eef2f6;
}

/* Buttons */
.${PREFIX}btn {
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:10px 14px;
  border-radius:10px;
  border: none;
  cursor:pointer;
  font-weight:600;
  font-size:14px;
}
.${PREFIX}btn-ghost { background:transparent; color:#345; }
.${PREFIX}btn-primary {
  background: linear-gradient(90deg,#1565ff 0%, #1ea1ff 100%);
  color:#fff;
  box-shadow: 0 6px 18px rgba(28,94,255,0.18);
}

/* Wallet row */
.${PREFIX}wallet { margin-bottom:12px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.${PREFIX}wallet-status { font-size:13px; color:#1d3150; padding:8px 12px; border-radius:8px; background:#f5f9ff; border:1px solid #e6f0ff; }

/* Small helper */
.${PREFIX}small { font-size:12px; color:#516975; }

/* Responsive */
@media (max-width:480px) {
  .${PREFIX}modal { max-width:100%; height:100%; border-radius:10px; justify-content:space-between; }
  .${PREFIX}modal-body { padding-bottom:90px; }
  .${PREFIX}modal-footer { position:sticky; bottom:0; background:#fff; }
}
`;

  /* Utilities */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.innerHTML = defaultStyles;
    document.head.appendChild(style);
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if ((k.startsWith('on') && typeof v === 'function')) {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        node.setAttribute(k, v);
      }
    }
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (!c && c !== 0) return;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  function formatAddress(a) {
    if (!a || typeof a !== 'string') return '';
    if (a.length <= 12) return a;
    return a.slice(0, 6) + '...' + a.slice(-4);
  }

  // Minimal focus trap for modal element
  function trapFocus(modalEl) {
    const selectors = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    let nodes = Array.from(modalEl.querySelectorAll(selectors));
    if (!nodes.length) {
      // fallback: allow modal itself to be focusable
      modalEl.setAttribute('tabindex', '-1');
      nodes = [modalEl];
    }
    let i = 0;
    function keyHandler(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) i = (i - 1 + nodes.length) % nodes.length;
        else i = (i + 1) % nodes.length;
        (nodes[i]).focus();
      }
    }
    modalEl.addEventListener('keydown', keyHandler);
    // initially focus the first focusable
    setTimeout(() => (nodes[0] && nodes[0].focus && nodes[0].focus()), 50);
    return () => modalEl.removeEventListener('keydown', keyHandler);
  }

  // Wallet connect (EVM injected)
  async function connectWalletViaWindowEthereum() {
    if (!window.ethereum) throw new Error('No Ethereum wallet detected (window.ethereum not found).');
    // modern wallets require eth_requestAccounts
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    return accounts && accounts[0] ? accounts[0] : null;
  }

  // Create modal DOM nodes (returns elements)
  function createModalElements() {
    const overlay = el('div', { class: PREFIX + 'overlay', role: 'presentation' });
    const modal = el('div', { class: PREFIX + 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Buyer deposit' });

    // Header
    const title = el('h3', { class: PREFIX + 'modal-title', text: 'Buyer Deposit' });
    const closeBtn = el('button', { class: PREFIX + 'modal-close', 'aria-label': 'Close', type: 'button', text: '✕' });

    const header = el('div', { class: PREFIX + 'modal-header' }, [title, closeBtn]);

    // Body
    const body = el('div', { class: PREFIX + 'modal-body' });

    // Wallet row
    const walletRow = el('div', { class: PREFIX + 'wallet' });
    const walletStatus = el('div', { class: PREFIX + 'wallet-status', role: 'status', text: 'Wallet: Not connected' });
    const connectBtn = el('button', { class: PREFIX + 'btn ' + PREFIX + 'btn-ghost', type: 'button', text: 'Connect Wallet' });
    walletRow.appendChild(walletStatus);
    walletRow.appendChild(connectBtn);

    // Form
    const form = el('form', { novalidate: 'true' });

    const propertyRow = el('div', { class: PREFIX + 'form-row' }, [
      el('label', { class: PREFIX + 'label', for: PREFIX + 'property', text: 'Property address' }),
      el('input', { id: PREFIX + 'property', name: 'property', class: PREFIX + 'input', placeholder: '123 Main St, City, State or parcel ID', required: 'true', type: 'text', autocomplete: 'street-address' })
    ]);
    const nameRow = el('div', { class: PREFIX + 'form-row' }, [
      el('label', { class: PREFIX + 'label', for: PREFIX + 'name', text: 'Buyer name' }),
      el('input', { id: PREFIX + 'name', name: 'name', class: PREFIX + 'input', placeholder: 'Full name', required: 'true', type: 'text', autocomplete: 'name' })
    ]);
    const amountRow = el('div', { class: PREFIX + 'form-row' }, [
      el('label', { class: PREFIX + 'label', for: PREFIX + 'amount', text: 'Amount (USD)' }),
      el('input', { id: PREFIX + 'amount', name: 'amount', class: PREFIX + 'input', placeholder: 'e.g. 5000.00', required: 'true', inputmode: 'decimal', type: 'number', step: '0.01', min: '0' })
    ]);
    const refRow = el('div', { class: PREFIX + 'form-row' }, [
      el('label', { class: PREFIX + 'label', for: PREFIX + 'reference', text: 'Reference / Notes' }),
      el('textarea', { id: PREFIX + 'reference', name: 'reference', class: PREFIX + 'textarea', placeholder: 'Optional reference, e.g. offer #123' })
    ]);
    const helper = el('div', { class: PREFIX + 'small', text: 'All fields are validated. Wallet connection is optional but recommended.' });

    form.appendChild(propertyRow);
    form.appendChild(nameRow);
    form.appendChild(amountRow);
    form.appendChild(refRow);
    form.appendChild(helper);

    body.appendChild(walletRow);
    body.appendChild(form);

    // Footer
    const cancelBtn = el('button', { class: PREFIX + 'btn ' + PREFIX + 'btn-ghost', type: 'button', text: 'Cancel' });
    const submitBtn = el('button', { class: PREFIX + 'btn ' + PREFIX + 'btn-primary', type: 'submit', text: 'Submit Deposit' });
    const footer = el('div', { class: PREFIX + 'modal-footer' }, [cancelBtn, submitBtn]);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    // Inputs map
    const inputs = {
      property: form.querySelector('#' + PREFIX + 'property'),
      name: form.querySelector('#' + PREFIX + 'name'),
      amount: form.querySelector('#' + PREFIX + 'amount'),
      reference: form.querySelector('#' + PREFIX + 'reference'),
    };

    return { overlay, modal, closeBtn, connectBtn, walletStatus, form, cancelBtn, submitBtn, inputs };
  }

  // Factory to create modal instance
  function createInstance(options = {}) {
    injectStyles();
    const { overlay, modal, closeBtn, connectBtn, walletStatus, form, cancelBtn, submitBtn, inputs } = createModalElements();

    let connectedAccount = null;
    let previouslyFocused = null;
    let removeTrap = null;

    const onSubmit = typeof options.onSubmit === 'function' ? options.onSubmit : (data) => { console.log('Deposit onSubmit', data); };
    const onConnect = typeof options.onConnect === 'function' ? options.onConnect : () => {};

    async function setWallet(account) {
      connectedAccount = account;
      if (account) {
        walletStatus.textContent = 'Wallet: ' + formatAddress(account);
        connectBtn.textContent = 'Connected';
        connectBtn.disabled = true;
        connectBtn.classList.remove(PREFIX + 'btn-ghost');
        connectBtn.classList.add(PREFIX + 'btn-primary');
      } else {
        walletStatus.textContent = 'Wallet: Not connected';
        connectBtn.textContent = 'Connect Wallet';
        connectBtn.disabled = false;
        connectBtn.classList.remove(PREFIX + 'btn-primary');
        connectBtn.classList.add(PREFIX + 'btn-ghost');
      }
    }

    async function tryAutoConnect() {
      try {
        if (window.ethereum) {
          // non-invasive read of accounts
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts[0]) {
            await setWallet(accounts[0]);
            try { onConnect(accounts[0]); } catch (e) { console.debug(e); }
          }
        }
      } catch (err) {
        // ignore
        console.debug('Auto connect failed', err);
      }
    }

    async function handleConnectClick() {
      try {
        const account = await connectWalletViaWindowEthereum();
        await setWallet(account);
        try { onConnect(account); } catch (e) { console.debug(e); }
      } catch (err) {
        // show small error but don't break: fallback to alert
        alert('Wallet connect failed: ' + (err && err.message ? err.message : String(err)));
      }
    }

    function validateForm() {
      const errors = [];
      const property = (inputs.property.value || '').trim();
      const name = (inputs.name.value || '').trim();
      const amountRaw = inputs.amount.value;
      const amount = Number(amountRaw);
      if (!property) errors.push('Property address is required.');
      if (!name) errors.push('Buyer name is required.');
      if (!amountRaw || Number.isNaN(amount) || amount <= 0) errors.push('Amount must be a positive number.');
      return { ok: errors.length === 0, errors, data: { property, name, amount: amount, reference: (inputs.reference.value || '').trim() } };
    }

    async function handleSubmit(e) {
      e.preventDefault();
      const { ok, errors, data } = validateForm();
      if (!ok) {
        alert('Please fix errors:\n' + errors.join('\n'));
        return;
      }
      if (!connectedAccount) {
        // ask user to connect if they want
        const proceed = confirm('No wallet connected. Connect now? (Cancel to submit without wallet)');
        if (proceed) {
          try {
            await handleConnectClick();
          } catch (err) {
            return;
          }
          if (!connectedAccount) return;
        }
      }
      data.wallet = connectedAccount;
      try {
        const res = onSubmit(data);
        if (res && typeof res.then === 'function') {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Submitting...';
          try { await res; } catch (err) { throw err; } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Deposit';
          }
        }
      } catch (err) {
        console.error('onSubmit error', err);
        alert('Submit error: ' + (err && err.message ? err.message : String(err)));
        return;
      }
      close();
    }

    function open() {
      if (document.body.contains(overlay)) return;
      previouslyFocused = document.activeElement;
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';
      overlay.addEventListener('click', overlayClick);
      closeBtn.addEventListener('click', close);
      cancelBtn.addEventListener('click', close);
      form.addEventListener('submit', handleSubmit);
      connectBtn.addEventListener('click', handleConnectClick);
      document.addEventListener('keydown', onKeyDown);
      removeTrap = trapFocus(modal);
      tryAutoConnect();
      // clear previous form values if options.resetOnOpen !== false
      if (options.resetOnOpen !== false) {
        inputs.property.value = options.prefill && options.prefill.property ? options.prefill.property : '';
        inputs.name.value = options.prefill && options.prefill.name ? options.prefill.name : '';
        inputs.amount.value = options.prefill && options.prefill.amount ? options.prefill.amount : '';
        inputs.reference.value = options.prefill && options.prefill.reference ? options.prefill.reference : '';
      }
      setTimeout(() => inputs.property.focus(), 80);
    }

    function overlayClick(e) {
      if (e.target === overlay) close();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') close();
    }

    function close() {
      if (!document.body.contains(overlay)) return;
      overlay.removeEventListener('click', overlayClick);
      closeBtn.removeEventListener('click', close);
      cancelBtn.removeEventListener('click', close);
      form.removeEventListener('submit', handleSubmit);
      connectBtn.removeEventListener('click', handleConnectClick);
      document.removeEventListener('keydown', onKeyDown);
      if (removeTrap) removeTrap();
      if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
      document.body.style.overflow = '';
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    }

    return {
      open,
      close,
      element: modal,
      connect: handleConnectClick,
      setWallet,
      getValues: () => {
        const { data } = validateForm();
        data.wallet = connectedAccount;
        return data;
      }
    };
  }

  /* Public API */
  const RealEstateDepositModal = {
    create: (opts) => createInstance(opts),
    // Attach modal to button(s) via selector, element, or NodeList/Array
    attach: (selectorOrElement, options = {}) => {
      if (!selectorOrElement) throw new Error('selectorOrElement is required');
      const elements = (typeof selectorOrElement === 'string')
        ? Array.from(document.querySelectorAll(selectorOrElement))
        : (selectorOrElement instanceof Element ? [selectorOrElement] : Array.from(selectorOrElement || []));

      if (!elements.length) {
        // no elements found; create a single modal but do not auto-open
        const inst = createInstance(options);
        return inst;
      }

      elements.forEach(elm => {
        // avoid attaching multiple handlers: store instance on element
        if (elm.__red_modal_attached) return;
        elm.__red_modal_attached = true;
        const inst = createInstance(options);
        elm.addEventListener('click', (e) => {
          e.preventDefault();
          inst.open();
        });
        // store instance for potential programmatic access
        elm.__red_modal_instance = inst;
      });

      // return first element's instance for convenience
      return elements[0].__red_modal_instance;
    }
  };

  // Expose to global
  if (!global.RealEstateDepositModal) global.RealEstateDepositModal = RealEstateDepositModal;

})(window);
