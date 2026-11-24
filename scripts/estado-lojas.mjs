// Mostra o que cada loja diz sobre as versões da extensão (aprovada, em revisão...).
// O Edge não tem endpoint de consulta; veja o Partner Center.
import { listaFirefox, statusChrome } from './publicar-loja.mjs';

try {
  const c = await statusChrome(process.env);
  console.log('Chrome publicada :', JSON.stringify(c.publishedItemRevisionStatus ?? null));
  console.log('Chrome em revisão:', JSON.stringify(c.submittedItemRevisionStatus ?? null));
  console.log(
    'Chrome upload    :',
    c.lastAsyncUploadState,
    '| removida:',
    c.takenDown,
    '| aviso:',
    c.warned,
  );
} catch (e) {
  console.log('Chrome: erro', String(e).slice(0, 300));
}
try {
  const f = await listaFirefox(process.env);
  for (const v of f.results ?? []) {
    console.log(
      `Firefox ${v.version} canal=${v.channel} arquivo=${v.file?.status} revisada=${v.reviewed ?? 'não'}`,
    );
  }
} catch (e) {
  console.log('Firefox: erro', String(e).slice(0, 300));
}
console.log('Edge: sem API de consulta (Partner Center).');
