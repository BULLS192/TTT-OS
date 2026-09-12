(() => {
  const config = window.TTT_AUTH_CONFIG || {};
  const root = document.documentElement;
  const roleLabels = {
    owner_admin: 'Owner / Administrator',
    manager: 'Manager',
    technician: 'Technician',
    service_advisor: 'Service Advisor',
    office: 'Office',
    read_only: 'Read Only'
  };

  const setMode = (mode) => {
    root.classList.remove('ttt-auth-pending', 'ttt-auth-required', 'ttt-authenticated', 'ttt-auth-bypass');
    root.classList.add(mode);
  };

  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  if (!config.enabled) {
    window.TTTAuth = Object.freeze({ enabled: false, mode: 'prototype' });
    setMode('ttt-auth-bypass');
    return;
  }

  const sdk = window.supabase;
  if (!sdk?.createClient || !config.supabaseUrl || !config.publishableKey) {
    setMode('ttt-auth-required');
    const setup = document.createElement('div');
    setup.className = 'ttt-auth-screen';
    setup.innerHTML = `
      <section class="ttt-auth-visual">
        <div class="ttt-auth-brand"><div class="ttt-auth-mark">TTT</div><div><strong>TTT OS</strong><span>Operations Platform</span></div></div>
        <div class="ttt-auth-message"><p class="ttt-auth-eyebrow">Secure operations</p><h1>Technology behind the operation.</h1><p>Customers, vehicles, estimates, work orders, inspections and service history in one controlled workspace.</p></div>
      </section>
      <section class="ttt-auth-panel-wrap"><div class="ttt-auth-panel"><h2>Configuration required</h2><p>The TTT authentication service has not been configured for this deployment.</p><div class="ttt-auth-setup">An administrator must configure the TTT OS Supabase URL and publishable key before production access can be enabled.</div></div></section>`;
    document.body.appendChild(setup);
    return;
  }

  const client = sdk.createClient(config.supabaseUrl, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const screen = document.createElement('div');
  screen.className = 'ttt-auth-screen';
  screen.innerHTML = `
    <section class="ttt-auth-visual">
      <div class="ttt-auth-brand"><div class="ttt-auth-mark">TTT</div><div><strong>TTT OS</strong><span>Operations Platform</span></div></div>
      <div class="ttt-auth-message">
        <p class="ttt-auth-eyebrow">Thompson Transportation Technologies</p>
        <h1>Run the shop as one system.</h1>
        <p>Customer intake, vehicles, estimates, check-in, work orders, QC, delivery and service history — controlled through one TTT operating environment.</p>
      </div>
    </section>
    <section class="ttt-auth-panel-wrap">
      <div class="ttt-auth-panel">
        <p class="ttt-auth-eyebrow">Authorized access</p>
        <h2>Sign in to TTT OS</h2>
        <p>Use your approved Google account. Access is granted only to active TTT OS users and is restricted by role.</p>
        <button class="ttt-google-signin" id="tttGoogleSignIn" type="button"><span class="ttt-google-g">G</span><span>Continue with Google</span></button>
        <p class="ttt-auth-status" id="tttAuthStatus" aria-live="polite"></p>
        <div class="ttt-auth-foot">${escapeHtml(config.supportText || 'Authorized Thompson Transportation Technologies personnel only.')}<br>Account access is controlled by the TTT administrator.</div>
      </div>
    </section>`;
  document.body.appendChild(screen);

  const signInButton = screen.querySelector('#tttGoogleSignIn');
  const status = screen.querySelector('#tttAuthStatus');

  const setStatus = (message = '', type = '') => {
    status.textContent = message;
    status.className = `ttt-auth-status${type ? ` is-${type}` : ''}`;
  };

  const showLogin = (message = '') => {
    setMode('ttt-auth-required');
    screen.hidden = false;
    if (message) setStatus(message, 'error');
  };

  const installUserChip = (profile) => {
    document.querySelector('.ttt-user-chip')?.remove();
    const actions = document.querySelector('.top-actions');
    if (!actions) return;
    const chip = document.createElement('div');
    chip.className = 'ttt-user-chip';
    chip.innerHTML = `<div class="ttt-user-copy"><strong>${escapeHtml(profile.display_name || 'TTT User')}</strong><span>${escapeHtml(roleLabels[profile.role] || profile.role || 'User')}</span></div><button class="ttt-signout" type="button">Sign out</button>`;
    chip.querySelector('.ttt-signout').addEventListener('click', async () => {
      await client.auth.signOut();
      window.location.reload();
    });
    actions.appendChild(chip);
  };

  const authorize = async () => {
    const { data: userData, error: userError } = await client.auth.getUser();
    const user = userData?.user;
    if (userError || !user) {
      showLogin();
      return false;
    }

    const { data: profile, error: profileError } = await client
      .from('user_profiles')
      .select('id, display_name, role, active')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !profile.active) {
      await client.auth.signOut();
      showLogin('Your TTT OS account is not active. Contact the TTT administrator.');
      return false;
    }

    window.TTTAuth = Object.freeze({
      enabled: true,
      client,
      user,
      profile,
      role: profile.role,
      is: (role) => profile.role === role,
      canManageUsers: () => profile.role === 'owner_admin'
    });

    screen.hidden = true;
    setMode('ttt-authenticated');
    installUserChip(profile);
    window.dispatchEvent(new CustomEvent('ttt-auth-ready', { detail: { user, profile } }));
    return true;
  };

  signInButton.addEventListener('click', async () => {
    signInButton.disabled = true;
    setStatus('Opening secure Google sign-in…');
    const redirectTo = `${window.location.origin}${config.redirectPath || '/'}`;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    if (error) {
      signInButton.disabled = false;
      setStatus('Google sign-in could not be started. Try again.', 'error');
    }
  });

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') showLogin();
    if (event === 'SIGNED_IN') authorize().catch(() => showLogin('TTT OS could not verify your account. Try again.'));
  });

  authorize().catch((error) => {
    console.error('TTT OS authentication initialization failed', error);
    showLogin('TTT OS could not verify your account. Try again.');
  });
})();
