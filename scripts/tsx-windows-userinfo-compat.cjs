if (process.platform === 'win32' && typeof process.geteuid !== 'function') {
  const username = process.env.USERNAME || 'user';
  process.geteuid = () => username;

  // tsx starts child Node processes in watch mode, so preload this fallback there too.
  const preloadPath = __filename.replace(/\\/g, '/');
  if (!process.env.NODE_OPTIONS?.includes(preloadPath)) {
    const preloadOption = `--require="${preloadPath}"`;
    process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, preloadOption]
      .filter(Boolean)
      .join(' ');
  }
}
