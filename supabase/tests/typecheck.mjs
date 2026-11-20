import ts from 'typescript'
import { resolve } from 'node:path'
import process from 'node:process'
import console from 'node:console'

// Use the already-installed SDK for a Docker/Deno-free strict typecheck.
// The only virtual file declares the Deno runtime surface used by these functions.
const virtual = resolve('supabase/tests/thailand-deno-runtime.d.ts')
const schemaProbe = resolve('supabase/tests/thailand-schema-probe.ts')
const options = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  types: ['node'],
}
const host = ts.createCompilerHost(options)
const readFile = host.readFile.bind(host)
const fileExists = host.fileExists.bind(host)
host.fileExists = (file) => file === virtual || file === schemaProbe || fileExists(file)
host.readFile = (file) => file === virtual
  ? `declare const Deno: {
      env: { get(name: string): string | undefined };
      serve(handler: (request: Request) => Response | Promise<Response>): void;
    };`
  : file === schemaProbe
    ? `import { createClient } from '@supabase/supabase-js';
       import type { Database } from '../../src/lib/database.types';
       import type { Attachment } from '../../src/lib/models';
       const db = createClient<Database>('https://example.invalid','public-key');
       async function verifySchema() {
         const response = await db.from('thailand_attachments').insert({
           trip_id:'trip', name:'sample.pdf', path:'path', mime_type:'application/pdf', size:1
         }).select().maybeSingle();
         if (response.data) {
           const row: Attachment = response.data;
           await db.from('thailand_attachments').update({status:'ready'})
             .eq('id',row.id).eq('version',row.version).select().maybeSingle();
         }
         await db.rpc('thailand_initialize_trip',{
           p_title:'Test',p_start_date:'2000-01-01',p_end_date:'2000-01-02',p_timezone:'UTC'
         });
       }`
    : readFile(file)
host.resolveModuleNames = (names, containingFile) => names.map((name) =>
  ts.resolveModuleName(name.startsWith('npm:@supabase/supabase-js@')
    ? '@supabase/supabase-js' : name, containingFile, options, host).resolvedModule)
const files = [
  virtual,
  schemaProbe,
  'src/lib/database.types.ts',
  'supabase/functions/_shared/http.ts',
  'supabase/functions/thailand-shared-login/index.ts',
  'supabase/functions/thailand-delete-content/index.ts',
]
const program = ts.createProgram(files, options, host)
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (file) => file,
    getNewLine: () => '\n',
  }))
  process.exitCode = 1
} else {
  console.log('Backend strict typecheck passed (installed SDK, virtual Deno runtime).')
}
