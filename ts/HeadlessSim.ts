// Runs the simulator without a browser, for tests: real XML parsing via xmldom, inert stubs for
// UI widgets, and just enough of CirSim for the loader, the simulator and scopes.

import { DOMParser, XMLSerializer, DOMImplementation } from "@xmldom/xmldom";

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

// the app modules, imported once the fake browser globals exist
export let M: any = null;

export async function initHeadless(): Promise<void> {
    if (M != null)
        return;
    (globalThis as any).DOMParser = DOMParser;
    (globalThis as any).XMLSerializer = XMLSerializer;
    (globalThis as any).Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
    // XML documents are real (subcircuit models are built in them); HTML widgets are not
    (globalThis as any).document = new Proxy({ implementation: new DOMImplementation() } as any,
        { get: (t, p) => (p in t) ? t[p] : inert() });
    (globalThis as any).window = globalThis;

    // Adjustable registers itself on window when it loads
    M = Object.assign({},
        await import("./CircuitElm"), await import("./SimulationManager"), await import("./CirSim"),
        await import("./CircuitLoader"), await import("./CircuitXMLDeserializer"), await import("./Scope"),
        await import("./DiodeModel"), await import("./TransistorModel"), await import("./MosfetModel"),
        await import("./RelayModel"), await import("./CustomLogicModel"), await import("./Color"),
        await import("./HookRegistry"), await import("./registerElements"), await import("./Adjustable"),
        await import("./UIManager"), await import("./Rectangle"));
    createApp();
    M.registerElements();
}

// a fresh app and simulator, installed as the current ones
export function createApp(): { app: any; sim: any } {
    const elmList: any[] = [];
    const app: any = {
        elmList, postDrawList: [], badConnectionList: [], adjustables: [], contextStack: [],
        showResistanceInVoltageSources: true, dumpMatrix: false, stopMessage: null,
        dcAnalysisFlag: false, simRunning: true, minFrameRate: 10, analyzeFlag: false,
        consoleExceptionOccurred: false,
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
            addScope(sc: any) {
                if (sc.position < 0)
                    sc.position = this.scopeCount;
                this.scopes[this.scopeCount++] = sc;
            },
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
        needAnalyze: () => { app.analyzeFlag = true; },
        clearCircuit: () => {},
        constructElement: (name: string, x: number, y: number) => M.CirSim.constructElement(name, x, y),
        // as in UIManager.setGrid()/CirSim.snapGrid()
        gridSize: 16,
        setGrid() { app.gridSize = app.menus.smallGridCheckItem.getState() ? 8 : 16; },
        snapGrid: (x: number) => (x + app.gridSize / 2 - 1) & ~(app.gridSize - 1),
        register: M.CirSim.prototype.register,
    };
    const stubbed = withStubs(app);
    const sim = new M.SimulationManager(stubbed);
    app.sim = sim;
    // routed wires route around the displayed elements (UIManager.theUI.elmList)
    app.ui.getCircuitBounds = M.UIManager.prototype.getCircuitBounds;
    M.UIManager.theUI = app.ui;
    M.CircuitElm.app = stubbed;
    M.CircuitElm.sim = sim;
    M.CircuitElm.initClass(stubbed, sim);
    M.CirSim.theApp = stubbed;
    M.CircuitElm.positiveColor ??= M.Color.green;
    app.loader = new M.CircuitLoader(stubbed, sim, app.scopeManager, app.menus);
    return { app: stubbed, sim };
}

// reset the circuit as the Reset button does, then analyze it as the next frame would
export function resetCircuit(app: any, sim: any): void {
    sim.resetTime();
    sim.resetNodes();
    for (const ce of app.elmList)
        ce.reset();
    analyze(app, sim);
}

export function analyze(app: any, sim: any): void {
    app.analyzeFlag = false;
    sim.analyzeCircuit();
    sim.preStampAndStampCircuit();
}

// do one timestep, as one app frame does (re-analyzing first if the circuit changed); the clock is
// frozen so runCircuit() never does more than one
export function step(app: any, sim: any): void {
    if (app.analyzeFlag)
        analyze(app, sim);
    const now = Date.now;
    Date.now = () => 1e12;
    sim.lastIterTime = 1;
    try {
        sim.runCircuit(true);
    } catch (e) {
        // stop() nulls out the matrices on purpose, which throws; the app catches it too
        if (app.stopMessage == null)
            throw e;
    } finally {
        Date.now = now;
    }
}
