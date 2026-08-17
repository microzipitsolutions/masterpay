require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const pool = require("./db");
const report = require("./payinReporting");

(async () => {
  const [startDate, endDate] = process.argv.slice(2);
  const owners = await pool.query("SELECT DISTINCT created_by_admin_id AS id FROM transactions WHERE created_by_admin_id IS NOT NULL ORDER BY 1");
  for (const { id } of owners.rows) {
    const scope = report.buildPayinScope({ adminId: id, startDate, endDate });
    const success = report.successfulStatusSql("t");
    const key = report.sourceKeySql();
    const joins = report.PAYIN_REPORT_JOINS;
    const overall = await pool.query(`SELECT COUNT(*)::INT total_count, COUNT(*) FILTER (WHERE ${success})::INT successful_count, COALESCE(SUM(t.amount) FILTER (WHERE ${success}),0) amount FROM transactions t ${joins} WHERE ${scope.whereSql}`, scope.values);
    const breakdown = await pool.query(`SELECT ${key} source, COUNT(*)::INT total_count, COUNT(*) FILTER (WHERE ${success})::INT successful_count, COALESCE(SUM(t.amount) FILTER (WHERE ${success}),0) amount FROM transactions t ${joins} WHERE ${scope.whereSql} GROUP BY ${key} ORDER BY amount DESC`, scope.values);
    const sum = breakdown.rows.reduce((a, r) => ({ total_count: a.total_count + Number(r.total_count), successful_count: a.successful_count + Number(r.successful_count), amount: a.amount + Number(r.amount) }), { total_count: 0, successful_count: 0, amount: 0 });
    const expected = overall.rows[0];
    const reconciles = Number(expected.total_count) === sum.total_count && Number(expected.successful_count) === sum.successful_count && Number(expected.amount) === sum.amount;
    console.log(JSON.stringify({ admin_id: id, start_date: startDate || null, end_date: endDate || null, dashboard: expected, breakdown_sum: sum, breakdown: breakdown.rows, reconciles }, null, 2));
    if (!reconciles) process.exitCode = 1;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
