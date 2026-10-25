// Simulator regression tests: replays each recorded circuit in fixtures/auto-tests/ headless and compares
// its scope traces against the ones saved in the file.  A recorded circuit is a normal saved
// circuit with extra tags before </cir>:
//   <test len="..."/>                   how long to run (simulated seconds)
//   <switchevent t="..." en="..."/>     toggle switch element en at time t
//   <scopedata si pi en v u sp ts>...   expected samples of scope si, plot pi, from t=0
//
// To re-record the expected traces after an intended change in simulator behavior:
//   RECORD_AUTO_TESTS=1 npx vitest run AutoTests -t td4.txt

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { initHeadless, createApp, resetCircuit, step, M } from "./HeadlessSim";

const testDir = path.resolve(__dirname, "fixtures/auto-tests");
const record = !!process.env.RECORD_AUTO_TESTS;

// a sample matches if it's within 0.1% of its own value or of the trace's peak (full scale)
const TOLERANCE = 1e-3;

beforeAll(initHeadless);

interface ScopeData {
    si: number;
    pi: number;
    values: number[];
}
interface TestCircuit {
    len: number;
    switchEvents: { t: number; en: number }[];
    scopeData: ScopeData[];
}

// the test tags, which the app's loader skips
function readTestTags(text: string): TestCircuit {
    const root = new DOMParser().parseFromString(text, "text/xml").documentElement;
    const test: TestCircuit = { len: -1, switchEvents: [], scopeData: [] };
    for (let i = 0; i < root.childNodes.length; i++) {
        const elem = root.childNodes[i] as Element;
        if (elem.nodeType !== 1) continue;
        const attr = (a: string) => parseFloat(elem.getAttribute(a)!);
        if (elem.tagName === "test") test.len = attr("len");
        else if (elem.tagName === "switchevent") test.switchEvents.push({ t: attr("t"), en: attr("en") });
        else if (elem.tagName === "scopedata")
            test.scopeData.push({ si: attr("si"), pi: attr("pi"), values: elem.textContent!.split(",").map(Number) });
    }
    return test;
}

// run the circuit for the test's length, as TestManager did in the Java app
function runTest(text: string) {
    const { app, sim } = createApp();
    app.loader.readCircuit(text, M.CircuitLoader.RC_NO_CENTER);
    const test = readTestTags(text);
    if (test.len < 0) throw new Error("no <test> tag");

    resetCircuit(app, sim);
    // wide enough that every scope keeps the whole run
    for (let i = 0; i !== app.scopeManager.scopeCount; i++)
        app.scopeManager.scopes[i].setRect(new M.Rectangle(0, 0, 1024, 128));

    let nextEvent = 0;
    while (sim.t < test.len - 1e-12) {
        step(app, sim);
        if (app.stopMessage != null) throw new Error("simulation stopped: " + app.stopMessage);
        // as clicking the switch does (MouseManager.doSwitch()); the next step() re-analyzes
        for (; nextEvent < test.switchEvents.length && test.switchEvents[nextEvent].t <= sim.t + 1e-12; nextEvent++) {
            const se = app.getElm(test.switchEvents[nextEvent].en);
            se.toggle();
            if (!se.isLogicInputElm()) app.needAnalyze();
        }
    }
    return { app, sim, test };
}

// the plot's samples from t=0 to now, oldest first
function plotSamples(sim: any, plot: any): number[] {
    const spc = plot.scopePointCount;
    const ts = sim.maxTimeStep * plot.scopePlotSpeed;
    const tStart = sim.t - ts * spc;
    const values: number[] = [];
    for (let i = 0; i !== spc; i++) if (tStart + ts * i >= 0) values.push(plot.maxValues[(i + plot.ptr) & (spc - 1)]);
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
            if (en < 0 || plot.minValues == null) continue;
            tags +=
                `  <scopedata si="${si}" pi="${pi}" en="${en}" v="${plot.value}" u="${plot.units}" ` +
                `sp="${plot.scopePlotSpeed}" ts="${sim.maxTimeStep * plot.scopePlotSpeed}">` +
                plotSamples(sim, plot).join(",") +
                "</scopedata>\n";
        }
    }
    text = text.replace(/^\s*<scopedata[^]*?<\/scopedata>\n/gm, "").replace("</cir>", tags + "</cir>");
    fs.writeFileSync(file, text);
}

describe("auto-tests", () => {
    for (const name of fs
        .readdirSync(testDir)
        .filter((f) => f.endsWith(".txt"))
        .sort()) {
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
                let mismatches = 0,
                    first = -1,
                    maxDiff = 0;
                for (let i = 0; i !== ref.values.length; i++) {
                    const diff = Math.abs(actual[i] - ref.values[i]);
                    if (diff <= TOLERANCE * Math.max(Math.abs(ref.values[i]), fullScale)) continue;
                    mismatches++;
                    if (first < 0) first = i;
                    if (!(diff <= maxDiff)) maxDiff = diff;
                }
                if (actual.length !== ref.values.length)
                    failures.push(
                        `scope ${ref.si} plot ${ref.pi}: ${actual.length} samples, expected ${ref.values.length}`,
                    );
                if (mismatches > 0)
                    failures.push(
                        `scope ${ref.si} plot ${ref.pi}: ${mismatches}/${ref.values.length} samples differ, ` +
                            `first at sample ${first} (got ${actual[first]}, expected ${ref.values[first]}), max diff ${maxDiff}`,
                    );
            }
            expect(failures).toEqual([]);
        });
    }
});
