import mysql from 'mysql2/promise';
async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1', port: 9030, user: 'root', password: '',
    connectTimeout: 10000
  });

  // Query distinct service_instance_id values (OpenClaw instances)
  try {
    const [instances] = await conn.query('SELECT DISTINCT service_instance_id FROM opsRobot.otel_metrics_sum WHERE service_instance_id IS NOT NULL LIMIT 20');
    console.log('=== OpenClaw Instances ===');
    console.log(JSON.stringify(instances, null, 2));
  } catch(e) { console.error('instances error:', e.message); }

  // Check for LLM-related attributes
  try {
    const [llmAttrs] = await conn.query("SELECT DISTINCT get_json_string(attributes, '$.llm') as llm FROM opsRobot.otel_metrics_sum WHERE get_json_string(attributes, '$.llm') IS NOT NULL LIMIT 20");
    console.log('\n=== LLM attributes ===');
    console.log(JSON.stringify(llmAttrs, null, 2));
  } catch(e) { console.error('llm error:', e.message); }

  // Check for agent-related attributes
  try {
    const [agentAttrs] = await conn.query("SELECT DISTINCT get_json_string(attributes, '$.agent') as agent FROM opsRobot.otel_metrics_sum WHERE get_json_string(attributes, '$.agent') IS NOT NULL LIMIT 20");
    console.log('\n=== Agent attributes ===');
    console.log(JSON.stringify(agentAttrs, null, 2));
  } catch(e) { console.error('agent error:', e.message); }

  // Check for openclaw sub-keys
  try {
    const [ocKeys] = await conn.query("SELECT DISTINCT get_json_string(attributes, '$.openclaw') as oc FROM opsRobot.otel_metrics_sum WHERE get_json_string(attributes, '$.openclaw') IS NOT NULL LIMIT 20");
    console.log('\n=== OpenClaw attributes ===');
    console.log(JSON.stringify(ocKeys.slice(0, 5), null, 2));
  } catch(e) { console.error('openclaw error:', e.message); }

  // Sample attributes
  try {
    const [attrs] = await conn.query("SELECT DISTINCT attributes FROM opsRobot.otel_metrics_sum WHERE attributes IS NOT NULL LIMIT 10");
    console.log('\n=== Sample Attributes ===');
    for (const row of attrs) {
      console.log(JSON.stringify(row.attributes));
    }
  } catch(e) { console.error('attrs error:', e.message); }

  // Gauge table
  try {
    const [gInstances] = await conn.query('SELECT DISTINCT service_instance_id FROM opsRobot.otel_metrics_gauge WHERE service_instance_id IS NOT NULL LIMIT 20');
    console.log('\n=== Gauge Instances ===');
    console.log(JSON.stringify(gInstances, null, 2));

    const [gMetricNames] = await conn.query('SELECT DISTINCT metric_name FROM opsRobot.otel_metrics_gauge LIMIT 30');
    console.log('\n=== Gauge Metric Names ===');
    console.log(JSON.stringify(gMetricNames, null, 2));
  } catch(e) { console.error('gauge error:', e.message); }

  await conn.end();
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
