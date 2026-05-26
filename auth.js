// WealthWise Auth System v2
// Supports email/password + Google OAuth
// Data stored in localStorage per user

const WW = {

  // ── Session ──
  getSession() {
    try { return JSON.parse(localStorage.getItem('ww_session')); } catch(e) { return null; }
  },
  setSession(user) {
    localStorage.setItem('ww_session', JSON.stringify({
      id: user.id, name: user.name, email: user.email,
      picture: user.picture||null, loginMethod: user.loginMethod||'email',
      ts: Date.now()
    }));
  },
  clearSession() { localStorage.removeItem('ww_session'); },
  isLoggedIn() {
    const s = this.getSession();
    if (!s) return false;
    if (Date.now() - s.ts > 7 * 24 * 3600 * 1000) { this.clearSession(); return false; }
    return true;
  },

  // ── Users ──
  getUsers() {
    try { return JSON.parse(localStorage.getItem('ww_users')) || []; } catch(e) { return []; }
  },
  saveUsers(users) { localStorage.setItem('ww_users', JSON.stringify(users)); },
  findUser(email) {
    return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  },
  findUserById(id) { return this.getUsers().find(u => u.id === id); },

  // ── Password hash (simple, client-side only) ──
  hashPassword(pwd) {
    let hash = 0;
    const str = pwd + 'wealthwise_salt_2026';
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + c;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  },

  // ── Register (email/password) ──
  register(name, email, password) {
    if (!name || !email || !password) return {ok:false, msg:'All fields are required.'};
    if (password.length < 6) return {ok:false, msg:'Password must be at least 6 characters.'};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {ok:false, msg:'Please enter a valid email address.'};
    if (this.findUser(email)) return {ok:false, msg:'An account with this email already exists. Please sign in.'};
    const users = this.getUsers();
    const user = {
      id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      name: name.trim(), email: email.trim().toLowerCase(),
      password: this.hashPassword(password),
      createdAt: new Date().toISOString(),
      isAdmin: users.length === 0,
      loginMethod: 'email'
    };
    users.push(user);
    this.saveUsers(users);
    this.setSession(user);
    return {ok:true, user};
  },

  // ── Login (email/password) ──
  login(email, password) {
    if (!email || !password) return {ok:false, msg:'Email and password are required.'};
    const user = this.findUser(email);
    if (!user) return {ok:false, msg:'No account found with this email.'};
    if (user.loginMethod === 'google') return {ok:false, msg:'This account uses Google Sign-In. Please use the Google button above.'};
    if (user.password !== this.hashPassword(password)) return {ok:false, msg:'Incorrect password. Please try again.'};
    this.setSession(user);
    return {ok:true, user};
  },

  // ── Google login / register ──
  googleLogin(googleUser) {
    const { id, name, email, picture, sub } = googleUser;
    let user = this.findUser(email);
    if (!user) {
      const users = this.getUsers();
      user = {
        id: 'g_' + (sub || id || Date.now()),
        name, email: email.toLowerCase(),
        password: null,
        createdAt: new Date().toISOString(),
        isAdmin: users.length === 0,
        picture, loginMethod: 'google', googleId: sub||id
      };
      users.push(user);
      this.saveUsers(users);
    }
    this.setSession(user);
    return {ok:true, user};
  },

  // ── Per-user data ──
  getUserDataKey(userId) { return 'ww_data_' + userId; },
  getUserData(userId) {
    try { return JSON.parse(localStorage.getItem(this.getUserDataKey(userId))); } catch(e) { return null; }
  },
  saveUserData(userId, data) {
    localStorage.setItem(this.getUserDataKey(userId), JSON.stringify(data));
  },

  // ── Logout ──
  logout() { this.clearSession(); window.location.href = 'login.html'; }
};
