// Simulator regression tests: replays each recorded circuit in fixtures/auto-tests/ headless and compares
// its scope traces against the ones saved in the file.  A recorded circuit is a normal saved
// circuit with extra tags before </cir>:
//   <test len="..."/>                   how long to run (simulated seconds)
//   <switchevent t="..." en="..."/>     toggle switch element en at time t
//   <scopedata si pi en v u sp ts>...   expected samples of scope si, plot pi, from t=0
//
// To re-record the expected traces after an intended change in simulator behavior:
//   RECORD_AUTO_TESTS=1 npx vitest run AutoTests -t td4.txt

import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DOMParser, XMLSerializer, DOMImplementation } from "@xmldom/xmldom";

const testDir = path.resolve(__dirname, "fixtures/auto-tests");
const record = !!process.env.RECORD_AUTO_TESTS;

// a sample matches if it's within 0.1% of its own value or of the trace's peak (full scale)
const TOLERANCE = 1e-3;

// ---- headless environment: real XML parsing via xmldom, inert stubs for UI widgets ----

function inert(): any {
    const f: any = () => inert();
    return new Proxy(f, {
        get: (_t, p) => p === Symbol.toPrimitive ? () => "" : inert(),
        set: () => true,
        apply: () => inert(),
        construct: () => inert(),
    });
}

// anything else the elements reach for (widgets, sliders, ...) gets an inert stub
function withStubs(o: any): any {
    return new Proxy(o, { get: (t, p) => (p in t) ? t[p] : inert() });
}

// a check item / scrollbar whose state sticks
function check(state: boolean): any {
    return { state, getState() { return this.state; }, setState(b: boolean) { this.state = b; } };
}
function bar(value: number): any {
    return { value, getValue() { return this.value; }, setValue(v: number) { this.value = v; } };
}

let M: any;

beforeAll(async () => {
    (globalThis as any).DOMParser = DOMParser;
    (globalThis as any).XMLSerializer = XMLSerializer;
    (globalThis as any).Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
    // XML documents are real (subcircuit models are built in them); HTML widgets are not
    (globalThis as any).document = new Proxy({ implementation: new DOMImplementation() } as any,
        { get: (t, p) => (p in t) ? t[p] : inert() });
    (globalThis as any).window = globalThis;

    // imported after the fake window exists: Adjustable registers itself on window when it loads
    M = Object.assign({},
        await import("./CircuitElm"), await import("./SimulationManager"), await import("./CirSim"),
        await import("./ElementFactory"), await import("./CircuitXMLDeserializer"), await import("./Scope"),
        await import("./DiodeModel"), await import("./TransistorModel"), await import("./MosfetModel"),
        await import("./RelayModel"), await import("./CustomLogicModel"), await import("./Color"),
        await import("./HookRegistry"), await import("./registerElements"), await import("./Adjustable"),
        await import("./UIManager"), await import("./Rectangle"));
});

// just enough of CirSim for the simulator and scopes
function makeApp(): any {
    const elmList: any[] = [];
    const app: any = {
        elmList, postDrawList: [], badConnectionList: [], adjustables: [], contextStack: [],
        showResistanceInVoltageSources: true, dumpMatrix: false, stopMessage: null,
        dcAnalysisFlag: false, simRunning: true, minFrameRate: 10, analyzeFlag: false,
        menus: {
            showValuesCheckItem: check(true), powerCheckItem: check(false), euroResistorCheckItem: check(false),
            euroGatesCheckItem: check(false), showOhmCheckItem: check(false), smallGridCheckItem: check(false),
            voltsCheckItem: check(true), dotsCheckItem: check(false),
        },
        ui: withStubs({ elmList, steps: 0, lastFrameTime: 0, subcircuitStack: [],
                        currentBar: bar(50), powerBar: bar(50), speedBar: bar(117) }),
        hintType: -1, hintItem1: 0, hintItem2: 0, autoDCOnReset: false,
        getElm: (n: number) => n >= 0 && n < elmList.length ? elmList[n] : null,
        locateElm: (e: any) => elmList.indexOf(e),
        mouse: withStubs({ scopePlotRoles: new Set(), highlightedNode: null, dragElm: null,
                           transformX: (x: number) => x, transformY: (y: number) => y }),
        scopeManager: withStubs({
            canDelayWireProcessing: () => false, scopeCount: 0, scopes: [], scopeSelected: -1,
            scopeMenuIsSelected: () => false,
            timeStep() {
                for (let i = 0; i !== this.scopeCount; i++)
                    this.scopes[i].timeStep();
            },
        }),
        random: { nextInt: () => 0, nextDouble: () => 0.5 },
        setStopElm: (_ce: any, msg: string | null) => { app.stopMessage = msg; },
        setSimRunning: (b: boolean) => { app.simRunning = b; },
        simIsRunning: () => app.simRunning,
        getIterCount: () => 1, isPrintable: () => false,
        onTimeStep: () => app.scopeManager.timeStep(), deleteSliders: () => {},
        // as in UIManager.setGrid()/CirSim.snapGrid()
        gridSize: 16,
        setGrid() { app.gridSize = app.menus.smallGridCheckItem.getState() ? 8 : 16; },
        snapGrid: (x: number) => (x + app.gridSize / 2 - 1) & ~(app.gridSize - 1),
        register: M.CirSim.prototype.register,
    };
    return withStubs(app);
}

interface ScopeData { si: number; pi: number; values: number[] }
interface TestCircuit { len: number; switchEvents: { t: number; en: number }[]; scopeData: ScopeData[] }

let elementsRegistered = false;

// load the circuit, as CircuitLoader/CircuitXMLDeserializer do, plus the test tags
function loadCircuit(app: any, sim: any, text: string): TestCircuit {
    const root = new DOMParser().parseFromString(text, "text/xml").documentElement as any;
    const ra = (a: string, d: number) => root.hasAttribute(a) ? parseFloat(root.getAttribute(a)) : d;
    const flags = ra("f", 0);
    app.menus.smallGridCheckItem.setState((flags & 2) != 0);
    app.setGrid();
    app.autoDCOnReset = (flags & 128) != 0;
    sim.adjustTimeStep = (flags & 64) !== 0;
    sim.maxTimeStep = sim.timeStep = ra("ts", 5e-6);
    sim.minTimeStep = ra("mts", 50e-12);
    sim.solverType = ra("st", 0);
    M.CircuitElm.voltageRange = ra("vr", 5);

    const test: TestCircuit = { len: -1, switchEvents: [], scopeData: [] };
    const xml = new M.CircuitXMLDeserializer(app);
    for (let i = 0; i < root.childNodes.length; i++) {
        const elem = root.childNodes[i];
        if (elem.nodeType !== 1)
            continue;
        xml.currentXmlElement = elem;
        const attr = (a: string) => parseFloat(elem.getAttribute(a));
        switch (elem.tagName) {
        case "dm": M.DiodeModel.undumpModelXml(xml); continue;
        case "tm": M.TransistorModel.undumpModelXml(xml); continue;
        case "mm": M.MosfetModel.undumpModelXml(xml); continue;
        case "rlm": M.RelayModel.undumpModelXml(xml); continue;
        case "clm": M.CustomLogicModel.undumpModelXml(xml); continue;
        case "ccm": M.HookRegistry.undumpSubcircuitModel?.(xml); continue;
        case "adj": M.Adjustable.undumpXml(xml, app); continue;
        case "o": {
            const sc = new M.Scope(app, sim);
            sc.undumpXml(xml);
            if (sc.position < 0)
                sc.position = app.scopeManager.scopeCount;
            app.scopeManager.scopes[app.scopeManager.scopeCount++] = sc;
            continue;
        }
        case "test": test.len = attr("len"); continue;
        case "switchevent": test.switchEvents.push({ t: attr("t"), en: attr("en") }); continue;
        case "scopedata":
            test.scopeData.push({ si: attr("si"), pi: attr("pi"), values: elem.textContent.split(",").map(Number) });
            continue;
        }
        if (elem.getAttribute("x") == null)
            continue;
        const className = M.CirSim.xmlDumpTypeMap.get(elem.tagName);
        if (className == null)
            throw new Error("unrecognized xml element: " + elem.tagName);
        const elm = M.ElementFactory.create(className, 0, 0);
        xml.currentElm = elm;
        elm.undumpXml(xml);
        elm.setPositionFromXml(elem);
        app.elmList.push(elm);
    }
    // as in CircuitLoader.finishReadCircuit()
    for (let i = 0; i < app.adjustables.length; i++)
        if (!app.adjustables[i].createSlider(app))
            app.adjustables.splice(i--, 1);
    return test;
}

// run the circuit for the test's length, as TestManager did in the Java app
function runTest(text: string) {
    const app = makeApp();
    app.ui.getCircuitBounds = M.UIManager.prototype.getCircuitBounds;
    M.UIManager.theUI = app.ui;
    const sim = new M.SimulationManager(app);
    app.sim = sim;
    M.CircuitElm.app = app;
    M.CircuitElm.sim = sim;
    M.CircuitElm.initClass(app, sim);
    M.CirSim.theApp = app;
    M.CircuitElm.positiveColor ??= M.Color.green;
    if (!elementsRegistered) {
        M.registerElements();
        elementsRegistered = true;
    }

    const test = loadCircuit(app, sim, text);
    if (test.len < 0)
        throw new Error("no <test> tag");

    // as UIManager.resetAction() followed by the next frame's analyze
    sim.resetTime();
    sim.resetNodes();
    for (const ce of app.elmList)
        ce.reset();
    sim.analyzeCircuit();
    sim.preStampAndStampCircuit();
    // wide enough that every scope keeps the whole run
    for (let i = 0; i !== app.scopeManager.scopeCount; i++)
        app.scopeManager.scopes[i].setRect(new M.Rectangle(0, 0, 1024, 128));

    // freeze the clock: with no time passing, each runCircuit(true) call does exactly one timestep
    const now = vi.spyOn(Date, "now").mockReturnValue(1e12);
    sim.lastIterTime = 1;
    try {
        let nextEvent = 0;
        while (sim.t < test.len - 1e-12) {
            sim.runCircuit(true);
            if (app.stopMessage != null)
                throw new Error("simulation stopped: " + app.stopMessage);
            let toggled = false;
            for (; nextEvent < test.switchEvents.length && test.switchEvents[nextEvent].t <= sim.t + 1e-12; nextEvent++) {
                app.getElm(test.switchEvents[nextEvent].en).toggle();
                toggled = true;
            }
            if (toggled) {
                // what the app's next frame does after needAnalyze()
                sim.analyzeCircuit();
                if (sim.needsStamp)
                    sim.preStampAndStampCircuit();
            }
        }
    } finally {
        now.mockRestore();
    }
    return { app, sim, test };
}

// the plot's samples from t=0 to now, oldest first
function plotSamples(sim: any, plot: any): number[] {
    const spc = plot.scopePointCount;
    const ts = sim.maxTimeStep * plot.scopePlotSpeed;
    const tStart = sim.t - ts * spc;
    const values: number[] = [];
    for (let i = 0; i !== spc; i++)
        if (tStart + ts * i >= 0)
            values.push(plot.maxValues[(i + plot.ptr) & (spc - 1)]);
    return values;
}

// replace the file's <scopedata> tags with the current traces
function recordScopeData(file: string, text: string, app: any, sim: any): void {
    let tags = "";
    for (let si = 0; si !== app.scopeManager.scopeCount; si++) {
        const plots = app.scopeManager.scopes[si].plots;
        for (let pi = 0; pi !== plots.length; pi++) {
            const plot = plots[pi];
            const en = plot.elm == null ? -1 : app.locateElm(plot.elm);
            if (en < 0 || plot.minValues == null)
                continue;
            tags += `  <scopedata si="${si}" pi="${pi}" en="${en}" v="${plot.value}" u="${plot.units}" ` +
                `sp="${plot.scopePlotSpeed}" ts="${sim.maxTimeStep * plot.scopePlotSpeed}">` +
                plotSamples(sim, plot).join(",") + "</scopedata>\n";
        }
    }
    text = text.replace(/^\s*<scopedata[^]*?<\/scopedata>\n/gm, "").replace("</cir>", tags + "</cir>");
    fs.writeFileSync(file, text);
}

describe("auto-tests", () => {
    for (const name of fs.readdirSync(testDir).filter(f => f.endsWith(".txt")).sort()) {
        it(name, () => {
            const file = path.join(testDir, name);
            const text = fs.readFileSync(file, "utf8");
            const { app, sim, test } = runTest(text);
            if (record) {
                recordScopeData(file, text, app, sim);
                return;
            }

            expect(test.scopeData.length).toBeGreaterThan(0);
            const failures: string[] = [];
            for (const ref of test.scopeData) {
                const plot = app.scopeManager.scopes[ref.si]?.plots[ref.pi];
                if (plot == null) {
                    failures.push(`scope ${ref.si} plot ${ref.pi}: missing`);
                    continue;
                }
                const actual = plotSamples(sim, plot);
                const fullScale = Math.max(...ref.values.map(Math.abs));
                let mismatches = 0, first = -1, maxDiff = 0;
                for (let i = 0; i !== ref.values.length; i++) {
                    const diff = Math.abs(actual[i] - ref.values[i]);
                    if (diff <= TOLERANCE * Math.max(Math.abs(ref.values[i]), fullScale))
                        continue;
                    mismatches++;
                    if (first < 0)
                        first = i;
                    if (!(diff <= maxDiff))
                        maxDiff = diff;
                }
                if (actual.length !== ref.values.length)
                    failures.push(`scope ${ref.si} plot ${ref.pi}: ${actual.length} samples, expected ${ref.values.length}`);
                if (mismatches > 0)
                    failures.push(`scope ${ref.si} plot ${ref.pi}: ${mismatches}/${ref.values.length} samples differ, ` +
                        `first at sample ${first} (got ${actual[first]}, expected ${ref.values[first]}), max diff ${maxDiff}`);
            }
            expect(failures).toEqual([]);
        });
    }
});
