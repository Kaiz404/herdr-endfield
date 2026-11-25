// A stand-in for Herdr's `herdr` module, so a test can import a mod file that uses it. The test
// sets globalThis.herdrStub = {home, exec(command, args)}; every call goes there.
export const appHome = () => globalThis.herdrStub.home;
export const exec = async (command, args, options) => globalThis.herdrStub.exec(command, args, options);
export const checking = () => false;
export const watchFolder = () => Object.assign(new Promise(() => {}), { cancel() {} });
