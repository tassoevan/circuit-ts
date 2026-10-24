# CircuitJS1

<p align="center">
  <img src="war/icon128.png" alt="CircuitJS1 logo" width="128" height="128">
  <br>
  <em>Electronic Circuit Simulator in the Browser</em>
</p>

## Introduction

CircuitJS1 is an electronic circuit simulator that runs in the browser. It was originally written by Paul Falstad as a Java Applet. It was adapted by Iain Sharp to run in the browser using GWT.

For a hosted version of the application see:

* Paul's Page: [http://www.falstad.com/circuit/](http://www.falstad.com/circuit/)
* Iain's Page: [http://lushprojects.com/circuitjs/](http://lushprojects.com/circuitjs/)
* Development Branch Version: [https://pfalstad.github.io/circuitjs1/circuitjs.html](https://pfalstad.github.io/circuitjs1/circuitjs.html)

Thanks to: Edward Calver for 15 new components and other improvements; Rodrigo Hausen for file import/export and many other UI improvements; J. Mike Rollins for the Zener diode code; Julius Schmidt for the spark gap code and some examples; Dustin Soodak for help with the user interface improvements; Jacob Calvert for the T Flip Flop; Ben Hayden for scope spectrum; Thomas Reitinger, Krystian Sławiński, Usevalad Khatkevich, Lucio Sciamanna, Mauro Hemerly Gazzani, J. Miguel Silva, and Franck Viard for translations; Andre Adrian for improved emitter coupled oscillator; Felthry for many examples; Colin Howell for code improvements. LZString (c) 2013 pieroxy.

## Building the web application

The web application is written in TypeScript and built with [Vite](https://vitejs.dev/). You'll need [Node.js](https://nodejs.org/) (which includes npm) — no Java, GWT, or Eclipse required.

The repository is an npm workspaces monorepo: the web application lives in `ts/`. Run `npm install` once from the repository root to install dependencies for every workspace; the root `dev`, `build`, `preview` and `test` scripts delegate to `ts/`.

### Quick start

```bash
npm install
npm run dev
```

This starts a local dev server with live reload at `http://localhost:5173/circuitjs.html` — edit any `.ts` file and your browser updates automatically.

### Building for production

```bash
npm run build
```

This type-checks the project and produces a production build in `ts/dist/`. To preview the built output locally:

```bash
npm run preview
```

### Running the tests

```bash
npm test
```

Besides the unit tests, this replays every circuit in `auto-tests/` headless and compares its scope traces with the ones recorded in the file (`ts/AutoTests.test.ts`). To add a test, save a circuit with scopes and append a `<test len="..."/>` tag (the simulated time to run, in seconds) before `</cir>`, then record its expected traces. After an intended change in simulator behavior, re-record the affected circuits the same way:

```bash
cd ts
RECORD_AUTO_TESTS=1 npx vitest run AutoTests -t td4.txt
```

### Quick local test

The included `test.sh` script builds the app and starts a local server in one step:

```bash
./test.sh          # builds and serves on port 8000
./test.sh 9000     # use a custom port
```

This opens `http://localhost:8000/circuitjs.html` in your browser automatically (macOS). Requires Python 3 for the HTTP server.

## Deployment of the web application

Run `./dist.sh <version-number>` from the repository root, e.g. `./dist.sh 81`. This builds the TypeScript app and produces a self-contained, versioned deployment in `site/`:

```
site/
  circuitjs81.html   - full page version of the application
  iframe.html        - see notes below
  jsinterface.html    - JS interface example, see "Embedding" below
  service-worker.js   - offline caching for this version
  ++ circuitjs81 (directory)
   +- JS/CSS bundle files
   +- circuits (directory, containing example circuits)
   +- locale (directory, containing translations)
   +- font (directory, containing icon fonts)
   +- setuplist.txt (index in to example circuit directory)
```

Copy everything under `site/` to your web server. Running `./dist.sh` again with a different version number produces an independent deployment with its own file names and cache, so old versions keep working at their own `circuitjsNUM.html` URL alongside a newly deployed one.

* Customize the "iframe.html" file to include any branding you want in the right hand panel of the application.
* The optional file "shortrelay.php" (found in `war/`, not produced by the build) is a server-side script to act as a relay to a URL shortening service to avoid cross-origin problems with a purely client solution. Copy it alongside `circuitjsNUM.html` if you want the "Create short URL" feature; otherwise it's simply unused. You may want to customize it for your site.
* If you wish to enable dropbox loading and saving, a dropbox API app-key is needed. This should be added as a script tag in `ts/circuitjs.html` before building. If this is not included the relevant features will be disabled.

For a quick unversioned build (used for local testing), use `./dist-offline.sh` instead, which produces the same `site/` layout without the version-numbered rename — the entry point stays `site/circuitjs.html`.

## Embedding

You can link to the full page version of the application using the link shown above.

If you want to embed the application in another page then use an iframe with the src being the full-page version.

You can add query parameters to link to change the applications startup behaviour. The following are supported:
```
.../circuitjs.html?cct=<string> // Load the circuit from the URL (like the # in the Java version)
.../circuitjs.html?ctz=<string> // Load the circuit from compressed data in the URL
.../circuitjs.html?startCircuit=<filename> // Loads the circuit named "filename" from the "Circuits" directory
.../circuitjs.html?startCircuitLink=<URL> // Loads the circuit from the specified URL. CURRENTLY THE URL MUST BE A DROPBOX SHARED FILE OR ANOTHER URL THAT SUPPORTS CORS ACCESS FROM THE CLIENT
.../circuitjs.html?euroResistors=true // Set to true to force "Euro" style resistors. If not specified the resistor style will be based on the user's browser's language preferences
.../circuitjs.html?IECGates=true // Set to true to force IEC logic gates. If not specified the gate style will be based on the user's browser's language preferences
.../circuitjs.html?usResistors=true // Set to true to force "US" style resistors. If not specified the resistor style will be based on the user's browser's language preferences
.../circuitjs.html?whiteBackground=<true|false>
.../circuitjs.html?conventionalCurrent=<true|false>
.../circuitjs.html?running=<true|false> // Start the app without the simulation running, default true
.../circuitjs.html?hideSidebar=<true|false> // Hide the sidebar, default false
.../circuitjs.html?hideMenu=<true|false> // Hide the menu, default false
.../circuitjs.html?editable=<true|false> // Allow circuit editing, default true
.../circuitjs.html?positiveColor=%2300ff00 // change positive voltage color (rrggbb)
.../circuitjs.html?negativeColor=%23ff0000 // change negative voltage color
.../circuitjs.html?selectColor=%2300ffff // change selection color
.../circuitjs.html?currentColor=%23ffff00 // change current color
.../circuitjs.html?mouseWheelEdit=<true|false> // allow changing of values by mouse wheel
.../circuitjs.html?mouseMode=<item> // set the initial mouse mode.  can also initially perform other UI actions, such as opening the 'about' menu, running 'importfromlocalfile', etc.
.../circuitjs.html?hideInfoBox=<true|false>
```
The simulator can also interface with your javascript code.  See [ts/jsinterface.html](http://www.falstad.com/circuit/jsinterface.html) for an example.

## License

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
