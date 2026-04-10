# Making a new release of notebook-metrics

This repository publishes:

- the PyPI package `notebook-metrics`
- the npm package `notebook-metrics`
- the Python import package `notebook_metrics`

This repository is set up for releases through the
[Jupyter Releaser](https://github.com/jupyter-server/jupyter_releaser).
Manual publishing still works, but the automated flow should be the default.

## Current Release Shape

The checked-in workflows currently assume this setup:

- `Step 1: Prep Release` uses the repository `GITHUB_TOKEN`.
- `Step 2: Publish Release` runs in the GitHub environment named `release`.
- `Step 2: Publish Release` creates a GitHub App token from:
  - environment variable `APP_ID`
  - environment secret `APP_PRIVATE_KEY`
- npm publishing uses the repository or environment secret `NPM_TOKEN`.
- PyPI publishing is expected to use PyPI trusted publishing through the
  workflow `publish-release.yml` and the GitHub environment `release`.

If you want a different release shape, update the workflows first and then
update this file to match.

## One-Time Setup

Before the first real release, make sure these external settings exist.

### GitHub

Create a GitHub environment named `release` and add:

- environment variable `APP_ID`
- environment secret `APP_PRIVATE_KEY`

The private key must belong to a GitHub App installed on this repository with
contents write access.

### PyPI

Create the PyPI project `notebook-metrics`, then add a trusted publisher that
points to:

- owner: `notebook-link`
- repository: `metrics`
- workflow: `publish-release.yml`
- environment: `release`

The publish workflow already requests `id-token: write`, so no `PYPI_TOKEN` is
needed if trusted publishing is configured.

### npm

Create the npm package `notebook-metrics`, then add an automation token as
`NPM_TOKEN`.

This repository does not currently use npm trusted publishing. If you switch to
that later, update `publish-release.yml` and this document together.

## Manual release

These commands assume the existing `metrics` mamba environment is already
active.

### Python package

This extension can be distributed as Python packages. All Python packaging
instructions live in `pyproject.toml`.

Before generating a package, install the release tools:

```bash
python -m pip install build twine hatch
```

Bump the version using `hatch`. By default this will create a tag.
See the docs on [hatch-nodejs-version](https://github.com/agoose77/hatch-nodejs-version#semver) for details.

```bash
hatch version <new-version>
```

Make sure to clean up all the development files before building the package:

```bash
jlpm clean:all
```

You could also clean up the local git repository:

```bash
git clean -dfX
```

To create a Python source package (`.tar.gz`) and the binary package (`.whl`) in the `dist/` directory, do:

```bash
python -m build
```

> `python setup.py sdist bdist_wheel` is deprecated and will not work for this package.

The published project name is `notebook-metrics`, but the generated wheel and
sdist filenames use the normalized Python form `notebook_metrics`.

Then to upload the package to PyPI, do:

```bash
twine upload dist/*
```

### NPM package

To publish the frontend part of the extension as a NPM package, do:

```bash
npm login
npm publish --access public
```

## Automated releases with the Jupyter Releaser

This repository is already wired for Jupyter Releaser. The missing pieces are
the external GitHub, PyPI, and npm settings described above.

Here is a summary of the steps to cut a new release:

- Go to the Actions panel
- Run the "Step 1: Prep Release" workflow
- Check the draft changelog
- Run the "Step 2: Publish Release" workflow

For the first release, prefer a prerelease version first so registry and
permission issues are discovered before a stable tag.

> [!NOTE]
> Check out the [workflow documentation](https://jupyter-releaser.readthedocs.io/en/latest/get_started/making_release_from_repo.html)
> for more information.

## Publishing to `conda-forge`

If the package is not on conda forge yet, check the documentation to learn how to add it: https://conda-forge.org/docs/maintainer/adding_pkgs.html

Otherwise a bot should pick up the new version publish to PyPI, and open a new PR on the feedstock repository automatically.
