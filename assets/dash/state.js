// Dashboard · Constants and shared state (no imports from other dashboard modules, so it loads first).

// ---------- constants ----------
export const METHODS = ['Cash', 'GCash', 'Maya', 'Card', 'Bank transfer'];
export const EXP_CATS = ['Rent', 'Electricity', 'Water', 'Internet', 'Supplies', 'Stock purchase', 'Wages', 'Maintenance', 'Marketing', 'Permits & taxes', 'Payment fees', 'Other'];
export const TABS = [['overview', 'Overview'], ['schedule', 'Schedule'], ['checkout', 'Checkout'], ['money', 'Income & expenses'], ['team', 'Staff'], ['clients', 'Clients'], ['stock', 'Inventory'], ['website', 'Website'], ['setup', 'Shop setup'], ['payroll', 'Payroll'], ['reports', 'Reports'], ['activity', 'Activity log'], ['me', 'My day'], ['mypay', 'My pay']];
export const APPT = {
  pending_payment: { label: 'Awaiting deposit', kind: 'warn', icon: '◷' },
  booked: { label: 'Booked', kind: 'info', icon: '◷' },
  waiting: { label: 'Waiting', kind: 'warn', icon: '●' },
  inchair: { label: 'In chair', kind: 'accent', icon: '✂' },
  done: { label: 'Done', kind: 'good', icon: '✓' },
  noshow: { label: 'No-show', kind: 'bad', icon: '✕' },
  cancelled: { label: 'Cancelled', kind: 'mute', icon: '–' },
  expired: { label: 'Hold expired', kind: 'mute', icon: '–' },
  needs_attention: { label: 'Paid, slot taken', kind: 'bad', icon: '!' }
};
export const STATUS_CHOICES = ['booked', 'waiting', 'inchair', 'done', 'noshow', 'cancelled'];
export const PERIODS = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['30d', 'Last 30 days'], ['year', 'This year'], ['custom', 'Custom']];
export const COLS = ['staff', 'appointments', 'sales', 'expenses', 'customers', 'inventory', 'payouts', 'waitlist', 'attendance', 'promos', 'closings', 'timeclock'];
export const STYLES = ['Fade', 'Taper', 'Crop', 'Mullet', 'Buzz cut', 'Pompadour', 'Perm', 'Color', 'Women’s cut', 'Beard', 'Shop'];
export const METHOD_NAMES = { gcash: 'GCash', paymaya: 'Maya', card: 'Card', qrph: 'QR Ph', grab_pay: 'GrabPay' };

// ---------- state ----------
export const S = {
  ready: false, user: null, canAdmin: false, loginErr: '', loginBusy: false, loginMsg: '',
  info: null, infoMissing: false, slow: false,
  staff: [], appointments: [], sales: [], expenses: [], customers: [], inventory: [], payouts: [], waitlist: [], attendance: [], promos: [], closings: [], leaves: [], timeclock: [], activity: [], evaluations: [], payslips: [], advances: [], cutoff: '', loaded: {}, me: null, elevUntil: 0, lockOn: false, reminding: '',
  proofImgs: {}, cutImgs: {}, refImgs: {},
  schedDate: '', schedBarber: '', schedQ: '', schedStatus: '', schedSrc: '', showExpired: false, period: 'month', from: '', to: '',
  clientQ: '', clientSort: 'recent', stockFilter: 'all', showArchived: false, pos: null, busy: false, uploading: ''
};
export const unsubs = [];
// Who sees what: the owner everything; the receptionist Schedule, Checkout and Clients; staff only their own day and pay.
// Owner pages show a lock screen on other sign-ins (and on the owner's own shared device when locked): the owner PIN opens them until someone taps Lock or signs out.
export const OWNER_TABS = ['overview', 'money', 'team', 'payroll', 'reports', 'stock', 'website', 'setup', 'activity'];
export const DESK_TABS = ['schedule', 'checkout', 'clients'], STAFF_TABS = ['me', 'mypay'];
export const OWNER_ACTS = { voidSale: 'void a sale', markRefunded: 'mark a down payment as refunded', delClient: 'delete a client', delAppt: 'delete a visit' };
export const bossUnsubs = [];

export const ACT = {}, CHG = {}, FORM = {}, TAB_VIEWS = {}; // filled in by the modules (actions, forms, pages)
