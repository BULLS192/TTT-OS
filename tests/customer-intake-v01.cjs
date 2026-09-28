const fs=require('fs');
const assert=require('assert');

const app=fs.readFileSync('app.js','utf8');
const manager=fs.readFileSync('customer-intakes-v01.js','utf8');
const publicApp=fs.readFileSync('intake/app.js','utf8');
const publicHtml=fs.readFileSync('intake/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20260928085927_customer_intake_qr_v1.sql','utf8');\nconst anonOnly=fs.readFileSync('supabase/migrations/20260928090736_customer_intake_rpc_anon_only.sql','utf8');

new Function(app);
new Function(manager);
new Function(publicApp);

assert(app.includes('/customer-intakes-v01.js'), 'TTT OS must load the customer intake manager.');
assert(app.includes('qrcodejs@1.0.0'), 'QR dependency must be pinned.');
assert(publicHtml.includes('id="customerIntakeForm"'), 'Public intake form is missing.');
assert(publicHtml.includes('Submit to TTT'), 'Public intake submit action is missing.');
assert(publicApp.includes("rpc('submit_customer_intake'"), 'Public intake must submit through the scoped RPC.');
assert(manager.includes("from('customer_intakes')"), 'Internal queue must read customer_intakes.');
assert(manager.includes("status:'converted'"), 'Intake conversion status update is missing.');
assert(manager.includes("postgres_changes"), 'Realtime intake subscription is missing.');
assert(migration.includes('alter table public.customer_intakes enable row level security'), 'RLS must be enabled.');
assert(migration.includes('revoke all on table public.customer_intakes from anon, authenticated'), 'Table privileges must be explicit.');
assert(migration.includes('grant execute on function public.submit_customer_intake(jsonb,text,uuid) to anon, authenticated'), 'Initial scoped intake submit RPC grant is missing.');\nassert(anonOnly.includes('revoke execute on function public.submit_customer_intake(jsonb,text,uuid) from authenticated'), 'Signed-in users should not retain public intake RPC execution.');
assert(![app,manager,publicApp,publicHtml,migration].some(s=>/service[_-]?role|sb_secret_/i.test(s)), 'No server secret may be exposed in customer intake files.');

console.log('Customer intake regression checks passed.');
