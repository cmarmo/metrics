/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

module.exports = {
  ...baseConfig,
  webServer: {
    command: 'jlpm start',
    gracefulShutdown: {
      signal: 'SIGINT',
      timeout: 5000
    },
    url: 'http://localhost:8888/lab',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI
  }
};
