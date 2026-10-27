/* price-guard.js | اطلس سازه
   رفع مشکل قیمت قدیمی + کنترل سفارش‌گیری در زمان تعطیلی / اعلام‌نشدن قیمت ورق
   این فایل باید بعد از اسکریپت اصلی و درست قبل از </body> بارگذاری شود. */
(function () {
    let pricesVerifiedAt = 0;      // آخرین زمانی که قیمت‌ها با سرور تأیید شد
    const FORM_IDS = ['prodCategory', 'fittingType', 'dim_w', 'dim_f', 'dim_l', 'dim_t', 'sheet_type', 'item_count'];
    const EXTRA_KEYS = ['orderMode', 'validHours', 'closedMsg', 'sheetConfirmedAt', 'priceVersion', 'schedule'];
    const $ = id => document.getElementById(id);
    const fmt = ts => formatJalaliDateTime(new Date(ts));
    const verKey = s => (s.priceVersion || '') + '|' + (s.lastUpdated || '');

    /* ---------- ساعت کاری و تعطیلات (به وقت تهران) ---------- */
    function tehranNow() {
        const p = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
        const g = t => (p.find(x => x.type === t) || {}).value;
        return { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')), min: (+g('hour')) * 60 + (+g('minute')), date: `${g('year')}/${g('month')}/${g('day')}` };
    }
    function normDate(x) {
        const e = String(x).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        const a = e.split(/[\/\-]/); return a.length === 3 ? `${a[0]}/${a[1].padStart(2, '0')}/${a[2].padStart(2, '0')}` : '';
    }
    function scheduleState() {
        const sc = appSettings.schedule;
        if (!sc || !sc.on) return '';
        const t = tehranNow(), mins = h => { const a = String(h || '0:0').split(':'); return (+a[0] || 0) * 60 + (+a[1] || 0); };
        const hol = String(sc.holidays || '').split(/[\s,،]+/).map(normDate).filter(Boolean);
        if ((sc.offDays || []).includes(t.wd) || hol.includes(t.date)) return '⛔ امروز تعطیل است و پیش‌فاکتور صادر نمی‌شود. لطفاً در اولین روز کاری مراجعه کنید.';
        if (t.min < mins(sc.from) || t.min >= mins(sc.to)) return `⛔ خارج از ساعت کاری هستیم (${sc.from} تا ${sc.to}) و پیش‌فاکتور صادر نمی‌شود. لطفاً در ساعت کاری مراجعه کنید.`;
        return '';
    }

    /* ---------- وضعیت سفارش‌گیری ---------- */
    function orderState() {
        const s = appSettings, now = Date.now(), mode = s.orderMode || 'open';
        const sch = scheduleState();
        if (sch) return { all: true, msg: sch };
        if (mode === 'closed') {
            return { all: true, msg: s.closedMsg || '⛔ ثبت پیش‌فاکتور موقتاً بسته است. لطفاً در ساعات کاری مراجعه کنید.' };
        }
        if (mode === 'sheet_pending') {
            return { sheet: true, msg: '⏳ قیمت ورق هنوز اعلام نشده است. ثبت والپست، وادار و پلیت تا اعلام قیمت جدید ممکن نیست (اتصالات قابل ثبت است).' };
        }
        const vh = Number(s.validHours) || 0;
        if (vh > 0 && s.sheetConfirmedAt && now - s.sheetConfirmedAt > vh * 3600000) {
            return { sheet: true, msg: '⏳ اعتبار آخرین قیمت ورق به پایان رسیده و قیمت جدید هنوز اعلام نشده است. ثبت والپست، وادار و پلیت تا اعلام قیمت جدید ممکن نیست.' };
        }
        return {};
    }
    const isSheetDep = (cat, fit) => cat !== 'fittings' || fit === 'plate_25_15';
    const blockedReason = dep => { const st = orderState(); return (st.all || (st.sheet && dep)) ? st.msg : ''; };

    function validity() {
        const vh = Number(appSettings.validHours) || 0, now = Date.now();
        const until = (vh > 0 && appSettings.sheetConfirmedAt) ? appSettings.sheetConfirmedAt + vh * 3600000 : now + 24 * 3600000;
        return `این پیش‌فاکتور تا ${fmt(until)} معتبر است و پس از آن نیاز به استعلام مجدد قیمت دارد. (نرخ‌های مبنا: ${appSettings.lastUpdated || 'نامشخص'})`;
    }

    function applyState() {
        const st = orderState();
        const dep = isSheetDep($('prodCategory').value, $('fittingType').value);
        const msg = (st.all || (st.sheet && dep)) ? st.msg : '';
        const btn = document.querySelector('.form-card .btn-add');
        if (btn) { btn.disabled = !!msg; btn.style.opacity = msg ? '0.45' : '1'; btn.style.cursor = msg ? 'not-allowed' : 'pointer'; }
        const b = $('orderBanner');
        if (!b) return;
        if (st.msg) {
            b.style.cssText = 'display:block;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:.85rem;font-weight:700;';
            b.textContent = st.msg;
        } else { b.style.display = 'none'; }
    }

    /* ---------- حافظه محلی: خواندن کلیدهای جدید ---------- */
    const _loadLocal = loadSettingsLocally;
    loadSettingsLocally = function () {
        const r = _loadLocal();
        try {
            const p = JSON.parse(localStorage.getItem('atlas_app_settings') || 'null');
            if (p) EXTRA_KEYS.forEach(k => { if (p[k] !== undefined) appSettings[k] = p[k]; });
        } catch (e) {}
        return r;
    };

    /* ---------- دریافت از سرور: 0 = ناموفق، 1 = موفق، 2 = موفق و قیمت‌ها تغییر کرده بود ---------- */
    async function fetchCloud() {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
        try {
            const res = await fetch(`https://api.jsonbin.io/v3/b/${CLOUD_BIN_ID}/latest?r=${Date.now()}`, {
                cache: 'no-store', headers: { 'X-Master-Key': CLOUD_MASTER_KEY }, signal: ctl.signal
            });
            clearTimeout(to);
            if (!res.ok) return 0;
            const data = await res.json(), r = data.record || data;
            if (!r || (r.st37 === undefined && r.galv === undefined)) return 0;

            const before = verKey(appSettings), hadOrders = orders.length > 0;
            ['st37', 'galv', 'labor', 'ar_wallpost', 'ar_vador', 'lastUpdated'].forEach(k => { if (r[k] !== undefined) appSettings[k] = r[k]; });
            if (r.fittings) appSettings.fittings = { ...appSettings.fittings, ...r.fittings };
            if (r.discounts) appSettings.discounts = { ...appSettings.discounts, ...r.discounts };
            appSettings.orderMode = r.orderMode || 'open';
            appSettings.validHours = r.validHours || 0;
            appSettings.closedMsg = r.closedMsg || '';
            appSettings.sheetConfirmedAt = r.sheetConfirmedAt || null;
            appSettings.priceVersion = r.priceVersion || null;
            appSettings.schedule = r.schedule || null;
            localStorage.setItem('atlas_app_settings', JSON.stringify(appSettings));
            pricesVerifiedAt = Date.now();

            const changed = before !== verKey(appSettings);
            if (changed && hadOrders) {
                recalcOrders();
                alert('⚠️ قیمت‌ها توسط مدیریت تغییر کرده بود. اقلام لیست شما با قیمت جدید دوباره محاسبه شد؛ لطفاً مبالغ را بررسی کنید.');
            }
            updateLivePreview(); renderTable(); updateSyncTimeDisplay(); applyState();
            return changed ? 2 : 1;
        } catch (e) {
            clearTimeout(to);
            updateSyncTimeDisplay();
            return 0;
        }
    }
    loadCloudSettings = async function (isManual) {
        const ov = $('syncLoadingOverlay');
        if (isManual && ov) ov.style.display = 'flex';
        loadSettingsLocally(); updateSyncTimeDisplay(); applyState();
        await fetchCloud();
        if (ov) ov.style.display = 'none';
    };
    updateSyncTimeDisplay = function () {
        const el = $('lastSyncTime');
        if (!el) return;
        const ok = Date.now() - pricesVerifiedAt < 6 * 60000;
        el.textContent = `آخرین بروزرسانی: ${appSettings.lastUpdated || 'ثبت نشده'} ` + (ok ? '✅ تأیید شده با سرور' : '⚠️ تأیید نشده (عدم اتصال به سرور)');
    };

    /* ---------- افزودن قلم و محاسبه مجدد ---------- */
    const _add = addItemToOrder;
    function readForm() {
        const o = {}; FORM_IDS.forEach(id => o[id] = $(id).value); o.noAR = $('chk_no_antirust').checked; return o;
    }
    function writeForm(o) {
        FORM_IDS.forEach(id => { $(id).value = o[id]; }); $('chk_no_antirust').checked = o.noAR;
    }
    function addCore() {
        const n = orders.length, p = readForm();
        _add();
        if (orders.length > n) { orders[n].params = p; orders[n].sheetDep = isSheetDep(p.prodCategory, p.fittingType); }
    }
    function recalcOrders() {
        const saved = orders.map(o => o.params).filter(Boolean);
        if (!saved.length) return;
        const snap = readForm(), st = showToast;
        showToast = function () {};
        try { orders.length = 0; saved.forEach(p => { writeForm(p); addCore(); }); }
        finally { showToast = st; writeForm(snap); }
        renderTable();
    }
    addItemToOrder = async function () {
        if (Date.now() - pricesVerifiedAt > 60000) {
            if (!(await fetchCloud())) { alert('⚠️ اتصال به سرور برقرار نشد و قیمت‌ها تأیید نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.'); return; }
        }
        const why = blockedReason(isSheetDep($('prodCategory').value, $('fittingType').value));
        if (why) { alert(why); return; }
        addCore();
    };
    const _lp = updateLivePreview;
    updateLivePreview = function () { _lp(); applyState(); };

    /* ---------- کنترل قبل از صدور پیش‌فاکتور ---------- */
    async function guardIssue() {
        if (!orders.length) return true;
        const r = await fetchCloud();
        if (!r) { alert('⚠️ اتصال به سرور برقرار نشد؛ قیمت‌ها تأیید نشد و پیش‌فاکتور صادر نمی‌شود. دوباره تلاش کنید.'); return false; }
        if (r === 2) return false;   // قیمت‌ها تغییر کرده؛ ابتدا لیست جدید را ببینید
        const bad = orders.find(o => blockedReason(o.sheetDep));
        if (bad) { alert(blockedReason(bad.sheetDep)); return false; }
        return true;
    }
    copyInvoiceText = async function () {
        if (!orders.length) { alert('پیش‌فاکتور خالی است.'); return; }
        if (!(await guardIssue())) return;
        let txt = `📄 پیش‌فاکتور رسمی اطلس سازه\n📅 تاریخ: ${formatJalaliDateTime(new Date())}\n----------------------------------\n`;
        orders.forEach((o, i) => {
            txt += `${i + 1}. ${o.name} | مشخصات: ${o.specs} | تعداد: ${o.count} | فی: ${o.unitPrice.toLocaleString()} تومان | کل: ${o.totalPrice.toLocaleString()} تومان\n`;
        });
        txt += `----------------------------------\nمبلغ قابل پرداخت: ${$('sumTotalPrice').innerText}\n⏳ ${validity()}\nاطلس سازه - تامین‌کننده تخصصی والپست و اتصالات نوین`;
        navigator.clipboard.writeText(txt).then(() => showToast('متن پیش‌فاکتور کپی شد.'));
    };
    const _pdf = exportPDF;
    exportPDF = async function () {
        if (!orders.length) { alert('پیش‌فاکتور خالی است.'); return; }
        if (!(await guardIssue())) return;
        _pdf();
        const h = $('pdf-custom-header');
        if (h) {
            const n = document.createElement('div');
            n.style.cssText = 'margin-top:8px;font-size:11px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;padding:5px 8px;border-radius:4px;';
            n.textContent = '⏳ ' + validity();
            h.appendChild(n);
        }
    };

    /* ---------- پنل مدیریت ---------- */
    const _open = openAdminModal;
    openAdminModal = function () {
        _open();
        if ($('adminModal').style.display === 'flex') {
            $('adm_orderMode').value = appSettings.orderMode || 'open';
            $('adm_validHours').value = appSettings.validHours || 0;
            $('adm_closedMsg').value = appSettings.closedMsg || '';
            const sc = appSettings.schedule || { on: false, from: '08:00', to: '16:00', offDays: [5], holidays: '' };
            $('adm_sc_on').checked = !!sc.on; $('adm_sc_from').value = sc.from || '08:00'; $('adm_sc_to').value = sc.to || '16:00';
            $('adm_sc_hol').value = sc.holidays || '';
            document.querySelectorAll('#adm_sc_days input').forEach(c => { c.checked = (sc.offDays || []).includes(+c.value); });
        }
    };
    const _save = saveAdminSettings;
    saveAdminSettings = function () {
        appSettings.orderMode = $('adm_orderMode').value;
        appSettings.validHours = parseSafeNumber($('adm_validHours').value);
        appSettings.closedMsg = $('adm_closedMsg').value.trim();
        appSettings.schedule = {
            on: $('adm_sc_on').checked, from: $('adm_sc_from').value || '08:00', to: $('adm_sc_to').value || '16:00',
            offDays: [...document.querySelectorAll('#adm_sc_days input:checked')].map(c => +c.value), holidays: $('adm_sc_hol').value.trim()
        };
        const now = Date.now();
        appSettings.priceVersion = now;
        if (appSettings.orderMode === 'open') appSettings.sheetConfirmedAt = now;   // ذخیره در حالت «باز» یعنی تأیید قیمت ورق
        _save();
        applyState();
    };

    /* ---------- راه‌اندازی ---------- */
    function init() {
        const body = document.querySelector('.content-body');
        const banner = document.createElement('div');
        banner.id = 'orderBanner'; banner.style.display = 'none';
        body.insertBefore(banner, body.firstChild);

        const sec = document.createElement('div');
        sec.innerHTML = `
            <div class="admin-section-title">وضعیت سفارش‌گیری و اعتبار قیمت ورق</div>
            <div class="admin-grid">
                <div class="form-group" style="grid-column: 1 / -1;"><label>وضعیت</label>
                    <select id="adm_orderMode">
                        <option value="open">باز (قیمت ورق تأیید شده است)</option>
                        <option value="sheet_pending">قیمت ورق هنوز اعلام نشده (والپست، وادار و پلیت غیرفعال)</option>
                        <option value="closed">بسته (ثبت هر نوع پیش‌فاکتور غیرفعال)</option>
                    </select></div>
                <div class="form-group"><label>اعتبار قیمت ورق (ساعت، ۰ = نامحدود)</label><input type="number" id="adm_validHours" min="0"></div>
                <div class="form-group" style="grid-column: 1 / -1;"><label>پیام حالت بسته (اختیاری)</label>
                    <input type="text" id="adm_closedMsg" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:.85rem;"></div>
            </div>
            <div class="admin-section-title">ساعت کاری و تعطیلات (به وقت تهران)</div>
            <label class="checkbox-container"><input type="checkbox" id="adm_sc_on"><span>خارج از ساعت کاری و در روزهای تعطیل، صدور پیش‌فاکتور قفل شود</span></label>
            <div class="admin-grid">
                <div class="form-group"><label>شروع کار</label><input type="time" id="adm_sc_from" style="padding:8px;border:1px solid #cbd5e1;border-radius:7px;"></div>
                <div class="form-group"><label>پایان کار</label><input type="time" id="adm_sc_to" style="padding:8px;border:1px solid #cbd5e1;border-radius:7px;"></div>
            </div>
            <div style="font-size:.78rem;margin-bottom:6px;font-weight:600;">روزهای تعطیل هفته:</div>
            <div id="adm_sc_days" style="display:flex;flex-wrap:wrap;gap:12px;font-size:.8rem;margin-bottom:8px;">
                ${[[6,'شنبه'],[0,'یکشنبه'],[1,'دوشنبه'],[2,'سه‌شنبه'],[3,'چهارشنبه'],[4,'پنجشنبه'],[5,'جمعه']].map(d => `<label><input type="checkbox" value="${d[0]}"> ${d[1]}</label>`).join('')}
            </div>
            <div class="form-group" style="margin-bottom:8px;"><label>تعطیلات رسمی و خاص (تاریخ شمسی، با ویرگول یا فاصله جدا کنید؛ مثال: 1405/08/20, 1405/09/01)</label>
                <textarea id="adm_sc_hol" rows="2" style="width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:7px;font-size:.85rem;"></textarea></div>
            <div style="font-size:.72rem;color:#64748b;line-height:1.7;">با هر «ذخیره» در حالت «باز»، قیمت ورق تأیید می‌شود و ساعت اعتبار از همان لحظه شروع می‌شود. اگر پس از پایان اعتبار قیمت جدید ثبت نشود، ثبت اقلام ورقی خودکار قفل می‌شود. پیش‌فاکتورها هم تا همان زمان معتبر درج می‌شوند.</div>`;
        const saveBtn = document.querySelector('#adminModal .btn-add');
        saveBtn.parentNode.insertBefore(sec, saveBtn);

        const sync = $('btnSyncPrice');
        if (sync) sync.onclick = async function () {
            sync.innerText = '⏳ در حال دریافت...'; sync.style.background = '#64748b';
            const r = await fetchCloud();
            sync.innerText = r ? '✅ قیمت‌ها بروز شد' : '⚠️ اتصال برقرار نشد';
            sync.style.background = r ? '#10b981' : '#ef4444';
            setTimeout(() => { sync.innerText = '🔄 بروزرسانی نرخ‌های روز'; sync.style.background = '#ea580c'; }, 2500);
        };

        ['prodCategory', 'fittingType'].forEach(id => $(id).addEventListener('change', applyState));
        document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchCloud(); });
        setInterval(() => { if (!document.hidden) fetchCloud(); }, 120000);   // بروزرسانی خودکار هر ۲ دقیقه
        setInterval(() => { applyState(); updateSyncTimeDisplay(); }, 30000);
        applyState(); updateSyncTimeDisplay();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else { init(); fetchCloud(); }
})();
