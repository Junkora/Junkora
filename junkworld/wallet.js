/* wallet.js - Solana wallet linking
   - Detects recommended Solana wallets (Phantom, Solflare, etc.) or standard window.solana
   - Connects and stores state
   - Updates Profile modal UI
*/

(function () {
  'use strict';

  const STORAGE_KEY = 'junkora-wallet-link-sol';

  // Standard wallet detection
  function getSolanaProvider() {
    if ('solana' in window) {
      const provider = window.solana;
      if (provider.isPhantom) {
        return { provider, name: 'Phantom', icon: 'https://phantom.app/img/phantom-logo.svg' };
      }
      return { provider, name: 'Solana Wallet', icon: '' };
    }
    // Check for Solflare
    if ('solflare' in window) {
      return { provider: window.solflare, name: 'Solflare', icon: 'https://solflare.com/assets/logo.svg' };
    }
    // Fallback or other wallets (Backpack, etc would go here)
    return null;
  }

  let state = {
    connected: false,
    publicKey: null,
    walletName: null,
  };

  function shortAddress(pubKey) {
    if (!pubKey) return '';
    const s = pubKey.toString();
    if (s.length <= 12) return s;
    return s.slice(0, 6) + '...' + s.slice(-6);
  }

  function showStatus(msg, isError = false) {
    try {
      const el = document.getElementById('wallet-link-status');
      if (el) {
        el.textContent = msg || '';
        el.style.color = isError ? '#ef476f' : '#b8c19a';
      }
    } catch (e) { }
  }

  function persistState() {
    try {
      if (state.connected) {
        const payload = {
          publicKey: state.publicKey,
          walletName: state.walletName
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) { }
  }

  function setState(partial, persist = true) {
    state = { ...state, ...partial };
    if (persist) persistState();
    renderUI();
  }

  async function connect() {
    try {
      const wallet = getSolanaProvider();
      if (!wallet) {
        window.open('https://phantom.app/', '_blank');
        throw new Error('Solana wallet not found. Please install Phantom.');
      }

      showStatus('Connecting to ' + wallet.name + '...');

      // Connect to wallet
      const resp = await wallet.provider.connect();
      const pubKey = resp.publicKey.toString();

      setState(
        {
          connected: true,
          publicKey: pubKey,
          walletName: wallet.name,
        },
        true
      );
      return true;

    } catch (err) {
      console.warn('Wallet connect failed:', err);
      setState(
        {
          connected: false,
          publicKey: null,
          walletName: null,
        },
        true
      );
      showStatus(
        'Failed: ' + (err.message || String(err)),
        true
      );
      return false;
    }
  }

  async function disconnect() {
    try {
      const wallet = getSolanaProvider();
      if (wallet && wallet.provider && wallet.provider.disconnect) {
        await wallet.provider.disconnect();
      }
    } catch (e) {
      console.warn('Disconnect error:', e);
    }
    setState(
      {
        connected: false,
        publicKey: null,
        walletName: null,
      },
      true
    );
  }

  function renderUI() {
    try {
      const linkBtn = document.getElementById('wallet-link-btn');
      const discBtn = document.getElementById('wallet-disconnect-btn');
      const walletSpan = document.getElementById('profile-wallet');
      const statusRow = document.getElementById('profile-status');

      if (state.connected) {
        if (linkBtn) {
          linkBtn.textContent = 'Linked (' + state.walletName + ')';
          linkBtn.disabled = true;
          linkBtn.style.background = '#2a9d8f';
          linkBtn.style.borderColor = 'transparent';
        }
        if (discBtn) {
          discBtn.style.display = 'inline-block';
          discBtn.disabled = false;
        }
        if (walletSpan) {
          walletSpan.textContent = shortAddress(state.publicKey);
        }
        if (statusRow) {
          statusRow.textContent = 'Active on Solana';
        }
        showStatus('Connected: ' + shortAddress(state.publicKey));
      } else {
        if (linkBtn) {
          linkBtn.textContent = 'Link Wallet';
          linkBtn.disabled = false;
          linkBtn.style.background = '#1f6feb'; // restore original blue
          linkBtn.style.borderColor = 'rgba(120,200,255,0.25)';
        }
        if (discBtn) {
          discBtn.style.display = 'none';
        }
        if (walletSpan) {
          walletSpan.textContent = 'Not linked';
        }
        if (statusRow) {
          // keep empty by default
          if (!statusRow.textContent || statusRow.textContent.includes('Active')) statusRow.textContent = '';
        }
        showStatus('');
      }
    } catch (e) { }
  }

  function wireUI() {
    try {
      const linkBtn = document.getElementById('wallet-link-btn');
      const discBtn = document.getElementById('wallet-disconnect-btn');

      if (linkBtn) {
        // Clone to remove old listeners
        const newBtn = linkBtn.cloneNode(true);
        linkBtn.parentNode.replaceChild(newBtn, linkBtn);

        newBtn.addEventListener('click', async () => {
          if (state.connected) return;
          await connect();
        });
      }

      if (discBtn) {
        // Clone to remove old listeners
        const newDisc = discBtn.cloneNode(true);
        discBtn.parentNode.replaceChild(newDisc, discBtn);

        newDisc.addEventListener('click', () => {
          disconnect();
        });
      }
    } catch (e) { }
    renderUI();
  }

  function autoReconnect() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && saved.publicKey) {
        // Eagerly set state for UI
        setState({
          connected: true,
          publicKey: saved.publicKey,
          walletName: saved.walletName || 'Solana'
        }, false);

        // Try checking if still trusted (Phantom specific)
        const wallet = getSolanaProvider();
        if (wallet && wallet.provider.connect) {
          wallet.provider.connect({ onlyIfTrusted: true }).then((resp) => {
            if (resp.publicKey.toString() !== saved.publicKey) {
              // changed accounts?
              setState({
                connected: true,
                publicKey: resp.publicKey.toString(),
                walletName: wallet.name
              }, true);
            }
          }).catch(() => {
            // Not trusted or disconnected, reset
            disconnect();
          });
        }
      }
    } catch (e) { }
  }

  // Public API
  window.JunkoraWallet = {
    connect,
    disconnect,
    get state() {
      return { ...state };
    },
    getAddress() {
      return state.publicKey;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      wireUI();
      autoReconnect();
    });
  } else {
    wireUI();
    autoReconnect();
  }
})();
