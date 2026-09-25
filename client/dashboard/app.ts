// @ts-nocheck
(() => {
  'use strict';

  const API = '/api/v1';
  const TOKEN_KEY = 'omniSentinel.accessToken';
  const REFRESH_KEY = 'omniSentinel.refreshToken';
  const AUTO_REFRESH_KEY = 'omniSentinel.dashboard.autoRefresh';
  const AUTO_REFRESH_INTERVAL_MS = 30_000;
  const OLT_NAME_TTL_MS = 5 * 60_000;
  const LIVE_VIEWS = new Set(['overview']);
  const state = {
    accessToken: sessionStorage.getItem(TOKEN_KEY),
    refreshToken: sessionStorage.getItem(REFRESH_KEY),
    user: null,
    currentView: 'overview',
    incidents: [],
    pagination: { inventory: 1, incidents: 1, alerts: 1 },
    loadingViews: new Set(),
    autoRefresh: sessionStorage.getItem(AUTO_REFRESH_KEY) === 'true',
    autoRefreshTimer: null,
    oltNames: new Map(),
    oltNameRequests: new Map(),
    previewIncident: null,
    detailIncident: null,
  };

  const byId = (id) => document.getElementById(id);
  const elements = {
    loginView: byId('login-view'), app: byId('app'), loginForm: byId('login-form'),
    loginError: byId('login-error'), loginSubmit: byId('login-submit'),
    password: byId('password'), togglePassword: byId('toggle-password'),
    pageTitle: byId('page-title'), userName: byId('user-name'), userRole: byId('user-role'),
    userInitials: byId('user-initials'), userEmail: byId('user-email'),
    userPermissions: byId('user-permissions'), userPopover: byId('user-popover'),
    userMenu: byId('user-menu'), toast: byId('toast'), dialog: byId('incident-dialog'),
    previewDialog: byId('incident-preview-dialog'),
    dialogTitle: byId('incident-dialog-title'), dialogCode: byId('incident-dialog-code'),
    incidentDetail: byId('incident-detail'), incidentActions: byId('incident-actions'),
    refreshView: byId('refresh-view'), autoRefresh: byId('auto-refresh'),
    autoRefreshLabel: byId('auto-refresh-label'), liveStatus: byId('live-status'),
  };

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  function text(value, fallback = '—') {
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
  }

  function number(value) {
    return new Intl.NumberFormat('es-EC').format(Number(value ?? 0));
  }

  function date(value, withTime = true) {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) return '—';
    return new Intl.DateTimeFormat('es-EC', {
      dateStyle: 'medium',
      ...(withTime ? { timeStyle: 'short' } : {}),
    }).format(parsed);
  }

  function minutes(value) {
    if (value === null || value === undefined) return '—';
    const rounded = Math.round(Number(value));
    if (rounded < 60) return `${rounded} min`;
    return `${Math.floor(rounded / 60)} h ${rounded % 60} min`;
  }

  function slug(value) {
    return String(value || '').replace(/[^A-Z_]/g, '');
  }

  function badge(value, kind = 'status') {
    const item = document.createElement('span');
    item.className = `status-badge ${kind}-${slug(value)}`;
    item.textContent = text(value).replaceAll('_', ' ');
    return item;
  }

  function has(permission) {
    return Boolean(state.user?.permissions?.includes(permission));
  }

  function setButtonBusy(button, busy, label) {
    button.disabled = busy;
    if (label) button.textContent = busy ? 'Procesando…' : label;
  }

  function messageFrom(payload, status) {
    if (typeof payload === 'string') return payload;
    if (Array.isArray(payload?.message)) return payload.message.join('. ');
    return payload?.message || payload?.error || `La solicitud no pudo completarse (${status}).`;
  }

  function loginMessage(error) {
    if (error instanceof ApiError) {
      if (error.status === 401) return 'Usuario o contraseña incorrectos. Usa solo el valor de ADMIN_USERNAME o ADMIN_EMAIL, sin "ADMIN_USERNAME=".';
      if (error.status === 429) return 'Demasiados intentos. Espera un minuto antes de volver a intentar.';
      if (error.status >= 500) return 'El servidor no pudo completar el inicio de sesión. Revisa el registro del contenedor.';
      return error.message;
    }
    return 'No se pudo conectar con el servidor. Confirma que estás usando http://10.101.2.11:3000.';
  }

  async function refreshAccessToken() {
    if (!state.refreshToken) return false;
    const response = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    setSession(result);
    return true;
  }

  async function api(path, options = {}, allowRefresh = true) {
    const { raw = false, headers = {}, ...requestOptions } = options;
    const requestHeaders = new Headers(headers);
    if (state.accessToken) requestHeaders.set('Authorization', `Bearer ${state.accessToken}`);
    if (requestOptions.body && !requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${API}${path}`, { ...requestOptions, headers: requestHeaders });
    if (response.status === 401 && allowRefresh && await refreshAccessToken()) {
      return api(path, options, false);
    }
    if (!response.ok) {
      const responseText = await response.text();
      let payload = responseText;
      try { payload = JSON.parse(responseText); } catch { /* plain text error */ }
      if (response.status === 401) clearSession(true);
      throw new ApiError(messageFrom(payload, response.status), response.status);
    }
    if (raw) return response;
    if (response.status === 204) return undefined;
    const responseText = await response.text();
    if (!responseText) return undefined;
    try { return JSON.parse(responseText); } catch { return responseText; }
  }

  function setSession(result) {
    if (!result?.accessToken || !result?.refreshToken || !result?.user) {
      throw new ApiError('El servidor respondió sin una sesión válida.', 502);
    }
    state.accessToken = result.accessToken;
    state.refreshToken = result.refreshToken;
    state.user = result.user || state.user;
    sessionStorage.setItem(TOKEN_KEY, result.accessToken);
    sessionStorage.setItem(REFRESH_KEY, result.refreshToken);
  }

  function clearSession(expired = false) {
    state.accessToken = null;
    state.refreshToken = null;
    state.user = null;
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    elements.app.hidden = true;
    elements.loginView.hidden = false;
    elements.loginForm.reset();
    window.clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
    if (expired) showToast('Tu sesión terminó. Vuelve a ingresar para continuar.', true);
  }

  function showToast(message, error = false) {
    elements.toast.textContent = message;
    elements.toast.classList.toggle('is-error', error);
    elements.toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { elements.toast.hidden = true; }, 4500);
  }

  function displayUser() {
    const user = state.user;
    const name = user.displayName || user.username;
    elements.userName.textContent = name;
    elements.userRole.textContent = (user.roles || []).join(', ') || 'Usuario';
    elements.userEmail.textContent = user.email;
    elements.userPermissions.textContent = `${(user.permissions || []).length} permisos activos`;
    elements.userInitials.textContent = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  function showApp() {
    elements.loginView.hidden = true;
    elements.app.hidden = false;
    displayUser();
    scheduleAutoRefresh();
    refreshCurrentView();
  }

  function create(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function clear(node) { node.replaceChildren(); }

  async function loadAllIncidentCustomers(incidentId) {
    const firstPage = await api(`/incidents/${incidentId}/customers?limit=100`);
    const totalPages = Math.ceil(Number(firstPage.total || 0) / 100);
    if (totalPages <= 1) return firstPage;

    const remainingPages = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) => api(`/incidents/${incidentId}/customers?page=${index + 2}&limit=100`)),
    );
    return {
      ...firstPage,
      data: [
        ...(firstPage.data || []),
        ...remainingPages.flatMap((page) => page.data || []),
      ],
    };
  }

  function downloadIncidentCustomersCsv(incident, customers) {
    const quote = (value) => {
      const raw = String(value ?? '');
      const safe = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows = [
      ['Código de incidente', 'Título', 'Cliente', 'Afectado desde', 'Restaurado'],
      ...(customers.length ? customers : [null]).map((customer) => [
        incident.code,
        incidentTitle(incident),
        customer?.customerName || customer?.customerCode || customer?.externalCustomerId,
        customer?.affectedFrom ? new Date(customer.affectedFrom).toISOString() : '',
        customer?.restoredAt ? new Date(customer.restoredAt).toISOString() : '',
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`;
    const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = `incidente-${String(incident.code || incident.id).replace(/[^a-z0-9_-]/gi, '_')}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  }

  function emptyState(container, title, detail) {
    clear(container);
    const empty = create('div', 'empty-state');
    empty.append(create('div', '', '○'), create('div', '', undefined));
    const words = empty.lastElementChild;
    words.append(create('strong', '', title), create('span', '', detail));
    container.append(empty);
  }

  function table(container, headers, rows, emptyTitle = 'No hay datos para mostrar') {
    clear(container);
    if (!rows.length) {
      emptyState(container, emptyTitle, 'Prueba cambiando los filtros o actualiza la vista.');
      return;
    }
    const node = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    headers.forEach((header) => headRow.append(create('th', '', header)));
    head.append(headRow);
    const body = document.createElement('tbody');
    rows.forEach((row) => body.append(row));
    node.append(head, body);
    container.append(node);
  }

  function cell(content, className) {
    const node = create('td', className);
    if (content instanceof Node) node.append(content);
    else node.textContent = text(content);
    return node;
  }

  const GENERIC_OLT_NAMES = new Set(['', 'smart olt', 'olt desconocida', 'olt no identificada', 'desconocido', 'unknown', 'n/a', 'na']);

  function isSpecificOltName(value) {
    return !GENERIC_OLT_NAMES.has(String(value || '').trim().toLocaleLowerCase('es'));
  }

  function eventOltName(incident) {
    const events = incident?.events || state.incidents.find((item) => item.id === incident?.id)?.events || [];
    for (const event of events) {
      const name = event?.payload?.device?.oltName;
      if (isSpecificOltName(name)) return String(name).trim();
    }
    return '';
  }

  function oltName(incidentOrId) {
    const incident = typeof incidentOrId === 'object' ? incidentOrId : null;
    const directName = eventOltName(incident);
    if (directName) return directName;
    const oltExternalId = incident?.oltExternalId ?? incidentOrId;
    if (!oltExternalId) return 'Sin OLT';
    return state.oltNames.get(String(oltExternalId))?.name || 'Consultando Smart OLT…';
  }

  function incidentTitle(incident) {
    const title = text(incident.title);
    const id = String(incident.oltExternalId || '');
    if (!id) return title;
    const location = `${id}${incident.ponIdentifier ? ` PON ${incident.ponIdentifier}` : ''}`;
    return title.endsWith(`: ${location}`)
      ? `${title.slice(0, -location.length)}${oltName(incident)}${incident.ponIdentifier ? ` PON ${incident.ponIdentifier}` : ''}`
      : title;
  }

  function incidentLocation(incident) {
    return [oltName(incident), incident.ponIdentifier ? `PON ${incident.ponIdentifier}` : ''].filter(Boolean).join(' · ');
  }

  function opticalStatus(eventType) {
    return eventType === 'pon.loss' ? 'LOSS' : ['pon.los', 'fiber.cut'].includes(eventType) ? 'LOS' : '—';
  }

  function updateOltLabels(id) {
    document.querySelectorAll('[data-olt-external-id]').forEach((node) => {
      if (node.dataset.oltExternalId !== id) return;
      const incident = state.incidents.find((item) => item.id === node.dataset.incidentOltNameId);
      node.textContent = oltName(incident || id);
    });
    document.querySelectorAll('[data-incident-title-id]').forEach((node) => {
      const incident = state.incidents.find((item) => item.id === node.dataset.incidentTitleId);
      if (incident?.oltExternalId === id) node.textContent = incidentTitle(incident);
    });
    if (state.previewIncident?.oltExternalId === id && elements.previewDialog.open) {
      byId('incident-preview-title').textContent = incidentTitle(state.previewIncident);
      byId('incident-preview-olt').textContent = incidentLocation(state.previewIncident);
    }
    if (state.detailIncident?.oltExternalId === id && elements.dialog.open) {
      elements.dialogTitle.textContent = incidentTitle(state.detailIncident);
      byId('incident-detail-olt').textContent = incidentLocation(state.detailIncident);
    }
  }

  async function loadOltName(id) {
    const cached = state.oltNames.get(id);
    if (cached && Date.now() - cached.checkedAt < OLT_NAME_TTL_MS) return;
    if (state.oltNameRequests.has(id)) return state.oltNameRequests.get(id);
    const request = (async () => {
      let name = 'Nombre no disponible en Smart OLT';
      let checkedAt = Date.now();
      try {
        const names = new Map();
        let page = 1;
        let total = 0;
        do {
          const result = await api(`/inventory/naps?oltId=${encodeURIComponent(id)}&limit=200&page=${page}`);
          total = Number(result.total || 0);
          (result.data || []).forEach((nap) => {
            const candidate = String(nap.oltName || '').trim();
            if (String(nap.oltId) === id && isSpecificOltName(candidate) && candidate !== id && !/^\d+$/.test(candidate)) {
              const subdomain = String(nap.oltSubdomain || '').trim();
              const label = subdomain ? `${candidate} · ${subdomain}` : candidate;
              names.set(label.toLocaleLowerCase('es'), label);
            }
          });
          page += 1;
        } while ((page - 1) * 200 < total);
        if (names.size) name = [...names.values()].sort((left, right) => left.localeCompare(right, 'es')).join(' / ');
      } catch {
        checkedAt -= OLT_NAME_TTL_MS - 30_000;
      }
      state.oltNames.set(id, { name, checkedAt });
      updateOltLabels(id);
    })();
    state.oltNameRequests.set(id, request);
    try { await request; } finally { state.oltNameRequests.delete(id); }
  }

  async function loadOltNames(incidents) {
    const ids = [...new Set(incidents.map((incident) => String(incident.oltExternalId || '')).filter(Boolean))];
    for (let index = 0; index < ids.length; index += 4) {
      await Promise.all(ids.slice(index, index + 4).map(loadOltName));
    }
  }

  function incidentRow(incident) {
    const row = document.createElement('tr');
    row.dataset.previewIncidentId = incident.id;
    row.tabIndex = 0;
    row.setAttribute('aria-label', `Vista previa del incidente ${incident.code}`);
    row.classList.toggle('is-selected', state.previewIncident?.id === incident.id);
    const title = create('div', 'row-title');
    const titleText = create('span', '', incidentTitle(incident));
    titleText.dataset.incidentTitleId = incident.id;
    title.append(create('strong', '', incident.code), titleText);
    const olt = create('span', '', oltName(incident));
    if (incident.oltExternalId) {
      olt.dataset.oltExternalId = String(incident.oltExternalId);
      olt.dataset.incidentOltNameId = incident.id;
    }
    row.append(cell(title), cell(badge(incident.severity, 'severity')),
      cell(badge(opticalStatus(incident.events?.[0]?.eventType))), cell(olt));
    row.append(cell(number(incident.affectedCustomerCount)), cell(date(incident.detectedAt)));
    const action = cell(undefined, 'action-cell');
    const open = create('button', 'table-button', 'Ver detalle');
    open.type = 'button';
    open.dataset.incidentId = incident.id;
    action.append(open);
    row.append(action);
    return row;
  }

  function setMetric(id, value) { byId(id).textContent = text(value); }

  function setViewLoading(view, busy) {
    const section = byId(view);
    if (!section) return;
    section.classList.toggle('is-loading', busy);
    section.setAttribute('aria-busy', String(busy));
    if (view === state.currentView) elements.refreshView.disabled = busy;
  }

  async function whileLoading(view, task) {
    if (state.loadingViews.has(view)) return;
    state.loadingViews.add(view);
    setViewLoading(view, true);
    try {
      return await task();
    } finally {
      state.loadingViews.delete(view);
      setViewLoading(view, false);
      if (view === state.currentView) updateAutoRefreshControl();
    }
  }

  function setLiveStatus(label) {
    elements.liveStatus.textContent = label;
  }

  function updateAutoRefreshControl() {
    const enabled = state.autoRefresh;
    elements.autoRefresh.classList.toggle('is-active', enabled);
    elements.autoRefresh.setAttribute('aria-pressed', String(enabled));
    elements.autoRefresh.title = enabled
      ? 'Pausar actualización automática'
      : 'Activar actualización automática cada 30 segundos';
    elements.autoRefreshLabel.textContent = enabled ? 'Auto: cada 30 s' : 'Auto: pausada';
    if (!state.loadingViews.has(state.currentView)) {
      setLiveStatus(enabled ? 'Actualización automática activa' : 'Actualización manual');
    }
  }

  function scheduleAutoRefresh() {
    window.clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
    if (!state.autoRefresh) return;
    state.autoRefreshTimer = window.setInterval(() => {
      if (document.hidden || elements.dialog.open || elements.previewDialog.open || !LIVE_VIEWS.has(state.currentView)) return;
      refreshCurrentView();
    }, AUTO_REFRESH_INTERVAL_MS);
  }

  function setAutoRefresh(enabled) {
    state.autoRefresh = enabled;
    sessionStorage.setItem(AUTO_REFRESH_KEY, String(enabled));
    updateAutoRefreshControl();
    scheduleAutoRefresh();
    showToast(enabled
      ? 'Actualización automática activada cada 30 segundos.'
      : 'Actualización automática pausada.');
  }

  function refreshCurrentView() {
    if (state.loadingViews.has(state.currentView)) return;
    loadOverview();
  }

  function renderPagination(containerId, view, result) {
    const container = byId(containerId);
    clear(container);
    const total = Number(result.total || 0);
    const page = Number(result.page || 1);
    const limit = Number(result.limit || 1);
    const pages = Math.max(1, Math.ceil(total / limit));
    if (!total || pages === 1) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    container.append(create('span', 'pagination-copy', `${number(start)}–${number(end)} de ${number(total)}`));
    const previous = create('button', 'button button--secondary pagination-button', '← Anterior');
    previous.type = 'button';
    previous.disabled = page <= 1;
    previous.addEventListener('click', () => {
      state.pagination[view] = page - 1;
      refreshCurrentView();
    });
    const next = create('button', 'button button--secondary pagination-button', 'Siguiente →');
    next.type = 'button';
    next.disabled = page >= pages;
    next.addEventListener('click', () => {
      state.pagination[view] = page + 1;
      refreshCurrentView();
    });
    container.append(previous, create('span', 'pagination-page', `Página ${page} de ${pages}`), next);
  }

  const filterLabels = {
    search: 'Buscar', status: 'Seguimiento', oltId: 'OLT', oltExternalId: 'OLT',
    severity: 'Severidad', source: 'Origen', localSearch: 'Buscar',
  };

  function filterValue(value) {
    return String(value).replaceAll('_', ' ');
  }

  function renderFilterSummary(formId, summaryId, view) {
    const form = byId(formId);
    const container = byId(summaryId);
    clear(container);
    const activeFilters = [...new FormData(form).entries()].filter(([, value]) => String(value).trim());
    if (!activeFilters.length) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.append(create('span', 'filter-summary-label', 'Filtros activos:'));
    activeFilters.forEach(([name, value]) => {
      const chip = create('button', 'filter-chip', `${filterLabels[name] || name}: ${filterValue(value)} ×`);
      chip.type = 'button';
      chip.title = `Quitar filtro ${filterLabels[name] || name}`;
      chip.addEventListener('click', () => {
        const field = form.elements.namedItem(name);
        if (field) field.value = '';
        state.pagination[view] = 1;
        refreshCurrentView();
      });
      container.append(chip);
    });
    const clearAll = create('button', 'text-button filter-clear', 'Quitar todos');
    clearAll.type = 'button';
    clearAll.addEventListener('click', () => {
      form.reset();
      state.pagination[view] = 1;
      refreshCurrentView();
    });
    container.append(clearAll);
  }

  async function loadOverview() {
    return whileLoading('overview', async () => {
      setConnection('Cargando');
      setLiveStatus('Actualizando resumen…');
      try {
        const summary = await api('/dashboard/summary');
        setMetric('metric-active', number(summary.activeIncidents));
        setMetric('metric-critical', number(summary.criticalIncidents));
        setMetric('metric-customers', number(summary.affectedCustomers));
        setMetric('metric-availability', `${Number(summary.availability || 0).toFixed(2)}%`);
        setMetric('metric-onus', number(summary.offlineOnus));
        setMetric('metric-resolved', number(summary.resolvedToday));
        setMetric('metric-mttr', minutes(summary.averageMttr));
        setMetric('pulse-onus', number(summary.offlineOnus));
        setMetric('pulse-resolved', number(summary.resolvedToday));
        setMetric('pulse-mttr', minutes(summary.averageMttr));
        const needsAttention = Number(summary.criticalIncidents) > 0;
        const pulse = byId('operations-pulse');
        pulse.classList.toggle('is-attention', needsAttention);
        byId('operations-pulse-title').textContent = needsAttention ? 'Atención prioritaria requerida' : 'Operación estable';
        byId('operations-pulse-detail').textContent = needsAttention
          ? `${number(summary.criticalIncidents)} incidentes críticos requieren atención inmediata.`
          : `Sin incidentes críticos. ${number(summary.offlineOnus)} ONU offline bajo seguimiento.`;
        byId('overview-updated').textContent = `Actualizado ${date(new Date())}`;
        await loadIncidents();
        setConnection('En línea');
      } catch (error) { showViewError(error, 'No fue posible cargar el resumen.'); }
    });
  }

  function queryFromForm(form, ignored = []) {
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (!ignored.includes(key) && value) params.set(key, value);
    });
    return params;
  }

  async function loadIncidents() {
    const params = new URLSearchParams({
      page: String(state.pagination.incidents),
      limit: '25',
    });
    setLiveStatus('Actualizando incidentes…');
    try {
      const result = await api(`/incidents?${params}`);
      state.incidents = result.data;
      byId('incidents-total').textContent = `${number(result.total)} encontrados`;
      table(byId('incidents-table'), ['Incidente', 'Severidad', 'Estado óptico', 'OLT', 'Afectados', 'Detectado', ''], state.incidents.map((item) => incidentRow(item)), 'No se encontraron incidentes');
      void loadOltNames(state.incidents);
      renderPagination('incidents-pagination', 'incidents', result);
      setConnection('En línea');
    } catch (error) { showViewError(error, 'No fue posible cargar los incidentes.'); }
  }

  function inventoryRow(nap) {
    const row = document.createElement('tr');
    const title = create('div', 'row-title');
    title.append(create('strong', '', nap.name), create('span', '', nap.id));
    const pon = [nap.board, nap.pon].every((part) => part !== null && part !== undefined)
      ? `${nap.board}/${nap.pon}` : 'Sin PON';
    row.append(
      cell(title),
      cell(nap.oltName || nap.oltId),
      cell(pon),
      cell(badge(nap.status)),
      cell(number(nap.totalClients)),
      cell(`${number(nap.onlineClients)} online · ${number(nap.offlineClients)} offline`),
    );
    return row;
  }

  async function loadInventory() {
    return whileLoading('inventory', async () => {
      const params = queryFromForm(byId('inventory-filters'));
      params.set('page', String(state.pagination.inventory));
      params.set('limit', '50');
      setLiveStatus('Consultando inventario real…');
      try {
        const result = await api(`/inventory/naps?${params}`);
        byId('inventory-total').textContent = `${number(result.total)} NAPs`;
        const inventorySource = byId('inventory-source');
        inventorySource.className = result.isStale ? 'form-error' : 'updated-at';
        inventorySource.textContent = result.isStale
          ? `Fuente: api_zaSmaOlt · se muestran ${number(result.cachedNaps)} NAPs reales de la última caché persistida; Smart OLT aún no ha podido actualizarla.`
          : `Fuente: api_zaSmaOlt · ${number(result.cachedNaps)} NAPs disponibles${result.refreshedAt ? ` · actualizado ${date(result.refreshedAt)}` : ''}`;
        table(
          byId('inventory-table'),
          ['NAP', 'OLT', 'PON', 'Estado', 'Clientes', 'Conexión'],
          result.data.map(inventoryRow),
          'No hay NAPs que coincidan con los filtros.',
        );
        renderFilterSummary('inventory-filters', 'inventory-filter-summary', 'inventory');
        renderPagination('inventory-pagination', 'inventory', result);
        setConnection('En línea');
      } catch (error) { showViewError(error, 'No fue posible consultar api_zaSmaOlt.'); }
    });
  }

  function alertRow(alert) {
    const row = document.createElement('tr');
    const title = create('div', 'row-title');
    title.append(create('strong', '', opticalStatus(alert.eventType)), create('span', '', alert.message || alert.externalEventId));
    row.append(cell(title), cell(badge(alert.severity, 'severity')), cell(badge(opticalStatus(alert.eventType))),
      cell(alert.source), cell(alert.oltExternalId || '—'), cell(date(alert.detectedAt)));
    return row;
  }

  async function loadAlerts() {
    return whileLoading('alerts', async () => {
      const params = queryFromForm(byId('alert-filters'));
      params.set('page', String(state.pagination.alerts));
      params.set('limit', '25');
      setLiveStatus('Actualizando alertas…');
      try {
        const result = await api(`/alerts?${params}`);
        byId('alerts-total').textContent = `${number(result.total)} recibidas`;
        table(byId('alerts-table'), ['Evento', 'Severidad', 'Estado óptico', 'Origen', 'OLT', 'Detectado'], result.data.map(alertRow), 'No se encontraron alertas');
        renderFilterSummary('alert-filters', 'alert-filter-summary', 'alerts');
        renderPagination('alerts-pagination', 'alerts', result);
        setConnection('En línea');
      } catch (error) { showViewError(error, 'No fue posible cargar las alertas.'); }
    });
  }

  function reportRow(report) {
    const row = document.createElement('tr');
    const title = create('div', 'row-title');
    title.append(create('strong', '', report.title), create('span', '', report.type.replaceAll('_', ' ')));
    row.append(cell(title), cell(report.format), cell(badge(report.status)), cell(date(report.generatedAt || report.createdAt)));
    const action = cell(undefined, 'action-cell');
    if (report.status === 'COMPLETED') {
      const download = create('button', 'table-button', 'Descargar');
      download.type = 'button';
      download.dataset.reportId = report.id;
      action.append(download);
    } else action.append(create('span', 'muted', report.status === 'FAILED' ? 'Falló' : 'En proceso'));
    row.append(action);
    return row;
  }

  async function loadReports() {
    try {
      const result = await api('/reports?limit=30');
      table(byId('reports-table'), ['Reporte', 'Formato', 'Estado', 'Generado', ''], result.data.map(reportRow), 'Aún no hay reportes');
    } catch (error) { showViewError(error, 'No fue posible cargar los reportes.'); }
  }

  function barRow(label, value, max) {
    const row = create('div', 'bar-row');
    row.append(create('span', '', label.replaceAll('_', ' ')));
    const track = document.createElement('progress');
    track.className = 'bar-track';
    track.max = max || 1;
    track.value = value;
    row.append(track, create('strong', '', number(value)));
    return row;
  }

  async function loadAnalytics() {
    try {
      const [incidents, customers, availability] = await Promise.all([
        api('/statistics/incidents'), api('/statistics/customers'), api('/statistics/availability'),
      ]);
      setMetric('analytics-incidents', number(incidents.totals.incidents));
      setMetric('analytics-resolved', `${number(incidents.totals.resolved)} resueltos · ${number(incidents.totals.active)} activos`);
      setMetric('analytics-customers', number(customers.totals.uniqueAffectedCustomers));
      setMetric('analytics-offline', `${number(customers.totals.currentlyOfflineCustomers)} actualmente offline`);
      setMetric('analytics-availability', `${Number(availability.availabilityPercentage || 0).toFixed(2)}%`);
      setMetric('analytics-downtime', `${minutes(availability.downtimeMinutes)} de indisponibilidad`);
      const barContainer = byId('severity-bars');
      clear(barContainer);
      const severities = incidents.bySeverity.filter((item) => item.count > 0);
      if (!severities.length) emptyState(barContainer, 'Sin incidentes en el período', 'La distribución aparecerá cuando lleguen alertas.');
      else {
        const max = Math.max(...severities.map((item) => item.count));
        severities.forEach((item) => barContainer.append(barRow(item.value, item.count, max)));
      }
      const oltContainer = byId('top-olts');
      clear(oltContainer);
      if (!incidents.byOlt.length) emptyState(oltContainer, 'Sin OLT con incidencias', 'No hay registros para el período seleccionado.');
      else incidents.byOlt.slice(0, 6).forEach((item) => {
        const row = create('div', 'simple-list-row');
        row.append(create('strong', '', item.key), create('span', '', `${number(item.incidents)} incidentes · ${number(item.affectedCustomers)} clientes`));
        oltContainer.append(row);
      });
    } catch (error) { showViewError(error, 'No fue posible cargar la analítica.'); }
  }

  function showIncidentPreview(id) {
    const incident = state.incidents.find((item) => item.id === id);
    if (!incident) return;
    state.previewIncident = incident;
    byId('incident-preview-code').textContent = incident.code;
    byId('incident-preview-title').textContent = incidentTitle(incident);
    const summary = byId('incident-preview-summary');
    clear(summary);
    const values = [
      ['Estado óptico', opticalStatus(incident.events?.[0]?.eventType)],
      ['Seguimiento', text(incident.status).replaceAll('_', ' ')],
      ['Severidad', incident.severity],
      ['OLT / PON', incidentLocation(incident)],
      ['Clientes afectados', number(incident.affectedCustomerCount)],
      ['Detectado', date(incident.detectedAt)],
    ];
    values.forEach(([label, value]) => {
      const card = create('div', 'detail-stat');
      const content = create('strong', '', value);
      if (label === 'OLT / PON') content.id = 'incident-preview-olt';
      card.append(create('span', '', label), content);
      summary.append(card);
    });
    byId('incident-preview-description').textContent = incident.description || 'Sin descripción adicional.';
    document.querySelectorAll('[data-preview-incident-id]').forEach((row) => row.classList.toggle('is-selected', row.dataset.previewIncidentId === id));
    // La vista rápida no debe interrumpir la tabla: se abre como panel lateral.
    if (!elements.previewDialog.open) elements.previewDialog.show();
    elements.app.classList.add('is-preview-open');
    if (incident.oltExternalId) void loadOltName(String(incident.oltExternalId));
  }

  async function showIncident(id) {
    elements.dialogCode.textContent = 'Cargando incidente…';
    elements.dialogTitle.textContent = 'Detalle del incidente';
    state.detailIncident = null;
    clear(elements.incidentDetail);
    clear(elements.incidentActions);
    if (!elements.dialog.open) elements.dialog.showModal();
    try {
      const [incident, timeline] = await Promise.all([
        api(`/incidents/${id}`), api(`/incidents/${id}/timeline`),
      ]);
      const listedIncident = state.incidents.find((item) => item.id === id);
      if (listedIncident?.events) incident.events = listedIncident.events;
      // Los registros anteriores al campo Caja NAP se enriquecen al abrirse.
      // Si la fuente no está disponible, se conserva el último impacto conocido.
      if (has('incident.update')) {
        try { await api(`/incidents/${id}/impact/refresh`, { method: 'POST' }); } catch { /* El detalle sigue disponible. */ }
      }
      const customers = await loadAllIncidentCustomers(id);
      state.detailIncident = incident;
      elements.dialogCode.textContent = incident.code;
      elements.dialogTitle.textContent = incidentTitle(incident);
      const summary = create('div', 'detail-summary');
      const values = [
        ['Estado', incident.status.replaceAll('_', ' ')], ['Severidad', incident.severity],
        ['Ubicación', incidentLocation(incident)],
        ['Clientes afectados', number(incident.affectedCustomerCount)],
      ];
      values.forEach(([label, value]) => {
        const card = create('div', 'detail-stat');
        const content = create('strong', '', value);
        if (label === 'Ubicación') content.id = 'incident-detail-olt';
        card.append(create('span', '', label), content);
        summary.append(card);
      });
      elements.incidentDetail.append(summary);
      if (incident.oltExternalId) void loadOltName(String(incident.oltExternalId));
      if (incident.description) {
        const section = create('section', 'detail-section');
        section.append(create('h3', '', 'Descripción'), create('p', 'muted', incident.description));
        elements.incidentDetail.append(section);
      }
      const customerSection = create('section', 'detail-section');
      customerSection.append(create('h3', '', `Clientes afectados (${number(customers.total)})`));
      if (!customers.data.length) customerSection.append(create('p', 'muted', 'Todavía no hay clientes asociados.'));
      else {
        const list = create('div', 'simple-list customer-nap-list');
        const previewLimit = 8;
        const customersByNap = new Map();
        customers.data.forEach((customer) => {
          const napName = text(customer.napName, 'Caja NAP no identificada');
          const group = customersByNap.get(napName) || [];
          group.push(customer);
          customersByNap.set(napName, group);
        });
        const customerRows = [];
        const napGroups = [];
        customersByNap.forEach((groupCustomers, napName) => {
          const group = create('section', 'customer-nap-group');
          group.append(create('h4', '', `Caja NAP: ${napName} (${number(groupCustomers.length)})`));
          const groupRows = groupCustomers.map((customer) => {
            const row = create('div', 'simple-list-row');
            row.append(create('strong', '', customer.customerName || customer.customerCode || customer.externalCustomerId),
              create('span', '', `${customer.currentStatus} · ${customer.onuSerial || 'sin ONU'}`));
            group.append(row);
            const entry = { row, index: customerRows.length };
            customerRows.push(entry);
            return entry;
          });
          napGroups.push({ group, rows: groupRows });
          list.append(group);
        });
        const setCustomerVisibility = (expanded) => {
          customerRows.forEach(({ row, index }) => { row.hidden = !expanded && index >= previewLimit; });
          napGroups.forEach(({ group, rows }) => { group.hidden = rows.every(({ row }) => row.hidden); });
        };
        setCustomerVisibility(false);
        customerSection.append(list);
        const actions = create('div', 'customer-list-actions');
        if (customers.data.length > previewLimit) {
          const toggle = create('button', 'button button--secondary', `Ver más clientes (${number(customers.data.length - previewLimit)})`);
          toggle.type = 'button';
          toggle.addEventListener('click', () => {
            const expanded = toggle.dataset.expanded === 'true';
            setCustomerVisibility(!expanded);
            toggle.dataset.expanded = String(!expanded);
            toggle.textContent = expanded ? `Ver más clientes (${number(customers.data.length - previewLimit)})` : 'Ver menos clientes';
          });
          actions.append(toggle);
        }
        const download = create('button', 'button button--primary', 'Descargar CSV');
        download.type = 'button';
        download.addEventListener('click', async () => {
          setButtonBusy(download, true, 'Descargar CSV');
          try {
            if (incident.oltExternalId) await loadOltName(String(incident.oltExternalId));
            downloadIncidentCustomersCsv(incident, customers.data);
          } finally { setButtonBusy(download, false, 'Descargar CSV'); }
        });
        actions.append(download);
        customerSection.append(actions);
      }
      elements.incidentDetail.append(customerSection);
      const timelineSection = create('section', 'detail-section');
      timelineSection.append(create('h3', '', 'Línea de tiempo'));
      const list = create('ol', 'timeline');
      timeline.slice(0, 12).forEach((entry) => {
        const item = document.createElement('li');
        item.append(create('strong', '', entry.title), create('span', '', `${entry.description || entry.eventType} · ${date(entry.createdAt)}`));
        list.append(item);
      });
      if (!timeline.length) timelineSection.append(create('p', 'muted', 'No hay eventos en la línea de tiempo.'));
      else timelineSection.append(list);
      elements.incidentDetail.append(timelineSection);
      renderIncidentActions(incident);
    } catch (error) {
      clear(elements.incidentDetail);
      elements.incidentDetail.append(create('p', 'form-error', messageFrom(error, '')));
    }
  }

  function renderIncidentActions(incident) {
    clear(elements.incidentActions);
    if (!has('incident.update') && !has('incident.resolve') && !has('incident.close')) return;
    const note = document.createElement('textarea');
    note.className = 'action-note'; note.placeholder = 'Nota opcional para la línea de tiempo'; note.maxLength = 2000;
    elements.incidentActions.append(note);
    const execute = (label, path, body = {}) => {
      const button = create('button', 'button button--secondary', label);
      button.type = 'button';
      button.addEventListener('click', async () => {
        setButtonBusy(button, true, label);
        try {
          await api(path, { method: 'POST', body: JSON.stringify({ ...body, note: note.value.trim() || undefined }) });
          showToast(`${label}: operación registrada.`);
          await showIncident(incident.id);
          refreshCurrentView();
        } catch (error) { showToast(messageFrom(error, ''), true); }
        finally { setButtonBusy(button, false, label); }
      });
      return button;
    };
    if (has('incident.update') && incident.status === 'DETECTED') elements.incidentActions.append(execute('Reconocer', `/incidents/${incident.id}/acknowledge`));
    if (has('incident.update')) {
      const select = document.createElement('select');
      select.className = 'action-select';
      ['INVESTIGATING', 'CONFIRMED', 'IN_PROGRESS', 'MONITORING', 'FALSE_POSITIVE'].forEach((status) => {
        const option = document.createElement('option'); option.value = status; option.textContent = status.replaceAll('_', ' '); select.append(option);
      });
      elements.incidentActions.append(select);
      elements.incidentActions.append(execute('Cambiar estado', `/incidents/${incident.id}/status`, { get status() { return select.value; } }));
      const refresh = execute('Actualizar impacto', `/incidents/${incident.id}/impact/refresh`);
      elements.incidentActions.append(refresh);
    }
    if (has('incident.resolve') && !['RESOLVED', 'CLOSED'].includes(incident.status)) elements.incidentActions.append(execute('Resolver', `/incidents/${incident.id}/resolve`));
    if (has('incident.close') && incident.status === 'RESOLVED') elements.incidentActions.append(execute('Cerrar', `/incidents/${incident.id}/close`));
  }

  async function generateReport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form));
    ['startDate', 'endDate'].forEach((field) => {
      if (data[field]) data[field] = new Date(`${data[field]}T00:00:00`).toISOString();
      else delete data[field];
    });
    if (!data.title) delete data.title;
    setButtonBusy(button, true, 'Generar reporte');
    try {
      await api('/reports/generate', { method: 'POST', body: JSON.stringify(data) });
      showToast('El reporte se está generando. Actualiza la tabla en unos segundos.');
      form.reset();
      loadReports();
    } catch (error) { showToast(messageFrom(error, ''), true); }
    finally { setButtonBusy(button, false, 'Generar reporte'); }
  }

  async function downloadReport(id, button) {
    setButtonBusy(button, true, 'Descargar');
    try {
      const response = await api(`/reports/${id}/download`, { raw: true });
      const blob = await response.blob();
      const filename = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || 'reporte';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = filename; document.body.append(link); link.click();
      link.remove(); URL.revokeObjectURL(link.href);
    } catch (error) { showToast(messageFrom(error, ''), true); }
    finally { setButtonBusy(button, false, 'Descargar'); }
  }

  function setConnection(label) { byId('connection-status').textContent = `● ${label}`; }

  function showViewError(error, fallback) {
    const message = error instanceof ApiError ? error.message : fallback;
    showToast(message, true);
    setConnection('Sin conexión');
  }

  async function login(event) {
    event.preventDefault();
    elements.loginError.hidden = true;
    const form = new FormData(elements.loginForm);
    const identity = String(form.get('identity') || '').trim();
    const password = String(form.get('password') || '');
    if (!identity || !password) {
      elements.loginError.textContent = 'Completa usuario o correo y contraseña antes de continuar.';
      elements.loginError.hidden = false;
      return;
    }
    setButtonBusy(elements.loginSubmit, true, 'Entrar al panel');
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ identity, password }) }, false);
      setSession(result);
      showApp();
    } catch (error) {
      elements.loginError.textContent = loginMessage(error);
      elements.loginError.hidden = false;
    } finally { setButtonBusy(elements.loginSubmit, false, 'Entrar al panel'); }
  }

  async function logout() {
    try { if (state.refreshToken) await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: state.refreshToken }) }, false); } catch { /* clear local session regardless */ }
    clearSession();
  }

  function bindEvents() {
    elements.loginForm.addEventListener('submit', login);
    elements.togglePassword.addEventListener('click', () => {
      const willShowPassword = elements.password.type === 'password';
      elements.password.type = willShowPassword ? 'text' : 'password';
      elements.togglePassword.textContent = willShowPassword ? 'Ocultar' : 'Mostrar';
      elements.togglePassword.setAttribute('aria-label', willShowPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
      elements.togglePassword.setAttribute('aria-pressed', String(willShowPassword));
      elements.password.focus();
    });
    elements.refreshView.addEventListener('click', refreshCurrentView);
    elements.autoRefresh.addEventListener('click', () => setAutoRefresh(!state.autoRefresh));
    elements.userMenu.addEventListener('click', () => {
      const visible = elements.userPopover.hidden;
      elements.userPopover.hidden = !visible;
      elements.userMenu.setAttribute('aria-expanded', String(visible));
    });
    byId('logout').addEventListener('click', logout);
    byId('incidents-table').addEventListener('click', (event) => {
      const button = event.target.closest('[data-incident-id]');
      if (button) {
        if (elements.previewDialog.open) elements.previewDialog.close();
        showIncident(button.dataset.incidentId);
        return;
      }
      const row = event.target.closest('[data-preview-incident-id]');
      if (row) showIncidentPreview(row.dataset.previewIncidentId);
    });
    byId('incidents-table').addEventListener('keydown', (event) => {
      if (!['Enter', ' '].includes(event.key) || event.target.closest('button')) return;
      const row = event.target.closest('[data-preview-incident-id]');
      if (!row) return;
      event.preventDefault();
      showIncidentPreview(row.dataset.previewIncidentId);
    });
    byId('close-preview').addEventListener('click', () => elements.previewDialog.close());
    elements.previewDialog.addEventListener('click', (event) => { if (event.target === elements.previewDialog) elements.previewDialog.close(); });
    elements.previewDialog.addEventListener('close', () => {
      state.previewIncident = null;
      elements.app.classList.remove('is-preview-open');
      document.querySelectorAll('[data-preview-incident-id]').forEach((row) => row.classList.remove('is-selected'));
    });
    byId('preview-open-detail').addEventListener('click', () => {
      const id = state.previewIncident?.id;
      elements.previewDialog.close();
      if (id) showIncident(id);
    });
    byId('preview-download-csv').addEventListener('click', async () => {
      const incident = state.previewIncident;
      if (!incident) return;
      const button = byId('preview-download-csv');
      setButtonBusy(button, true, 'Descargar CSV');
      try {
        if (incident.oltExternalId) await loadOltName(String(incident.oltExternalId));
        const customers = await loadAllIncidentCustomers(incident.id);
        downloadIncidentCustomersCsv(incident, customers.data || []);
      } catch (error) { showToast(messageFrom(error, ''), true); }
      finally { setButtonBusy(button, false, 'Descargar CSV'); }
    });
    byId('close-dialog').addEventListener('click', () => elements.dialog.close());
    elements.dialog.addEventListener('click', (event) => { if (event.target === elements.dialog) elements.dialog.close(); });
    document.addEventListener('click', (event) => {
      if (!elements.userPopover.hidden && !elements.userMenu.contains(event.target) && !elements.userPopover.contains(event.target)) {
        elements.userPopover.hidden = true;
        elements.userMenu.setAttribute('aria-expanded', 'false');
      }
    });
  }

  async function boot() {
    bindEvents();
    updateAutoRefreshControl();
    if (!state.accessToken) return;
    try {
      state.user = await api('/auth/me');
      elements.loginView.hidden = true;
      elements.app.hidden = false;
      displayUser();
      scheduleAutoRefresh();
      refreshCurrentView();
    } catch { clearSession(); }
  }

  void boot();
})();
