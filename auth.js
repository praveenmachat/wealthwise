// WealthWise Auth System
// Handles user registration, login, sessions
// All data stored in localStorage per user

const WW = {

  // --- Session ---
  getSession() {
    try { return JSON.parse(localStorage.getItem('ww_session')); } catch(e) { return null; }
  },
  setSession(user) {
    localStorage.setItem('ww_session', JSON.stringify({id:user.id, name:user.name, email:user.email, ts:Date.now()}));
  },
  clearSession() {
    localStorage.removeItem('ww_session');
  },
  isLoggedIn() {
    const s = this.getSession();
    if (!s) return false;
    // Session expires after 7 days
    if (Date.now() - s.ts > 7 * 24 * 3600 * 1000) { this.clearSession(); return false; }
    return true;
  },

  // --- Users ---
  getUsers() {
    try { return JSON.parse(localStorage.getItem('ww_users')) || []; } catch(e) { return []; }
  },
  saveUsers(users) {
    localStorage.setItem('ww_users', JSON.stringify(users));
  },
  findUser(email) {
    return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  },
  hashPassword(pwd) {
    // Simple hash for client-side (not cryptographic but functional for this use case)
    let hash = 0;
    const str = pwd + 'wealthwise_salt_2026';
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  },

  // --- Register ---
  register(name, email, password) {
    if (!name || !email || !password) return {ok:false, msg:'All fields are required.'};
    if (password.length < 6) return {ok:false, msg:'Password must be at least 6 characters.'};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {ok:false, msg:'Please enter a valid email address.'};
    if (this.findUser(email)) return {ok:false, msg:'An account with this email already exists. Please login.'};
    const users = this.getUsers();
    const user = {
      id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: this.hashPassword(password),
      createdAt: new Date().toISOString(),
      isAdmin: users.length === 0 // first user is admin
    };
    users.push(user);
    this.saveUsers(users);
    this.setSession(user);
    return {ok:true, user};
  },

  // --- Login ---
  login(email, password) {
    if (!email || !password) return {ok:false, msg:'Email and password are required.'};
    const user = this.findUser(email);
    if (!user) return {ok:false, msg:'No account found with this email. Please register first.'};
    if (user.password !== this.hashPassword(password)) return {ok:false, msg:'Incorrect password. Please try again.'};
    this.setSession(user);
    return {ok:true, user};
  },

  // --- User Data (per user) ---
  getUserDataKey(userId) { return 'ww_data_' + userId; },
  getUserData(userId) {
    try { return JSON.parse(localStorage.getItem(this.getUserDataKey(userId))); } catch(e) { return null; }
  },
  saveUserData(userId, data) {
    localStorage.setItem(this.getUserDataKey(userId), JSON.stringify(data));
  },

  // --- Logout ---
  logout() { this.clearSession(); window.location.href = 'index.html'; }
};
