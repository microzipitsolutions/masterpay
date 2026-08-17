// Canonical Admin Pay-In reporting rules.
// Amount/commission: Approved and the legacy matched-bank-proof status Agent Verified.
// Transaction count: every status. All consumers add the same owner/date/agent/merchant filters.
const PAYIN_AMOUNT_STATUSES = ["Approved", "Agent Verified"];

function buildPayinScope({ adminId, clientId, startDate, endDate, agentId, merchantId, status, sourceKey } = {}) {
  const values = [];
  const where = [];
  const add = (sql, value) => { values.push(value); where.push(sql.replace("?", `$${values.length}`)); };

  add("t.created_by_admin_id = ?", Number(adminId));
  if (clientId) add("t.client_id = ?", Number(clientId));
  if (agentId) add("t.agent_id = ?", Number(agentId));
  if (merchantId) add("t.merchant_id = ?", Number(merchantId));
  if (startDate) add("DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= ?", startDate);
  if (endDate) add("DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') <= ?", endDate);
  if (status) {
    const statuses = String(status).split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length) {
      const slots = statuses.map((value) => { values.push(value); return `$${values.length}`; });
      where.push(`t.status IN (${slots.join(",")})`);
    }
  }
  if (sourceKey) add(`${sourceKeySql()} = ?`, sourceKey);
  return { whereSql: where.join(" AND "), values };
}

function sourceKeySql() {
  return `CASE
    WHEN x.id IS NOT NULL THEN 'external:' || x.id::text
    WHEN m.id IS NOT NULL THEN 'merchant:' || m.id::text
    WHEN c.id IS NOT NULL THEN 'client:' || c.id::text
    ELSE 'unassigned'
  END`;
}

function sourceNameSql() {
  return `COALESCE(NULLIF(x.external_merchant_name,''), NULLIF(m.name,''),
    CASE WHEN c.id IS NOT NULL THEN COALESCE(NULLIF(c.company_name,''), NULLIF(c.domain_name,''), 'Client ' || c.id::text) || ' API' END,
    'Unassigned/API')`;
}

const PAYIN_REPORT_JOINS = `
  LEFT JOIN merchants m ON m.id = t.merchant_id
  LEFT JOIN trustpay_external_merchant_assignments x ON x.id = t.external_assignment_id
  LEFT JOIN clients c ON c.id = t.client_id`;

function successfulStatusSql(alias = "t") {
  return `${alias}.status IN ('Approved','Agent Verified')`;
}

module.exports = { PAYIN_AMOUNT_STATUSES, PAYIN_REPORT_JOINS, buildPayinScope, sourceKeySql, sourceNameSql, successfulStatusSql };
