(() => {
  'use strict';

  const API = '/api/v1';
  const TOKEN_KEY = 'omniSentinel.accessToken';
  const REFRESH_KEY = 'omniSentinel.refreshToken';
  const AUTO_REFRESH_KEY = 'omniSentinel.dashboard.autoRefresh';
  const AUTO_REFRESH_INTERVAL_MS = 30_000;
  const LIVE_VIEWS = new Set(['overview', 'incidents', 'alerts']);
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
  };

  const byId = (id) => document.getElementById(id);
  const elements = {
    loginView: byId('login-view'), app: byId('app'), loginForm: byId('login-form'),
    loginError: byId('login-error'), loginSubmit: byId('login-submit'),
    password: byId('password'), togglePassword: byId('toggle-password'),
    sidebar: byId('sidebar'), menuBackdrop: byId('menu-backdrop'),
    pageTitle: byId('page-title'), userName: byId('user-name'), userRole: byId('user-role'),
    userInitials: byId('user-initials'), userEmail: byId('user-email'),
    userPermissions: byId('user-permissions'), userPopover: byId('user-popover'),
    userMenu: byId('user-menu'), toast: byId('toast'), dialog: byId('incident-dialog'),
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
    closeMenu();
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
    byId('report-generator').hidden = !has('report.generate');
  }

  function showApp() {
    elements.loginView.hidden = true;
    elements.app.hidden = false;
    displayUser();
    scheduleAutoRefresh();
    navigate('overview');
  }

  function create(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function clear(node) { node.replaceChildren(); }

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

  function incidentRow(incident, compact = false) {
    const row = document.createElement('tr');
    const title = create('div', 'row-title');
    title.append(create('strong', '', incident.code), create('span', '', incident.title));
    row.append(cell(title), cell(badge(incident.severity, 'severity')),
      cell(badge(incident.status)), cell(incident.oltExternalId || 'Sin OLT'));
    if (!compact) row.append(cell(number(incident.affectedCustomerCount)), cell(date(incident.detectedAt)));
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
      if (document.hidden || elements.dialog.open || !LIVE_VIEWS.has(state.currentView)) return;
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
    const loaders = {
      overview: loadOverview, inventory: loadInventory, incidents: loadIncidents,
      alerts: loadAlerts, reports: loadReports, analytics: loadAnalytics,
    };
    loaders[state.currentView]?.();
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
    search: 'Buscar', status: 'Estado', oltId: 'OLT', oltExternalId: 'OLT',
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
        const [summary, incidents] = await Promise.all([
          api('/dashboard/summary'), api('/incidents?limit=6'),
        ]);
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
        const priority = incidents.data
          .filter((item) => ['DISASTER', 'CRITICAL', 'MAJOR'].includes(item.severity))
          .slice(0, 5);
        table(byId('priority-incidents'), ['Incidente', 'Severidad', 'Estado', 'OLT', ''], priority.map((item) => incidentRow(item, true)), 'No hay incidentes prioritarios');
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
    return whileLoading('incidents', async () => {
      const form = byId('incident-filters');
      const params = queryFromForm(form, ['localSearch']);
      params.set('page', String(state.pagination.incidents));
      params.set('limit', '25');
      setLiveStatus('Actualizando incidentes…');
      try {
        const result = await api(`/incidents?${params}`);
        const search = String(new FormData(form).get('localSearch') || '').trim().toLowerCase();
        state.incidents = result.data.filter((item) => !search || `${item.code} ${item.title}`.toLowerCase().includes(search));
        byId('incidents-total').textContent = `${number(result.total)} encontrados`;
        table(byId('incidents-table'), ['Incidente', 'Severidad', 'Estado', 'OLT', 'Afectados', 'Detectado', ''], state.incidents.map((item) => incidentRow(item)), 'No se encontraron incidentes');
        renderFilterSummary('incident-filters', 'incident-filter-summary', 'incidents');
        renderPagination('incidents-pagination', 'incidents', result);
        setConnection('En línea');
      } catch (error) { showViewError(error, 'No fue posible cargar los incidentes.'); }
    });
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
    title.append(create('strong', '', alert.eventType), create('span', '', alert.message || alert.externalEventId));
    row.append(cell(title), cell(badge(alert.severity, 'severity')), cell(badge(alert.status)),
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
        table(byId('alerts-table'), ['Evento', 'Severidad', 'Estado', 'Origen', 'OLT', 'Detectado'], result.data.map(alertRow), 'No se encontraron alertas');
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

  async function showIncident(id) {
    elements.dialogCode.textContent = 'Cargando incidente…';
    elements.dialogTitle.textContent = 'Detalle del incidente';
    clear(elements.incidentDetail);
    clear(elements.incidentActions);
    if (!elements.dialog.open) elements.dialog.showModal();
    try {
      const [incident, timeline, customers] = await Promise.all([
        api(`/incidents/${id}`), api(`/incidents/${id}/timeline`), api(`/incidents/${id}/customers?limit=8`),
      ]);
      elements.dialogCode.textContent = incident.code;
      elements.dialogTitle.textContent = incident.title;
      const summary = create('div', 'detail-summary');
      const values = [
        ['Estado', incident.status.replaceAll('_', ' ')], ['Severidad', incident.severity],
        ['Ubicación', [incident.oltExternalId, incident.ponIdentifier].filter(Boolean).join(' · ') || 'Sin asignar'],
        ['Clientes afectados', number(incident.affectedCustomerCount)],
      ];
      values.forEach(([label, value]) => {
        const card = create('div', 'detail-stat');
        card.append(create('span', '', label), create('strong', '', value));
        summary.append(card);
      });
      elements.incidentDetail.append(summary);
      if (incident.description) {
        const section = create('section', 'detail-section');
        section.append(create('h3', '', 'Descripción'), create('p', 'muted', incident.description));
        elements.incidentDetail.append(section);
      }
      const customerSection = create('section', 'detail-section');
      customerSection.append(create('h3', '', `Clientes afectados (${number(customers.total)})`));
      if (!customers.data.length) customerSection.append(create('p', 'muted', 'Todavía no hay clientes asociados.'));
      else {
        const list = create('div', 'simple-list');
        customers.data.forEach((customer) => {
          const row = create('div', 'simple-list-row');
          row.append(create('strong', '', customer.customerName || customer.customerCode || customer.externalCustomerId),
            create('span', '', `${customer.currentStatus} · ${customer.onuSerial || 'sin ONU'}`));
          list.append(row);
        });
        customerSection.append(list);
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
          loadOverview(); loadIncidents();
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

  const titles = { overview: 'Resumen', inventory: 'Inventario real', incidents: 'Incidentes', alerts: 'Alertas', reports: 'Reportes', analytics: 'Analítica y SLA' };
  function viewFromHash() {
    const view = window.location.hash.replace(/^#/, '');
    return Object.hasOwn(titles, view) ? view : 'overview';
  }

  function navigate(view, fromHash = false) {
    if (!Object.hasOwn(titles, view)) view = 'overview';
    if (!fromHash && window.location.hash !== `#${view}`) {
      window.location.hash = view;
      return;
    }
    state.currentView = view;
    document.querySelectorAll('.view').forEach((section) => section.classList.toggle('is-visible', section.id === view));
    document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
    elements.pageTitle.textContent = titles[view];
    closeMenu();
    updateAutoRefreshControl();
    refreshCurrentView();
  }

  function openMenu() { elements.sidebar.classList.add('is-open'); elements.menuBackdrop.hidden = false; }
  function closeMenu() { elements.sidebar.classList.remove('is-open'); elements.menuBackdrop.hidden = true; }

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
    document.querySelectorAll('.nav-link').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
    document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.go)));
    byId('open-menu').addEventListener('click', openMenu); byId('close-menu').addEventListener('click', closeMenu); elements.menuBackdrop.addEventListener('click', closeMenu);
    elements.refreshView.addEventListener('click', refreshCurrentView);
    elements.autoRefresh.addEventListener('click', () => setAutoRefresh(!state.autoRefresh));
    elements.userMenu.addEventListener('click', () => {
      const visible = elements.userPopover.hidden;
      elements.userPopover.hidden = !visible;
      elements.userMenu.setAttribute('aria-expanded', String(visible));
    });
    byId('logout').addEventListener('click', logout);
    byId('incident-filters').addEventListener('submit', (event) => { event.preventDefault(); state.pagination.incidents = 1; loadIncidents(); });
    byId('clear-incident-filters').addEventListener('click', () => { byId('incident-filters').reset(); state.pagination.incidents = 1; loadIncidents(); });
    byId('inventory-filters').addEventListener('submit', (event) => { event.preventDefault(); state.pagination.inventory = 1; loadInventory(); });
    byId('clear-inventory-filters').addEventListener('click', () => { byId('inventory-filters').reset(); state.pagination.inventory = 1; loadInventory(); });
    byId('alert-filters').addEventListener('submit', (event) => { event.preventDefault(); state.pagination.alerts = 1; loadAlerts(); });
    byId('clear-alert-filters').addEventListener('click', () => { byId('alert-filters').reset(); state.pagination.alerts = 1; loadAlerts(); });
    byId('report-form').addEventListener('submit', generateReport);
    byId('incidents-table').addEventListener('click', (event) => { const button = event.target.closest('[data-incident-id]'); if (button) showIncident(button.dataset.incidentId); });
    byId('priority-incidents').addEventListener('click', (event) => { const button = event.target.closest('[data-incident-id]'); if (button) showIncident(button.dataset.incidentId); });
    byId('reports-table').addEventListener('click', (event) => { const button = event.target.closest('[data-report-id]'); if (button) downloadReport(button.dataset.reportId, button); });
    byId('close-dialog').addEventListener('click', () => elements.dialog.close());
    elements.dialog.addEventListener('click', (event) => { if (event.target === elements.dialog) elements.dialog.close(); });
    window.addEventListener('hashchange', () => navigate(viewFromHash(), true));
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
      navigate(viewFromHash(), true);
    } catch { clearSession(); }
  }

  void boot();
})();
