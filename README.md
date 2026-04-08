# `notebook-metrics`

A JupyterLab/JupyterLite extension for Jupyter UI metrics.

If you are integrating the package for the first time, start with the
[onboarding guide](./ONBOARDING.md).

## Usage

This package contains four Jupyter extensions.

### Jupyter server extension

The Jupyter server extension, `notebook_metrics` registers event schemas for four types of metrics events:

1. `CommandExecuted` events (`anonymous`: `false`, `sensitivity`: `"high"`), which are emitted every time the command registry executes a command
2. `CurrentChanged` events (`anonymous`: `false`, `sensitivity`: `"high"`), which are emitted every time a non-`null` new value is emitted by the application shell's `currentChanged` signal
3. `JupyterError` events (`anonymous`: `false`, `sensitivity`: `"high"`), which are emitted every time notebook cell execution fails with a Jupyter error
4. `RuntimeError` events (`anonymous`: `false`, `sensitivity`: `"high"`), which are emitted every time an `error` or `unhandledpromiserejection` listener on the application `window` is invoked

### JupyterLab/JupyterLite dispatcher extension

The front-end dispatcher extension listens for registered events and dispatches them based on filter and user settings to a collector extension. It also provides a single API point of entry, a function called `register(...)`, which registers an event schema URL and an optional broadcast source that emits metrics events for dispatch. In cases where no broadcast is necessary (e.g., where a UI component automatically emits metrics events), the `source` argument can be omitted.

### JupyterLab/JupyterLite collector extension

The collector extension is the client that receives metrics emissions. The default implementation is a no-op and in production, the extension `notebook-metrics:collector` needs to be disabled and replaced with a custom extension that `provides` an `IMetrics.ICollector` for the dispatcher extension to use. The `interface` for a collector is minimal:

```ts
interface ICollector {
  collect: (schema: string, event: IMetrics.Event) => Promise<void>;
}
```

An extension that replaces the default no-op collector would have this shape:

```ts
const collector: JupyterFrontEndPlugin<IMetrics.ICollector> = {
  id: 'my-collector-extension',
  description: 'A collector for metrics emissions',
  provides: IMetrics.ICollector,
  activate: (): IMetrics.ICollector => ({
    collect: async (schema: string, event: IMetrics.Event) => {
      // Save emission here...
    }
  })
};
```

### JupyterLab/JupyterLite broadcasts extension

This frontend extension registers the four metrics event types that ship with this package.

### Configuration

This plugin can be configured in two ways to allow a user to disable or limit
emissions: the JupyterLab user settings system or using the JupyterLab
`PageConfig` object.

There are several ways to populate `PageConfig`, (which is an object literal
loaded in the HTML page that hosts JupyterLab). As a convenience for JupyterLab
deployment, this package supports setting a path to a YAML file as an
environment variable, `NOTEBOOK_METRICS_OVERRIDE`.

The contents of an override file are the same keys that exist in the user
settings (`dispatcher.json`) and **if set, they always take precedence over user
settings**.

Here is an example override file for the most permissive emission settings:

```yml
anonymous: false
disabled: false
excluded:
  'https://schema.notebook.link/metrics/command-executed/v1': false
  'https://schema.notebook.link/metrics/current-changed/v1': false
  'https://schema.notebook.link/metrics/jupyter-error/v1': false
  'https://schema.notebook.link/metrics/runtime-error/v1': false
sensitivity: high
```

## Requirements

- Python >= 3.9
- JupyterLab >= 4.0.0,<5

## Install

```bash
python -m pip install notebook-metrics
```

## Uninstall

To remove the extension, execute:

```bash
python -m pip uninstall notebook-metrics
```

## Contributing

### Development install

Note: You will need Node.js 24.x to build the extension package and run the
frontend tooling.

This repo uses `jlpm`, JupyterLab's pinned Yarn wrapper.

```bash
# Clone the repo to your local environment
# Change directory to the metrics directory
# Install package in development mode
python -m pip install -e ".[test]"
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).

By default, the `jlpm build` command generates the source maps for this extension to make it easier to debug using the browser dev tools. To also generate source maps for the JupyterLab core extensions, you can run the following command:

```bash
jupyter lab build --minimize=False
```

### Development uninstall

```bash
python -m pip uninstall notebook-metrics
```

In development mode, you will also need to remove the symlink created by `jupyter labextension develop`
command. To find its location, you can run `jupyter labextension list` to figure out where the `labextensions`
folder is located. Then you can remove the symlink named `notebook-metrics` within that folder.

### Testing the extension

#### Python tests

Install the editable package with test extras, then run:

```sh
python -m pip install -e ".[test]"
pytest -vv -r ap --cov notebook_metrics
```

#### Frontend tests

This extension is using [Jest](https://jestjs.io/) for JavaScript code testing.

To execute them, execute:

```sh
jlpm install
jlpm test
```

#### Integration tests

This extension uses [Playwright](https://playwright.dev/docs/intro) for the integration tests (aka user level tests).
More precisely, the JupyterLab helper [Galata](https://github.com/jupyterlab/jupyterlab/tree/master/galata) is used to handle testing the extension in JupyterLab.

More information are provided within the [ui-tests](./ui-tests/README.md) README.

The local flow that is currently validated in this repo is:

```sh
jlpm build:prod
cd ui-tests
jlpm install
jlpm playwright install
PLAYWRIGHT_HTML_OPEN=never jlpm playwright test
cd ..
```

### Packaging the extension

See [RELEASE](RELEASE.md)
