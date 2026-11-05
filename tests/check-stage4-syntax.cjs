const fs = require('fs');
const ts = require('typescript');
const path = require('path');
for (const file of ['src/sync/sync.service.ts','src/admissions/admission-number.service.ts']) {
  const full = path.resolve(__dirname, '..', file);
  const source = fs.readFileSync(full, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
    fileName: full, reportDiagnostics: true,
  });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    for (const d of errors) console.error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));
    process.exitCode = 1;
  } else console.log('PASS TS syntax:',file);
}
const admission=fs.readFileSync(path.resolve(__dirname,'../src/admissions/admission-number.service.ts'),'utf8');
if (admission.includes('Math.max(sequence.nextSequence, config.nextSequence)')) throw new Error('Stale branch counter issue not fixed');
const sync=fs.readFileSync(path.resolve(__dirname,'../src/sync/sync.service.ts'),'utf8');
for (const string of ['assertStudentCapacityInTransaction(tx, accountId, studentId)', 'accountId_studentId: { accountId, studentId }','STUDENT_QUOTA_ENFORCEMENT']) if(!sync.includes(string)) throw new Error('Missing safeguard '+string);
console.log('PASS static safeguard inspection');
