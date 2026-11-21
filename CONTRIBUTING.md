# Contributing to Formula 25

Use Node.js 24 LTS. Run `npm ci` and `npm run dev` from the repository root. Run `npm test` and `npm run build` before opening a pull request. The build is self-contained. Python is only needed to regenerate season data.

For handling or contact issues, include the venue, position on the lap, assists, inputs and a repeatable driving scenario. For rendering issues, include the browser, graphics mode, renderer and cockpit frame timing. Report bugs or discuss changes in the [issue tracker](https://github.com/aravhawk/formula-25/issues).

Keep changes focused. Cover race rules, physics or persistence changes with a regression test when possible. Submit the lockfile for dependency changes. Leave build output, download caches and secrets out of commits. Include upstream notices, source and redistribution terms for contributed data or artwork.

## Optional data rebuild

Install the Python libraries listed under **Data and simulation** in the README into a virtual environment. Run these commands from the repository root.

```sh
python scripts/season.py
python scripts/qualifying.py
python scripts/sprints.py
python scripts/landscape.py
node scripts/outlines.mjs
```

The generators fetch from upstream services and cache downloads under `data/`. Check changed venue data and attribution before sending a pull request.
