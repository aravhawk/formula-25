# Formula 25

Drive Max Verstappen’s No. 1 Oracle Red Bull Racing RB21 from the cockpit on all 24 circuits of the 2025 Formula 1 calendar. Standalone events and a saved drivers’ championship include 19 AI rivals and the six Sprint weekends.

## Run locally

Install Node.js 24 LTS and npm. The circuits, textures and fonts ship with the repository.

```sh
git clone https://github.com/aravhawk/formula-25.git
cd formula-25
npm ci
npm run dev
```

Open the local URL printed by Vite. Choose **First drive** to learn the controls or **Race** to line up on the grid. The game loads its assets over HTTP.

## Deploy to Vercel

Import the GitHub repository as a new Vercel project. Use the repository root, the **Vite** preset and Node.js **24.x**. The included configuration runs `npm ci`, builds with `npm run build` and serves `dist`. The app needs no API keys, server database or environment variables. Use the same production domain across releases so players keep access to their browser saves.

## Driving

Choose **First drive** for a guided solo run. The engineer follows your inputs through throttle, steering, braking and ERS deployment. You can replay it from the garage. Choose a venue and race distance. Start a Grand Prix from Verstappen’s 2025 grid slot or take a flying qualifying lap against the other drivers’ best recorded 2025 qualifying times. Sprint events use the 2025 Sprint grid. Championship progress saves after each classified race.

- W/A/S/D or arrows operate the pedals and steering.
- Q and E shift down and up. Paddle input selects manual mode. The pause menu can restore automatic shifting. At a standstill, R switches between reverse and first. Reverse is also available in the pause menu or by downshifting from first at a stop.
- Hold Shift to deploy ERS. Braking recovers energy.
- Hold Space for DRS. Enter an observed DRS zone within a second of another car from lap two. Qualifying allows free use within zones.
- B calls or cancels a pit stop. T selects the next compound. Pit entry, service and release are automatic once called.
- Full-distance Grands Prix require two dry tyre compounds. Monaco also requires two stops. The game applies a 30-second penalty for a missed requirement.
- Settings has traction control (Full, Medium, Off), anti-lock brakes and steering assist. With traction control off, too much throttle in a low gear spins the car. Lift and steer into the slide to catch it. With anti-lock off, a locked front axle will not turn.
- L toggles the racing line. F toggles fullscreen. Esc pauses. Touch and standard-mapping gamepads are supported. The Controls screen lists every binding, and H shows them in the cockpit. Menus respond to arrows, Enter and Esc, or a gamepad’s D-pad, A and B.

## Build and test the source

Use Node.js 22.12 or newer. Run these commands in the source directory.

    npm ci
    npm test
    npm run build
    npm start

The production preview listens on port 4173. The build in `dist` can also be served with `python3 -m http.server 8080 --directory dist`. The build writes `sw.js`, which caches every file for offline play.

## Data and simulation

GPS racing lines, elevation, sector splits and observed DRS usage come from 2025 OpenF1 sessions. Baku and Las Vegas use practice data. The 2025 racing line is registered to a geographic circuit map. Where the map diverges from the recorded layout the fit falls back toward the driven path. The AI pace envelope uses the recorded speed trace. Gear spacing is fitted to measured engine RPM per km/h. Topography uses AWS Terrain Tiles, with road-relative grading at the track edge. Each venue has a georeferenced 2025 Sentinel-2 mosaic and nearby OSM building envelopes. Building heights depend on map coverage. Roofs, facade finishes, grandstands, trees and kerbs are reconstructed. The graphics settings include adaptive, performance and ultra quality. Hardware WebGPU is preferred when a test frame presents successfully, with WebGL 2 and Canvas fallbacks. The full 3D paths use environment lighting, antialiasing, local shadow maps and rear-facing scene capture. The software path uses reduced geometry, adaptive resolution and projected mirrors. At high refresh rates, adaptive resolution targets an 8.33 ms frame. The HUD reports average presented fps and the 95th-percentile frame interval. Jolpica supplies the event calendar, driver rosters, grids and qualifying times. Rebuilding data is optional and requires Python, NumPy, SciPy, requests and Pillow. Run season.py before qualifying.py and sprints.py. Run landscape.py afterward to rebuild the surroundings with rasterio, pyproj, shapely and mapbox-vector-tile. The geographic data and imagery attribution is in public/licenses/landscape.txt.

The car is the RB21, the Red Bull Racing car that competed in 2025, entered as Max Verstappen’s No. 1. Handling resolves combined braking, traction and cornering forces at four contact patches. Split-surface braking can lock one front wheel and pull the car toward the higher-grip side. The 120 Hz simulation integrates tyre forces in four substeps and interpolates the view between physics ticks. The qualifying interval compares elapsed time with Verstappen’s recorded time at the same point on the circuit. Cars use swept contact checks and test the chassis against the rail at its actual angle. Fixed trackside objects and the rear-view camera use the rendered scene geometry on the 3D paths. Each tyre samples surface grip, rolling resistance and temperature. Impacts affect aero efficiency and pit service time. Vehicle forces, tyre loads, battery capacity, opponent behaviour, road widths, pit paths, trackside architecture and timing rules are approximations for interactive play. Races use dry conditions. Driver standings use Grand Prix and Sprint points with countback on Grand Prix results. Independent fan simulation.

- https://openf1.org/
- https://api.jolpi.ca/ergast/f1/2025.json
- https://global.honda/en/F1/machine/2025_RedBullRB21/

## Project layout

| Directory | Contents |
| --- | --- |
| `src/` | Simulation, rendering, input and menus |
| `public/season/` | Event grids, circuits, reference laps and mapped buildings |
| `public/assets/` | Cockpit artwork, fonts, textures and environment maps |
| `scripts/` | Optional data generation and local release launchers |
| `test/` | Regression tests and the reference driver |

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and bug reporting. Project code uses the [MIT license](LICENSE). Fonts, maps, datasets and third-party assets have their own [notices](public/licenses), including [circuit-specific imagery credits](public/licenses/landscape.txt).

Formula 25 is an independent fan project. Formula 1, team and driver marks belong to their respective owners.
