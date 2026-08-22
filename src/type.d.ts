declare module 'virtual:config' {
  const Config: typeof import('./site.config').default
  export default Config
}
