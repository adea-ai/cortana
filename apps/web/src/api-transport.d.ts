// The `?transport-test` specifier forces Bun to load a second, unmocked
// instance of `./api` so transport tests stay real after other suites register
// `mock.module('./api')`. TypeScript resolves it through this wildcard.
declare module '*?transport-test' {
  const apiTransportModule: typeof import('./api')
  export = apiTransportModule
}
