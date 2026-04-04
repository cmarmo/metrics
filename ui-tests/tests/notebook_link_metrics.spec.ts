import { expect, test } from '@jupyterlab/galata';
import type { APIRequestContext } from '@playwright/test';

/**
 * Don't load JupyterLab webpage before running the tests.
 * This is required to ensure we capture all log messages.
 */
test.use({ autoGoto: false });

const COMMAND_EXECUTED =
  'https://schema.notebook.link/metrics/command-executed/v1';
const RUNTIME_ERROR = 'https://schema.notebook.link/metrics/runtime-error/v1';

const clearEvents = async (request: APIRequestContext) => {
  const response = await request.delete('/api/metrics-capture');
  expect(response.ok()).toBeTruthy();
};

const readEvents = async (request: APIRequestContext) => {
  const response = await request.get('/api/metrics-capture');
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    events: Array<{
      data: { metrics?: { command?: string; description?: string } };
      schema_id: string;
    }>;
  };
};

test('should collect command executed metrics on the backend', async ({
  page,
  request
}) => {
  const command = 'apputils:change-theme';

  await clearEvents(request);
  await page.goto();
  await page.waitForFunction(() =>
    Boolean((window as any).jupyterapp?.commands)
  );

  await page.evaluate(
    async ({ command, theme }) => {
      await (window as any).jupyterapp.commands.execute(command, { theme });
    },
    { command, theme: 'JupyterLab Dark' }
  );

  await expect
    .poll(async () => {
      const { events } = await readEvents(request);
      const match = events.find(
        event =>
          event.schema_id === COMMAND_EXECUTED &&
          event.data.metrics?.command === command
      );
      return match?.data.metrics?.command ?? null;
    })
    .toBe(command);
});

test('should collect runtime error metrics on the backend', async ({
  page,
  request
}) => {
  const description = 'metrics ui test runtime error';

  await clearEvents(request);
  await page.goto();
  await page.waitForFunction(() => Boolean((window as any).jupyterapp));

  await page.evaluate(message => {
    window.dispatchEvent(new ErrorEvent('error', { message }));
  }, description);

  await expect
    .poll(async () => {
      const { events } = await readEvents(request);
      const match = events.find(
        event =>
          event.schema_id === RUNTIME_ERROR &&
          event.data.metrics?.description === description
      );
      return match?.data.metrics?.description ?? null;
    })
    .toBe(description);
});
