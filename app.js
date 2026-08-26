// Supabase client initialization
const SUPABASE_URL = 'https://klfvyfvcxzjmdioygryd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LwVDCxNoEQH3b328GZ7xiQ_Ub6ImbTR';

// --- Local Storage Database Fallback Implementation ---
class LocalStorageDb {
    static getCollection(table) {
        const key = `dailyo_db_${table}`;
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch (e) {
            console.error(`Failed to load table ${table} from localStorage`, e);
            return [];
        }
    }
    static setCollection(table, data) {
        try {
            localStorage.setItem(`dailyo_db_${table}`, JSON.stringify(data));
        } catch (e) {
            console.error(`Failed to save table ${table} to localStorage`, e);
        }
    }
}

class MockSupabaseQueryBuilder {
    constructor(table) {
        this.table = table;
        this.filters = [];
        this.orderByField = null;
        this.orderAscending = true;
        this.limitVal = null;
        this.isSingle = false;
        this.isMaybeSingle = false;
    }

    select(columns) {
        return this;
    }

    eq(column, value) {
        this.filters.push((row) => String(row[column]) === String(value));
        return this;
    }

    in(column, values) {
        this.filters.push((row) => values.map(v => String(v)).includes(String(row[column])));
        return this;
    }

    order(column, { ascending = true } = {}) {
        this.orderByField = column;
        this.orderAscending = ascending;
        return this;
    }

    limit(val) {
        this.limitVal = val;
        return this;
    }

    maybeSingle() {
        this.isMaybeSingle = true;
        return this;
    }

    single() {
        this.isSingle = true;
        return this;
    }

    async executeSelect() {
        let data = LocalStorageDb.getCollection(this.table);
        
        // Apply filters
        for (const filter of this.filters) {
            data = data.filter(filter);
        }
        
        // Apply order
        if (this.orderByField) {
            data.sort((a, b) => {
                const valA = a[this.orderByField];
                const valB = b[this.orderByField];
                if (valA === undefined || valA === null) return 1;
                if (valB === undefined || valB === null) return -1;
                if (valA < valB) return this.orderAscending ? -1 : 1;
                if (valA > valB) return this.orderAscending ? 1 : -1;
                return 0;
            });
        }
        
        // Apply limit
        if (this.limitVal !== null) {
            data = data.slice(0, this.limitVal);
        }

        if (this.isSingle || this.isMaybeSingle) {
            return { data: data.length > 0 ? data[0] : null, error: null };
        }
        return { data, error: null };
    }

    async insert(rows) {
        const collection = LocalStorageDb.getCollection(this.table);
        const rowsArray = Array.isArray(rows) ? rows : [rows];
        const newRows = rowsArray.map((row, index) => {
            return {
                id: row.id || Date.now() + index + Math.floor(Math.random() * 1000),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...row
            };
        });
        collection.push(...newRows);
        LocalStorageDb.setCollection(this.table, collection);
        return { data: newRows, error: null };
    }

    async update(values) {
        let collection = LocalStorageDb.getCollection(this.table);
        const updatedRows = [];
        collection = collection.map(row => {
            let matches = true;
            for (const filter of this.filters) {
                if (!filter(row)) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                const newRow = { ...row, ...values, updated_at: new Date().toISOString() };
                updatedRows.push(newRow);
                return newRow;
            }
            return row;
        });
        LocalStorageDb.setCollection(this.table, collection);
        return { data: updatedRows, error: null };
    }

    async delete() {
        let collection = LocalStorageDb.getCollection(this.table);
        collection = collection.filter(row => {
            let matches = true;
            for (const filter of this.filters) {
                if (!filter(row)) {
                    matches = false;
                    break;
                }
            }
            return !matches;
        });
        LocalStorageDb.setCollection(this.table, collection);
        return { data: null, error: null };
    }

    async upsert(rows) {
        const collection = LocalStorageDb.getCollection(this.table);
        const rowsArray = Array.isArray(rows) ? rows : [rows];
        rowsArray.forEach(row => {
            const idx = collection.findIndex(item => String(item.id) === String(row.id));
            if (idx > -1) {
                collection[idx] = { ...collection[idx], ...row, updated_at: new Date().toISOString() };
            } else {
                collection.push({
                    id: row.id || Date.now() + Math.floor(Math.random() * 1000),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    ...row
                });
            }
        });
        LocalStorageDb.setCollection(this.table, collection);
        return { data: rowsArray, error: null };
    }

    then(onfulfilled, onrejected) {
        return this.executeSelect().then(onfulfilled, onrejected);
    }
}

let isLocalDbMode = false;
let realSupabase = null;

if (typeof supabase !== 'undefined' && supabase && typeof supabase.createClient === 'function') {
    try {
        realSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
        console.warn("Failed to initialize Supabase client. Running in Local Mode.", e);
        isLocalDbMode = true;
    }
} else {
    console.warn("Supabase library not loaded. Running in Local Mode.");
    isLocalDbMode = true;
}

function isNetworkError(err) {
    if (!err) return false;
    const msg = String(err.message || err).toLowerCase();
    return msg.includes('failed to fetch') || 
           msg.includes('network') || 
           msg.includes('dns') || 
           msg.includes('load failed') || 
           msg.includes('origin') || 
           msg.includes('cors') || 
           msg.includes('unreachable');
}

function enableLocalMode() {
    if (isLocalDbMode) return;
    isLocalDbMode = true;
    console.warn("Supabase connection failed. Switched to Local Database Mode.");
    showLocalModeBanner();
}

function showLocalModeBanner() {
    const existing = document.getElementById('local-db-banner');
    if (existing) return;
    
    const banner = document.createElement('div');
    banner.id = 'local-db-banner';
    banner.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(30, 41, 59, 0.95);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        color: #f8fafc;
        padding: 14px 20px;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        z-index: 9999;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    `;
    
    if (!document.getElementById('local-banner-styles')) {
        const style = document.createElement('style');
        style.id = 'local-banner-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateY(100px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    banner.innerHTML = `
        <span style="font-size: 18px;">💡</span>
        <div>
            <div style="font-weight: 600; color: #38bdf8;">Local Mode Active</div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">Supabase is offline. Data is saved to your browser.</div>
        </div>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 0 0 0 8px; line-height: 1; margin-left: auto;">&times;</button>
    `;
    
    document.body.appendChild(banner);
}

if (isLocalDbMode) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showLocalModeBanner);
    } else {
        showLocalModeBanner();
    }
}

function wrapBuilder(realBuilder, table) {
    const builderProxy = {
        table,
        filters: [],
        orderByField: null,
        orderAscending: true,
        limitVal: null,
        isSingle: false,
        isMaybeSingle: false,
        
        select(columns) {
            try { realBuilder.select(columns); } catch (e) {}
            return this;
        },
        eq(column, value) {
            try { realBuilder.eq(column, value); } catch (e) {}
            this.filters.push((row) => String(row[column]) === String(value));
            return this;
        },
        in(column, values) {
            try { realBuilder.in(column, values); } catch (e) {}
            this.filters.push((row) => values.map(v => String(v)).includes(String(row[column])));
            return this;
        },
        order(column, { ascending = true } = {}) {
            try { realBuilder.order(column, { ascending }); } catch (e) {}
            this.orderByField = column;
            this.orderAscending = ascending;
            return this;
        },
        limit(val) {
            try { realBuilder.limit(val); } catch (e) {}
            this.limitVal = val;
            return this;
        },
        maybeSingle() {
            try { realBuilder.maybeSingle(); } catch (e) {}
            this.isMaybeSingle = true;
            return this;
        },
        single() {
            try { realBuilder.single(); } catch (e) {}
            this.isSingle = true;
            return this;
        },
        
        async insert(rows) {
            try {
                const res = await realBuilder.insert(rows);
                if (res.error) throw res.error;
                return res;
            } catch (err) {
                if (isNetworkError(err)) {
                    enableLocalMode();
                    return new MockSupabaseQueryBuilder(table).insert(rows);
                }
                throw err;
            }
        },
        async update(values) {
            try {
                const res = await realBuilder.update(values);
                if (res.error) throw res.error;
                return res;
            } catch (err) {
                if (isNetworkError(err)) {
                    enableLocalMode();
                    const mockBuilder = new MockSupabaseQueryBuilder(table);
                    mockBuilder.filters = this.filters;
                    return mockBuilder.update(values);
                }
                throw err;
            }
        },
        async delete() {
            try {
                const res = await realBuilder.delete();
                if (res.error) throw res.error;
                return res;
            } catch (err) {
                if (isNetworkError(err)) {
                    enableLocalMode();
                    const mockBuilder = new MockSupabaseQueryBuilder(table);
                    mockBuilder.filters = this.filters;
                    return mockBuilder.delete();
                }
                throw err;
            }
        },
        async upsert(rows) {
            try {
                const res = await realBuilder.upsert(rows);
                if (res.error) throw res.error;
                return res;
            } catch (err) {
                if (isNetworkError(err)) {
                    enableLocalMode();
                    return new MockSupabaseQueryBuilder(table).upsert(rows);
                }
                throw err;
            }
        },
        
        async then(onfulfilled, onrejected) {
            try {
                const res = await realBuilder;
                if (res.error) throw res.error;
                return onfulfilled ? onfulfilled(res) : res;
            } catch (err) {
                if (isNetworkError(err)) {
                    enableLocalMode();
                    const mockBuilder = new MockSupabaseQueryBuilder(table);
                    mockBuilder.filters = this.filters;
                    mockBuilder.orderByField = this.orderByField;
                    mockBuilder.orderAscending = this.orderAscending;
                    mockBuilder.limitVal = this.limitVal;
                    mockBuilder.isSingle = this.isSingle;
                    mockBuilder.isMaybeSingle = this.isMaybeSingle;
                    const res = await mockBuilder.executeSelect();
                    return onfulfilled ? onfulfilled(res) : res;
                }
                return onrejected ? onrejected(err) : Promise.reject(err);
            }
        }
    };
    
    return builderProxy;
}

const supabaseClient = {
    from(table) {
        if (isLocalDbMode) {
            return new MockSupabaseQueryBuilder(table);
        }
        try {
            const realBuilder = realSupabase.from(table);
            return wrapBuilder(realBuilder, table);
        } catch (err) {
            console.warn("Failed to create real builder. Switching to Local Mode.", err);
            enableLocalMode();
            return new MockSupabaseQueryBuilder(table);
        }
    }
};

// EmailJS Configuration (Fill these in to send real emails to Gmail)
const EMAILJS_SERVICE_ID = '';
const EMAILJS_TEMPLATE_ID = '';
const EMAILJS_PUBLIC_KEY = '';

// Mapping helpers between database schema (snake_case) and client schema (camelCase)
function mapDbToTask(t) {
    if (!t) return null;
    return {
        id: Number(t.id),
        username: t.username,
        jobId: t.job_id,
        desc: t.desc,                     // Reverted to match actual DB column 'desc'
        assignDate: t.assign_date,        // Reverted to match actual DB column 'assign_date'
        completeDate: t.complete_date,
        status: t.status,
        remark: t.remark,
        userFullName: t.user_full_name,
        userIdNo: t.user_id_no
    };
}

function mapTaskToDb(t) {
    if (!t) return null;
    return {
        id: t.id,
        username: t.username,
        job_id: t.jobId,
        desc: t.desc,                     // Reverted to match actual DB column 'desc'
        assign_date: t.assignDate,        // Reverted to match actual DB column 'assign_date'
        complete_date: t.completeDate,
        status: t.status,
        remark: t.remark,
        user_full_name: t.userFullName,
        user_id_no: t.userIdNo
    };
}

// Server URL (must match server.js)
const UPLOAD_SERVER_ROOT = 'https://bapintras.bhel.in';
const UPLOAD_ENDPOINT = UPLOAD_SERVER_ROOT + '/upload';
const SSE_ENDPOINT = UPLOAD_SERVER_ROOT + '/events';
let lastOpenedFileUrl = null;
let sseConnected = false;

// Compatibility stub — UI for "Open Excel" was removed but some code still calls this.
function updateOpenExcelLink(url, filename) {}

// Setup SSE to listen for file updates from server
function setupSSE() {
    if (sseConnected) return;
    try {
        console.log('Connecting SSE to', SSE_ENDPOINT);
        const ev = new EventSource(SSE_ENDPOINT);
        ev.onopen = () => { console.log('SSE open', SSE_ENDPOINT); };
        ev.onmessage = async (e) => {
            try {
                const info = JSON.parse(e.data || '{}');
                console.log('SSE message', info);
                if (!info.url) return;
                if (!currentUser) return;
                if (lastOpenedFileUrl && normalizeUrl(lastOpenedFileUrl) === normalizeUrl(info.url)) {
                    console.log('Detected remote file save, reloading:', info.url);
                    await fetchAndImportExcel(info.url, true);
                }
            } catch (err) { console.warn('SSE parse error', err); }
        };
        ev.onerror = (err) => {
            console.warn('SSE error, readyState=', ev.readyState, err);
            try { ev.close(); } catch (e) { }
            sseConnected = false;
        };
        sseConnected = true;
    } catch (err) {
        console.warn('SSE initialization failed', err);
    }
}

function normalizeUrl(u) {
    try { return (new URL(u)).toString(); } catch { return u; }
}

// Fetch the xlsx by URL and import rows. If replaceUserTasks true, remove existing user tasks and replace with imported rows.
async function fetchAndImportExcel(url, replaceUserTasks = false) {
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Fetch failed ' + resp.status);
        const buf = await resp.arrayBuffer();
        const data = new Uint8Array(buf);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        // Convert rows to tasks
        const importedTasks = rowsToTasks(rows);
        if (importedTasks.length === 0) {
            console.log('No rows to import from', url);
            return;
        }

        if (replaceUserTasks) {
            // Delete old tasks for this user in DB
            const { error: deleteError } = await supabaseClient
                .from('tasks')
                .delete()
                .eq('username', currentUser.username);
            if (deleteError) throw deleteError;
        }

        // Insert new tasks to DB
        const dbTasks = importedTasks.map(mapTaskToDb);
        const { error: insertError } = await supabaseClient
            .from('tasks')
            .insert(dbTasks);
        if (insertError) throw insertError;

        // Renumber
        await renumberJobIdsForUser(currentUser.username);
        await renderTasks();
        console.log('Imported', importedTasks.length, 'tasks from', url);
    } catch (err) {
        console.error('Import failed', err);
    }
}

// Convert sheet rows (array-of-arrays) to task objects (skip header if present)
function rowsToTasks(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    function inferColumnIndexes(rows) {
        const defaults = { sno:0, user:1, id:2, jobId:3, desc:4, assign:5, complete:6, status:7, remark:8 };
        if (!rows || rows.length === 0) return defaults;
        const hdr = (rows[0] || []).map(c => (c || '').toString().trim().toLowerCase());
        const found = {};
        hdr.forEach((h, i) => {
            if (!h) return;
            if (h.includes('s.no') || h === 's' || h === 'sno') found.sno = i;
            if (h.includes('user')) found.user = i;
            if (h.includes('id')) found.id = i;
            if (h.includes('job')) found.jobId = i;
            if (h.includes('work') || h.includes('description')) found.desc = i;
            if (h.includes('assign')) found.assign = i;
            if (h.includes('complete')) found.complete = i;
            if (h.includes('status')) found.status = i;
            if (h.includes('remark')) found.remark = i;
        });
        return {
            sno: (found.sno !== undefined) ? found.sno : defaults.sno,
            user: (found.user !== undefined) ? found.user : defaults.user,
            id: (found.id !== undefined) ? found.id : defaults.id,
            jobId: (found.jobId !== undefined) ? found.jobId : defaults.jobId,
            desc: (found.desc !== undefined) ? found.desc : defaults.desc,
            assign: (found.assign !== undefined) ? found.assign : defaults.assign,
            complete: (found.complete !== undefined) ? found.complete : defaults.complete,
            status: (found.status !== undefined) ? found.status : defaults.status,
            remark: (found.remark !== undefined) ? found.remark : defaults.remark
        };
    }

    const idx = inferColumnIndexes(rows);
    const first = (rows[0] || []).map(c => (c || '').toString().trim().toLowerCase());
    let start = 0;
    if (first.includes('work description') || first.includes('user name') || first.includes('s.no') || first.includes('work') || first.includes('description')) start = 1;

    // build set of existing normalized descriptions for current user
    const existingSet = new Set();
    if (currentUser) {
        (tasks || []).forEach(t => {
            if (t && t.username === currentUser.username && t.desc) existingSet.add(normalizeDesc(t.desc));
        });
    }

    const seenInFile = new Set();
    const out = [];
    for (let i = start; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const desc = (row[idx.desc] || '').toString().trim();
        if (!desc) continue;
        const nd = normalizeDesc(desc);
        // skip if already exists for user or duplicate inside file
        if (existingSet.has(nd) || seenInFile.has(nd)) continue;
        seenInFile.add(nd);

        const assignDate = parseExcelDate(row[idx.assign]);
        const completeDate = parseExcelDate(row[idx.complete]);
        const status = ((row[idx.status] || 'Pending') + '').toString().trim() || 'Pending';
        const remark = (row[idx.remark] || '').toString().trim();

        out.push({
            id: Date.now() + i + Math.floor(Math.random() * 1000),
            username: currentUser ? currentUser.username : 'unknown',
            jobId: '',
            userFullName: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : ((row[idx.user] || '').toString().trim() || 'Unknown'),
            userIdNo: currentUser ? (currentUser.idNo || '') : ((row[idx.id] || '').toString().trim() || ''),
            desc,
            assignDate,
            completeDate,
            status,
            remark
        });
    }
    return out;
}

// Parse Excel date cell (handles numeric Excel serials and date strings)
function parseExcelDate(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && !isNaN(v)) {
        const ms = (v - 25569) * 86400000;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
        return '';
    }
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0,10);
    const s = (v || '').toString().trim();
    const p = new Date(s);
    if (!isNaN(p.getTime())) return p.toISOString().slice(0,10);
    return s;
}

// Ensure SSE is active on page load (skip when running from file:// to avoid CORS/socket errors)
if (location.protocol !== 'file:' && location.protocol.startsWith('http')) {
    setupSSE();
} else {
    console.warn('Skipping SSE setup when running from file:// - host the page over http(s) to enable SSE.');
}

// --- State ---
let tasks = [];
let currentUser = null;
let editingTaskId = null;

// OTP & Password Reset State
let generatedOTP = null;
let otpExpiryTime = null;
let resetUsername = null;
let resetGmail = null;

// Helper: normalize description for duplicate checks
function normalizeDesc(s) {
    return (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
}

async function isDuplicateDescription(desc, username) {
    if (!desc || !username) return false;
    const nd = normalizeDesc(desc);
    try {
        const { data, error } = await supabaseClient
            .from('tasks')
            .select('desc')              // Reverted to match actual DB column name 'desc'
            .eq('username', username);
        if (error) throw error;
        return (data || []).some(t => normalizeDesc(t.desc) === nd); // Reverted from t.description to t.desc
    } catch (err) {
        console.error('isDuplicateDescription check failed', err);
        return false;
    }
}

// Disable HOD option in signup if a HOD already exists
async function updateSignupRoleAvailability() {
    try {
        const sel = document.getElementById('supRole');
        const noteEl = document.getElementById('hod-note');
        const { data, error } = await supabaseClient
            .from('users')
            .select('role')
            .eq('role', 'HOD')
            .limit(1);
        if (error) throw error;
        const hodExists = data && data.length > 0;
        if (sel) {
            Array.from(sel.options).forEach(opt => {
                if ((opt.value || '').toString().toUpperCase() === 'HOD') {
                    opt.disabled = hodExists;
                }
            });
        }
        if (noteEl) {
            noteEl.textContent = hodExists ? ' (HOD already exists)' : '';
        }
    } catch (e) { console.warn('updateSignupRoleAvailability failed', e); }
}
// run once at load to update signup role selector
updateSignupRoleAvailability();

// Renumber Job IDs for a given user so they become consecutive J001, J002, ...
async function renumberJobIdsForUser(username) {
    if (!username) return;
    try {
        const { data: dbTasks, error } = await supabaseClient
            .from('tasks')
            .select('*')
            .eq('username', username)
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        if (!dbTasks || dbTasks.length === 0) return;

        const updatedTasks = dbTasks.map((t, idx) => ({
            ...t,
            job_id: 'J' + String(idx + 1).padStart(3, '0')
        }));

        const { error: upsertError } = await supabaseClient
            .from('tasks')
            .upsert(updatedTasks);
        
        if (upsertError) throw upsertError;
    } catch (e) {
        console.warn('Renumbering Job IDs failed', e);
    }
}

async function saveTask(e) {
    e.preventDefault();
    if (!currentUser) { alert('Sign in to save tasks'); switchView('loginView'); return; }
    const desc = (document.getElementById('tDesc').value || '').trim();
    const assignDate = document.getElementById('tAssignDate').value || '';
    const completeDate = document.getElementById('tCompleteDate').value || '';
    const remark = (document.getElementById('tRemark').value || '').trim();
    const check = document.getElementById('tCheck').checked;
    const status = document.getElementById('tStatus').value || 'Pending';

    if (!check) { alert('Please confirm the details'); return; }
    if (!desc) { alert('Work Description required'); return; }

    // prevent duplicate work description for the same user
    const isDuplicate = await isDuplicateDescription(desc, currentUser.username);
    if (isDuplicate) {
        alert('This Work Description already exists for your account.');
        return;
    }

    const newTask = {
        username: currentUser.username,
        job_id: '',
        desc,                             // Reverted to match actual DB column 'desc'
        assign_date: assignDate,          // Reverted to match actual DB column 'assign_date'
        complete_date: completeDate,
        status,
        remark,
        user_full_name: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
        user_id_no: currentUser.idNo || ''
    };

    try {
        const { error } = await supabaseClient
            .from('tasks')
            .insert([newTask]);
        if (error) throw error;

        // renumber to ensure contiguous J001.. sequence for this user
        await renumberJobIdsForUser(currentUser.username);
        document.getElementById('taskForm').reset();
        alert('Task saved.');
        await renderTasks();
    } catch (err) {
        alert('Failed to save task: ' + err.message);
        console.error(err);
    }
}

// Hashing helper
async function hashPassword(pwd) {
    const msgBuffer = new TextEncoder().encode(pwd);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Signup handler (creates users with role)
async function handleSignup(e) {
    e.preventDefault();
    const firstName = (document.getElementById('supFirstName').value || '').trim();
    const lastName = (document.getElementById('supLastName').value || '').trim();
    const idNo = (document.getElementById('supIdNo').value || '').trim();
    const gmail = (document.getElementById('supGmail').value || '').trim();
    const username = (document.getElementById('supUsername').value || '').trim();
    const password = (document.getElementById('supPassword').value || '').trim();
    const confirm = (document.getElementById('supConfirm').value || '').trim();
    const role = (document.getElementById('supRole').value || 'user').trim();

    if (!firstName || !lastName || !idNo || !gmail || !username || !password) {
        alert('All fields required');
        return;
    }
    if (!gmail.includes('@')) {
        alert('Please enter a valid Gmail address');
        return;
    }
    if (password !== confirm) { alert('Passwords do not match'); return; }

    try {
        const { data: existingUser, error: checkError } = await supabaseClient
            .from('users')
            .select('username')
            .eq('username', username)
            .maybeSingle();
        
        if (checkError) throw checkError;
        if (existingUser) { alert('Username already exists'); return; }

        if (role.toString().toUpperCase() === 'HOD') {
            const { data: hodData, error: hodCheckError } = await supabaseClient
                .from('users')
                .select('role')
                .eq('role', 'HOD')
                .limit(1);
            if (hodCheckError) throw hodCheckError;
            if (hodData && hodData.length > 0) {
                alert('An HOD account already exists. Contact the administrator to change HOD.');
                return;
            }
        }

        const hashedPassword = await hashPassword(password);
        const newUser = {
            username,
            password: hashedPassword,
            first_name: firstName,
            last_name: lastName,
            id_no: idNo,
            role,
            gmail
        };

        const { error: insertError } = await supabaseClient
            .from('users')
            .insert([newUser]);
        if (insertError) throw insertError;

        await updateSignupRoleAvailability();
        alert('Account created. Sign in now.');
        switchView('loginView');
    } catch (err) {
        alert('Signup failed: ' + err.message);
        console.error(err);
    }
}

// --- Forgot Password / OTP Flow ---

function openForgotPasswordView(e) {
    if (e) e.preventDefault();
    document.getElementById('forgotUsername').value = '';
    document.getElementById('forgotOTP').value = '';
    document.getElementById('forgotNewPassword').value = '';
    document.getElementById('forgotConfirmNewPassword').value = '';
    document.getElementById('forgotStep1').style.display = 'block';
    document.getElementById('forgotStep2').style.display = 'none';
    switchView('forgotPasswordView');
}

async function handleRequestOTP(e) {
    if (e) e.preventDefault();
    const username = (document.getElementById('forgotUsername').value || '').trim();
    if (!username) { alert('Username is required'); return; }
    
    try {
        const { data: user, error } = await supabaseClient
            .from('users')
            .select('username, first_name, last_name, gmail')
            .eq('username', username)
            .maybeSingle();
            
        if (error) throw error;
        if (!user) { alert('Username not found'); return; }
        if (!user.gmail) { 
            alert('No registered Gmail found for this account. Please contact the administrator.'); 
            return; 
        }
        
        // Generate 6-digit OTP code
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        generatedOTP = otp;
        otpExpiryTime = Date.now() + 5 * 60 * 1000; // 5 minutes expiry
        resetUsername = user.username;
        resetGmail = user.gmail;
        
        // Send the OTP email
        const sent = await sendOTPEmail(user.gmail, otp, user.username, `${user.first_name || ''} ${user.last_name || ''}`.trim());
        if (sent) {
            document.getElementById('forgotStep1').style.display = 'none';
            document.getElementById('forgotStep2').style.display = 'block';
        }
    } catch (err) {
        alert('Error requesting OTP: ' + err.message);
        console.error(err);
    }
}

async function sendOTPEmail(gmail, otp, username, fullName) {
    console.log(`[OTP DEBUG] Code for ${username} (${gmail}) is ${otp}`);
    
    if (EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID) {
        try {
            if (window.emailjs) {
                emailjs.init(EMAILJS_PUBLIC_KEY);
                const templateParams = {
                    to_email: gmail,
                    to_name: fullName || username,
                    otp_code: otp,
                    username: username,
                    app_name: 'DAYLIO'
                };
                const resp = await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
                console.log('EmailJS response:', resp.status, resp.text);
                alert(`An OTP verification email has been sent to your Gmail address (${gmail}).`);
                return true;
            } else {
                console.warn('EmailJS SDK not loaded yet.');
            }
        } catch (err) {
            console.error('EmailJS sending failed:', err);
            alert('Failed to send email via EmailJS: ' + err.message + '\nFalling back to Demo Mode.');
        }
    }
    
    // Fallback/Demo mode alert
    alert(`[Demo Mode] OTP sent to registered Gmail (${gmail}):\n\nYour OTP is: ${otp}\n\n(To send real emails, configure your EmailJS credentials in app.js)`);
    return true;
}

async function handleResetPassword(e) {
    if (e) e.preventDefault();
    const otp = (document.getElementById('forgotOTP').value || '').trim();
    const newPassword = (document.getElementById('forgotNewPassword').value || '').trim();
    const confirmPassword = (document.getElementById('forgotConfirmNewPassword').value || '').trim();
    
    if (!otp || !newPassword || !confirmPassword) {
        alert('All fields are required');
        return;
    }
    if (otp !== generatedOTP) {
        alert('Invalid OTP code. Please check and try again.');
        return;
    }
    if (Date.now() > otpExpiryTime) {
        alert('OTP has expired. Please request a new OTP.');
        return;
    }
    if (newPassword !== confirmPassword) {
        alert('Passwords do not match.');
        return;
    }
    if (!resetUsername) {
        alert('Session error. Please restart the forgot password process.');
        return;
    }
    
    try {
        const hashedPassword = await hashPassword(newPassword);
        const { error } = await supabaseClient
            .from('users')
            .update({ password: hashedPassword })
            .eq('username', resetUsername);
            
        if (error) throw error;
        
        alert('Your password has been reset successfully! You can now log in.');
        
        // Clear session variables
        generatedOTP = null;
        otpExpiryTime = null;
        resetUsername = null;
        resetGmail = null;
        
        switchView('loginView');
    } catch (err) {
        alert('Failed to reset password: ' + err.message);
        console.error(err);
    }
}

// Update dashboard UI according to signed-in user's role.
function updateDashboardForRole() {
    const isHod = currentUser && (currentUser.role || '').toString().toUpperCase() === 'HOD';
    const btnAdd = document.getElementById('btnAddTask');
    const btnUpload = document.getElementById('btnUpload');
    const selectAll = document.getElementById('selectAll');
    const submitBtn = document.querySelector('button[onclick="submitSelected()"]');
    const addSection = document.getElementById('addSection');

    if (btnAdd) btnAdd.style.display = isHod ? 'none' : '';
    if (btnUpload) btnUpload.style.display = isHod ? 'none' : '';
    if (addSection) addSection.style.display = isHod ? 'none' : '';

    if (selectAll) selectAll.style.display = isHod ? 'none' : '';
    if (submitBtn) submitBtn.style.display = isHod ? 'none' : '';

    if (isHod) {
        switchTab('reportSection');
    } else {
        switchTab('addSection');
    }
}

// Login handler
async function handleLogin(e) {
    e.preventDefault();
    const username = (document.getElementById('loginUsername').value || '').trim();
    const password = (document.getElementById('loginPassword').value || '').trim();
    if (!username || !password) { alert('Enter username and password'); return; }

    try {
        const { data: user, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('username', username)
            .maybeSingle();

        if (error) throw error;
        if (!user) { alert('Invalid username or password'); return; }

        const hashedInput = await hashPassword(password);
        const isPlainTextMatch = (user.password === password);
        const isHashMatch = (user.password === hashedInput);

        if (!isPlainTextMatch && !isHashMatch) {
            alert('Invalid username or password');
            return;
        }

        // Auto-upgrade plain-text password to hashed password in the database
        if (isPlainTextMatch) {
            try {
                await supabaseClient
                    .from('users')
                    .update({ password: hashedInput })
                    .eq('username', username);
            } catch (err) {
                console.warn('Failed to upgrade password format', err);
            }
        }

        currentUser = {
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            idNo: user.id_no,
            role: user.role
        };

        document.getElementById('dashName').innerText = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
        document.getElementById('dashId').innerText = currentUser.idNo || '';
        switchView('dashboardView');

        try { updateDashboardForRole(); } catch (err) {}
        try { setupSSE(); } catch (err) {}
        try { await renderTasks(); } catch (err) {}
    } catch (err) {
        alert('Login failed: ' + err.message);
        console.error(err);
    }
}

function switchView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    const el = document.getElementById(id);
    if (el) el.style.display = 'block';

    // Active button highlight
    document.querySelectorAll('.nav-buttons button').forEach(btn => btn.classList.remove('active-tab'));
    if (id === 'addSection') {
        const btn = document.getElementById('btnAddTask');
        if (btn) btn.classList.add('active-tab');
    } else if (id === 'reportSection') {
        const btn = document.getElementById('btnReport');
        if (btn) btn.classList.add('active-tab');
    }
}

// Render report table
async function renderTasks() {
    const tbody = document.getElementById('reportTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!currentUser) {
        tbody.innerHTML = '<tr><td colspan="10">No user signed in.</td></tr>';
        return;
    }
    const isHod = (currentUser.role || '').toString().toUpperCase() === 'HOD';

    try {
        let dbTasks = [];
        if (isHod) {
            const { data, error } = await supabaseClient
                .from('tasks')
                .select('*')
                .eq('status', 'Submitted')
                .order('created_at', { ascending: true });
            if (error) throw error;
            dbTasks = data || [];
        } else {
            const { data, error } = await supabaseClient
                .from('tasks')
                .select('*')
                .eq('username', currentUser.username)
                .order('created_at', { ascending: true });
            if (error) throw error;
            dbTasks = data || [];
        }

        tasks = dbTasks.map(mapDbToTask);

        if (tasks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10">No tasks found.</td></tr>';
            return;
        }

        tasks.forEach((t, idx) => {
            const tr = document.createElement('tr');
            const isEditing = (t.id === editingTaskId);

            const selTd = document.createElement('td');
            if (!isHod) {
                const selChk = document.createElement('input');
                selChk.type = 'checkbox';
                selChk.className = 'row-select';
                selChk.id = 'sel-' + t.id;
                selChk.dataset.id = t.id;
                selTd.appendChild(selChk);
            }
            tr.appendChild(selTd);

            const sno = document.createElement('td'); sno.textContent = String(idx + 1); tr.appendChild(sno);

            const uTd = document.createElement('td'); uTd.textContent = t.userFullName || `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(); tr.appendChild(uTd);

            const jobTd = document.createElement('td');
            if (isEditing) {
                const jInp = document.createElement('input'); jInp.type = 'text'; jInp.value = t.jobId || ''; jInp.readOnly = true; jobTd.appendChild(jInp);
            } else {
                jobTd.textContent = t.jobId || '';
            }
            tr.appendChild(jobTd);

            const descTd = document.createElement('td');
            if (isEditing) {
                const dInp = document.createElement('input'); dInp.type = 'text'; dInp.id = 'edit-desc-' + t.id; dInp.value = t.desc || '';
                descTd.appendChild(dInp);
            } else descTd.textContent = t.desc || '';
            tr.appendChild(descTd);

            const aTd = document.createElement('td');
            if (isEditing) {
                const aInp = document.createElement('input'); aInp.type = 'date'; aInp.id = 'edit-assign-' + t.id; aInp.value = t.assignDate || '';
                aTd.appendChild(aInp);
            } else aTd.textContent = t.assignDate || '';
            tr.appendChild(aTd);

            const cTd = document.createElement('td');
            if (isEditing) {
                const cInp = document.createElement('input'); cInp.type = 'date'; cInp.id = 'edit-complete-' + t.id; cInp.value = t.completeDate || '';
                cTd.appendChild(cInp);
            } else cTd.textContent = t.completeDate || '';
            tr.appendChild(cTd);

            const sTd = document.createElement('td');
            if (isEditing) {
                const sel = document.createElement('select'); sel.id = 'edit-status-' + t.id;
                ['Pending','In Progress','Submitted','Approved','Rejected','Completed'].forEach(val => {
                    const o = document.createElement('option'); o.value = val; o.textContent = val; if ((t.status||'').toString() === val) o.selected = true; sel.appendChild(o);
                });
                sTd.appendChild(sel);
            } else {
                const badge = document.createElement('span');
                badge.className = 'status-badge ' + (t.status || 'Pending').toLowerCase().replace(' ', '-');
                badge.textContent = t.status || 'Pending';
                sTd.appendChild(badge);
            }
            tr.appendChild(sTd);

            const rTd = document.createElement('td');
            if (isEditing) {
                const rInp = document.createElement('input'); rInp.type = 'text'; rInp.id = 'edit-remark-' + t.id; rInp.value = t.remark || '';
                rTd.appendChild(rInp);
            } else rTd.textContent = t.remark || '';
            tr.appendChild(rTd);

            const actTd = document.createElement('td');
            if (isHod) {
                const approveBtn = document.createElement('button'); approveBtn.className='save-btn'; approveBtn.textContent='Approve'; approveBtn.onclick = () => approveTask(t.id);
                const rejectBtn = document.createElement('button'); rejectBtn.className='cancel-btn'; rejectBtn.style.marginLeft='6px'; rejectBtn.textContent='Reject'; rejectBtn.onclick = () => rejectTask(t.id);
                actTd.appendChild(approveBtn); actTd.appendChild(rejectBtn);
            } else {
                const currentStatus = String(t.status || '').toLowerCase();
                const locked = ['submitted','approved'].includes(currentStatus);

                if (isEditing) {
                    const saveBtn = document.createElement('button'); saveBtn.className='save-btn'; saveBtn.textContent='Save'; saveBtn.onclick = () => saveEditedTask(t.id);
                    const cancelBtn = document.createElement('button'); cancelBtn.className='cancel-btn'; cancelBtn.style.marginLeft='6px'; cancelBtn.textContent='Cancel'; cancelBtn.onclick = () => cancelEdit();
                    actTd.appendChild(saveBtn); actTd.appendChild(cancelBtn);
                } else {
                    const editBtn = document.createElement('button'); editBtn.className='edit-btn'; editBtn.textContent='Edit'; editBtn.onclick = () => startEdit(t.id);
                    const delBtn = document.createElement('button'); delBtn.className='delete-btn'; delBtn.style.marginLeft='6px'; delBtn.textContent='Delete'; delBtn.onclick = () => deleteTask(t.id);
                    editBtn.disabled = locked; delBtn.disabled = locked;
                    actTd.appendChild(editBtn); actTd.appendChild(delBtn);
                }
            }
            tr.appendChild(actTd);

            tbody.appendChild(tr);
        });
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="10">Error loading tasks: ' + err.message + '</td></tr>';
        console.error(err);
    }
}

async function startEdit(taskId) {
    const t = (tasks || []).find(x => x.id === taskId);
    if (!t) return;
    const st = String(t.status || '').toLowerCase();
    if (st === 'submitted' || st === 'approved') { alert('Submitted or approved tasks cannot be edited.'); return; }
    editingTaskId = taskId;
    await renderTasks();
}

async function cancelEdit() {
    editingTaskId = null;
    await renderTasks();
}

async function saveEditedTask(taskId) {
    const descEl = document.getElementById('edit-desc-' + taskId);
    const assignEl = document.getElementById('edit-assign-' + taskId);
    const completeEl = document.getElementById('edit-complete-' + taskId);
    const statusEl = document.getElementById('edit-status-' + taskId);
    const remarkEl = document.getElementById('edit-remark-' + taskId);

    if (!descEl) { alert('Edit fields not found. Reload the page and try again.'); return; }
    const desc = (descEl.value || '').trim();
    const assignDate = (assignEl && assignEl.value) || '';
    const completeDate = (completeEl && completeEl.value) || '';
    const status = (statusEl && statusEl.value) || 'Pending';
    const remark = (remarkEl && remarkEl.value || '').trim();

    if (!desc) { alert('Description required'); return; }

    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx === -1) { alert('Task not found'); editingTaskId = null; await renderTasks(); return; }

    const curStatus = String(tasks[idx].status || '').toLowerCase();
    if (curStatus === 'submitted' || curStatus === 'approved') { alert('Submitted or approved tasks cannot be edited.'); editingTaskId = null; await renderTasks(); return; }

    try {
        const { error } = await supabaseClient
            .from('tasks')
            .update({
                desc,                             // Reverted to match actual DB column 'desc'
                assign_date: assignDate,          // Reverted to match actual DB column 'assign_date'
                complete_date: completeDate,
                status,
                remark
            })
            .eq('id', taskId);
        
        if (error) throw error;
        editingTaskId = null;
        await renderTasks();
    } catch (err) {
        alert('Failed to update task: ' + err.message);
        console.error(err);
    }
}

async function deleteTask(taskId) {
    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;
    const currentStatus = String(tasks[idx].status || '').toLowerCase();
    if (currentStatus === 'approved' || currentStatus === 'submitted') { alert('Submitted or approved tasks cannot be deleted.'); return; }
    if (!confirm('Delete this task?')) return;
    const username = tasks[idx].username;

    try {
        const { error } = await supabaseClient
            .from('tasks')
            .delete()
            .eq('id', taskId);
        
        if (error) throw error;
        await renumberJobIdsForUser(username);
        if (editingTaskId === taskId) editingTaskId = null;
        await renderTasks();
    } catch (err) {
        alert('Failed to delete task: ' + err.message);
        console.error(err);
    }
}

function logout() {
    currentUser = null;
    editingTaskId = null;
    lastOpenedFileUrl = null;
    sseConnected = false;

    const dn = document.getElementById('dashName'); if (dn) dn.innerText = '';
    const di = document.getElementById('dashId'); if (di) di.innerText = '';

    const lu = document.getElementById('loginUsername'); if (lu) lu.value = '';
    const lp = document.getElementById('loginPassword'); if (lp) lp.value = '';

    try { if (typeof ev !== 'undefined' && ev && typeof ev.close === 'function') ev.close(); } catch (e) {}

    switchView('loginView');
    try { switchTab('addSection'); } catch (e) {}
}

async function loadReportSection() {
    switchTab('reportSection');
    try { await renderTasks(); } catch (e) { console.warn('renderTasks missing', e); }
}

function openUploadFileChooser() {
    if (!currentUser) { alert('Please sign in before uploading.'); switchView('loginView'); return; }
    const inp = document.getElementById('uploadInput');
    if (!inp) { alert('Upload input not found'); return; }
    inp.value = '';
    inp.click();
}

async function handleUpload(e) {
    if (!currentUser) { alert('Sign in to upload tasks'); return; }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const data = new Uint8Array(evt.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            const importedTasks = rowsToTasks(rows);
            if (importedTasks.length === 0) {
                alert('No new tasks to import.');
                return;
            }
            
            const dbTasks = importedTasks.map(mapTaskToDb);
            const { error } = await supabaseClient
                .from('tasks')
                .insert(dbTasks);
            
            if (error) throw error;
            
            await renumberJobIdsForUser(currentUser.username);
            alert(`Successfully imported ${importedTasks.length} tasks.`);
            await renderTasks();
        } catch (err) {
            alert('Failed to parse and import file: ' + err.message);
            console.error(err);
        }
    };
    reader.readAsArrayBuffer(file);
}

function toggleSelectAll(cb) {
    const checked = !!cb.checked;
    document.querySelectorAll('.row-select').forEach(c => { c.checked = checked; });
}

async function submitSelected() {
    if (!currentUser) { alert('Sign in to submit tasks'); switchView('loginView'); return; }
    if ((currentUser.role || '').toString().toUpperCase() === 'HOD') { alert('HOD cannot submit tasks. Use Approve/Reject'); return; }
    const selectedIds = Array.from(document.querySelectorAll('.row-select:checked')).map(el => Number(el.dataset.id));
    if (!selectedIds.length) { alert('No rows selected'); return; }
    const selectedTasks = tasks.filter(t => selectedIds.includes(Number(t.id)) && t.username === currentUser.username);
    if (!selectedTasks.length) { alert('No valid tasks selected for your account.'); return; }
    if (!confirm('Submit ' + selectedTasks.length + ' task(s) for HOD approval?')) return;
    
    try {
        const { error } = await supabaseClient
            .from('tasks')
            .update({ status: 'Submitted' })
            .in('id', selectedIds);
        
        if (error) throw error;
        alert(`${selectedTasks.length} task(s) submitted for approval.`);
        await renderTasks();
    } catch (err) {
        alert('Failed to submit tasks: ' + err.message);
        console.error(err);
    }
}

async function approveTask(taskId) {
    if (!currentUser || (currentUser.role || '').toString().toUpperCase() !== 'HOD') { alert('Access denied'); return; }
    try {
        const { error } = await supabaseClient
            .from('tasks')
            .update({ status: 'Approved' })
            .eq('id', taskId);
        if (error) throw error;
        await renderTasks();
    } catch (err) {
        alert('Failed to approve task: ' + err.message);
        console.error(err);
    }
}

async function rejectTask(taskId) {
    if (!currentUser || (currentUser.role || '').toString().toUpperCase() !== 'HOD') { alert('Access denied'); return; }
    try {
        const { error } = await supabaseClient
            .from('tasks')
            .update({ status: 'Rejected' })
            .eq('id', taskId);
        if (error) throw error;
        await renderTasks();
    } catch (err) {
        alert('Failed to reject task: ' + err.message);
        console.error(err);
    }
}

function exportToExcel() {
    if (!currentUser) {
        alert("Sign in to export tasks.");
        return;
    }
    const isHod = (currentUser.role || '').toString().toUpperCase() === 'HOD';
    if (tasks.length === 0) {
        alert("No tasks to export.");
        return;
    }

    const data = tasks.map((t, idx) => ({
        "S.No": idx + 1,
        "User Name": t.userFullName || `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim(),
        "Job ID": t.jobId || '',
        "Work Description": t.desc || '',
        "Assignment Date": t.assignDate || '',
        "Complete Date": t.completeDate || '',
        "Status": t.status || '',
        "Remark": t.remark || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tasks");
    
    const max_cols = [
        { wch: 6 },
        { wch: 20 },
        { wch: 10 },
        { wch: 40 },
        { wch: 15 },
        { wch: 15 },
        { wch: 12 },
        { wch: 25 }
    ];
    worksheet['!cols'] = max_cols;

    const fileName = isHod ? 'Submitted_Tasks.xlsx' : `${currentUser.username}_tasks.xlsx`;
    XLSX.writeFile(workbook, fileName);
}
