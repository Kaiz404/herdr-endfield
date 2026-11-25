// Resolves `import ... from "herdr"` to herdr-stub.mjs (module.register).
export async function resolve(specifier, context, next) {
  if (specifier === "herdr") return { url: new URL("./herdr-stub.mjs", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
