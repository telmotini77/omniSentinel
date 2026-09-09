import type { ReportDocument } from '../report-document';

const dateFormatter = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '—')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function date(value: Date | null | undefined): string {
  return value ? dateFormatter.format(value) : '—';
}

function customerRows(document: ReportDocument): string {
  if (!document.customers.length)
    return '<tr><td colspan="6">No hay clientes asociados para los filtros seleccionados.</td></tr>';
  return document.customers
    .map(
      (customer) => `<tr>
        <td>${escapeHtml(customer.customerCode)}</td>
        <td>${escapeHtml(customer.customerName)}</td>
        <td>${escapeHtml(customer.onuSerial)}</td>
        <td>${escapeHtml(customer.servicePlan)}</td>
        <td>${escapeHtml(customer.currentStatus)}</td>
        <td>${customer.confirmedAffected ? 'Sí' : 'No'}</td>
      </tr>`,
    )
    .join('');
}

function timelineRows(document: ReportDocument): string {
  if (!document.timeline.length)
    return '<tr><td colspan="3">Sin eventos de timeline.</td></tr>';
  return document.timeline
    .map(
      (entry) => `<tr>
        <td>${date(entry.createdAt)}</td>
        <td>${escapeHtml(entry.title)}</td>
        <td>${escapeHtml(entry.description)}</td>
      </tr>`,
    )
    .join('');
}

export function renderIncidentReportHtml(document: ReportDocument): string {
  const incident = document.incident;
  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 16mm 12mm 18mm; }
        * { box-sizing: border-box; }
        body { color: #172033; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.45; }
        header { border-bottom: 3px solid #0f766e; display: flex; justify-content: space-between; margin-bottom: 18px; padding-bottom: 12px; }
        .brand { color: #0f766e; font-size: 22px; font-weight: 700; }
        .caption { color: #667085; font-size: 10px; margin-top: 3px; }
        h1 { font-size: 19px; margin: 0 0 4px; }
        h2 { border-bottom: 1px solid #cbd5e1; color: #0f766e; font-size: 13px; margin: 20px 0 9px; padding-bottom: 4px; }
        .grid { display: grid; gap: 8px; grid-template-columns: repeat(4, 1fr); }
        .card { background: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 5px; padding: 9px; }
        .card b { color: #0f766e; display: block; font-size: 16px; }
        .meta { background: #f8fafc; border-radius: 5px; display: grid; grid-template-columns: 1fr 1fr; padding: 10px; }
        .meta div { margin: 3px 0; }
        .meta span { color: #667085; display: inline-block; min-width: 116px; }
        table { border-collapse: collapse; font-size: 8.5px; width: 100%; }
        th { background: #0f766e; color: white; font-weight: 600; text-align: left; }
        th, td { border: 1px solid #dbe3ea; padding: 5px; vertical-align: top; }
        tr:nth-child(even) { background: #f8fafc; }
        .footer { bottom: 0; color: #667085; font-size: 8px; position: fixed; text-align: center; width: 100%; }
        .severity { background: #fee2e2; color: #991b1b; font-weight: 700; padding: 3px 6px; }
      </style>
    </head>
    <body>
      <header>
        <div><div class="brand">omniSentinel</div><div class="caption">api_incidentReport · Informe operacional</div></div>
        <div style="text-align:right"><b>${escapeHtml(document.type.replaceAll('_', ' '))}</b><br/>${date(document.generatedAt)}</div>
      </header>
      <h1>${escapeHtml(document.title)}</h1>
      ${
        incident
          ? `<div class="meta">
        <div><span>Código</span><b>${escapeHtml(incident.code)}</b></div>
        <div><span>Severidad</span><b class="severity">${escapeHtml(incident.severity)}</b></div>
        <div><span>Estado</span>${escapeHtml(incident.status)}</div>
        <div><span>Tipo</span>${escapeHtml(incident.type)}</div>
        <div><span>OLT / PON</span>${escapeHtml(incident.oltExternalId)} / ${escapeHtml(incident.ponIdentifier)}</div>
        <div><span>Detección</span>${date(incident.detectedAt)}</div>
        <div><span>Causa probable</span>${escapeHtml(incident.rootCause)} (${incident.rootCauseConfidence}%)</div>
        <div><span>Duración</span>${incident.durationSeconds} segundos</div>
      </div>`
          : '<p>Resumen operacional para los filtros y período seleccionados.</p>'
      }
      <h2>Resumen ejecutivo</h2>
      <div class="grid">
        <div class="card"><b>${document.summary.totalIncidents}</b>Incidentes incluidos</div>
        <div class="card"><b>${document.summary.activeIncidents}</b>Incidentes activos</div>
        <div class="card"><b>${document.summary.affectedCustomers}</b>Clientes afectados</div>
        <div class="card"><b>${document.summary.offlineOnus}</b>ONU offline</div>
      </div>
      <h2>Clientes afectados</h2>
      <table><thead><tr><th>Código</th><th>Nombre</th><th>ONU</th><th>Plan</th><th>Estado</th><th>Confirmado</th></tr></thead><tbody>${customerRows(document)}</tbody></table>
      <h2>Timeline</h2>
      <table><thead><tr><th>Fecha</th><th>Evento</th><th>Detalle</th></tr></thead><tbody>${timelineRows(document)}</tbody></table>
      <div class="footer">Generado por api_incidentReport · ${date(document.generatedAt)}</div>
    </body>
  </html>`;
}
