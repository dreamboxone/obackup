'use strict';
'require view';
'require form';
'require rpc';
'require ui';

var callStatus = rpc.declare({
    object: 'obackup',
    method: 'status',
    expect: { '': {} }
});

var callScan = rpc.declare({
    object: 'obackup',
    method: 'scan',
    expect: { 'packages': [] }
});

var callBackupInfo = rpc.declare({
    object: 'obackup',
    method: 'backup_info',
    expect: { '': {} }
});

var callStartBackup = rpc.declare({
    object: 'obackup',
    method: 'start_backup',
    expect: { '': {} }
});

var callDeleteBackup = rpc.declare({
    object: 'obackup',
    method: 'delete_backup',
    expect: { '': {} }
});

var callStartRestore = rpc.declare({
    object: 'obackup',
    method: 'start_restore',
    expect: { '': {} }
});

var callJobStatus = rpc.declare({
    object: 'obackup',
    method: 'job_status',
    expect: { '': {} }
});

var callReport = rpc.declare({
    object: 'obackup',
    method: 'report',
    expect: { '': {} }
});

var POLL_INTERVAL_MS = 1500;
/* A backup downloads one file per package, so allow up to an hour. */
var MAX_POLLS = 2400;

/* LuCI ships light and dark themes, and a dark one does not necessarily set
   prefers-color-scheme, so these hues are picked to stay readable on both a
   white and a near-black background. The dark block only brightens them. */
var STYLE = [
'.ob-wrap { --ob-ok:#1f9d55; --ob-warn:#b7791f; --ob-err:#e02424; --ob-info:#2563c9; --ob-dim:rgba(128,128,128,.85); }',
'@media (prefers-color-scheme: dark) {',
'  .ob-wrap { --ob-ok:#3fb950; --ob-warn:#d29922; --ob-err:#f85149; --ob-info:#58a6ff; }',
'}',
'.ob-cards { display:flex; flex-wrap:wrap; gap:12px; margin:0 0 18px 0; }',
'.ob-card { flex:1 1 190px; min-width:170px; padding:12px 14px; border-radius:8px;',
'  border:1px solid rgba(128,128,128,.35); background:rgba(128,128,128,.07); }',
'.ob-card-label { font-size:.78em; text-transform:uppercase; letter-spacing:.06em;',
'  opacity:.75; margin-bottom:6px; }',
'.ob-card-value { font-size:1.18em; font-weight:700; word-break:break-word; line-height:1.3; }',
'.ob-card-note { font-size:.82em; opacity:.7; margin-top:6px; line-height:1.4; }',
'.ob-ok   { color:var(--ob-ok); }',
'.ob-warn { color:var(--ob-warn); }',
'.ob-err  { color:var(--ob-err); }',
'.ob-info { color:var(--ob-info); }',
'.ob-dim  { color:var(--ob-dim); }',
'.ob-b    { font-weight:700; }',
'.ob-tag { display:inline-block; padding:2px 9px; border-radius:11px; font-size:.83em;',
'  font-weight:700; white-space:nowrap; border:1px solid currentColor; }',
'.ob-tag-ok   { color:var(--ob-ok);   background:rgba(63,185,80,.13); }',
'.ob-tag-warn { color:var(--ob-warn); background:rgba(210,153,34,.13); }',
'.ob-tag-err  { color:var(--ob-err);  background:rgba(248,81,73,.13); }',
'.ob-tag-info { color:var(--ob-info); background:rgba(88,166,255,.13); }',
'.ob-table td, .ob-table th { vertical-align:middle; }',
'.ob-steps { margin:0 0 16px 0; padding:0; list-style:none; }',
'.ob-steps li { padding:7px 0 7px 26px; position:relative; line-height:1.55; }',
'.ob-steps li::before { content:"›"; position:absolute; left:8px; top:6px;',
'  font-weight:700; color:var(--ob-info); }',
'.ob-btn-row { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:6px; }',
'.ob-report { padding:12px 14px; border-radius:6px; border:1px solid rgba(128,128,128,.35);',
'  background:rgba(128,128,128,.07); font-family:monospace; font-size:.88em;',
'  line-height:1.5; max-height:330px; overflow:auto; white-space:pre-wrap; }',
'.ob-rep-ok   { color:var(--ob-ok);   font-weight:700; }',
'.ob-rep-warn { color:var(--ob-warn); font-weight:700; }',
'.ob-rep-err  { color:var(--ob-err);  font-weight:700; }',
'.ob-rep-head { color:var(--ob-info); font-weight:700; }',
'.ob-rep-dim  { opacity:.6; }',
'.ob-foot { margin-top:22px; padding-top:12px; font-size:.9em; opacity:.75;',
'  border-top:1px solid rgba(128,128,128,.35); }'
].join('\n');

/* Turn "SUCCESS:/mnt/sda1/obackup_storage" into just the path. */
function pathFromMessage(msg) {
    if (!msg) return '';
    var sep = msg.indexOf(':');
    return (sep >= 0) ? msg.substring(sep + 1) : msg;
}

function card(label, valueNode, note) {
    return E('div', { 'class': 'ob-card' }, [
        E('div', { 'class': 'ob-card-label' }, label),
        E('div', { 'class': 'ob-card-value' }, valueNode),
        note ? E('div', { 'class': 'ob-card-note' }, note) : ''
    ]);
}

function kb(n) {
    n = Number(n) || 0;
    if (n >= 1024) return (n / 1024).toFixed(1) + ' MB';
    return n + ' KB';
}

function when(unixSeconds) {
    var t = Number(unixSeconds) || 0;
    if (!t) return null;
    var d = new Date(t * 1000);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString();
}

function tag(text, kind) {
    return E('span', { 'class': 'ob-tag ob-tag-' + kind }, text);
}

/* The restore report is plain text written by the recovery runner. Colouring
   each line by its leading keyword makes a long report scannable. */
function renderReport(text) {
    var pre = E('pre', { 'class': 'ob-report' });

    text.split('\n').forEach(function(line) {
        var t = line.replace(/^\s+/, '');
        var cls = '';

        if (/^OK\b/.test(t)) cls = 'ob-rep-ok';
        else if (/^WARN\b/.test(t)) cls = 'ob-rep-warn';
        else if (/^(FAIL|FATAL)\b/.test(t)) cls = 'ob-rep-err';
        else if (/^\[.*\]\s*$/.test(t)) cls = 'ob-rep-head';
        else if (/^=+\s*$/.test(t)) cls = 'ob-rep-dim';
        else if (/^-\s/.test(t)) cls = 'ob-rep-dim';
        else if (/^(Authenticity|Integrity):/.test(t))
            cls = /(verified|match)/.test(t) ? 'ob-rep-ok' : 'ob-rep-warn';
        else if (/^Everything was restored/.test(t)) cls = 'ob-rep-ok';
        else if (/could not be installed/.test(t)) cls = 'ob-rep-err';
        else if (/worth checking/.test(t)) cls = 'ob-rep-warn';

        pre.appendChild(E('span', cls ? { 'class': cls } : {}, line + '\n'));
    });

    return pre;
}

return view.extend({
    load: function() {
        return Promise.allSettled([
            callStatus(),
            callScan(),
            callReport(),
            callBackupInfo()
        ]).then(function(results) {
            var out = results.map(function(r) {
                return (r.status === 'fulfilled') ? r.value : null;
            });
            /* Kept so render() can say the backend is unreachable instead of
               quietly filling the page with "unknown". */
            out.statusError = (results[0].status === 'rejected')
                ? ((results[0].reason && results[0].reason.message) || String(results[0].reason))
                : null;
            return out;
        });
    },

    pollJob: function(modalTitle, onFinished) {
        var pollCount = 0;
        var cancelled = false;

        var progressContainer = E('div', { 'style': 'margin-top: 15px;' }, [
            E('div', { 'class': 'cbi-progressbar', 'title': '0%' },
                E('div', { 'style': 'width: 0%;' })),
            E('p', { 'id': 'obackup-progress-msg',
                     'style': 'margin-top: 10px; font-weight: 700;' },
                _('Starting…'))
        ]);

        var closeButton = E('button', {
            'class': 'cbi-button',
            'style': 'margin-top: 14px;',
            'click': function() {
                cancelled = true;
                ui.hideModal();
            }
        }, _('Hide (keep working in the background)'));

        ui.showModal(modalTitle, [ progressContainer, closeButton ]);

        var finish = function(state, msg) {
            ui.hideModal();

            if (state === 'success') {
                ui.addNotification(null, E('p', {}, [
                    E('span', { 'class': 'ob-b ob-ok' }, _('Done.') + ' '),
                    document.createTextNode(_('Saved to: ')),
                    E('span', { 'class': 'ob-b' }, pathFromMessage(msg) || '-')
                ]), 'info');
                if (typeof onFinished === 'function') onFinished();
            } else if (state === 'warning') {
                ui.addNotification(null, E('p', {}, [
                    E('span', { 'class': 'ob-b ob-warn' }, _('Finished with warnings.') + ' '),
                    document.createTextNode(_('Some package files could not be downloaded, so restoring them will need an internet connection. Saved to: ')),
                    E('span', { 'class': 'ob-b' }, pathFromMessage(msg) || '-')
                ]), 'warning');
                if (typeof onFinished === 'function') onFinished();
            } else if (state === 'cancelled' || state === 'aborted') {
                ui.addNotification(null, E('p', {}, _('Stopped.')), 'warning');
            } else {
                ui.addNotification(null, E('p', {}, [
                    E('span', { 'class': 'ob-b ob-err' }, _('It did not work.') + ' '),
                    document.createTextNode(msg || _('unknown error'))
                ]), 'error');
            }
        };

        var pollFn = function() {
            if (cancelled) return;

            if (++pollCount > MAX_POLLS) {
                ui.hideModal();
                ui.addNotification(null, E('p', {},
                    _('This is taking longer than expected. Check the system log for details.')),
                    'error');
                return;
            }

            callJobStatus().then(function(res) {
                var state = (res && res.state) ? res.state : 'idle';
                var msg = (res && res.message) ? res.message : '';
                var progress = Math.max(0, Math.min(100,
                    (res && res.progress) ? Number(res.progress) || 0 : 0));

                var bar = progressContainer.querySelector('.cbi-progressbar > div');
                var barBox = progressContainer.querySelector('.cbi-progressbar');
                var msgElem = document.getElementById('obackup-progress-msg');

                if (bar) bar.style.width = progress + '%';
                if (barBox) barBox.setAttribute('title', progress + '%');
                if (msgElem) msgElem.textContent = msg || _('Working…');

                if (state === 'running') {
                    window.setTimeout(pollFn, POLL_INTERVAL_MS);
                } else {
                    finish(state, msg);
                }
            }).catch(function() {
                /* The router may be busy restarting services; keep waiting. */
                window.setTimeout(pollFn, POLL_INTERVAL_MS * 2);
            });
        };

        window.setTimeout(pollFn, POLL_INTERVAL_MS);
    },

    startJob: function(startRpc, modalTitle, btn, onFinished) {
        var self = this;
        btn.disabled = true;

        startRpc().then(function(res) {
            if (res && res.result === 'JOB_STARTED') {
                self.pollJob(modalTitle, onFinished);
            } else if (res && res.result === 'JOB_ALREADY_RUNNING') {
                btn.disabled = false;
                ui.addNotification(null, E('p', {},
                    _('Another backup or restore is already running. Wait for it to finish.')),
                    'warning');
            } else {
                btn.disabled = false;
                ui.addNotification(null, E('p', {},
                    _('Could not start: %s').format(
                        (res && (res.error || res.result)) || _('unknown reason'))), 'error');
            }
        }).catch(function(e) {
            btn.disabled = false;
            ui.addNotification(null, E('p', {}, e.message), 'error');
        });
    },

    render: function(data) {
        var self = this;
        var status = (data && data[0]) ? data[0] : {};
        var customPkgs = (data && data[1] && Array.isArray(data[1].packages)) ?
            data[1].packages : [];
        var report = (data && data[2] && data[2].report) ? data[2].report : '';
        var backup = (data && data[3]) ? data[3] : {};
        var statusError = (data && data.statusError) ? data.statusError : null;
        var appVersion = status.version || '1.0.3';

        /* Every field on this page comes from the obackup ubus object. When
           that object is missing, rpcd has not picked up its plugin, and
           saying so beats showing a page full of "unknown". */
        var backendWarning = statusError ? E('div', {
            'class': 'alert-message warning',
            'style': 'margin-bottom: 1em;'
        }, [
            E('h4', { 'class': 'ob-b ob-err' }, _('Obackup cannot reach its backend')),
            E('p', {}, _('The router is not answering Obackup\'s requests, so nothing on this page is filled in and the buttons will not work.')),
            E('p', {}, _('This normally means rpcd has not loaded the Obackup plugin yet. Connect over SSH and run:')),
            E('pre', { 'style': 'padding: 8px; overflow-x: auto;' }, '/etc/init.d/rpcd restart'),
            E('p', {}, [
                document.createTextNode(_('Then reload this page. Reported error: ')),
                E('span', { 'class': 'ob-b ob-err' }, statusError)
            ])
        ]) : '';

        var m = new form.JSONMap({}, _('Obackup'),
            _('When you upgrade the firmware, OpenWrt keeps your basic settings but removes every package you added yourself. Obackup saves those packages, their settings and which of their services were switched on, and puts them back after the upgrade — including when you move to a different OpenWrt version.'));

        /* ---------- This router, as summary cards ---------- */
        var s1 = m.section(form.NamedSection, 'status', 'status', _('This router'));
        s1.anonymous = true;
        s1.render = function() {
            var known = function(v) { return v && v !== 'unknown'; };

            var relNode = known(status.release)
                ? E('span', { 'class': 'ob-ok' }, status.release)
                : E('span', { 'class': 'ob-err' }, _('unknown'));

            var archNode = known(status.arch)
                ? E('span', {}, status.arch)
                : E('span', { 'class': 'ob-err' }, _('unknown'));

            var mgr = status.pkg_mgr ? status.pkg_mgr.toUpperCase() : '';
            var mgrNode = mgr
                ? tag(mgr, mgr === 'APK' ? 'info' : 'ok')
                : E('span', { 'class': 'ob-err' }, _('unknown'));

            var target = status.target || '';
            var targetNode;
            if (!target) {
                targetNode = E('span', { 'class': 'ob-err' }, _('not chosen yet'));
            } else if (target === 'ERR_NO_SPACE') {
                targetNode = E('span', { 'class': 'ob-err' }, _('No space left — plug in a USB drive'));
            } else if (target.indexOf('/etc/') === 0) {
                targetNode = E('span', { 'class': 'ob-warn' }, target);
            } else {
                targetNode = E('span', { 'class': 'ob-ok' }, target);
            }

            var storageNote = (target && target.indexOf('/etc/') === 0)
                ? _('The router\'s own storage. A USB drive is used instead whenever one is plugged in.')
                : _('A USB drive is used when one is plugged in, otherwise the router\'s own storage.');

            var countNode = (customPkgs.length === 0)
                ? E('span', { 'class': 'ob-dim' }, '0')
                : E('span', { 'class': 'ob-warn' }, String(customPkgs.length));

            return E('div', { 'class': 'cbi-section' }, [
                E('div', { 'class': 'ob-cards' }, [
                    card(_('OpenWrt version'), relNode, null),
                    card(_('Processor type'), archNode,
                        _('A saved package file only fits a router with the same processor type.')),
                    card(_('Package installer'), mgrNode,
                        _('24.10 and older use OPKG, 25.12 and newer use APK. Obackup handles moving between the two.')),
                    card(_('Would be lost on upgrade'), countNode,
                        _('Packages that did not come with the firmware.')),
                    card(_('Backup is stored in'), targetNode, storageNote),
                    card(_('Obackup version'), E('span', { 'class': 'ob-info' }, appVersion), null)
                ])
            ]);
        };


        /* ---------- The backup that is already on this router ---------- */
        var sB = m.section(form.NamedSection, 'backup', 'backup', _('Your backup'));
        sB.anonymous = true;
        sB.render = function() {
            if (!backup || !backup.exists) {
                return E('div', { 'class': 'cbi-section' }, [
                    E('p', {}, [
                        E('span', { 'class': 'ob-b ob-warn' }, _('No backup on this router yet.')),
                        document.createTextNode(' ' + _('Press Backup below before you upgrade the firmware, otherwise everything listed above is lost.'))
                    ])
                ]);
            }

            var made = when(backup.created);
            var rows = [];
            var row = function(label, valueNode) {
                rows.push(E('tr', { 'class': 'tr' }, [
                    E('td', { 'class': 'td', 'style': 'width:30%' }, label),
                    E('td', { 'class': 'td' }, valueNode)
                ]));
            };

            row(_('Taken on'), made
                ? E('span', { 'class': 'ob-b' }, made)
                : E('span', { 'class': 'ob-dim' }, _('unknown')));

            row(_('Stored in'), E('span', { 'class': 'ob-b' }, backup.path || '-'));

            row(_('Contains'), E('span', {}, [
                E('span', { 'class': 'ob-b ob-ok' }, String(backup.packages || 0)),
                document.createTextNode(' ' + _('packages') + ' · '),
                E('span', { 'class': 'ob-b' }, String(backup.configs || 0)),
                document.createTextNode(' ' + _('settings entries') + ' · '),
                E('span', { 'class': 'ob-b' }, String(backup.services || 0)),
                document.createTextNode(' ' + _('services') + ' · '),
                E('span', { 'class': 'ob-b' }, kb(backup.size_kb))
            ]));

            var fromParts = [];
            if (backup.source_release) fromParts.push('OpenWrt ' + backup.source_release);
            if (backup.source_arch) fromParts.push(backup.source_arch);
            if (backup.source_pkg_manager) fromParts.push(backup.source_pkg_manager.toUpperCase());
            var sameRelease = backup.source_release && status.release &&
                              backup.source_release === status.release;
            row(_('Taken from'), E('span', {}, [
                E('span', { 'class': sameRelease ? 'ob-b ob-ok' : 'ob-b ob-warn' },
                    fromParts.join(' · ') || _('unknown')),
                sameRelease ? '' : E('div', { 'class': 'ob-card-note' },
                    _('This is not the OpenWrt version running now, so a restore would reinstall the packages from the package lists of the running system.'))
            ]));

            row(_('Protected by a signature'), backup.signed
                ? tag(_('yes'), 'ok')
                : tag(_('no'), 'warn'));

            row(_('Ready to restore'), backup.runnable
                ? tag(_('yes'), 'ok')
                : tag(_('no — the recovery script is missing'), 'err'));

            if (backup.bundle) {
                row(_('Single-file copy'), E('span', {}, [
                    E('span', { 'class': 'ob-b' }, backup.bundle),
                    document.createTextNode(' (' + kb(backup.bundle_kb) + ')'),
                    E('div', { 'class': 'ob-card-note' },
                        _('Copy this one file somewhere safe if you want the backup off the router.'))
                ]));
            }

            var notes = [];
            if (backup.incomplete > 0) {
                notes.push(E('p', {}, [
                    E('span', { 'class': 'ob-b ob-warn' },
                        _('%d package file(s) could not be downloaded.').format(backup.incomplete)),
                    document.createTextNode(' ' + _('Those packages will be reinstalled from the internet during a restore, so the router will need a working connection. Running Backup again while online fills them in.'))
                ]));
            }

            var heading = E('p', {}, [
                E('span', { 'class': 'ob-b ob-ok' }, _('A backup is ready.')),
                document.createTextNode(' ' + _('It was made by Obackup %s.').format(backup.made_by || '?'))
            ]);

            var btnDelete = E('button', {
                'class': 'cbi-button cbi-button-remove',
                'click': function(ev) { self.confirmDelete(ev.target, backup); }
            }, _('Delete backup'));

            var deleteHint = E('p', { 'class': 'ob-card-note' },
                _('Once the upgrade is done and everything has been put back, you can delete the backup to get the space back.'));

            return E('div', { 'class': 'cbi-section' }, [
                heading,
                E('table', { 'class': 'table ob-table' }, rows)
            ].concat(notes).concat([
                deleteHint,
                E('div', { 'class': 'ob-btn-row' }, [ btnDelete ])
            ]));
        };

        /* ---------- Packages ---------- */
        var s2 = m.section(form.NamedSection, 'packages', 'packages',
            _('Packages that an upgrade would remove'));
        s2.anonymous = true;
        s2.render = function() {
            var rows = [];

            if (customPkgs.length === 0) {
                rows.push(E('tr', { 'class': 'tr' }, [
                    E('td', { 'class': 'td', 'colspan': 4 },
                        E('span', { 'class': 'ob-dim' },
                            _('Nothing found. Everything installed came with the firmware, so an upgrade would not remove anything.')))
                ]));
            } else {
                for (var i = 0; i < customPkgs.length; i++) {
                    var pkg = customPkgs[i] || {};
                    var origin = pkg.origin || 'third-party';
                    var originNode;

                    if (origin === 'official-feed') {
                        originNode = tag(_('OpenWrt package list'), 'info');
                    } else if (origin === 'unverified') {
                        originNode = tag(_('source unknown'), 'err');
                    } else {
                        originNode = tag(_('added from elsewhere'), 'warn');
                    }

                    rows.push(E('tr', { 'class': 'tr' }, [
                        E('td', { 'class': 'td', 'style': 'width:40%' },
                            E('span', { 'class': 'ob-b' }, pkg.name || '-')),
                        E('td', { 'class': 'td', 'style': 'width:25%' },
                            E('span', { 'class': 'ob-dim' }, pkg.version || '-')),
                        E('td', { 'class': 'td', 'style': 'width:12%' },
                            pkg.size ? (Math.round(pkg.size / 1024) + ' KB') : '-'),
                        E('td', { 'class': 'td', 'style': 'width:23%' }, originNode)
                    ]));
                }
            }

            var note = E('p', { 'class': 'cbi-section-descr' }, [
                document.createTextNode(_('These are the packages that did not come with the firmware. ')),
                E('span', { 'class': 'ob-b' }, _('Packages they depend on are saved too')),
                document.createTextNode(_(', even though they are not listed here.'))
            ]);

            return E('div', { 'class': 'cbi-section' }, [
                note,
                E('table', { 'class': 'table ob-table' }, [
                    E('tr', { 'class': 'tr table-titles' }, [
                        E('th', { 'class': 'th' }, _('Package')),
                        E('th', { 'class': 'th' }, _('Version')),
                        E('th', { 'class': 'th' }, _('Size')),
                        E('th', { 'class': 'th' }, _('Where it came from'))
                    ])
                ].concat(rows))
            ]);
        };

        /* ---------- Actions ---------- */
        var s3 = m.section(form.NamedSection, 'actions', 'actions', _('Save and put back'));
        s3.anonymous = true;
        s3.render = function() {
            var btnBackup = E('button', {
                'class': 'cbi-button cbi-button-action important',
                'click': function(ev) {
                    self.startJob(callStartBackup, _('Backing up'), ev.target,
                        function() { window.location.reload(); });
                }
            }, _('Backup'));

            var btnRestore = E('button', {
                'class': 'cbi-button cbi-button-apply',
                'click': function(ev) { self.confirmRestore(ev.target); }
            }, _('Restore'));

            var steps = E('ul', { 'class': 'ob-steps' }, [
                E('li', {}, [
                    E('span', { 'class': 'ob-b ob-ok' }, _('Press Backup before you upgrade the firmware.')),
                    document.createTextNode(' ' + _('It saves your extra packages, their settings and their data files, then checks and signs the result so a damaged or altered backup is refused later.'))
                ]),
                E('li', {}, [
                    document.createTextNode(_('After the upgrade the router puts everything back ')),
                    E('span', { 'class': 'ob-b' }, _('on its own at the first start')),
                    document.createTextNode(_(', once storage and the internet connection are ready. Press Restore only if you want to do it by hand, or to try again.'))
                ]),
                E('li', {}, [
                    E('span', { 'class': 'ob-b ob-info' }, _('Moving to a different OpenWrt version works too.')),
                    document.createTextNode(' ' + _('Packages are then installed fresh from the new version\'s own package lists, because the saved files were built for the old firmware. Your settings are still put back, and a copy of each replaced file is kept next to it ending in ')),
                    E('span', { 'class': 'ob-b ob-warn' }, '.obackup-orig'),
                    document.createTextNode('.')
                ])
            ]);

            return E('div', { 'class': 'cbi-section' }, [
                steps,
                E('div', { 'class': 'ob-btn-row' }, [ btnBackup, btnRestore ])
            ]);
        };

        /* ---------- Last restore report ---------- */
        var s4 = m.section(form.NamedSection, 'report', 'report', _('Result of the last restore'));
        s4.anonymous = true;
        s4.render = function() {
            var body = report
                ? renderReport(report)
                : E('p', { 'class': 'ob-dim' }, _('Nothing yet. This fills in after the first restore.'));

            var footer = E('div', { 'class': 'ob-foot' }, [
                E('span', { 'class': 'ob-b' }, _('Obackup %s').format(appVersion)),
                document.createTextNode(' · '),
                E('a', { 'href': 'https://github.com/dreamboxone/obackup', 'target': '_blank', 'rel': 'noopener' },
                    'github.com/dreamboxone/obackup'),
                document.createTextNode(' · '),
                E('a', { 'href': 'https://t.me/routekernel1', 'target': '_blank', 'rel': 'noopener' },
                    '@routekernel1')
            ]);

            return E('div', { 'class': 'cbi-section' }, [ body, footer ]);
        };

        return m.render().then(function(mapEl) {
            return E('div', { 'class': 'ob-wrap' }, [
                E('style', {}, STYLE),
                backendWarning,
                mapEl
            ]);
        });
    },

    confirmDelete: function(btn, backup) {
        var self = this;
        var freed = backup && backup.size_kb ? kb(backup.size_kb) : null;

        ui.showModal(_('Delete this backup?'), [
            E('p', {}, [
                document.createTextNode(_('The whole backup in ')),
                E('span', { 'class': 'ob-b' }, (backup && backup.path) || '-'),
                document.createTextNode(_(' is removed, together with the hook that restores it at the next start.'))
            ]),
            freed ? E('p', {}, [
                document.createTextNode(_('This frees about ')),
                E('span', { 'class': 'ob-b ob-ok' }, freed),
                document.createTextNode('.')
            ]) : '',
            E('p', {}, [
                E('span', { 'class': 'ob-b ob-err' }, _('There will be nothing left to restore.')),
                document.createTextNode(' ' + _('Only do this after an upgrade has finished and you have checked that your packages and settings are back.'))
            ]),
            E('div', { 'style': 'text-align: right; margin-top: 14px;' }, [
                E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, _('Cancel')),
                ' ',
                E('button', {
                    'class': 'cbi-button cbi-button-negative important',
                    'click': function() {
                        ui.hideModal();
                        btn.disabled = true;
                        callDeleteBackup().then(function(res) {
                            var r = (res && res.result) || '';
                            if (r.indexOf('DELETED') === 0) {
                                ui.addNotification(null, E('p', {}, [
                                    E('span', { 'class': 'ob-b ob-ok' }, _('Backup deleted.') + ' '),
                                    document.createTextNode(_('Freed %s.').format(kb(r.split(':')[1])))
                                ]), 'info');
                                window.setTimeout(function() { window.location.reload(); }, 1200);
                            } else if (r === 'ERR_NOT_FOUND') {
                                btn.disabled = false;
                                ui.addNotification(null, E('p', {}, _('There is no backup to delete.')), 'warning');
                            } else {
                                btn.disabled = false;
                                ui.addNotification(null, E('p', {},
                                    _('Could not delete the backup: %s').format(
                                        (res && (res.error || res.result)) || _('unknown reason'))), 'error');
                            }
                        }).catch(function(e) {
                            btn.disabled = false;
                            ui.addNotification(null, E('p', {}, e.message), 'error');
                        });
                    }
                }, _('Delete'))
            ])
        ]);
    },

    confirmRestore: function(btn) {
        var self = this;

        ui.showModal(_('Restore now?'), [
            E('p', {}, [
                document.createTextNode(_('This installs the packages from the backup and ')),
                E('span', { 'class': 'ob-b ob-warn' }, _('overwrites their settings')),
                document.createTextNode(_(' with the saved ones.'))
            ]),
            E('p', {}, [
                document.createTextNode(_('Each file that gets replaced is first copied next to itself with ')),
                E('span', { 'class': 'ob-b' }, '.obackup-orig'),
                document.createTextNode(_(' added to the name, so you can go back by hand if you need to.'))
            ]),
            E('div', { 'style': 'text-align: right; margin-top: 14px;' }, [
                E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, _('Cancel')),
                ' ',
                E('button', {
                    'class': 'cbi-button cbi-button-negative important',
                    'click': function() {
                        ui.hideModal();
                        self.startJob(callStartRestore, _('Restoring'), btn,
                            function() { window.location.reload(); });
                    }
                }, _('Restore'))
            ])
        ]);
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
