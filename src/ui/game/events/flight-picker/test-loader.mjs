// Compatibility for the existing data-URL presenter harness and Node 22.
import { URL } from 'node:url';
export async function resolve(specifier, context, next) {
  if (
    context.parentURL?.startsWith('data:') &&
    specifier.startsWith('./flight-picker/')
  )
    return {
      url:
        new URL(specifier.slice('./flight-picker/'.length), import.meta.url)
          .href + (specifier.endsWith('.css') ? '' : '.ts'),
      shortCircuit: true,
    };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.endsWith('.css'))
    return { format: 'module', source: '', shortCircuit: true };
  return next(url, context);
}
