/*!
 * real-estate-deposit-modal.js
 * Self-contained modal UI for a "buyer deposit" form + Connect Wallet button.
 *
 * Usage:
 * 1) Include this script on any page (e.g. <script src="real-estate-deposit-modal.js"></script>)
 * 2) Create the modal and open it:
 *      const modal = RealEstateDepositModal.create({
 *         onSubmit: (data) => { console.log('deposit data', data); /* send to backend or trigger tx */ },
 *         onConnect: (account) => { console.log('connected account', account); }
 *      });
 *      modal.open();
 *
 * The modal injects styles automatically and doesn't depend on external libs.
 */
(function (global) {
  const STYLE_ID = 'red-modal-styles-v1';

  const defaultStyles = `
  /* Overlay */
  .red-overlay {
    position: fixed;
    inset: 0;
    background: rgba(12, 18, 25, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2147483646;
    padding: 20px;
    backdrop-filter: blur(4px);
  }
  /* Modal */
  .red-modal {
    width: 100%;
    max-width: 720px;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(2, 6, 23, 0.28);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: translateY(6px);
    animation: red-modal-show 180ms ease-out;
  }
  @keyframes red-modal-show { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .red-modal-header {
    padding: 18px 20px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    border-bottom: 1px solid #eef2f6;
  }
  .red-modal-title {
    font-size: 18px;
    font-weight: 600;
    color: #071029;
    margin: 0;
  }
  .red-modal-close {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #6b7b8b;
  }
  .red-modal-body {
    padding: 20px;
  }
  .red-form-row {
    margin-bottom: 14px;
    display:flex;
    flex-direction:column;
  }
  .red-label {
    font-size: 13px;
    margin-bottom: 6px;
    color: #124;
  }
  .red-input, .red-textarea, .red-select {
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid #dfe7ef;
    font-size: 14px;
    outline: none;
    transition: box-shadow .12s, border-color .12s;
    background: #fff;
  }
  .red-input:focus, .red-textarea:focus {
    box-shadow: 0 0 0 4px rgba(18, 122, 255, 0.06);
    border-color: #1a73ff;
  }
  .red-textarea { min-height: 80px; resize: vertical; }
  .red-modal-footer {
    padding: 16px 20px;
    display:flex;
    gap:10px;
    align-items:center;
    justify-content: flex-end;
    border-top: 1px solid #eef2f6;
  }
  .red-btn {
    display:inline-flex;
    align-items:center;
    gap:8px;
    padding: 10px 14px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
  }
  .red-btn-ghost {
    background: transparent;
    color: #345;
  }
  .red-btn-primary {
    background: linear-gradient(90deg,#1565ff 0%, #1ea1ff 100%);
    color: white;
    box-shadow: 0 6px 18px rgba(28, 94, 255, 0.18);
  }
  .red-wallet {
    margin-bottom: 12px;
    display:flex;
    gap:10px;
    align-items:center;
  }
  .red-wallet-status {
    font-size: 13px;
    color: #1d3150;
    padding: 8px 12px;
    border-radius: 8px;
    background: #f5f9ff;
    border: 1px solid #e6f0ff;
  }
  .red-small {
    font-size: 12px;
    color: #516975;
  }
  /* Mobile */
  @media (max-width:480px) {
    .red-modal { max-width: 100%; height: 100%; border-radius: 10px; justify-content: space-between; }
    .red-modal-body { padding-bottom: 90px; } /* allow space for footer */
    .red-modal-footer { position: sticky; bottom: 0; background: #fff; }
  }
  `;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.innerHTML = defaultStyles;
    document.head.appendChild(style);
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (!c) return;
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  function formatAddress(a) {
    if (!a) return '';
    return a.slice(0, 6) + '...' + a.slice(-4);
  }

  function createModalElements() {
    // overlay & container
    const overlay = el('div', { class: 'red-overlay', role: 'presentation' });
    const modal = el('div', { class: 'red-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Buyer deposit' });

    // header
    const title = el('h3', { class: 'red-modal-title' }, 'Buyer Deposit');
    const closeBtn = el('button', { class: 'red-modal-close', 'aria-label': 'Close modal' }, '✕');
    const header = el('div', { class: 'red-modal-header' }, [title, closeBtn]);

    // body
    const body = el('div', { class: 'red-modal-body' });

    // Wallet UI row
    const walletRow = el('div', { class: 'red-wallet' });
    const walletStatus = el('div', { class: 'red-wallet-status red-small', role: 'status' }, 'Wallet: Not connected');
    const connectBtn = el('button', { class: 'red-btn red-btn-ghost', type: 'button' }, 'Connect Wallet');
    walletRow.appendChild(walletStatus);
    walletRow.appendChild(connectBtn);

    // Form
    const form = el('form', { novalidate: 'true' });

    // Property address
    const propertyRow = el('div', { class: 'red-form-row' }, [
      el('label', { class: 'red-label', for: 'red-property' }, 'Property address'),
      el('input', { id: 'red-property', name: 'property', class: 'red-input', placeholder: '123 Main St, City, State or parcel ID', required: 'true', type: 'text', autocomplete: 'street-address' })
    ]);

    // Buyer name
    const nameRow = el('div', { class: 'red-form-row' }, [
      el('label', { class: 'red-label', for: 'red-name' }, 'Buyer name'),
      el('input', { id: 'red-name', name: 'name', class: 'red-input', placeholder: 'Full name', required: 'true', type: 'text', autocomplete: 'name' })
    ]);

    // Amount
    const amountRow = el('div', { class: 'red-form-row' }, [
      el('label', { class: 'red-label', for: 'red-amount' }, 'Amount (USD)'),
      el('input', { id: 'red-amount', name: 'amount', class: 'red-input', placeholder: 'e.g. 5000.00', required: 'true', inputmode: 'decimal', type: 'number', step: '0.01', min: '0' })
    ]);

    // Reference / note
    const refRow = el('div', { class: 'red-form-row' }, [
      el('label', { class: 'red-label', for: 'red-reference' }, 'Reference / Notes'),
      el('textarea', { id: 'red-reference', name: 'reference', class: 'red-textarea', placeholder: 'Optional reference, e.g. offer #123' })
    ]);

    // small helper
    const smallRow = el('div', { class: 'red-small' }, 'All fields are validated. Wallet connection is required to finalize deposit.');

    form.appendChild(propertyRow);
    form.appendChild(nameRow);
    form.appendChild(amountRow);
    form.appendChild(refRow);
    form.appendChild(smallRow);

    body.appendChild(walletRow);
    body.appendChild(form);

    // footer buttons
    const cancelBtn = el('button', { class: 'red-btn red-btn-ghost', type: 'button' }, 'Cancel');
    const submitBtn = el('button', { class: 'red-btn red-btn-primary', type: 'submit' }, 'Submit Deposit');

    const footer = el('div', { class: 'red-modal-footer' }, [cancelBtn, submitBtn]);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);

    return {
      overlay, modal, closeBtn, connectBtn, walletStatus, form, cancelBtn, submitBtn,
      inputs: {
        property: form.querySelector('#red-property'),
        name: form.querySelector('#red-name'),
        amount: form.querySelector('#red-amount'),
        reference: form.querySelector('#red-reference'),
      }
    };
  }

  // Minimal focus trap
  function trapFocus(modalEl) {
    const focusable = modalEl.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
    const nodes = Array.prototype.slice.call(focusable);
    if (!nodes.length) return () => {};
    let i = 0;
    nodes[0].focus();
    function onKey(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) i = (i - 1 + nodes.length) % nodes.length;
        else i = (i + 1) % nodes.length;
        nodes[i].focus();
      } else if (e.key === 'Escape') {
        // handled by outside listener
      }
    }
    modalEl.addEventListener('keydown', onKey);
    return () => modalEl.removeEventListener('keydown', onKey);
  }

  // Wallet helpers (MetaMask / EVM)
  async function connectWalletViaWindowEthereum() {
    if (!window.ethereum) throw new Error('No Ethereum wallet detected (window.ethereum not found).');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    return accounts && accounts[0] ? accounts[0] : null;
  }

  // Public factory
  const RealEstateDepositModal = {
    create: (opts = {}) => {
      injectStyles();
      const { overlay, modal, closeBtn, connectBtn, walletStatus, form, cancelBtn, submitBtn, inputs } = createModalElements();
      let connectedAccount = null;
      let previouslyFocused = null;
      let removeTrap = null;

      // callbacks
      const onSubmit = typeof opts.onSubmit === 'function' ? opts.onSubmit : (d) => { console.log('deposit submit', d); };
      const onConnect = typeof opts.onConnect === 'function' ? opts.onConnect : (a) => {};

      async function updateWalletUI(account) {
        connectedAccount = account;
        if (account) {
          walletStatus.textContent = 'Wallet: ' + formatAddress(account);
          connectBtn.textContent = 'Connected';
          connectBtn.disabled = true;
          connectBtn.classList.remove('red-btn-ghost');
          connectBtn.classList.add('red-btn-primary');
        } else {
          walletStatus.textContent = 'Wallet: Not connected';
          connectBtn.textContent = 'Connect Wallet';
          connectBtn.disabled = false;
          connectBtn.classList.remove('red-btn-primary');
          connectBtn.classList.add('red-btn-ghost');
        }
      }

      async function tryAutoConnect() {
        try {
          if (window.ethereum && window.ethereum.selectedAddress) {
            await updateWalletUI(window.ethereum.selectedAddress);
            onConnect(window.ethereum.selectedAddress);
          } else if (window.ethereum) {
            // non-invasive request: eth_accounts
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts && accounts[0]) {
              await updateWalletUI(accounts[0]);
              onConnect(accounts[0]);
            }
          }
        } catch (err) {
          console.debug('Auto connect failed', err);
        }
      }

      async function handleConnectClick() {
        try {
          const account = await connectWalletViaWindowEthereum();
          await updateWalletUI(account);
          onConnect(account);
        } catch (err) {
          alert('Wallet connect failed: ' + (err && err.message ? err.message : String(err)));
        }
      }

      function validateForm() {
        const errors = [];
        const property = inputs.property.value.trim();
        const name = inputs.name.value.trim();
        const amountRaw = inputs.amount.value;
        const amount = Number(amountRaw);
        if (!property) errors.push('Property address is required.');
        if (!name) errors.push('Buyer name is required.');
        if (!amountRaw || Number.isNaN(amount) || amount <= 0) errors.push('Amount must be a positive number.');
        return { ok: errors.length === 0, errors, data: { property, name, amount: amount, reference: inputs.reference.value.trim() } };
      }

      async function handleSubmit(e) {
        e.preventDefault();
        const { ok, errors, data } = validateForm();
        if (!ok) {
          alert('Please fix errors:\n' + errors.join('\n'));
          return;
        }
        if (!connectedAccount) {
          const proceed = confirm('No wallet connected. Connect now?');
          if (proceed) {
            try {
              await handleConnectClick();
            } catch (err) {
              return;
            }
            if (!connectedAccount) return; // still not connected
          } else return;
        }
        // attach wallet to data
        data.wallet = connectedAccount;
        // call user callback
        try {
          const res = onSubmit(data);
          // allow promise handling
          if (res && typeof res.then === 'function') {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';
            await res;
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Deposit';
          }
        } catch (err) {
          console.error('onSubmit threw', err);
          alert('Submit handler error: ' + (err && err.message ? err.message : String(err)));
          return;
        }
        close();
      }

      function open() {
        if (document.body.contains(overlay)) return;
        previouslyFocused = document.activeElement;
        document.body.appendChild(overlay);
        // disable scroll behind
        document.body.style.overflow = 'hidden';
        // event listeners
        overlay.addEventListener('click', overlayClick);
        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);
        form.addEventListener('submit', handleSubmit);
        connectBtn.addEventListener('click', handleConnectClick);
        // close on ESC
        document.addEventListener('keydown', onKeyDown);
        // focus trap
        removeTrap = trapFocus(modal);
        // try to auto-connect wallet if available
        tryAutoConnect();
        // focus first input
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

      // expose some helpers
      return {
        open,
        close,
        element: modal,
        connect: handleConnectClick,
        setWallet: updateWalletUI, // set external wallet (e.g., from WalletConnect)
        getValues: () => {
          const { data } = validateForm();
          data.wallet = connectedAccount;
          return data;
        }
      };
    }
  };

  // attach to global
  global.RealEstateDepositModal = RealEstateDepositModal;
})(window);

/* Example usage:
<script>
  // wait until this script loaded on page
  const modal = RealEstateDepositModal.create({
    onSubmit: async (data) => {
      // send data to your backend or create blockchain tx
      // e.g. await fetch('/api/deposit', {method:'POST', body: JSON.stringify(data)});
      console.log('form submit', data);
      alert('Deposit submitted. See console.');
    },
    onConnect: (acct) => {
      console.log('wallet connected', acct);
    }
  });

  // open modal (you can wire this to any button)
  // modal.open();
</script>
*/
