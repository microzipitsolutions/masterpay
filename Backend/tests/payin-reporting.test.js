const test = require("node:test");
const assert = require("node:assert/strict");
const report = require("../payinReporting");

test("canonical Pay-In scope binds owner, tenant, dates and filters", () => {
  const scope = report.buildPayinScope({
    adminId: 7, clientId: 3, startDate: "2026-08-01", endDate: "2026-08-31",
    agentId: 11, merchantId: 12, status: "Approved,Pending", sourceKey: "external:9",
  });
  assert.deepEqual(scope.values, [7, 3, 11, 12, "2026-08-01", "2026-08-31", "Approved", "Pending", "external:9"]);
  assert.match(scope.whereSql, /t\.created_by_admin_id = \$1/);
  assert.match(scope.whereSql, /t\.client_id = \$2/);
  assert.match(scope.whereSql, /Asia\/Kolkata/);
  assert.match(scope.whereSql, /t\.status IN \(\$7,\$8\)/);
});

test("canonical successful amount statuses document existing dashboard rule", () => {
  assert.deepEqual(report.PAYIN_AMOUNT_STATUSES, ["Approved", "Agent Verified"]);
  assert.equal(report.successfulStatusSql("p"), "p.status IN ('Approved','Agent Verified')");
});

test("source mapping prioritizes external assignment then merchant then client", () => {
  assert.match(report.sourceKeySql(), /WHEN x\.id IS NOT NULL/);
  assert.match(report.sourceKeySql(), /WHEN m\.id IS NOT NULL/);
  assert.match(report.sourceKeySql(), /WHEN c\.id IS NOT NULL/);
  assert.match(report.sourceNameSql(), /Unassigned\/API/);
});
